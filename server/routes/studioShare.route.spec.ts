import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /studio/:id is private. Signed-out visitors get 401. Another client gets 403.
 * Neither response includes the project or media URLs. The owning client and
 * staff get delivery data. The public advertising page is /present/<token>.
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
        if (token === "qa-owner-token") return { uid: "qa-owner-uid", email: "ops+deliveryqa@iconicimagestx.com" };
        throw new Error("invalid");
      },
    }),
  };
  return { default: admin };
});

import { handlePublicGalleryLink } from "./galleryLink";
import { buildDeliveryQaSeed, DELIVERY_QA_IDS } from "../../shared/deliveryQaSeed";
import { publicMediaItem } from "../../shared/paymentAccess";

function stringValues(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => stringValues(item, found));
  else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => stringValues(item, found));
  }
  return found;
}

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

async function openStudio(authorization?: string, id = LISTING_ID) {
  let statusCode = 200;
  let body: Record<string, unknown> = {};
  const req = {
    params: { id },
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

function expectClosed(statusCode: number, body: Record<string, unknown>, status: 401 | 403) {
  const message = status === 401
    ? "Sign in to open this studio."
    : "This studio belongs to another client.";
  expect(statusCode).toBe(status);
  expect(body).toEqual({
    code: status === 401 ? "auth_required" : "studio_forbidden",
    error: message,
    message,
  });
}

function expectOwnerView(body: Record<string, unknown>, downloadsOpen: boolean, media: "full" | "display" = downloadsOpen ? "full" : "display") {
  expect(body.kind).toBe("listing");
  const project = body.project as Record<string, unknown>;
  expect(project.view).toBe("owner");
  expect(project.agentName).toBe("Ada Agent");
  expect(project.clientName).toBe("Private Client");
  expect(project.clientEmail).toBe("ada@example.com");
  expect(project.clientPhone).toBe("512-555-0100");
  const firstImage = (project.images as Array<{ url: string }>)[0]?.url || "";
  if (media === "full") expect(firstImage).toBe("https://cdn.example/final.jpg");
  else expect(firstImage).toMatch(/^\/api\/media\/display\/o\/[^/]+\/0$/);
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
    if (media === "display") expect(json).not.toContain("final.jpg");
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

  it("refuses a signed-out visitor without a project or media url", async () => {
    const { statusCode, body } = await openStudio();
    expectClosed(statusCode, body, 401);
  });

  it("refuses a different signed-in client without a project or media url", async () => {
    const { statusCode, body } = await openStudio("Bearer other-token");
    expectClosed(statusCode, body, 403);
  });

  it("does not upgrade a rejected session", async () => {
    const { statusCode, body } = await openStudio("Bearer not-a-session");
    expectClosed(statusCode, body, 401);
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
    expectOwnerView(body, false, "full");
  });

  it("keeps original files off the locked delivery QA owner view", async () => {
    const plan = buildDeliveryQaSeed({ origin: "https://cdn.example" });
    for (const doc of plan.documents) {
      const data = { ...doc.data };
      if (doc.collection === "listings") {
        data.studioEnabled = true;
        data.lockStudio = false;
        data.invoiceStatus = "sent";
        data.paymentStatus = "unpaid";
        data.downloadEnabled = false;
        data.downloadsReleased = false;
      }
      seed(doc.collection, doc.id, data);
    }
    seed("clients", "qa-owner-uid", {
      email: "ops+deliveryqa@iconicimagestx.com",
      linkedClientId: DELIVERY_QA_IDS.client,
    });

    const originals = [
      "/media/blaze/01_BUILT_v2.mp4",
      "/media/video/product-photography.mp4",
      "/media/videos/snap-reels/snap-reel-01.mp4",
      "/media/photos/luxury-exterior.jpg",
      "/media/photos/listing-living-01.jpg",
      "/media/photos/drone-hero.jpg",
      "/media/playtest/TEST-delivery-qa-floorplan.png",
      "/media/playtest/TEST-delivery-qa-floorplan.pdf",
      "/media/playtest/TEST-delivery-qa-other.zip",
      "public/media/blaze/01_BUILT_v2.mp4",
      "public/media/photos/luxury-exterior.jpg",
    ];
    const leaked = (payload: unknown) => {
      const values = stringValues(payload);
      return originals.filter((piece) => values.some((value) => value === piece || value.includes(piece)));
    };

    const shared = await openStudio(undefined, DELIVERY_QA_IDS.listing);
    expectClosed(shared.statusCode, shared.body, 401);
    expect(leaked(shared.body)).toEqual([]);

    const locked = await openStudio("Bearer qa-owner-token", DELIVERY_QA_IDS.listing);
    expect(locked.statusCode).toBe(200);
    const lockedProject = locked.body.project as {
      view?: string;
      downloadsUnlocked?: boolean;
      invoice?: { status?: string };
      files?: unknown[];
    };
    expect(lockedProject.view).toBe("owner");
    expect(lockedProject.downloadsUnlocked).toBe(false);
    expect(lockedProject.invoice).toEqual({ status: "sent" });
    expect(lockedProject.files).toEqual([]);
    expect(leaked(lockedProject)).toEqual([]);
    const lockedPublic = plan.media.map((item) => publicMediaItem(item as unknown as Record<string, unknown>, false));
    const publicBlob = JSON.stringify(lockedPublic);
    const lockedBlob = JSON.stringify(lockedProject);
    for (const item of plan.media) {
      for (const value of [item.url, item.shareUrl, item.embedUrl, item.poster, item.sourcePath]) {
        if (typeof value !== "string" || !value || publicBlob.includes(value)) continue;
        if (value.includes("matterport.com")) continue;
        expect(lockedBlob).not.toContain(value);
      }
    }
    const lockedView = lockedProject as {
      images?: Array<{ url?: string }>;
      floorPlans?: Array<{ url?: string }>;
      videos?: Array<{ url?: string | null; poster?: string | null }>;
      tourUrl?: string;
    };
    expect(lockedView.images?.map((image) => image.url)).toEqual([
      expect.stringMatching(/^\/api\/media\/display\/o\/[^/]+\/0$/),
      expect.stringMatching(/^\/api\/media\/display\/o\/[^/]+\/1$/),
      expect.stringMatching(/^\/api\/media\/display\/o\/[^/]+\/2$/),
    ]);
    expect(lockedView.floorPlans?.[0]?.url).toMatch(/^\/api\/media\/display\/o\/[^/]+\/3$/);
    expect(lockedView.videos?.length).toBe(3);
    for (const video of lockedView.videos || []) {
      expect(video.url ?? null).toBeNull();
      expect(video.poster).toMatch(/^\/api\/media\/display\/o\/[^/]+\/\d+$/);
    }
    expect(lockedView.tourUrl).toContain("my.matterport.com/show");

    const staff = await openStudio("Bearer staff-token", DELIVERY_QA_IDS.listing);
    expect(staff.statusCode).toBe(200);
    expect((staff.body.project as { downloadsUnlocked?: boolean }).downloadsUnlocked).toBe(false);
    expect(JSON.stringify(staff.body.project)).toContain("/media/blaze/01_BUILT_v2.mp4");

    const invoice = plan.documents.find((doc) => doc.id === DELIVERY_QA_IDS.invoice);
    seed("invoices", DELIVERY_QA_IDS.invoice, {
      ...(invoice?.data || {}),
      status: "paid",
      amountPaid: 1,
      amountDue: 0,
    });
    const paid = await openStudio("Bearer qa-owner-token", DELIVERY_QA_IDS.listing);
    expect((paid.body.project as { downloadsUnlocked?: boolean }).downloadsUnlocked).toBe(true);
    expect(JSON.stringify(paid.body.project)).toContain("/media/blaze/01_BUILT_v2.mp4");
    expect(JSON.stringify(paid.body.project)).toContain("/media/photos/luxury-exterior.jpg");
    expect(JSON.stringify(paid.body)).not.toContain("amountDue");
    const paidShare = await openStudio(undefined, DELIVERY_QA_IDS.listing);
    expectClosed(paidShare.statusCode, paidShare.body, 401);
    const paidOther = await openStudio("Bearer other-token", DELIVERY_QA_IDS.listing);
    expectClosed(paidOther.statusCode, paidOther.body, 403);

    seed("invoices", DELIVERY_QA_IDS.invoice, invoice?.data || {});
    const listingDoc = plan.documents.find((doc) => doc.id === DELIVERY_QA_IDS.listing);
    const galleryDoc = plan.documents.find((doc) => doc.id === DELIVERY_QA_IDS.gallery);
    const lockedListing = {
      ...(listingDoc?.data || {}),
      studioEnabled: true,
      lockStudio: false,
      invoiceStatus: "sent",
      paymentStatus: "unpaid",
      downloadEnabled: false,
      downloadsReleased: false,
    };
    seed("listings", DELIVERY_QA_IDS.listing, { ...lockedListing, invoiceStatus: "paid" });
    const stalePaid = await openStudio("Bearer qa-owner-token", DELIVERY_QA_IDS.listing);
    const staleProject = stalePaid.body.project as { downloadsUnlocked?: boolean; invoice?: { status?: string } };
    expect(staleProject.downloadsUnlocked).toBe(true);
    expect(staleProject.invoice).toEqual({ status: "sent" });
    expect(JSON.stringify(stalePaid.body.project)).toContain("/media/blaze/01_BUILT_v2.mp4");
    expect(JSON.stringify(stalePaid.body.project)).toContain("/media/photos/luxury-exterior.jpg");

    seed("listings", DELIVERY_QA_IDS.listing, { ...lockedListing, paymentStatus: "comped" });
    const comped = await openStudio("Bearer qa-owner-token", DELIVERY_QA_IDS.listing);
    expect((comped.body.project as { downloadsUnlocked?: boolean }).downloadsUnlocked).toBe(true);
    expect(JSON.stringify(comped.body.project)).toContain("/media/blaze/01_BUILT_v2.mp4");

    seed("listings", DELIVERY_QA_IDS.listing, lockedListing);
    seed("galleries", DELIVERY_QA_IDS.gallery, {
      ...(galleryDoc?.data || {}),
      downloadsReleased: true,
      downloadEnabled: true,
    });
    const released = await openStudio("Bearer qa-owner-token", DELIVERY_QA_IDS.listing);
    expect((released.body.project as { downloadsUnlocked?: boolean }).downloadsUnlocked).toBe(true);
    expect(JSON.stringify(released.body.project)).toContain("/media/blaze/01_BUILT_v2.mp4");
    const releasedShare = await openStudio(undefined, DELIVERY_QA_IDS.listing);
    expectClosed(releasedShare.statusCode, releasedShare.body, 401);
    expect(JSON.stringify(releasedShare.body)).not.toContain("matterport");
  });

  it("keeps the released-gallery redirect for the owner and staff, and hides it from another client", async () => {
    const galleryId = "gallery1234abcd";
    seed("galleries", galleryId, {
      status: "delivered",
      clientId: "someone-else",
      clientEmail: "other-client@example.com",
      listingId: LISTING_ID,
      mediaItems: [{ url: "https://cdn.example/secret.jpg", fileName: "secret.jpg" }],
    });
    const owner = await openStudio("Bearer owner-token", galleryId);
    expect(owner.statusCode).toBe(200);
    expect(owner.body.kind).toBe("gallery");
    expect(owner.body.released).toBe(true);
    expect(owner.body.galleryId).toBe(galleryId);
    expect(owner.body.project).toBeUndefined();
    expect(JSON.stringify(owner.body)).not.toContain("cdn.example");
    expect(JSON.stringify(owner.body)).not.toContain("secret.jpg");

    const staff = await openStudio("Bearer staff-token", galleryId);
    expect(staff.statusCode).toBe(200);
    expect(staff.body).toMatchObject({ kind: "gallery", released: true, galleryId });

    const other = await openStudio("Bearer other-token", galleryId);
    expectClosed(other.statusCode, other.body, 403);
    const anon = await openStudio(undefined, galleryId);
    expectClosed(anon.statusCode, anon.body, 401);
  });

  it("still tells the owner when Client Studio is off, and does not tell another client", async () => {
    seed("listings", LISTING_ID, { ...listing(), studioEnabled: false });
    const owner = await openStudio("Bearer owner-token");
    expect(owner.statusCode).toBe(403);
    expect(owner.body.code).toBe("studio_disabled");
    expect(String(owner.body.message)).toMatch(/Client Studio is turned off/);
    expect(owner.body.project).toBeUndefined();

    const other = await openStudio("Bearer other-token");
    expectClosed(other.statusCode, other.body, 403);
    expect(JSON.stringify(other.body)).not.toMatch(/turned off|cdn\.example|secret-token/);
  });

  it("gives the owner the presentation path and does not give it to another client", async () => {
    const token = "abcdefghijklmnopqrstuv";
    seed("listings", LISTING_ID, { ...listing(), presentationToken: token, presentationEnabled: true });
    const owner = await openStudio("Bearer owner-token");
    expect(owner.statusCode).toBe(200);
    expect(owner.body.sharePath).toBe(`/present/${token}`);
    expect((owner.body.project as { view?: string }).view).toBe("owner");
    const other = await openStudio("Bearer other-token");
    expectClosed(other.statusCode, other.body, 403);
    expect(JSON.stringify(other.body)).not.toContain(token);
  });
});
