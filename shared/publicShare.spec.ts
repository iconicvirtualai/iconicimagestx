import { describe, expect, it } from "vitest";
import { buildDeliveryQaSeed, DELIVERY_QA_IDS } from "./deliveryQaSeed";
import { publicShareMedia, publicShareVideos, shareDisplayItems, shareDisplayPath } from "./publicShare";

const LISTING_ID = DELIVERY_QA_IDS.listing;

function qaListing() {
  const plan = buildDeliveryQaSeed({ origin: "https://cdn.example" });
  const doc = plan.documents.find((item) => item.id === LISTING_ID);
  if (!doc) throw new Error("missing playtest listing");
  return { id: LISTING_ID, ...doc.data };
}

describe("public share display set", () => {
  it("indexes MLS, full-res, aerials, and floor-plan images and skips PDF and zip", () => {
    const items = shareDisplayItems(qaListing());
    expect(items.map((item) => item.kind)).toEqual(["image", "image", "image", "floorPlan"]);
    expect(items[0]?.sourceUrl).toContain("/media/photos/listing-living-01.jpg");
    expect(items[1]?.sourceUrl).toContain("/media/photos/luxury-exterior.jpg");
    expect(items[2]?.sourceUrl).toContain("/media/photos/drone-hero.jpg");
    expect(items[3]?.sourceUrl).toContain("/media/playtest/TEST-delivery-qa-floorplan.png");
    const joined = items.map((item) => item.sourceUrl).join(" ");
    expect(joined).not.toContain(".pdf");
    expect(joined).not.toContain(".zip");
    expect(joined).not.toContain(".mp4");
  });

  it("points payload photos at the display route and omits video URLs while locked", () => {
    const listing = qaListing();
    const media = publicShareMedia(listing);
    expect(media.images).toEqual([
      { url: shareDisplayPath(LISTING_ID, 0), displayUrl: shareDisplayPath(LISTING_ID, 0), name: "TEST-delivery-qa-mls-photo.jpg" },
      { url: shareDisplayPath(LISTING_ID, 1), displayUrl: shareDisplayPath(LISTING_ID, 1), name: "TEST-delivery-qa-full-res-photo.jpg" },
      { url: shareDisplayPath(LISTING_ID, 2), displayUrl: shareDisplayPath(LISTING_ID, 2), name: "TEST-delivery-qa-aerial.jpg" },
    ]);
    expect(media.floorPlans[0]?.url).toBe(shareDisplayPath(LISTING_ID, 3));
    expect(publicShareVideos(listing, false)).toEqual([]);
    const body = JSON.stringify({ ...media, videos: publicShareVideos(listing, false) });
    for (const hidden of [
      "/media/photos/drone-hero.jpg",
      "/media/playtest/TEST-delivery-qa-floorplan.png",
      "/media/photos/luxury-exterior.jpg",
      "/media/photos/listing-living-01.jpg",
      "/media/blaze/01_BUILT_v2.mp4",
      "/media/video/product-photography.mp4",
      "/media/videos/snap-reels/snap-reel-01.mp4",
      "firebasestorage",
    ]) {
      expect(body).not.toContain(hidden);
    }
  });

  it("adds the branded MP4 and reel with noDownload once playback is open", () => {
    const videos = publicShareVideos(qaListing(), true);
    expect(videos.map((video) => video.noDownload)).toEqual([true, true]);
    expect(videos.map((video) => video.url)).toEqual([
      "https://cdn.example/media/blaze/01_BUILT_v2.mp4",
      "https://cdn.example/media/videos/snap-reels/snap-reel-01.mp4",
    ]);
    const body = JSON.stringify(videos);
    expect(body).not.toContain("product-photography.mp4");
    expect(body).not.toContain("luxury-exterior");
    expect(body).not.toContain("listing-living-01");
    expect(body).not.toContain("drone-hero");
  });

  it("keeps a listing whose only photos are MLS and full-res on the display route", () => {
    const id = "mls-only-listing-id";
    const media = publicShareMedia({
      id,
      images: [
        { url: "https://cdn.example/media/photos/listing-living-01.jpg", name: "mls.jpg", category: "mls", downloadable: true },
        { url: "https://cdn.example/media/photos/luxury-exterior.jpg", name: "full.jpg", category: "full-res", downloadable: true },
      ],
    });
    expect(media.images.map((image) => image.url)).toEqual([
      shareDisplayPath(id, 0),
      shareDisplayPath(id, 1),
    ]);
    const body = JSON.stringify(media);
    expect(body).not.toContain("listing-living-01");
    expect(body).not.toContain("luxury-exterior");
    expect(body).not.toContain("cdn.example");
    expect(body).not.toContain("firebasestorage");
  });
});
