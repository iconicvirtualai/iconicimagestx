import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildDeliveryQaSeed, DELIVERY_QA_IDS } from "../../shared/deliveryQaSeed";

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

async function openDisplay(index: string, headers: Record<string, string> = {}, listingId: string = LISTING_ID) {
  let statusCode = 200;
  let jsonBody: unknown;
  const resHeaders: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const req = {
    params: { listingId, index },
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
    expect(first.headers["cache-control"]).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
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
    expect(mls.headers["cache-control"]).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
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
        url: "https://www.iconicimagestx.com/media/photos/listing-living-01.jpg",
        redirect: "error",
      }]);
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
});
