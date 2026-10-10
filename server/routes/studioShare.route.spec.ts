import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /studio/:id is the copied share link. Signed-out visitors and other clients
 * get the marketing view. The owning client and staff get delivery data.
 */

const LISTING_ID = "playtest-job-sqoa1v8vech1MQfpl47bBMqw9zC3";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
}));

function seed(collection: string, id: string, data: Record<string, unknown>) {
  if (!store.collections[collection]) store.collections[collection] = new Map();
  store.collections[collection].set(id, data);
}

vi.mock("firebase-admin", () => {
  function docs(name: string) {
    return store.collections[name] || new Map<string, Record<string, unknown>>();
  }
  const admin = {
    apps: [{ name: "studio-share-test" }],
    firestore: () => ({
      collection(name: string) {
        return {
          doc(id: string) {
            return {
              async get() {
                const data = docs(name).get(id);
                return { id, exists: data !== undefined, data: () => data };
              },
            };
          },
          where(field: string, _op: string, value: string) {
            return {
              limit() {
                return {
                  async get() {
                    const matches = [...docs(name).entries()]
                      .filter(([, data]) => data[field] === value)
                      .map(([id, data]) => ({ id, exists: true, data: () => data }));
                    return { empty: matches.length === 0, docs: matches };
                  },
                };
              },
            };
          },
        };
      },
    }),
    auth: () => ({
      async verifyIdToken(token: string) {
        if (token === "owner-token") return { uid: "owner-uid", email: "ada@example.com" };
        if (token === "other-token") return { uid: "other-uid", email: "bob@example.com" };
        if (token === "staff-token") return { uid: "staff-uid", email: "staff@iconicimagestx.com" };
        throw new Error("invalid");
      },
    }),
  };
  return { default: admin };
});

import { handlePublicGalleryLink } from "./galleryLink";

function listing(invoiceStatus = "sent") {
  return {
    studioEnabled: true,
    lockStudio: false,
    address: "100 Playtest Lane, Austin, TX 78701",
    agentName: "Ada Agent",
    clientName: "Private Client",
    clientEmail: "ada@example.com",
    clientPhone: "512-555-0100",
    clientId: "client-ada",
    notes: "lockbox 1234",
    studioToken: "secret-token",
    invoiceId: "inv_private_1",
    orderId: "order_private_1",
    zipUrl: "https://cdn.example/delivery.zip",
    mlsUrl: "https://cdn.example/mls-full.jpg",
    images: [{
      url: "https://cdn.example/final.jpg",
      name: "front.jpg",
      path: `listings/${LISTING_ID}/finals/front.jpg`,
      downloadUrl: "https://cdn.example/front-full.jpg",
    }],
    videos: [{ url: "https://cdn.example/walkthrough.mp4", name: "Walkthrough" }],
    floorplans: [
      { url: "https://cdn.example/level1.jpg", name: "Level 1.jpg" },
      { url: "https://cdn.example/plans.zip", name: "plans.zip" },
    ],
    matterportUrl: "https://my.matterport.com/show/?m=abc",
    revisions: [{ id: "rev-1", type: "single", description: "Warm the kitchen", status: "pending", createdAt: "2026-04-01" }],
    invoiceStatus,
  };
}

beforeEach(() => {
  store.collections = {};
  seed("listings", LISTING_ID, listing());
  seed("invoices", "inv_private_1", {
    status: "sent",
    total: 400,
    amountDue: 400,
    clientEmail: "invoice-pii@example.com",
  });
  seed("clients", "owner-uid", { email: "ada@example.com", linkedClientId: "client-ada" });
  seed("clients", "other-uid", { email: "bob@example.com" });
  seed("staff", "staff-uid", { role: "admin", isActive: true });
});

async function openStudio(authorization?: string) {
  let statusCode = 200;
  let body: Record<string, unknown> = {};
  const req = {
    params: { id: LISTING_ID },
    headers: authorization ? { authorization } : {},
  };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      body = payload;
      return this;
    },
  };
  await handlePublicGalleryLink(req as never, res as never, (() => undefined) as never);
  return { statusCode, body };
}

function expectMarketingView(body: Record<string, unknown>) {
  expect(body.kind).toBe("listing");
  const project = body.project as Record<string, unknown>;
  expect(project.view).toBe("public");
  expect(project.address).toBe("100 Playtest Lane, Austin, TX 78701");
  expect(project.agentName).toBe("Ada Agent");
  expect(project.images).toEqual([{ url: "https://cdn.example/final.jpg", name: "front.jpg" }]);
  expect(project.videos).toEqual([{ url: "https://cdn.example/walkthrough.mp4", name: "Walkthrough" }]);
  expect(project.tourUrl).toBe("https://my.matterport.com/show/?m=abc");
  expect(project.floorPlans).toEqual([{ url: "https://cdn.example/level1.jpg", name: "Level 1.jpg" }]);
  const json = JSON.stringify(body);
  for (const secret of [
    "ada@example.com",
    "bob@example.com",
    "invoice-pii@example.com",
    "512-555-0100",
    "Private Client",
    "Warm the kitchen",
    "lockbox",
    "secret-token",
    "delivery.zip",
    "front-full.jpg",
    "mls-full.jpg",
    "plans.zip",
    "inv_private_1",
    "order_private_1",
    "amountDue",
    "downloadsUnlocked",
  ]) {
    expect(json).not.toContain(secret);
  }
}

function expectOwnerView(body: Record<string, unknown>, downloadsOpen: boolean) {
  expect(body.kind).toBe("listing");
  const project = body.project as Record<string, unknown>;
  expect(project.view).toBe("owner");
  expect(project.agentName).toBe("Ada Agent");
  expect(project.clientName).toBe("Private Client");
  expect(project.clientEmail).toBe("ada@example.com");
  expect(project.clientPhone).toBe("512-555-0100");
  expect((project.images as Array<{ url: string }>)[0].url).toBe("https://cdn.example/final.jpg");
  expect((project.revisions as Array<{ description: string }>)[0].description).toBe("Warm the kitchen");
  expect(project.invoice).toEqual({ status: downloadsOpen ? "paid" : "sent" });
  expect(project.downloadsUnlocked).toBe(downloadsOpen);
  const json = JSON.stringify(project);
  if (downloadsOpen) {
    expect(json).toContain("delivery.zip");
    expect(json).toContain("front-full.jpg");
    expect((project.images as Array<{ downloadUrl?: string }>)[0].downloadUrl).toBe("https://cdn.example/front-full.jpg");
  } else {
    expect(json).not.toContain("delivery.zip");
    expect(json).not.toContain("front-full.jpg");
    expect(json).not.toContain("mls-full.jpg");
    expect(json).not.toContain("invoice-pii@example.com");
  }
}

describe("GET /api/galleries/link/:id studio share", () => {
  it("does not read the listing from the browser for a signed-in client", () => {
    const page = readFileSync(new URL("../../client/pages/ClientStudio.tsx", import.meta.url), "utf8");
    expect(page).not.toContain("getDoc");
    expect(page).toContain('headers.Authorization = `Bearer ${token}`');
    expect(page).not.toContain("openGalleryId");
  });

  it("renders the download-free share for a signed-out visitor", async () => {
    const { statusCode, body } = await openStudio();
    expect(statusCode).toBe(200);
    expectMarketingView(body);
  });

  it("renders the same share for a different signed-in client", async () => {
    const { statusCode, body } = await openStudio("Bearer other-token");
    expect(statusCode).toBe(200);
    expectMarketingView(body);
  });

  it("does not upgrade a rejected session", async () => {
    const { statusCode, body } = await openStudio("Bearer not-a-session");
    expect(statusCode).toBe(200);
    expectMarketingView(body);
  });

  it("gives the owning client the private view and keeps downloads locked until paid", async () => {
    const locked = await openStudio("Bearer owner-token");
    expect(locked.statusCode).toBe(200);
    expectOwnerView(locked.body, false);

    seed("invoices", "inv_private_1", { status: "paid", total: 400, amountDue: 0, clientEmail: "invoice-pii@example.com" });
    seed("listings", LISTING_ID, listing("paid"));
    const paid = await openStudio("Bearer owner-token");
    expect(paid.statusCode).toBe(200);
    expectOwnerView(paid.body, true);
    expect(JSON.stringify(paid.body)).not.toContain("invoice-pii@example.com");
    expect(JSON.stringify(paid.body)).not.toContain("amountDue");
  });

  it("gives staff the same private view", async () => {
    const { statusCode, body } = await openStudio("Bearer staff-token");
    expect(statusCode).toBe(200);
    expectOwnerView(body, false);
  });
});
