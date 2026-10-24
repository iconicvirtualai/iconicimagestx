import { describe, expect, it } from "vitest";
import { EXPORT_PRESETS, estimateVideoBytes, exportPresetById, resolveExport } from "./videoExportPresets";

describe("export presets", () => {
  it("covers the social, YouTube, Facebook, and MLS envelopes", () => {
    expect(EXPORT_PRESETS.map((preset) => preset.id)).toEqual([
      "instagram_reel",
      "instagram_story",
      "tiktok",
      "youtube_shorts",
      "youtube_landscape",
      "facebook",
      "mls",
      "custom",
    ]);
    expect(exportPresetById("instagram_reel")).toMatchObject({ width: 1080, height: 1920, maxDurationSec: 90 });
    expect(exportPresetById("youtube_shorts")?.maxDurationSec).toBe(180);
    expect(exportPresetById("youtube_landscape")).toMatchObject({ width: 1920, height: 1080 });
    const mls = exportPresetById("mls");
    expect(mls).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
      maxDurationSec: 180,
      maxBytes: 100 * 1024 * 1024,
      branded: false,
    });
  });

  it("keeps a 3 minute MLS standard file under 100 MB and warns when max quality will not", () => {
    const mlsPreset = exportPresetById("mls");
    expect(mlsPreset?.maxBytes).toBe(100 * 1024 * 1024);
    const standard = estimateVideoBytes(mlsPreset?.bitrate.standard || 0, 180);
    expect(standard).toBeLessThan(100 * 1024 * 1024);
    const resolved = resolveExport({
      presetId: "mls",
      width: 1920,
      height: 1080,
      fps: 60,
      quality: "max",
      durationSec: 180,
    });
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    expect(resolved.warnings.some((line) => line.includes("100 MB"))).toBe(true);
    expect(resolved.warnings.some((line) => line.includes("30 fps"))).toBe(true);
    expect(resolved.warnings.some((line) => line.includes("branding"))).toBe(true);
  });

  it("rejects an odd custom frame", () => {
    const resolved = resolveExport({
      presetId: "custom",
      width: 1081,
      height: 1920,
      fps: 30,
      quality: "high",
      durationSec: 10,
    });
    expect(resolved).toEqual({ error: "Width and height must be even numbers from 256 to 3840." });
  });
});
