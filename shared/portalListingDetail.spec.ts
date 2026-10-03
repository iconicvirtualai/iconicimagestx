import { describe, expect, it } from "vitest";
import {
  applyPortalMediaChange,
  buildPortalListingDetail,
  hiddenPresentationKeys,
  mapEmbedUrl,
  portalListingId,
  portalListingPageMode,
  portalListingTab,
  readMediaStore,
  sanitizeWebsiteSettings,
  visitorPortalListingDetail,
} from "./portalListingDetail";

const listingId = "listing1234";

function sources() {
  return {
    listing: {
      id: listingId,
      status: "scheduled",
      createdAt: "2026-04-01T15:00:00.000Z",
      address: "100 Playtest Lane, Apt 2, Austin, TX 78701, USA",
      lat: 30.2672,
      lng: -97.7431,
      bedrooms: 4,
      bathrooms: 3,
      yearBuilt: 1998,
      pool: true,
      neighborhood: "Tarrytown",
      portalMedia: {
        photos: { living: { hidden: true, order: 1 } },
      },
      images: [
        { id: "living", name: "living.jpg", path: "listings/listing1234/photos/living.jpg", url: "https://cdn.example/living.jpg", contentType: "image/jpeg", uploadedAt: "2026-04-03T15:00:00.000Z" },
        { id: "kitchen", name: "kitchen.jpg", path: "listings/listing1234/photos/kitchen.jpg", url: "https://cdn.example/kitchen.jpg", contentType: "image/jpeg", uploadedAt: "2026-04-03T16:00:00.000Z", order: 0 },
        { id: "angle", name: "floorplan-angle.jpg", path: "listings/listing1234/photos/floorplan-angle.jpg", url: "https://cdn.example/floorplan-angle.jpg", contentType: "image/jpeg" },
      ],
      videos: [
        { id: "walkthrough", name: "walkthrough.mp4", url: "https://cdn.example/walk.mp4", contentType: "video/mp4", uploadedAt: "2026-04-04T15:00:00.000Z" },
        { id: "clip", name: "clip.webm", url: "https://cdn.example/clip.webm", contentType: "video/webm" },
      ],
      matterportUrl: "https://my.matterport.com/show/?m=abc123",
      floorplans: [
        { id: "level1", name: "level1.jpg", url: "https://cdn.example/level1.jpg", type: "image/jpeg", uploadedAt: "2026-04-05T15:00:00.000Z" },
        { id: "cad", name: "plan.pdf", url: "https://cdn.example/plan.pdf", type: "application/pdf" },
      ],
      auditLog: [{ action: "Lockbox code updated", at: "2026-04-02T12:00:00.000Z" }],
    },
    orderRequest: {
      id: "req1",
      squareFootage: "2400",
      submittedAt: "2026-03-30T15:00:00.000Z",
      schools: "Austin ISD",
    },
    order: {
      id: "order1",
      status: "confirmed",
      confirmedAt: "2026-03-31T15:00:00.000Z",
    },
    invoices: [{
      id: "inv1",
      invoiceNumber: "INV-2026-100",
      status: "draft",
      total: 450,
      amountDue: 450,
      createdAt: "2026-03-31T16:00:00.000Z",
    }],
    galleries: [{
      id: "gal1",
      status: "pending_upload",
      createdAt: "2026-03-31T17:00:00.000Z",
      mediaItems: [
        { id: "suite", type: "photo", url: "https://cdn.example/suite.jpg", fileName: "suite.jpg" },
      ],
    }],
    appointments: [{
      id: "appt1",
      status: "requested",
      createdAt: "2026-03-30T16:00:00.000Z",
    }],
  };
}

describe("portal listing detail", () => {
  it("reads the booking address, property facts, and leaves missing facts blank", () => {
    const detail = buildPortalListingDetail(sources());
    expect(detail.address).toMatchObject({
      line1: "100 Playtest Lane",
      line2: "Apt 2",
      city: "Austin",
      state: "TX",
      zip: "78701",
      lat: 30.2672,
      lng: -97.7431,
    });
    expect(detail.address.mapUrl).toBe(mapEmbedUrl(30.2672, -97.7431));
    expect(detail.facts.find((fact) => fact.id === "beds")?.value).toBe("4");
    expect(detail.facts.find((fact) => fact.id === "sqft")?.value).toBe("2400");
    expect(detail.facts.find((fact) => fact.id === "pool")?.value).toBe("Yes");
    expect(detail.facts.find((fact) => fact.id === "schools")?.value).toBe("Austin ISD");
    expect(detail.facts.find((fact) => fact.id === "lotSize")).toMatchObject({ empty: true, value: "Not on file yet" });
    expect(detail.facts.find((fact) => fact.id === "office")).toMatchObject({ empty: true });
    expect(JSON.stringify(detail)).not.toContain("Lockbox");
  });

  it("keeps a hidden photo on file and out of the presentation set", () => {
    const detail = buildPortalListingDetail(sources());
    const living = detail.photos.find((photo) => photo.id === "living");
    expect(living?.hidden).toBe(true);
    expect(living?.url).toBe("https://cdn.example/living.jpg");
    expect(hiddenPresentationKeys(sources().listing).has("living")).toBe(true);

    const shown = applyPortalMediaChange(
      readMediaStore(sources().listing.portalMedia),
      detail.photos,
      { kind: "photo", id: "living", hidden: false },
      "2026-04-06T15:00:00.000Z",
    );
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(shown.store.photos.living.hidden).toBe(false);
    expect(shown.activity?.summary).toMatch(/Restored/);

    const moved = applyPortalMediaChange(shown.store, detail.photos.map((photo) => (
      photo.id === "living" ? { ...photo, hidden: false } : photo
    )), { kind: "photo", id: "kitchen", move: "later" }, "2026-04-06T16:00:00.000Z");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.store.photos.kitchen.order).toBeGreaterThan(moved.store.photos.living.order);
    expect(applyPortalMediaChange(shown.store, detail.photos, { kind: "photo", id: "missing", hidden: true }, "2026-04-06T17:00:00.000Z").ok).toBe(false);
  });

  it("collects mp4 video, Matterport, and jpg floorplans only", () => {
    const detail = buildPortalListingDetail(sources());
    expect(detail.videos.map((video) => video.id)).toEqual(["walkthrough"]);
    expect(detail.tours[0]).toMatchObject({
      provider: "Matterport",
      embedUrl: "https://my.matterport.com/show/?m=abc123",
    });
    expect(detail.photos.some((photo) => photo.id === "angle")).toBe(true);
    expect(detail.floorplans.map((plan) => plan.name)).toEqual(["level1.jpg"]);
    expect(detail.marketing.map((card) => card.status)).toEqual(["not_connected", "not_connected", "not_connected"]);
    expect(detail.invoices[0]).toMatchObject({ invoiceNumber: "INV-2026-100", status: "draft", total: 450 });
    expect(JSON.stringify(detail.invoices)).not.toContain("/invoice/");
  });

  it("orders activity from the booking forward and skips internal notes", () => {
    const summaries = buildPortalListingDetail(sources()).activity.map((event) => event.summary);
    expect(summaries[0]).toBe("Booking request received");
    expect(summaries).toContain("Booking confirmed");
    expect(summaries).toContain("Photo uploaded: kitchen.jpg");
    expect(summaries).toContain("Invoice INV-2026-100 is draft");
    expect(summaries.join(" ")).not.toMatch(/lockbox/i);
    expect(summaries.indexOf("Booking request received")).toBeLessThan(summaries.indexOf("Photo uploaded: kitchen.jpg"));
  });

  it("accepts only listing-site choices", () => {
    expect(sanitizeWebsiteSettings({
      font: "serif",
      color: "nope",
      style: "editorial",
      showPhotos: false,
    })).toMatchObject({
      font: "serif",
      color: "ink",
      style: "editorial",
      showPhotos: false,
      showVideo: true,
    });
    expect(portalListingTab("photos")).toBe("photos");
    expect(portalListingTab("har")).toBe("data");
  });

  it("treats a listing link as public and keeps a malformed id off the page", () => {
    expect(portalListingPageMode({ loading: true, isClient: false })).toBe("pending");
    expect(portalListingPageMode({ loading: false, isClient: false })).toBe("public");
    expect(portalListingPageMode({ loading: false, isClient: true })).toBe("owner-check");
    expect(portalListingId("listing1234")).toBe("listing1234");
    expect(portalListingId("no")).toBe("");
    expect(portalListingId("")).toBe("");
    expect(portalListingId("../admin")).toBe("");

    const detail = buildPortalListingDetail(sources());
    const visitor = visitorPortalListingDetail({
      ...detail,
      activity: [
        ...detail.activity,
        { id: "pay1", at: "2026-04-06T15:00:00.000Z", kind: "invoice", summary: "Payment recorded on INV-2026-100" },
        { id: "web1", at: "2026-04-07T15:00:00.000Z", kind: "website", summary: "Listing site style updated" },
      ],
    });
    expect(visitor.address.line1).toBe("100 Playtest Lane");
    expect(visitor.facts.find((fact) => fact.id === "beds")?.value).toBe("4");
    expect(visitor.photos.map((photo) => photo.id)).not.toContain("living");
    expect(visitor.photos.map((photo) => photo.id)).toContain("kitchen");
    expect(visitor.photos.some((photo) => photo.hidden)).toBe(false);
    expect(visitor.title).toBe(detail.title);
    expect(visitor.invoices).toEqual([]);
    const summaries = visitor.activity.map((event) => event.summary);
    expect(summaries).toContain("Booking request received");
    expect(summaries).toContain("Photo uploaded: kitchen.jpg");
    expect(summaries).toContain("Listing site style updated");
    expect(summaries.join(" ")).not.toMatch(/invoice|payment|amount due/i);
    const body = JSON.stringify(visitor);
    expect(body).not.toMatch(/INV-2026-100/);
    expect(body).not.toMatch(/"invoiceNumber"|"amountDue"|"total"/);
    expect(detail.invoices[0]).toMatchObject({
      invoiceNumber: "INV-2026-100",
      status: "draft",
      total: 450,
      amountDue: 450,
    });
    expect(detail.activity.map((event) => event.summary)).toContain("Invoice INV-2026-100 is draft");
  });
});
