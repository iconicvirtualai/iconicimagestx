import { describe, expect, it } from "vitest";
import { mergeHdrPixels } from "./hdrMerge";
import {
  addressSlug,
  applyPhotoOrder,
  hdrBracketGroups,
  keptShots,
  orderedGalleryMedia,
  sequenceFileName,
  sequenceKeptShots,
} from "./gallerySequence";

describe("gallery sequence names", () => {
  it("builds a short street slug and a zero-padded download name", () => {
    expect(addressSlug("123 Main St, Houston, TX 77002")).toBe("123-main-st");
    expect(sequenceFileName(1, "123 Main St, Houston, TX 77002", "DSC_100.JPEG")).toBe("001_123-main-st.jpg");
    expect(sequenceFileName(12, "123 Main St", "yard.png")).toBe("012_123-main-st.png");
    expect(sequenceFileName(1000, "10 Oak", "a.webp")).toBe("1000_10-oak.webp");
  });

  it("keeps the photographer order, skips culled shots, and survives a fresh read", () => {
    const images = [
      { path: "listings/a/photos/kitchen.jpg", name: "kitchen.jpg" },
      { path: "listings/a/photos/front.jpg", name: "front.jpg" },
      { path: "listings/a/photos/yard.jpg", name: "yard.jpg" },
    ];
    const ordered = applyPhotoOrder(images, [
      { key: "listings/a/photos/yard.jpg", culled: false },
      { key: "listings/a/photos/kitchen.jpg", culled: true },
      { key: "listings/a/photos/front.jpg", culled: false },
    ]);
    expect(ordered.map((item) => item.path)).toEqual([
      "listings/a/photos/yard.jpg",
      "listings/a/photos/kitchen.jpg",
      "listings/a/photos/front.jpg",
    ]);
    expect(keptShots(ordered).map((item) => item.name)).toEqual(["yard.jpg", "front.jpg"]);
    const named = sequenceKeptShots(ordered, "123 Main St");
    expect(named.map((item) => item.deliveryName)).toEqual([
      "001_123-main-st.jpg",
      "002_123-main-st.jpg",
    ]);
    const reread = applyPhotoOrder(ordered, ordered.map((item) => ({
      key: String(item.path),
      culled: (item as { culled?: boolean }).culled === true,
    })));
    expect(sequenceKeptShots(reread, "123 Main St").map((item) => item.deliveryName)).toEqual([
      "001_123-main-st.jpg",
      "002_123-main-st.jpg",
    ]);
  });

  it("sorts gallery items by sortOrder and leaves an unordered gallery alone", () => {
    const media = [
      { fileName: "b.jpg", sortOrder: 2 },
      { fileName: "video.mp4", type: "video" },
      { fileName: "a.jpg", sortOrder: 1 },
      { fileName: "gone.jpg", sortOrder: 3, culled: true },
    ];
    expect(orderedGalleryMedia(media).map((item) => item.fileName)).toEqual(["a.jpg", "b.jpg", "video.mp4"]);
    expect(orderedGalleryMedia([{ fileName: "one.jpg" }, { fileName: "two.jpg" }]).map((item) => item.fileName)).toEqual([
      "one.jpg",
      "two.jpg",
    ]);
  });

  it("groups an exposure stem and a timed burst, and leaves unrelated frames alone", () => {
    const groups = hdrBracketGroups([
      { id: "dark", name: "kitchen-2ev.jpg", shotAt: 1_000 },
      { id: "mid", name: "kitchen-0ev.jpg", shotAt: 1_200 },
      { id: "bright", name: "kitchen+2ev.jpg", shotAt: 1_400 },
      { id: "a", name: "IMG_2041.jpg", shotAt: 10_000 },
      { id: "b", name: "IMG_2042.jpg", shotAt: 11_000 },
      { id: "c", name: "IMG_2043.jpg", shotAt: 12_000 },
      { id: "porch", name: "porch.jpg", shotAt: 80_000 },
    ]);
    expect(groups).toEqual([
      ["dark", "mid", "bright"],
      ["a", "b", "c"],
    ]);
  });
});

describe("hdr exposure fusion", () => {
  it("prefers the well-exposed frame over a crushed and a blown bracket", () => {
    const dark = new Uint8ClampedArray([8, 8, 8, 255]);
    const mid = new Uint8ClampedArray([140, 150, 160, 255]);
    const blown = new Uint8ClampedArray([250, 250, 250, 255]);
    const merged = mergeHdrPixels([dark, mid, blown], 1, 1);
    expect(merged[0]).toBeGreaterThan(80);
    expect(merged[0]).toBeLessThan(200);
    expect(merged[3]).toBe(255);
  });
});
