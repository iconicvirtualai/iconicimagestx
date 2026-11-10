import { describe, expect, it } from "vitest";
import {
  CLIENT_ZIP_MAX_BYTES,
  matchesAllTokens,
  normalizeLibraryPath,
  orderLibraryPath,
  queryTokens,
  searchTokens,
  shouldZipDownloads,
  uploadDestination,
  useMultipart,
} from "./mediaLibrary";

describe("media library paths", () => {
  it("rejects traversal, absolute paths, and hidden trash prefixes", () => {
    expect(normalizeLibraryPath("")).toBe("");
    expect(normalizeLibraryPath("Inbox/photo.jpg")).toBe("Inbox/photo.jpg");
    expect(normalizeLibraryPath("../etc/passwd")).toBeNull();
    expect(normalizeLibraryPath("Inbox/../../secret")).toBeNull();
    expect(normalizeLibraryPath("/etc/passwd")).toBeNull();
    expect(normalizeLibraryPath("Inbox\\photo.jpg")).toBeNull();
    expect(normalizeLibraryPath(".trash/photo.jpg")).toBeNull();
    expect(normalizeLibraryPath("Inbox/../.trash/photo.jpg")).toBeNull();
    expect(uploadDestination("Inbox", "../../secret.jpg")).toBeNull();
    expect(uploadDestination("", "front.jpg")).toEqual({ folder: "Inbox", name: "front.jpg" });
    expect(uploadDestination("Clients/Ada", "raw/frame.CR2")).toEqual({
      folder: "Clients/Ada/raw",
      name: "frame.CR2",
    });
  });

  it("builds an order folder and a searchable token index", () => {
    expect(orderLibraryPath({
      clientName: "Ada Homes",
      address: "9 Oak St",
      orderNumber: "88",
      kind: "Video",
    })).toBe("Clients/Ada Homes/9 Oak St/Video");
    const tokens = searchTokens("front.jpg", "Clients/Ada Homes/9 Oak St/Photos", ["twilight"], "Ada Homes", "88", "9 Oak St");
    expect(matchesAllTokens(tokens, queryTokens("ada oak"))).toBe(true);
    expect(matchesAllTokens(tokens, queryTokens("twilight"))).toBe(true);
    expect(matchesAllTokens(tokens, queryTokens("missing client"))).toBe(false);
  });

  it("uses multipart for large files and for video, and zips only a modest batch", () => {
    expect(useMultipart(1024, "image/jpeg")).toBe(false);
    expect(useMultipart(8 * 1024 * 1024, "image/jpeg")).toBe(true);
    expect(useMultipart(5 * 1024 * 1024, "video/mp4")).toBe(true);
    expect(shouldZipDownloads(2, 1024)).toBe(true);
    expect(shouldZipDownloads(1, 1024)).toBe(false);
    expect(shouldZipDownloads(3, CLIENT_ZIP_MAX_BYTES + 1)).toBe(false);
  });
});
