/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  cullWorkingShot,
  mergeStoredOrder,
  readStoredPhotoOrder,
  readStoredSequenceAddress,
  reorderWorkingShots,
  sequenceNamesFor,
  shotsFromListingImages,
  writeStoredPhotoOrder,
  type WorkingShot,
} from "./photoOrder";

const shots: WorkingShot[] = [
  { key: "listings/a/photos/kitchen.jpg", name: "kitchen.jpg", url: "https://cdn.example/kitchen.jpg", path: "listings/a/photos/kitchen.jpg", culled: false },
  { key: "listings/a/photos/front.jpg", name: "front.jpg", url: "https://cdn.example/front.jpg", path: "listings/a/photos/front.jpg", culled: false },
  { key: "listings/a/photos/yard.jpg", name: "yard.jpg", url: "https://cdn.example/yard.jpg", path: "listings/a/photos/yard.jpg", culled: true },
];

describe("photographer photo order", () => {
  it("rebuilds listing images and keeps a culled shot in the working set", () => {
    const loaded = shotsFromListingImages([
      { id: "listings/a/photos/yard.jpg", path: "listings/a/photos/yard.jpg", url: "https://cdn.example/yard.jpg", name: "yard.jpg", culled: true, sortOrder: 2 },
      { id: "listings/a/photos/front.jpg", path: "listings/a/photos/front.jpg", url: "https://cdn.example/front.jpg", name: "front.jpg", sortOrder: 1 },
    ]);
    expect(loaded.map((shot) => shot.key)).toEqual([
      "listings/a/photos/yard.jpg",
      "listings/a/photos/front.jpg",
    ]);
    expect(loaded[0].culled).toBe(true);
  });

  it("keeps drag order and cull flags across a reload", () => {
    const moved = reorderWorkingShots(shots, "listings/a/photos/front.jpg", "listings/a/photos/kitchen.jpg");
    const culled = cullWorkingShot(moved, "listings/a/photos/kitchen.jpg", true);
    writeStoredPhotoOrder("listing1234", culled, "123 Main St");
    const stored = readStoredPhotoOrder("listing1234");
    const restored = mergeStoredOrder(shots, stored);
    expect(restored.map((shot) => shot.key)).toEqual([
      "listings/a/photos/front.jpg",
      "listings/a/photos/kitchen.jpg",
      "listings/a/photos/yard.jpg",
    ]);
    expect(restored.find((shot) => shot.key.endsWith("kitchen.jpg"))?.culled).toBe(true);
    expect(readStoredSequenceAddress("listing1234")).toBe("123 Main St");
    expect(sequenceNamesFor(restored, "123 Main St").map((item) => item.name)).toEqual(["001_123-main-st.jpg"]);
  });
});
