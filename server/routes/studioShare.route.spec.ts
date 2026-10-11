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
        if (token === "qa-owner-token") return { uid: "qa-owner-uid", email: "ops+deliveryqa@iconicimagestx.com" };
        throw new Error("invalid");
      },
    }),
  };
  return { default: admin };
});

import { handlePublicGalleryLink } from "./galleryLink";
import { invoicePayLinkFor } from "../../shared/invoicePayLink";
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
    payToken: "samplePayToken0123456789ab",
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

function expectMarketingView(body: Record<string, unknown>) {
  expect(body.kind).toBe("listing");
  const project = body.project as Record<string, unknown>;
  expect(project.view).toBe("public");
  expect(project.address).toBe("100 Playtest Lane, Austin, TX 78701");
  expect(project.agentName).toBe("Ada Agent");
  const photo = `/api/media/display/${LISTING_ID}/0`;
  const plan = `/api/media/display/${LISTING_ID}/1`;
  expect(project.images).toEqual([{ url: photo, displayUrl: photo, name: "front.jpg" }]);
  expect(project.videos).toEqual([]);
  expect(project.tourUrl).toBe("https://my.matterport.com/show/?m=abc");
  expect(project.floorPlans).toEqual([{ url: plan, displayUrl: plan, name: "Level 1.jpg" }]);
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
    "walkthrough.mp4",
    "final.jpg",
    "level1.jpg",
    "samplePayToken0123456789ab",
  ]) {
    expect(json).not.toContain(secret);
  }
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
    expect((locked.body.project as { payUrl?: string }).payUrl).toBe(invoicePayLinkFor({
      id: "inv_private_1",
      status: "sent",
      payToken: "samplePayToken0123456789ab",
    }));

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
    expect(shared.statusCode).toBe(200);
    const sharedProject = shared.body.project as {
      view?: string;
      images?: Array<{ url?: string; displayUrl?: string }>;
      floorPlans?: Array<{ url?: string }>;
      videos?: Array<{ url?: string | null }>;
    };
    expect(sharedProject.view).toBe("public");
    expect(leaked(shared.body)).toEqual([]);
    expect(sharedProject.images?.map((image) => image.url)).toEqual([
      `/api/media/display/${DELIVERY_QA_IDS.listing}/0`,
      `/api/media/display/${DELIVERY_QA_IDS.listing}/1`,
      `/api/media/display/${DELIVERY_QA_IDS.listing}/2`,
    ]);
    expect(sharedProject.images?.[0]?.displayUrl).toBe(`/api/media/display/${DELIVERY_QA_IDS.listing}/0`);
    expect(sharedProject.floorPlans?.[0]?.url).toBe(`/api/media/display/${DELIVERY_QA_IDS.listing}/3`);
    expect(sharedProject.videos ?? []).toEqual([]);
    expect(JSON.stringify(shared.body)).toContain("100 Playtest Lane, Austin, TX 78701");
    expect(JSON.stringify(shared.body)).toContain("my.matterport.com/show");
    expect(shared.body.project).not.toHaveProperty("files");

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
    expect((paidShare.body.project as { view?: string }).view).toBe("public");
    expectPlaybackShare(paidShare.body);
    const paidOther = await openStudio("Bearer other-token", DELIVERY_QA_IDS.listing);
    expect((paidOther.body.project as { view?: string }).view).toBe("public");
    expectPlaybackShare(paidOther.body);

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
    expectPlaybackShare(releasedShare.body);
    expect(JSON.stringify(releasedShare.body)).toContain("my.matterport.com/show");
  });
});

function expectPlaybackShare(body: Record<string, unknown>) {
  const project = body.project as {
    images?: Array<{ url?: string }>;
    videos?: Array<{ url?: string | null; noDownload?: boolean }>;
  };
  expect(project.images?.[0]?.url).toBe(`/api/media/display/${DELIVERY_QA_IDS.listing}/0`);
  const videos = project.videos ?? [];
  expect(videos.map((video) => video.noDownload)).toEqual([true, true]);
  expect(videos.map((video) => video.url)).toEqual([
    "https://cdn.example/media/blaze/01_BUILT_v2.mp4",
    "https://cdn.example/media/videos/snap-reels/snap-reel-01.mp4",
  ]);
  const json = JSON.stringify(body);
  for (const hidden of [
    "/media/video/product-photography.mp4",
    "/media/photos/luxury-exterior.jpg",
    "/media/photos/listing-living-01.jpg",
    "/media/photos/drone-hero.jpg",
    "/media/playtest/TEST-delivery-qa-floorplan.png",
    "/media/playtest/TEST-delivery-qa-floorplan.pdf",
    "/media/playtest/TEST-delivery-qa-other.zip",
  ]) {
    expect(json).not.toContain(hidden);
  }
}
