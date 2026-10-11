import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ownerStudioProject } from "../../shared/clientGalleryLink";
import { buildDeliveryQaSeed, DELIVERY_QA_IDS } from "../../shared/deliveryQaSeed";
import { lockedClientGalleryMedia } from "../../shared/lockedClientMedia";
import { signOwnerDisplayToken } from "../../shared/ownerDisplayGrant";

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
    apps: [{ name: "media-display-test" }],
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
          where(field: string, op: string, value: unknown) {
            const query = {
              limit() {
                return query;
              },
              async get() {
                const matched = [...docs(name).entries()].filter(([, data]) => op === "==" && data[field] === value);
                return {
                  docs: matched.map(([id, data]) => ({ id, data: () => data })),
                };
              },
            };
            return query;
          },
        };
      },
    }),
  };
  return { default: admin };
});

import { handleMediaDisplay, resetMediaDisplayRateLimit } from "./mediaDisplay";

const LISTING_ID = DELIVERY_QA_IDS.listing;

function qaListingData() {
  const plan = buildDeliveryQaSeed({ origin: "https://cdn.example" });
  const doc = plan.documents.find((item) => item.id === LISTING_ID);
  if (!doc) throw new Error("missing playtest listing");
  return doc.data;
}

beforeEach(() => {
  store.collections = {};
  resetMediaDisplayRateLimit();
  delete process.env.MEDIA_DISPLAY_RATE_MAX;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.APP_URL;
  seed("listings", LISTING_ID, qaListingData());
});

async function openDisplay(index: string, headers: Record<string, string> = {}, listingId: string = LISTING_ID, url?: string) {
  let statusCode = 200;
  let jsonBody: unknown;
  const resHeaders: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const req = {
    params: { listingId, index },
    url: url || `/api/media/display/${listingId}/${index}`,
    headers,
    ip: "203.0.113.10",
    socket: { remoteAddress: "203.0.113.10" },
  };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string | number) {
      resHeaders[name.toLowerCase()] = String(value);
      return this;
    },
    json(payload: unknown) {
      jsonBody = payload;
      return this;
    },
    end(body?: Buffer | string) {
      if (body) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(body));
      return this;
    },
  };
  await handleMediaDisplay(req as never, res as never, (() => undefined) as never);
  return { statusCode, headers: resHeaders, body: Buffer.concat(chunks), jsonBody };
}

describe("GET /api/media/display/:listingId/:index", () => {
  it("returns a JPEG at most 1600px with a long cache and an ETag", async () => {
    const first = await openDisplay("0");
    expect(first.statusCode).toBe(200);
    expect(first.body[0]).toBe(0xff);
    expect(first.body[1]).toBe(0xd8);
    expect(first.headers["content-type"]).toBe("image/jpeg");
    expect(first.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
    expect(first.headers.etag).toMatch(/^"[a-f0-9]{40}"$/);
    const meta = await sharp(first.body).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
    expect(Math.max(meta.width || 0, meta.height || 0)).toBe(1600);
    const headerBlob = JSON.stringify(first.headers);
    expect(headerBlob).not.toContain("drone-hero");
    expect(headerBlob).not.toContain("/media/");
    expect(headerBlob).not.toContain("firebasestorage");
    expect(headerBlob).not.toContain("cdn.example");

    const again = await openDisplay("0", { "if-none-match": first.headers.etag });
    expect(again.statusCode).toBe(304);
    expect(again.body.length).toBe(0);
    expect(again.headers["cache-control"]).toBe(first.headers["cache-control"]);
    expect(again.headers.etag).toBe(first.headers.etag);
  });

  it("applies EXIF orientation and strips metadata", async () => {
    const source = await sharp({
      create: { width: 32, height: 8, channels: 3, background: { r: 200, g: 10, b: 10 } },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { ImageDescription: "secret-exif-note" } },
      })
      .toBuffer();
    const file = path.join(process.cwd(), "public/media/playtest/display-orientation-check.jpg");
    await writeFile(file, source);
    const orientedId = "orientation-listing";
    seed("listings", orientedId, {
      images: [{
        url: "https://cdn.example/media/playtest/display-orientation-check.jpg",
        name: "oriented.jpg",
      }],
    });
    try {
      const result = await openDisplay("0", {}, orientedId);
      expect(result.statusCode).toBe(200);
      const meta = await sharp(result.body).metadata();
      expect(meta.width).toBe(8);
      expect(meta.height).toBe(32);
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
      expect(result.body.includes(Buffer.from("secret-exif-note"))).toBe(false);
      expect(JSON.stringify(result.headers)).not.toContain("display-orientation-check");
    } finally {
      await rm(file, { force: true });
    }
  });

  it("serves an MLS-only photo through the display route and 404s a bad index", async () => {
    const mlsId = "mls-only-listing-id";
    seed("listings", mlsId, {
      images: [{
        url: "https://cdn.example/media/photos/listing-living-01.jpg",
        name: "mls.jpg",
        category: "mls",
        downloadable: true,
      }, {
        url: "https://cdn.example/media/photos/luxury-exterior.jpg",
        name: "full.jpg",
        category: "full-res",
        downloadable: true,
      }],
    });
    const mls = await openDisplay("0", {}, mlsId);
    expect(mls.statusCode).toBe(200);
    expect(mls.body[0]).toBe(0xff);
    expect(mls.headers["content-type"]).toBe("image/jpeg");
    expect(mls.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
    const full = await openDisplay("1", {}, mlsId);
    expect(full.statusCode).toBe(200);
    expect(full.body[0]).toBe(0xff);
    const shown = JSON.stringify({ mls: mls.jsonBody, full: full.jsonBody, headers: mls.headers });
    expect(shown).not.toContain("listing-living");
    expect(shown).not.toContain("luxury-exterior");
    expect(shown).not.toContain("cdn.example");

    const pdfId = "pdf-only-listing1";
    seed("listings", pdfId, {
      images: [{ url: "https://cdn.example/notes.pdf", name: "notes.pdf", contentType: "application/pdf" }],
    });
    const pdf = await openDisplay("0", {}, pdfId);
    expect(pdf.statusCode).toBe(404);
    expect(pdf.jsonBody).toEqual({ error: "Not found." });

    const bad = await openDisplay("mls");
    expect(bad.statusCode).toBe(404);
    expect(bad.jsonBody).toEqual({ error: "Not found." });

    const missing = await openDisplay("9");
    expect(missing.statusCode).toBe(404);
    expect(missing.jsonBody).toEqual({ error: "Not found." });
    expect(JSON.stringify(missing)).not.toContain("drone-hero");
    expect(JSON.stringify(missing)).not.toContain("luxury-exterior");
  });

  it("rate limits an IP", async () => {
    process.env.MEDIA_DISPLAY_RATE_MAX = "2";
    resetMediaDisplayRateLimit();
    expect((await openDisplay("9")).statusCode).toBe(404);
    expect((await openDisplay("9")).statusCode).toBe(404);
    const blocked = await openDisplay("0");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.jsonBody).toEqual({ error: "Too many requests." });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(JSON.stringify(blocked.jsonBody)).not.toContain("/media/");
  });

  it("fetches /media from this deployment when public/ is not on disk", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_URL = "iconicimagestx-abc.vercel.app";
    process.env.APP_URL = "https://www.iconicimagestx.com";
    const jpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 9, g: 9, b: 9 } },
    }).jpeg().toBuffer();
    const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), redirect: init?.redirect });
      return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
    }));
    try {
      const result = await openDisplay("0", { host: "evil.example" });
      expect(result.statusCode).toBe(200);
      expect(result.body[0]).toBe(0xff);
      expect(calls).toEqual([{
        url: "https://iconicimagestx-abc.vercel.app/media/photos/listing-living-01.jpg",
        redirect: "error",
      }]);
      expect(calls[0]?.url).not.toContain("iconicimagestx.com");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a foreign image host and still allows Firebase Storage", async () => {
    process.env.VERCEL = "1";
    const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
    const jpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 1, b: 1 } },
    }).jpeg().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), redirect: init?.redirect });
      return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
    }));
    const evilId = "evil-host-listing1";
    seed("listings", evilId, {
      images: [{ url: "https://evil.example/secret.jpg", name: "secret.jpg" }],
    });
    const storageId = "storage-listing1";
    const storageUrl = "https://firebasestorage.googleapis.com/v0/b/iconic.appspot.com/o/photo.jpg?alt=media";
    seed("listings", storageId, {
      images: [{ url: storageUrl, name: "storage.jpg" }],
    });
    try {
      const evil = await openDisplay("0", { host: "169.254.169.254" }, evilId);
      expect(evil.statusCode).toBe(404);
      expect(calls).toEqual([]);
      const stored = await openDisplay("0", {}, storageId);
      expect(stored.statusCode).toBe(200);
      expect(calls).toEqual([{ url: storageUrl, redirect: "error" }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("404s when the studio share is closed and when the index is outside the share set", async () => {
    const lockedId = "locked-studio-listing";
    seed("listings", lockedId, {
      ...qaListingData(),
      id: lockedId,
      lockStudio: true,
    });
    const locked = await openDisplay("0", {}, lockedId);
    expect(locked.statusCode).toBe(404);
    expect(locked.headers["cache-control"]).toBe("no-store");
    expect(locked.jsonBody).toEqual({ error: "Not found." });

    const disabledId = "disabled-studio-list";
    seed("listings", disabledId, {
      ...qaListingData(),
      studioEnabled: false,
    });
    expect((await openDisplay("0", {}, disabledId)).statusCode).toBe(404);

    seed("galleries", "gallery-only-extra", {
      listingId: LISTING_ID,
      mediaItems: [{ url: "https://cdn.example/media/photos/luxury-interior.jpg", name: "gallery-only.jpg", type: "photo" }],
    });
    const outside = await openDisplay("4");
    expect(outside.statusCode).toBe(404);
    expect(JSON.stringify(outside)).not.toContain("luxury-interior");
    expect((await openDisplay("0")).statusCode).toBe(200);
  });

  it("serves a presentation photo on a locked studio and 404s an unknown token", async () => {
    const token = "abcdefghijklmnopqrstuv";
    const lockedId = "present-locked-list1";
    seed("listings", lockedId, {
      id: lockedId,
      lockStudio: true,
      presentationToken: token,
      presentationEnabled: true,
      images: [{
        url: "https://cdn.example/media/photos/listing-living-01.jpg",
        name: "living.jpg",
        contentType: "image/jpeg",
      }],
    });
    expect((await openDisplay("0", {}, lockedId)).statusCode).toBe(404);
    const photo = await openDisplay("0", {}, lockedId, `/api/media/display/p/${token}/0`);
    expect(photo.statusCode).toBe(200);
    expect(photo.body[0]).toBe(0xff);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
    expect(JSON.stringify(photo.headers)).not.toContain("listing-living");

    seed("listings", lockedId, {
      id: lockedId,
      lockStudio: true,
      presentationToken: token,
      presentationEnabled: false,
      images: [{ url: "https://cdn.example/media/photos/listing-living-01.jpg", name: "living.jpg" }],
    });
    expect((await openDisplay("0", {}, lockedId, `/api/media/display/p/${token}/0`)).statusCode).toBe(404);
    expect((await openDisplay("0", {}, lockedId, "/api/media/display/p/not-a-real-token-value/0")).statusCode).toBe(404);
    expect((await openDisplay("0", {}, lockedId, "/api/media/display/p/zzzzzzzzzzzzzzzzzzzzzz/0")).statusCode).toBe(404);
  });

  it("never fetches APP_URL, including the Wix host", async () => {
    process.env.VERCEL = "1";
    process.env.APP_URL = "https://www.iconicimagestx.com";
    delete process.env.VERCEL_URL;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(null, { status: 500 });
    }));
    try {
      const wix = await openDisplay("0", { host: "www.iconicimagestx.com" });
      expect(wix.statusCode).toBe(404);
      expect(calls).toEqual([]);
      await openDisplay("0", { host: "iconicimagestx.vercel.app" });
      expect(calls).toEqual(["https://iconicimagestx.vercel.app/media/photos/listing-living-01.jpg"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns JPEGs for a locked owner studio and a locked gallery without original paths", async () => {
    const plan = buildDeliveryQaSeed({ origin: "https://cdn.example" });
    const listingDoc = plan.documents.find((item) => item.id === DELIVERY_QA_IDS.listing);
    const galleryDoc = plan.documents.find((item) => item.id === DELIVERY_QA_IDS.gallery);
    if (!listingDoc || !galleryDoc) throw new Error("missing playtest docs");
    const listing = { id: DELIVERY_QA_IDS.listing, ...listingDoc.data, lockStudio: true };
    seed("listings", DELIVERY_QA_IDS.listing, listing);
    seed("galleries", DELIVERY_QA_IDS.gallery, galleryDoc.data);

    const owner = ownerStudioProject(listing, {
      id: listing.id,
      address: "100 Playtest Lane",
      agentName: "",
      services: [],
      images: [],
      videos: [],
      tourUrl: "",
      floorPlans: [],
      notice: null,
      view: "public",
    }, { invoice: { status: "sent", total: 1, amountPaid: 0, amountDue: 1 } });
    expect(owner.downloadsUnlocked).toBe(false);
    expect(owner.tourUrl).toContain("my.matterport.com/show");
    const ownerUrls = [
      ...(owner.images || []).map((image) => image.url),
      ...(owner.floorPlans || []).map((planImage) => planImage.url),
      ...(owner.videos || []).map((video) => video.poster),
    ].filter((url): url is string => typeof url === "string");
    expect(ownerUrls.length).toBeGreaterThanOrEqual(7);
    for (const url of ownerUrls) {
      expect(url).toMatch(/^\/api\/media\/display\/o\/[^/]+\/\d+$/);
      const result = await openDisplay("0", {}, LISTING_ID, url);
      expect(result.statusCode).toBe(200);
      expect(result.body[0]).toBe(0xff);
      expect(result.headers["content-type"]).toBe("image/jpeg");
    }
    const ownerBlob = JSON.stringify(owner);
    expect(ownerBlob).not.toContain("/media/photos/");
    expect(ownerBlob).not.toContain("/media/blaze/");
    expect(ownerBlob).not.toContain("/media/video/");
    expect(ownerBlob).not.toContain("/media/videos/");
    expect(ownerBlob).not.toContain(".pdf");
    expect(ownerBlob).not.toContain(".zip");

    const galleryMedia = lockedClientGalleryMedia(DELIVERY_QA_IDS.gallery, [
      ...(Array.isArray(galleryDoc.data.mediaItems) ? galleryDoc.data.mediaItems : []),
    ], false);
    const photos = galleryMedia.filter((item) => item.type === "photo" || item.type === "aerial" || item.type === "floorplan" && item.contentType === "image/png");
    expect(photos.every((item) => typeof item.url === "string" && item.url.startsWith("/api/media/display/o/"))).toBe(true);
    const videos = galleryMedia.filter((item) => item.type === "video" || item.type === "reel");
    expect(videos.every((item) => item.url === null && typeof item.poster === "string" && item.poster.startsWith("/api/media/display/o/"))).toBe(true);
    const tour = galleryMedia.find((item) => item.type === "matterport");
    expect(tour?.embedUrl).toContain("my.matterport.com/show");
    const pdf = galleryMedia.find((item) => item.fileName?.endsWith(".pdf"));
    const zip = galleryMedia.find((item) => item.fileName?.endsWith(".zip"));
    expect(pdf?.url).toBeNull();
    expect(zip?.url).toBeNull();
    const galleryBlob = JSON.stringify(galleryMedia);
    expect(galleryBlob).not.toContain("/media/photos/");
    expect(galleryBlob).not.toContain("/media/blaze/");
    expect(galleryBlob).not.toContain("/media/video/");
    expect(galleryBlob).not.toContain("/media/playtest/");
    for (const item of galleryMedia) {
      for (const candidate of [item.url, item.poster]) {
        if (typeof candidate !== "string" || !candidate.startsWith("/api/media/display/")) continue;
        const result = await openDisplay("0", {}, LISTING_ID, candidate);
        expect(result.statusCode).toBe(200);
        expect(result.body[0]).toBe(0xff);
      }
    }

    const forged = signOwnerDisplayToken({ scope: "listing", id: DELIVERY_QA_IDS.listing });
    expect(forged).toBeTruthy();
    const flipped = `${forged?.slice(0, -1)}${forged?.endsWith("a") ? "b" : "a"}`;
    expect((await openDisplay("0", {}, LISTING_ID, `/api/media/display/o/${flipped}/0`)).statusCode).toBe(404);
    const other = signOwnerDisplayToken({ scope: "listing", id: "other-listing-id" });
    expect((await openDisplay("0", {}, LISTING_ID, `/api/media/display/o/${other}/0`)).statusCode).toBe(404);

    const paid = ownerStudioProject(listing, {
      id: listing.id,
      address: "100 Playtest Lane",
      agentName: "",
      services: [],
      images: [],
      videos: [],
      tourUrl: "",
      floorPlans: [],
      notice: null,
      view: "public",
    }, { invoice: { status: "paid", total: 1, amountPaid: 1, amountDue: 0 } });
    expect(JSON.stringify(paid)).toContain("/media/blaze/01_BUILT_v2.mp4");
    expect(JSON.stringify(paid.images)).toContain("/media/photos/luxury-exterior.jpg");
    expect(JSON.stringify(paid.images)).not.toContain("/api/media/display/o/");
  });
});
