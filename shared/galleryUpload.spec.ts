import { describe, expect, it } from "vitest";
import { keptShots } from "./gallerySequence";
import {
  emptyListingKit,
  ensureNamedSection,
  galleryUploadExtra,
  listingKitFieldShown,
  listingKitRefreshTodo,
  readListingKit,
  videoAspectBucket,
  videoUploadReady,
} from "./galleryUpload";
import { readMediaArrangement, setItemsHidden, stampListingArrangement } from "./mediaArrangement";
import { buildPortalListingDetail, visitorPortalListingDetail } from "./portalListingDetail";

describe("gallery delivery helpers", () => {
  it("sorts video aspect into reels, listing, and other", () => {
    expect(videoAspectBucket(1080, 1920).bucket).toBe("reels");
    expect(videoAspectBucket(1920, 1080).label).toBe("16:9");
    expect(videoAspectBucket(1000, 1000).bucket).toBe("other");
    expect(videoAspectBucket(0, 0).label).toBe("Size unknown");
  });

  it("blocks a video upload until the name and brand label are set", () => {
    expect(videoUploadReady("", "branded")).toBe(false);
    expect(videoUploadReady("Walkthrough", "")).toBe(false);
    expect(videoUploadReady("Walkthrough", "cinema")).toBe(false);
    expect(videoUploadReady(" 801 River Twilight ", "unbranded")).toBe(true);
  });

  it("keeps only the upload fields the listing file is allowed to store", () => {
    expect(galleryUploadExtra({
      displayName: "Front walk",
      brandLabel: "both",
      assetType: "video",
      width: 1920,
      height: 1080,
      aspectLabel: "16:9",
      platform: "Instagram",
      caption: "Just listed",
      token: "secret",
      url: "https://evil.example",
    })).toEqual({
      displayName: "Front walk",
      brandLabel: "both",
      assetType: "video",
      width: 1920,
      height: 1080,
      aspectLabel: "16:9",
      platform: "Instagram",
      caption: "Just listed",
    });
  });

  it("creates a named section once", () => {
    const first = ensureNamedSection(readMediaArrangement(null), "Reels");
    const second = ensureNamedSection(first.arrangement, "Reels");
    expect(first.sectionId).toMatch(/^s/);
    expect(second.sectionId).toBe(first.sectionId);
    expect(second.arrangement.sections).toHaveLength(1);
  });

  it("leaves listing-kit slots empty and remembers a show switch", () => {
    const empty = emptyListingKit();
    expect(empty.slots.every((slot) => slot.body === "")).toBe(true);
    expect(empty.source).toBe("");
    const saved = readListingKit({
      slots: [{ id: "crime", body: "Staff wrote this.", showOnGallery: false }],
      fields: { beds: false },
    });
    expect(saved.slots.find((slot) => slot.id === "crime")).toMatchObject({ body: "Staff wrote this.", showOnGallery: false });
    expect(saved.slots.find((slot) => slot.id === "neighborhood")?.body).toBe("");
    expect(listingKitFieldShown(saved, "beds")).toBe(false);
    expect(listingKitFieldShown(saved, "baths")).toBe(true);
    expect(listingKitRefreshTodo("801 River Road").ok).toBe(false);
  });

  it("hides a photo from the client gallery and keeps it on the listing", () => {
    const listing = {
      id: "listing1234",
      address: "123 Main St, Spring, TX",
      status: "delivered",
      galleryStatus: "delivered",
      images: [
        { id: "front", name: "front.jpg", path: "listings/listing1234/photos/front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" },
        { id: "kitchen", name: "kitchen.jpg", path: "listings/listing1234/photos/kitchen.jpg", url: "https://cdn.example/kitchen.jpg", contentType: "image/jpeg" },
      ],
    };
    const hidden = setItemsHidden(readMediaArrangement(null), ["kitchen"], true);
    const stamped = stampListingArrangement(listing, hidden, listing.address);
    const images = stamped.listing.images as Array<{ id: string; hiddenFromGallery?: boolean }>;
    expect(images.find((item) => item.id === "kitchen")?.hiddenFromGallery).toBe(true);
    expect(keptShots(images).map((item) => item.id)).toEqual(["front"]);

    const detail = buildPortalListingDetail({ listing: stamped.listing });
    expect(detail.photos.map((photo) => photo.id).sort()).toEqual(["front", "kitchen"]);
    expect(detail.photos.find((photo) => photo.id === "kitchen")?.hidden).toBe(true);
    expect(visitorPortalListingDetail(detail).photos.map((photo) => photo.id)).toEqual(["front"]);
  });
});
