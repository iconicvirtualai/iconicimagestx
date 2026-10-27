import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("listing uploads meet the delivery gallery", () => {
  it("appends media on galleryId and leaves the pay lock alone", () => {
    const source = readFileSync(new URL("./listingMedia.ts", import.meta.url), "utf8");
    const start = source.indexOf("async function syncListingGallery");
    const end = source.indexOf("async function syncPlaytestGallery");
    const fn = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(fn).toContain("listing.galleryId");
    expect(fn).toContain("mediaItems: admin.firestore.FieldValue.arrayUnion");
    expect(fn).not.toContain("lockDownloads");
    expect(fn).not.toContain("requirePayment");
    expect(fn).not.toContain("status:");
    expect(source).toContain("await syncListingGallery(listing, image)");

    const sequence = source.slice(source.indexOf("export async function publishListingGallerySequence"));
    expect(sequence).toContain("addressOverride");
    expect(sequence).toContain("sequenceKeptShots");
    expect(sequence).not.toMatch(/sendMail|sendSms|twilio|CLIENT_NOTIFY|BOOKING_NOTIFY/);

    const deliver = readFileSync(new URL("./galleryDeliver.ts", import.meta.url), "utf8");
    expect(deliver).toContain("deliverGalleryToClient");

    const page = readFileSync(new URL("../../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
    expect(page).toContain('navigate(`/admin/listing/${order.listingId}`)');
    expect(page).toContain('navigate("/admin/delivery")');
    expect(page).toContain("> Media");
  });
});
