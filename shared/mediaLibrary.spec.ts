import { describe, expect, it } from "vitest";
import {
  CUBICASA_MANUAL_NEXT_STEP,
  buildCubiCasaLibraryRequest,
  buildListingObjectPath,
  byteSize,
  canPreviewImage,
  filesInView,
  formatFileSize,
  normalizeMediaFiles,
  normalizeMediaFolders,
  planFileMove,
  sanitizeFolderName,
  sortMediaFiles,
} from "./mediaLibrary";

const files = normalizeMediaFiles([
  {
    name: "kitchen.jpg",
    path: "listings/job1/photos/2_kitchen.jpg",
    url: "https://example.com/kitchen.jpg",
    uploadedAt: "2026-03-02T00:00:00.000Z",
    size: 2_000_000,
    contentType: "image/jpeg",
  },
  {
    name: "raw-frame.CR2",
    path: "listings/job1/raw/1_raw-frame.CR2",
    url: "https://example.com/raw.cr2",
    uploadedAt: "2026-03-01T00:00:00.000Z",
    size: 20_000_000,
  },
  {
    name: "bath.jpg",
    path: "listings/job1/photos/3_bath.jpg",
    url: "https://example.com/bath.jpg",
    uploadedAt: "2026-03-03T00:00:00.000Z",
    folderId: "fld_selects",
    size: 500_000,
    contentType: "image/jpeg",
  },
]);

describe("listing media library", () => {
  it("keeps photos, raw, and custom folders as separate views", () => {
    expect(filesInView(files, "photos").map((file) => file.name)).toEqual(["kitchen.jpg"]);
    expect(filesInView(files, "raw").map((file) => file.name)).toEqual(["raw-frame.CR2"]);
    expect(filesInView(files, "fld_selects").map((file) => file.name)).toEqual(["bath.jpg"]);
    expect(filesInView(files, "all")).toHaveLength(3);
  });

  it("sorts by name, date, and size, with missing size last when descending", () => {
    const sized = normalizeMediaFiles([
      { name: "b.jpg", path: "listings/job/photos/b.jpg", url: "u", size: 10, uploadedAt: "2026-01-02T00:00:00.000Z" },
      { name: "a.jpg", path: "listings/job/photos/a.jpg", url: "u", uploadedAt: "2026-01-03T00:00:00.000Z" },
      { name: "c.jpg", path: "listings/job/photos/c.jpg", url: "u", size: 30, uploadedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(sortMediaFiles(sized, "name", "asc").map((file) => file.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(sortMediaFiles(sized, "date", "desc").map((file) => file.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(sortMediaFiles(sized, "size", "desc").map((file) => file.name)).toEqual(["c.jpg", "b.jpg", "a.jpg"]);
    expect(byteSize("2048")).toBe(2048);
    expect(byteSize(-1)).toBeNull();
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(2_000_000)).toBe("1.9 MB");
  });

  it("previews browser images and leaves raw files as files", () => {
    expect(canPreviewImage(files[0])).toBe(true);
    expect(canPreviewImage(files[1])).toBe(false);
  });

  it("rejects empty folder names and path characters", () => {
    expect(sanitizeFolderName("  Selects / twilight  ")).toBe("Selects twilight");
    expect(sanitizeFolderName("   ")).toBe("");
    expect(normalizeMediaFolders([
      { id: "fld_1", name: "Selects" },
      { id: "photos", name: "Nope" },
      { id: "fld_2", name: "selects" },
    ])).toEqual([expect.objectContaining({ id: "fld_1", name: "Selects" })]);
  });

  it("copies a file only when the listing or storage folder changes", () => {
    const photo = files[0];
    expect(planFileMove({
      file: photo,
      sourceListingId: "job1",
      destinationListingId: "job1",
      destinationStorageFolder: "photos",
    }).mode).toBe("metadata");
    const moved = planFileMove({
      file: photo,
      sourceListingId: "job1",
      destinationListingId: "job2",
      destinationStorageFolder: "raw",
    });
    expect(moved.mode).toBe("copy");
    expect(moved.nextPath.startsWith("listings/job2/raw/")).toBe(true);
    expect(buildListingObjectPath("job2", "photos", "a b.jpg", 5)).toBe("listings/job2/photos/5_a_b.jpg");
  });

  it("queues CubiCasa as a manual request and does not invent an API call", () => {
    const request = buildCubiCasaLibraryRequest({
      listingId: "job1",
      requestedBy: "admin-1",
      requestedAt: "2026-04-01T00:00:00.000Z",
      files: [{ name: "kitchen.jpg", path: files[0].path, url: files[0].url }],
    });
    expect(request.apiConnected).toBe(false);
    expect(request.status).toBe("needs_manual_order");
    expect(request.provider).toBe("cubicasa");
    expect(request.nextStep).toBe(CUBICASA_MANUAL_NEXT_STEP);
    expect(request.files).toEqual([{ name: "kitchen.jpg", path: files[0].path, url: files[0].url }]);
  });
});
