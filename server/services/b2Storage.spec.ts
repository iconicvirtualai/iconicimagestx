import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPortalListingDetail } from "../../shared/portalListingDetail";
import { B2_BUCKET_CORS, B2_PORTAL_ORIGINS } from "../../shared/b2Media";
import { lockboxCodeFromOrder } from "../../shared/orderStaffOnly";
import {
  applyB2MediaUrls,
  b2ObjectUrl,
  b2ReadableHosts,
  orderedDownloadPlan,
  presignS3GetUrl,
} from "./b2Storage";

const NOW = new Date("2026-11-25T19:25:00.000Z");
const ENV = {
  B2_KEY_ID: "key-id-example",
  B2_APP_KEY: "app-key-example",
  B2_BUCKET: "iconic-media",
  B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
} satisfies NodeJS.ProcessEnv;

describe("B2 SigV4", () => {
  it("matches the AWS query-string example", () => {
    const url = presignS3GetUrl({
      host: "examplebucket.s3.amazonaws.com",
      canonicalUri: "/test.txt",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      amzDate: "20130524T000000Z",
      expires: 86400,
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("presigns a GET on the B2 S3 host for fifteen minutes", () => {
    const url = b2ObjectUrl("aryeo-test/caroline-warren/front.jpg", { now: NOW, env: ENV });
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.host).toBe("iconic-media.s3.us-west-004.backblazeb2.com");
    expect(parsed.pathname).toBe("/aryeo-test/caroline-warren/front.jpg");
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(parsed.searchParams.get("X-Amz-Credential")).toContain("/20261125/us-west-004/s3/aws4_request");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(url).not.toContain(ENV.B2_APP_KEY);
  });

  it("uses the public base instead of a signature when that base is set", () => {
    const url = b2ObjectUrl("aryeo/client/listing/front.jpg", {
      now: NOW,
      env: { B2_PUBLIC_BASE_URL: "https://media.iconicimagestx.com/" },
    });
    expect(url).toBe("https://media.iconicimagestx.com/aryeo/client/listing/front.jpg");
    expect(url).not.toContain("X-Amz-");
  });
});

describe("B2 media urls", () => {
  it("leaves Firebase files untouched and signs only b2 files", () => {
    const listing = {
      storageBackend: "b2",
      b2Key: "aryeo/caroline-warren/123-main",
      images: [
        { id: "keep", url: "https://firebasestorage.googleapis.com/v0/b/bucket/o/a.jpg?alt=media&token=abc", storageBackend: "firebase" },
        { id: "full", b2Key: "aryeo/caroline-warren/123-main/002_front.jpg", deliveryName: "002_front.jpg", sortOrder: 2 },
        { id: "rel", b2Key: "001_kitchen.jpg", name: "kitchen.jpg", sortOrder: 1 },
      ],
    };
    const stamped = applyB2MediaUrls(listing, { now: NOW, env: ENV });
    const images = stamped.images as Array<Record<string, unknown>>;
    expect(images[0]).toBe(listing.images[0]);
    expect(images[1]).toMatchObject({
      id: "full",
      b2Key: "aryeo/caroline-warren/123-main/002_front.jpg",
      deliveryName: "002_front.jpg",
    });
    expect(String(images[1].url)).toContain("/aryeo/caroline-warren/123-main/002_front.jpg");
    expect(String(images[2].url)).toContain("/aryeo/caroline-warren/123-main/001_kitchen.jpg");
    expect(String(images[1].downloadUrl)).toContain("response-content-disposition");
    expect(decodeURIComponent(String(images[1].downloadUrl))).toContain("filename=\"002_front.jpg\"");
    expect(listing.images[1]).not.toHaveProperty("url");
  });

  it("signs a file that names b2 even when the listing does not", () => {
    const listing = {
      images: [
        { url: "https://firebasestorage.googleapis.com/v0/b/bucket/o/old.jpg?alt=media&token=t", name: "old.jpg" },
        { storageBackend: "b2", b2Key: "aryeo-test/caroline-warren/new.jpg", name: "new.jpg" },
      ],
    };
    const stamped = applyB2MediaUrls(listing, { now: NOW, env: ENV });
    const images = stamped.images as Array<Record<string, unknown>>;
    expect(images[0].url).toBe(listing.images[0].url);
    expect(String(images[1].url)).toContain("/aryeo-test/caroline-warren/new.jpg");
  });

  it("does not invent a url when B2 is not configured", () => {
    const listing = {
      images: [{ storageBackend: "b2", b2Key: "aryeo-test/caroline-warren/new.jpg", name: "new.jpg" }],
    };
    const stamped = applyB2MediaUrls(listing, { env: {} });
    expect(stamped).toBe(listing);
    expect(b2ObjectUrl("aryeo-test/file.jpg", { env: {} })).toBe("");
    expect(b2ReadableHosts({})).toEqual([]);
  });

  it("rejects unsafe keys", () => {
    const listing = {
      storageBackend: "b2",
      images: [
        { b2Key: "../secret.jpg" },
        { b2Key: "/abs.jpg" },
        { b2Key: "a\\b.jpg" },
        { b2Key: "ok/front.jpg", name: "front.jpg" },
      ],
    };
    const stamped = applyB2MediaUrls(listing, { now: NOW, env: ENV });
    const images = stamped.images as Array<Record<string, unknown>>;
    expect(images[0]).toBe(listing.images[0]);
    expect(String(images[1].url)).toContain("/abs.jpg");
    expect(images[2]).toBe(listing.images[2]);
    expect(String(images[3].url)).toContain("/ok/front.jpg");
  });

  it("keeps saved order and delivery filenames for downloads", () => {
    const gallery = {
      storageBackend: "b2",
      mediaItems: [
        { b2Key: "aryeo/client/listing/c.jpg", deliveryName: "003_main.jpg", sortOrder: 3, type: "photo" },
        { b2Key: "aryeo/client/listing/a.jpg", deliveryName: "001_main.jpg", sortOrder: 1, type: "photo", culled: true },
        { b2Key: "aryeo/client/listing/b.jpg", deliveryName: "002_main.jpg", sortOrder: 2, type: "photo" },
      ],
    };
    expect(orderedDownloadPlan(gallery.mediaItems, gallery).map((row) => [row.name, row.key])).toEqual([
      ["002_main.jpg", "aryeo/client/listing/b.jpg"],
      ["003_main.jpg", "aryeo/client/listing/c.jpg"],
    ]);
  });

  it("allows only the configured B2 hosts to be fetched for previews", () => {
    expect(b2ReadableHosts(ENV)).toEqual([
      "s3.us-west-004.backblazeb2.com",
      "iconic-media.s3.us-west-004.backblazeb2.com",
    ]);
    expect(b2ReadableHosts({ B2_PUBLIC_BASE_URL: "https://media.iconicimagestx.com" })).toContain("media.iconicimagestx.com");
  });

  it("does not log credentials", () => {
    const source = readFileSync(new URL("./b2Storage.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
    expect(source).not.toContain("B2_APP_KEY}");
  });
});

describe("B2 CORS and lockbox", () => {
  it("names the portal origins on the bucket rule", () => {
    const rule = B2_BUCKET_CORS.CORSRules[0];
    expect(rule.AllowedMethods).toEqual(["GET", "HEAD"]);
    for (const origin of ["https://iconicimagestx.com", "https://www.iconicimagestx.com", "https://iconicimagestx.vercel.app"]) {
      expect(rule.AllowedOrigins).toContain(origin);
    }
    expect(rule.AllowedOrigins).toEqual([...B2_PORTAL_ORIGINS]);
    expect(rule.ExposeHeaders).toContain("Content-Disposition");
  });

  it("reads a lockbox from orders.staffOnly and keeps it off the client listing", () => {
    expect(lockboxCodeFromOrder({ lockboxCode: "1111", staffOnly: { lockboxCode: "9999" } })).toBe("1111");
    expect(lockboxCodeFromOrder({ staffOnly: { lockboxCode: "4455" } })).toBe("4455");
    const detail = buildPortalListingDetail({
      listing: { id: "listing1234", address: "123 Main St, Austin, TX" },
      order: { id: "order1", notes: "Meet the agent out front.", staffOnly: { lockboxCode: "4455" } },
    });
    const packed = JSON.stringify(detail);
    expect(packed).not.toContain("4455");
    expect(packed).not.toContain("staffOnly");
  });
});
