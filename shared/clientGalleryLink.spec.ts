import { describe, expect, it } from "vitest";
import { decideClientGalleryLink, type GalleryLinkDoc } from "./clientGalleryLink";

const LISTING_ID = "V92oe4gWihszc95tEcVQ";

function listing(overrides: Record<string, unknown> = {}): GalleryLinkDoc {
  return {
    id: LISTING_ID,
    studioEnabled: true,
    address: "100 Main St, Austin, TX",
    clientName: "Ada Agent",
    clientEmail: "ada@example.com",
    clientPhone: "512-555-0100",
    notes: "lockbox 1234",
    studioToken: "secret-token",
    images: [
      { url: "https://cdn.example/final.jpg", name: "front.jpg", path: `listings/${LISTING_ID}/finals/1_front.jpg` },
      { url: "https://cdn.example/raw.dng", name: "front.dng", path: `listings/${LISTING_ID}/raw/1_front.dng`, contentType: "image/x-adobe-dng" },
      { url: "javascript:alert(1)", name: "bad.jpg", path: `listings/${LISTING_ID}/photos/bad.jpg` },
    ],
    videos: [
      { url: "javascript:alert(1)", name: "bad" },
      { url: "https://cdn.example/walkthrough.mp4", name: "Walkthrough" },
    ],
    tourUrl: "javascript:alert(1)",
    ...overrides,
  };
}

const empty = {
  gallery: null,
  listing: null,
  relatedGalleries: [],
  order: null,
  orderRequest: null,
  pointedGallery: null,
  pointedListing: null,
  galleriesByOrderId: [],
};

describe("decideClientGalleryLink", () => {
  it("opens a listing when /studio uses a project id and no gallery doc exists", () => {
    const result = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: listing() });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "listing") throw new Error("expected the listing studio");
    expect(result.openGalleryId).toBeNull();
    expect(result.project.id).toBe(LISTING_ID);
    expect(result.project.images).toEqual([{ url: "https://cdn.example/final.jpg", name: "front.jpg" }]);
    expect(result.project.videos).toEqual([{ url: "https://cdn.example/walkthrough.mp4", name: "Walkthrough" }]);
    expect(result.project.tourUrl).toBe("");
    expect(result.project.view).toBe("public");
    expect(result.project.downloadsUnlocked).toBe(false);
    expect(result.project.clientName).toBe("Ada Agent");
    expect(JSON.stringify(result.project)).not.toContain("ada@example.com");
    expect(JSON.stringify(result.project)).not.toContain("javascript:");
    expect(JSON.stringify(result.project)).not.toContain("512-555-0100");
    expect(JSON.stringify(result.project)).not.toContain("lockbox");
    expect(JSON.stringify(result.project)).not.toContain("secret-token");
    expect(JSON.stringify(result.project)).not.toContain("/raw/");
  });

  it("sends a released linked gallery when the shared id is the project", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ galleryId: "galleryDelivered1" }),
      relatedGalleries: [
        { id: "galleryPending01", status: "pending_upload", listingId: LISTING_ID },
        { id: "galleryDelivered1", status: "delivered", listingId: LISTING_ID },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "listing") throw new Error("expected a listing redirect");
    expect(result.openGalleryId).toBe("galleryDelivered1");
  });

  it("keeps the project studio when the linked gallery is not released", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing(),
      relatedGalleries: [{ id: "galleryPending01", status: "ready_for_review", listingId: LISTING_ID }],
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "listing") throw new Error("expected the listing studio");
    expect(result.openGalleryId).toBeNull();
    expect(result.project.notice).toMatch(/not public yet/);
  });

  it("names a real gallery that has not been delivered or approved", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: "galleryPending01",
      gallery: { id: "galleryPending01", status: "pending_upload" },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "gallery") throw new Error("expected the gallery");
    expect(result.released).toBe(false);
    expect(result.staffNote).toMatch(/pending_upload/);
    expect(result.staffNote).toMatch(/not a missing link/);
  });

  it("opens a delivered gallery document directly", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: "galleryDelivered1",
      gallery: { id: "galleryDelivered1", status: "approved" },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "gallery") throw new Error("expected the gallery");
    expect(result.released).toBe(true);
    expect(result.galleryId).toBe("galleryDelivered1");
  });

  it("unlocks the owning client only after payment or a staff release", () => {
    const paid = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ invoiceStatus: "paid", lockDownloads: true }),
    });
    expect(paid.ok).toBe(true);
    if (paid.ok !== true || paid.kind !== "listing") throw new Error("expected the listing studio");
    expect(paid.project.downloadsUnlocked).toBe(true);
    expect(paid.project.view).toBe("public");

    const released = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ lockDownloads: true, invoiceStatus: "sent", downloadsReleased: true }),
    });
    if (released.ok !== true || released.kind !== "listing") throw new Error("expected the listing studio");
    expect(released.project.downloadsUnlocked).toBe(true);

    const locked = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ lockDownloads: true, requirePayment: false, invoiceStatus: "sent" }),
    });
    if (locked.ok !== true || locked.kind !== "listing") throw new Error("expected the listing studio");
    expect(locked.project.downloadsUnlocked).toBe(false);
    expect(locked.project.images).toEqual([{ url: "https://cdn.example/final.jpg", name: "front.jpg" }]);

    const unset = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ invoiceStatus: "sent" }),
    });
    if (unset.ok !== true || unset.kind !== "listing") throw new Error("expected the listing studio");
    expect(unset.project.lockDownloads).toBe(true);
    expect(unset.project.requirePayment).toBe(true);
    expect(unset.project.downloadsUnlocked).toBe(false);

    const paidUnset = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ invoiceStatus: "paid" }),
    });
    if (paidUnset.ok !== true || paidUnset.kind !== "listing") throw new Error("expected the listing studio");
    expect(paidUnset.project.lockDownloads).toBe(true);
    expect(paidUnset.project.downloadsUnlocked).toBe(true);

    const releasedByStaff = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ invoiceStatus: "sent", lockDownloads: false }),
    });
    if (releasedByStaff.ok !== true || releasedByStaff.kind !== "listing") throw new Error("expected the listing studio");
    expect(releasedByStaff.project.lockDownloads).toBe(false);
    expect(releasedByStaff.project.downloadsUnlocked).toBe(true);
  });

  it("says when the project exists but Client Studio is off or locked", () => {
    const disabled = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ studioEnabled: false }),
    });
    expect(disabled.ok).toBe(false);
    if (disabled.ok !== false) throw new Error("expected a refusal");
    expect(disabled.code).toBe("studio_disabled");
    expect(disabled.message).toMatch(/Client Studio is turned off/);
    expect(disabled.message).toMatch(LISTING_ID);

    const locked = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ lockStudio: true }),
    });
    expect(locked.ok).toBe(false);
    if (locked.ok !== false) throw new Error("expected a refusal");
    expect(locked.code).toBe("studio_locked");
    expect(locked.message).toMatch(/Lock Studio is on/);
  });

  it("explains an id that is in neither galleries nor listings", () => {
    const result = decideClientGalleryLink({ ...empty, id: LISTING_ID });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected unknown");
    expect(result.code).toBe("unknown");
    expect(result.httpStatus).toBe(404);
    expect(result.message).toMatch(/galleries\/V92oe4gWihszc95tEcVQ/);
    expect(result.message).toMatch(/listings\/V92oe4gWihszc95tEcVQ/);
    expect(result.message).toMatch(/Fotello/);
  });

  it("follows an order id to its delivered gallery", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: "orderId1234567890",
      order: { id: "orderId1234567890" },
      galleriesByOrderId: [{ id: "galleryDelivered1", status: "delivered" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "gallery") throw new Error("expected the order gallery");
    expect(result.galleryId).toBe("galleryDelivered1");
    expect(result.released).toBe(true);
    expect(result.staffNote).toMatch(/order id/);
  });

  it("rejects a short or unsafe id before any lookup", () => {
    const result = decideClientGalleryLink({ ...empty, id: "../secret" });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected invalid");
    expect(result.code).toBe("invalid_id");
    expect(result.httpStatus).toBe(400);
  });
});
