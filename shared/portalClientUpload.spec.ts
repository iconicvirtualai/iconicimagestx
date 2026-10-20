import { describe, expect, it } from "vitest";
import {
  isPortalUploadStoragePath,
  portalUploadDecision,
  portalUploadStoragePath,
} from "./portalClientUpload";

describe("portal client uploads", () => {
  it("accepts mp4 and mov videos and refuses to treat them as documents", () => {
    expect(portalUploadDecision("video", "walkthrough.mp4", "", 50_000_000)).toMatchObject({
      ok: true,
      contentType: "video/mp4",
    });
    expect(portalUploadDecision("video", "reel.mov", "video/quicktime", 8_000_000).ok).toBe(true);
    expect(portalUploadDecision("video", "notes.pdf", "application/pdf", 1000)).toMatchObject({
      ok: false,
      error: "Upload an MP4 or MOV video.",
    });
  });

  it("accepts social images, reels, and graphics", () => {
    expect(portalUploadDecision("social", "story.png", "image/png", 2_000_000).ok).toBe(true);
    expect(portalUploadDecision("social", "reel.mp4", "", 20_000_000)).toMatchObject({ ok: true, contentType: "video/mp4" });
    expect(portalUploadDecision("social", "badge.svg", "image/svg+xml", 40_000).ok).toBe(true);
    expect(portalUploadDecision("social", "notes.pdf", "application/pdf", 1000).ok).toBe(false);
  });

  it("accepts pdf documents and rejects programs", () => {
    expect(portalUploadDecision("file", "floor.pdf", "application/pdf", 1_000_000)).toMatchObject({
      ok: true,
      contentType: "application/pdf",
    });
    expect(portalUploadDecision("file", "brief.docx", "", 20_000).ok).toBe(true);
    expect(portalUploadDecision("file", "run.exe", "application/octet-stream", 20_000).ok).toBe(false);
  });

  it("rejects an empty file and a video over 2 GB", () => {
    expect(portalUploadDecision("video", "empty.mp4", "video/mp4", 0).ok).toBe(false);
    expect(portalUploadDecision("video", "huge.mp4", "video/mp4", 2 * 1024 * 1024 * 1024 + 1).ok).toBe(false);
  });

  it("keeps the storage path inside this listing's client upload folder", () => {
    const path = portalUploadStoragePath("listing1234", "video", "tour.mp4", 10);
    expect(path).toBe("listings/listing1234/client-uploads/video/10_tour.mp4");
    expect(isPortalUploadStoragePath("listing1234", "video", path)).toBe(true);
    expect(isPortalUploadStoragePath("listing1234", "file", path)).toBe(false);
    expect(isPortalUploadStoragePath("listing1234", "video", "listings/listing1234/photos/tour.mp4")).toBe(false);
    expect(isPortalUploadStoragePath("listing1234", "video", "listings/listing1234/client-uploads/video/../secret.mp4")).toBe(false);
  });
});
