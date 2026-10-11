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
  seed("listings", LISTING_ID, qaListingData());
});

async function openDisplay(index: string, headers: Record<string, string> = {}, listingId = LISTING_ID) {
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

  it("404s an MLS-only listing, a bad index, and a non-share index", async () => {
    const mlsId = "mls-only-listing-id";
    seed("listings", mlsId, {
      images: [{
        url: "https://cdn.example/media/photos/listing-living-01.jpg",
        name: "mls.jpg",
        category: "mls",
        downloadable: true,
      }],
    });
    const mls = await openDisplay("0", {}, mlsId);
    expect(mls.statusCode).toBe(404);
    expect(mls.jsonBody).toEqual({ error: "Not found." });
    expect(JSON.stringify(mls.jsonBody)).not.toContain("listing-living");
    expect(JSON.stringify(mls.headers)).not.toContain("listing-living");

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
});
