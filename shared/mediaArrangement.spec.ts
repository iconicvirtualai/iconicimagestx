import { describe, expect, it } from "vitest";
import { deliveryFileName, orderedGalleryMedia } from "./gallerySequence";
import { buildPublicListingSite } from "./listingSite";
import {
  collectArrangementMedia,
  createSection,
  deleteSection,
  moveIntoSection,
  moveSelection,
  readMediaArrangement,
  renameSection,
  reorderSections,
  sequenceArrangement,
  setSectionHidden,
  stampGalleryMediaItems,
  stampListingArrangement,
  type ArrangementMedia,
} from "./mediaArrangement";
import { buildPortalListingDetail } from "./portalListingDetail";
import { collectPresentationPhotos } from "./presentation";

const address = "123 Main St, Spring, TX";

function listing() {
  return {
    id: "listing1234",
    address,
    portalWebsite: {
      published: true,
      design: "index",
      showPhotos: true,
      showVideo: true,
      showTours: true,
      showFloorplans: true,
    },
    images: [
      { id: "yard", name: "yard.jpg", path: "listings/listing1234/photos/yard.jpg", url: "https://cdn.example/yard.jpg", contentType: "image/jpeg" },
      { id: "front", name: "front.jpg", path: "listings/listing1234/photos/front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" },
      { id: "kitchen", name: "kitchen.jpg", path: "listings/listing1234/photos/kitchen.jpg", url: "https://cdn.example/kitchen.jpg", contentType: "image/jpeg" },
      { id: "culled", name: "culled.jpg", path: "listings/listing1234/photos/culled.jpg", url: "https://cdn.example/culled.jpg", contentType: "image/jpeg", culled: true },
    ],
    videos: [
      { id: "walkthrough", name: "walkthrough.mp4", path: "listings/listing1234/video/walkthrough.mp4", url: "https://cdn.example/walkthrough.mp4", contentType: "video/mp4" },
    ],
    tours: [
      { id: "matterport", name: "3D tour", url: "https://my.matterport.com/show/?m=abc12345", type: "tour" },
    ],
    floorplans: [
      { id: "level1", name: "level-1.png", path: "listings/listing1234/plans/level-1.png", url: "https://cdn.example/level-1.png", contentType: "image/png" },
    ],
    files: [
      { id: "brochure", name: "brochure.pdf", path: "listings/listing1234/files/brochure.pdf", url: "https://cdn.example/brochure.pdf", contentType: "application/pdf" },
    ],
    portalMedia: {
      photos: {
        yard: { hidden: false, order: 0, groupId: "" },
        front: { hidden: false, order: 1, groupId: "" },
      },
    },
  };
}

function savedOrder() {
  const media = collectArrangementMedia(listing());
  let created = createSection(readMediaArrangement(null), "Twilight", ["front", "kitchen", "walkthrough"], "stwilight1");
  if (created.ok === false) throw new Error(created.error);
  created = createSection(created.arrangement, "Behind the scenes", ["yard", "brochure"], "sbehind01");
  if (created.ok === false) throw new Error(created.error);
  const hidden = setSectionHidden(created.arrangement, "sbehind01", true);
  if (hidden.ok === false) throw new Error(hidden.error);
  const moved = moveIntoSection(media, hidden.arrangement, ["level1"], "stwilight1");
  if (moved.ok === false) throw new Error(moved.error);
  return moved.arrangement;
}

describe("staff media arrangement", () => {
  it("round-trips sections and keeps a multi-file move in one section", () => {
    const media = collectArrangementMedia(listing());
    const arrangement = savedOrder();
    const reread = readMediaArrangement(JSON.parse(JSON.stringify(arrangement)));
    expect(reread.sections.map((section) => section.name)).toEqual(["Twilight", "Behind the scenes"]);
    expect(reread.sections.find((section) => section.id === "sbehind01")?.hideFromListingSites).toBe(true);
    const ordered = sequenceArrangement(media, reread, address).map((item) => item.id);
    expect(ordered.indexOf("matterport")).toBeLessThan(ordered.indexOf("front"));
    expect(ordered.indexOf("front")).toBeLessThan(ordered.indexOf("yard"));
    const twilight = sequenceArrangement(media, reread, address).filter((item) => item.sectionId === "stwilight1").map((item) => item.id);
    expect(twilight).toEqual(["front", "kitchen", "walkthrough", "level1"]);
  });

  it("renames, reorders, and deletes a section without dropping its files", () => {
    let arrangement = savedOrder();
    const renamed = renameSection(arrangement, "stwilight1", "Daylight");
    if (renamed.ok === false) throw new Error(renamed.error);
    arrangement = reorderSections(renamed.arrangement, ["sbehind01", "stwilight1"]);
    expect(arrangement.sections.map((section) => section.name)).toEqual(["Behind the scenes", "Daylight"]);
    const removed = deleteSection(arrangement, "sbehind01");
    if (removed.ok === false) throw new Error(removed.error);
    expect(removed.arrangement.sections.map((section) => section.id)).toEqual(["stwilight1"]);
    const yard = removed.arrangement.placements.find((item) => item.id === "yard");
    expect(yard?.sectionId).toBe("");
  });

  it("drags a multi-selection ahead of another file and into that file's section", () => {
    const rows = [
      { id: "front", sectionId: "stwilight1" },
      { id: "yard", sectionId: "sbehind01" },
      { id: "walkthrough", sectionId: "sbehind01" },
    ];
    const next = moveSelection(rows, ["yard", "walkthrough"], "front", "before");
    expect(next.map((row) => row.id)).toEqual(["yard", "walkthrough", "front"]);
    expect(next.every((row) => row.sectionId === "stwilight1")).toBe(true);
  });

  it("survives a reload and shows that order on the client gallery, listing site, and downloads", () => {
    const arrangement = savedOrder();
    const first = stampListingArrangement(listing(), arrangement, address);
    const reloaded = stampListingArrangement(
      JSON.parse(JSON.stringify(first.listing)) as Record<string, unknown>,
      readMediaArrangement(JSON.parse(JSON.stringify(first.listing.mediaArrangement))),
      address,
    );
    expect(reloaded.names).toEqual(first.names);
    expect(reloaded.names).toEqual([
      "001_123-main-st.jpg",
      "002_123-main-st.jpg",
      "003_123-main-st.mp4",
      "004_123-main-st.png",
      "005_123-main-st.jpg",
      "006_123-main-st.pdf",
    ]);

    const detail = buildPortalListingDetail({ listing: reloaded.listing });
    expect(detail.photos.map((item) => item.id)).toEqual(["front", "kitchen", "yard"]);
    expect(detail.photos.map((item) => item.downloadName)).toEqual([
      "001_123-main-st.jpg",
      "002_123-main-st.jpg",
      "005_123-main-st.jpg",
    ]);
    expect(detail.photoGroups.map((group) => group.name)).toEqual(["Twilight", "Behind the scenes"]);
    expect(detail.videos.map((item) => item.downloadName)).toEqual(["003_123-main-st.mp4"]);
    expect(detail.tours.map((item) => item.id)).toContain("matterport");
    expect(detail.floorplans.map((item) => item.downloadName)).toEqual(["004_123-main-st.png"]);

    const site = buildPublicListingSite(reloaded.listing);
    expect(site?.photos.map((photo) => photo.name)).toEqual(["001_123-main-st.jpg", "002_123-main-st.jpg"]);
    expect(site?.floorplan?.name).toBe("004_123-main-st.png");
    expect(JSON.stringify(site)).not.toContain("005_123-main-st");
    expect(JSON.stringify(site)).not.toContain("006_123-main-st");

    const presentation = collectPresentationPhotos({
      token: "abcdefghijklmnopqrstuv",
      origin: "https://iconicimagestx.com",
      listing: reloaded.listing,
    });
    expect(presentation.map((photo) => photo.id)).toEqual(["front", "kitchen"]);
    expect(presentation.map((photo) => photo.id)).not.toContain("yard");

    const gallery = stampGalleryMediaItems(
      [
        { id: "g-yard", storagePath: "listings/listing1234/photos/yard.jpg", fileName: "yard.jpg", url: "https://cdn.example/yard.jpg" },
        { id: "g-front", storagePath: "listings/listing1234/photos/front.jpg", fileName: "front.jpg", url: "https://cdn.example/front.jpg" },
        { id: "g-kitchen", storagePath: "listings/listing1234/photos/kitchen.jpg", fileName: "kitchen.jpg", url: "https://cdn.example/kitchen.jpg" },
        { id: "g-video", storagePath: "listings/listing1234/video/walkthrough.mp4", fileName: "walkthrough.mp4", url: "https://cdn.example/walkthrough.mp4" },
        { id: "g-plan", storagePath: "listings/listing1234/plans/level-1.png", fileName: "level-1.png", url: "https://cdn.example/level-1.png" },
        { id: "g-pdf", storagePath: "listings/listing1234/files/brochure.pdf", fileName: "brochure.pdf", url: "https://cdn.example/brochure.pdf" },
      ],
      reloaded.sequenced,
    );
    const zipped = orderedGalleryMedia(gallery);
    expect(zipped.map((item) => deliveryFileName(item))).toEqual(reloaded.names);
    expect((reloaded.listing.images as ArrangementMedia[]).some((item) => item.id === "culled" && !item.deliveryName)).toBe(true);
  });
});
