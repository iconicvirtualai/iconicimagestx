import { describe, expect, it } from "vitest";
import {
  AI_EDIT_READY_NOTE,
  DEFAULT_ADJUSTMENTS,
  STUDIO_FLAGS,
  adjustmentCssFilter,
  adjustmentsAreNeutral,
  applyPixel,
  canOpenIconicStudio,
  clampAdjustments,
  cropRect,
  finalsObjectPath,
  frameFromListingImage,
  galleryStatusAfterStudioAdd,
  iconicStudioHref,
  isRawStudioFile,
  isStudioPreviewable,
  listingAddressLabel,
  listingPhotoEditSize,
  parseAiEditRequest,
  presetPrompt,
  realEstateEditPrompt,
  resolveStudioApprovePath,
  sharpenLuma,
  shouldBumpStudioQueue,
} from "./iconicStudio";
import { isListingStoragePath } from "./listingAccess";

describe("Iconic Studio flags and navigation", () => {
  it("keeps agent upsell, SaaS, and Canva off for the team shell", () => {
    expect(STUDIO_FLAGS.teamStudio).toBe(true);
    expect(STUDIO_FLAGS.agentUpsell).toBe(false);
    expect(STUDIO_FLAGS.outsidePhotographerSaas).toBe(false);
    expect(STUDIO_FLAGS.canvaBrand).toBe(false);
  });

  it("is open to every staff role and hidden from everyone else", () => {
    expect(canOpenIconicStudio("photographer")).toBe(true);
    expect(canOpenIconicStudio("editor")).toBe(true);
    expect(canOpenIconicStudio("coordinator")).toBe(true);
    expect(canOpenIconicStudio("admin")).toBe(true);
    expect(canOpenIconicStudio("client")).toBe(false);
    expect(canOpenIconicStudio(undefined)).toBe(false);
    expect(iconicStudioHref()).toBe("/admin/studio/editing");
    expect(iconicStudioHref("job_12345678")).toBe("/admin/studio/editing?listingId=job_12345678");
  });
});

describe("Iconic Studio queue and files", () => {
  it("bumps the studio queue only for raw uploads", () => {
    expect(shouldBumpStudioQueue("listings/job123456/raw/1_frame.CR2")).toBe(true);
    expect(shouldBumpStudioQueue("listings/job123456/photos/1_frame.jpg")).toBe(false);
    expect(shouldBumpStudioQueue("listings/job123456/finals/1_frame.jpg")).toBe(false);
  });

  it("labels RAW as not previewable and keeps JPEG finals previewable", () => {
    expect(isRawStudioFile("frame.CR2")).toBe(true);
    expect(isStudioPreviewable("frame.CR2", "image/x-canon-cr2")).toBe(false);
    expect(isStudioPreviewable("final.jpg", "image/jpeg")).toBe(true);
    expect(isStudioPreviewable("shot.webp")).toBe(true);
  });

  it("builds a finals path that the listing storage check accepts", () => {
    const path = finalsObjectPath("job123456", "Kitchen 1.jpg", 10);
    expect(path).toBe("listings/job123456/finals/10_Kitchen_1.jpg");
    expect(isListingStoragePath("job123456", path)).toBe(true);
  });

  it("reads a listing address and a photo frame", () => {
    expect(listingAddressLabel({ address: { street: "10 Oak", city: "Austin", state: "TX" } })).toBe("10 Oak, Austin, TX");
    const frame = frameFromListingImage({
      path: "listings/job123456/finals/1_a.jpg",
      url: "https://example.com/a.jpg",
      name: "a.jpg",
      contentType: "image/jpeg",
      studioApproved: true,
    });
    expect(frame?.studioApproved).toBe(true);
    expect(frame?.previewable).toBe(true);
    expect(frameFromListingImage({ note: "empty" })).toBeNull();
  });
});

describe("Iconic Studio adjustments", () => {
  it("clamps sliders and treats the default as neutral", () => {
    expect(adjustmentsAreNeutral(DEFAULT_ADJUSTMENTS)).toBe(true);
    const adj = clampAdjustments({ exposure: 400, shadows: -5, rotate: 90, crop: "16:9", sharpness: -3 });
    expect(adj.exposure).toBe(100);
    expect(adj.shadows).toBe(-5);
    expect(adj.rotate).toBe(90);
    expect(adj.crop).toBe("16:9");
    expect(adj.sharpness).toBe(0);
    expect(adjustmentCssFilter({ exposure: 0 })).toContain("brightness(1.000)");
  });

  it("crops to the requested aspect from the center", () => {
    expect(cropRect(1600, 1000, "1:1")).toEqual({ x: 300, y: 0, w: 1000, h: 1000 });
    expect(cropRect(800, 1000, "16:9").w / cropRect(800, 1000, "16:9").h).toBeCloseTo(16 / 9, 1);
    expect(cropRect(400, 300, "original")).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it("lifts exposure and pulls saturation toward gray", () => {
    const brighter = applyPixel(100, 100, 100, { exposure: 50 });
    expect(brighter[0]).toBeGreaterThan(100);
    const gray = applyPixel(200, 20, 20, { saturation: -100 });
    expect(gray[0]).toBe(gray[1]);
    expect(sharpenLuma(200, 100, 100)).toBeGreaterThan(200);
    expect(sharpenLuma(200, 100, 0)).toBe(200);
  });
});

describe("Iconic Studio AI jobs", () => {
  const listingId = "job123456";
  const sourcePath = `listings/${listingId}/photos/1_room.jpg`;

  it("accepts a preset and requires text for a free-form edit", () => {
    const ok = parseAiEditRequest({
      listingId,
      type: "virtual_stage",
      imageUrl: "https://cdn.example/room.jpg",
      sourcePath,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.prompt).toBe(presetPrompt("virtual_stage"));

    const missing = parseAiEditRequest({
      listingId,
      type: "free_text",
      prompt: "  ",
      imageUrl: "https://cdn.example/room.jpg",
      sourcePath,
    });
    expect(missing.ok).toBe(false);
  });

  it("rejects paths outside the listing and non-https image URLs", () => {
    expect(parseAiEditRequest({
      listingId,
      type: "add_tv",
      imageUrl: "http://cdn.example/room.jpg",
      sourcePath,
    }).ok).toBe(false);
    expect(parseAiEditRequest({
      listingId,
      type: "add_tv",
      imageUrl: "https://cdn.example/room.jpg",
      sourcePath: "listings/other/photos/1.jpg",
    }).ok).toBe(false);
  });

  it("wraps a preset for the image edit and approves only a finished AI file", () => {
    const prompt = realEstateEditPrompt(presetPrompt("virtual_stage"));
    expect(prompt).toMatch(/photoreal real-estate/i);
    expect(prompt).toMatch(/Virtually stage/i);
    expect(prompt).not.toMatch(/TODO/);
    expect(prompt).not.toMatch(/placeholder/);
    expect(AI_EDIT_READY_NOTE).not.toMatch(/TODO/);
    expect(listingPhotoEditSize(1800, 1200)).toBe("1536x1024");

    expect(resolveStudioApprovePath({
      kind: "ai_edit",
      status: "review",
      placeholder: true,
      sourcePath,
    }).ok).toBe(false);
    const approved = resolveStudioApprovePath({
      kind: "ai_edit",
      status: "review",
      resultPath: `listings/${listingId}/photos/room-ai.jpg`,
      sourcePath,
    });
    expect(approved).toEqual({ ok: true, sourcePath: `listings/${listingId}/photos/room-ai.jpg` });
    const adjust = resolveStudioApprovePath({ kind: "adjust", resultPath: "", sourcePath }, "");
    expect(adjust.ok && adjust.sourcePath).toBe(sourcePath);
  });

  it("marks a gallery ready for deliver without touching delivered or approved", () => {
    expect(galleryStatusAfterStudioAdd("raw_uploaded")).toBe("ready_for_review");
    expect(galleryStatusAfterStudioAdd("editing")).toBe("ready_for_review");
    expect(galleryStatusAfterStudioAdd(undefined)).toBe("ready_for_review");
    expect(galleryStatusAfterStudioAdd("delivered")).toBe("delivered");
    expect(galleryStatusAfterStudioAdd("approved")).toBe("approved");
    expect(galleryStatusAfterStudioAdd("ready_for_review")).toBe("ready_for_review");
  });
});
