import { describe, expect, it } from "vitest";
import { sortScratchItems, type ScratchSortable } from "./scratchSort";

function row(
  partial: Partial<ScratchSortable> &
    Pick<ScratchSortable, "name" | "uploadIndex">,
): ScratchSortable {
  return {
    shotAt: 0,
    byteSize: 0,
    ...partial,
  };
}

describe("scratch set sort", () => {
  const items = [
    row({ name: "IMG_10.jpg", uploadIndex: 0, shotAt: 30, byteSize: 100 }),
    row({ name: "IMG_2.jpg", uploadIndex: 1, shotAt: 10, byteSize: 300 }),
    row({ name: "IMG_1.jpg", uploadIndex: 2, shotAt: 20, byteSize: 200 }),
  ];

  it("defaults to natural filename order, smallest number first", () => {
    expect(
      sortScratchItems("name-asc", items).map((item) => item.name),
    ).toEqual(["IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg"]);
  });

  it("reverses filename, date, and size, and can restore upload order", () => {
    expect(
      sortScratchItems("name-desc", items).map((item) => item.name)[0],
    ).toBe("IMG_10.jpg");
    expect(
      sortScratchItems("date-asc", items).map((item) => item.name),
    ).toEqual(["IMG_2.jpg", "IMG_1.jpg", "IMG_10.jpg"]);
    expect(
      sortScratchItems("date-desc", items).map((item) => item.name)[0],
    ).toBe("IMG_10.jpg");
    expect(
      sortScratchItems("size-desc", items).map((item) => item.name),
    ).toEqual(["IMG_2.jpg", "IMG_1.jpg", "IMG_10.jpg"]);
    expect(
      sortScratchItems("size-asc", items).map((item) => item.name)[0],
    ).toBe("IMG_10.jpg");
    expect(
      sortScratchItems("upload", items).map((item) => item.uploadIndex),
    ).toEqual([0, 1, 2]);
  });
});
