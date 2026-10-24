/**
 * Export envelopes for social, MLS, and custom masters.
 * MLS uses the common Matrix / Flexmls direct-upload limit seen across Texas
 * MLSs (including HAR-style property video): MP4, H.264, AAC, 1920×1080,
 * 30 fps, about 3 minutes, and 100 MB. Many MLSs would rather have a hosted
 * URL. This file stays inside that envelope and is unbranded: no logo, agent
 * name, phone, brokerage, or price callout. Confirm the board's current cap
 * before a large upload.
 */

export type ExportFps = 24 | 30 | 60;
export type ExportQuality = "standard" | "high" | "max";

export interface ExportPreset {
  id: string;
  label: string;
  detail: string;
  width: number;
  height: number;
  fps: ExportFps;
  maxDurationSec: number;
  maxBytes: number | null;
  branded: boolean;
  /** Target video bitrate. MLS standard is low enough for a 3 minute file under 100 MB. */
  bitrate: Record<ExportQuality, number>;
  crf: Record<ExportQuality, number>;
}

const SOCIAL_BITRATE: Record<ExportQuality, number> = {
  standard: 6_000_000,
  high: 12_000_000,
  max: 20_000_000,
};

const LANDSCAPE_BITRATE: Record<ExportQuality, number> = {
  standard: 8_000_000,
  high: 16_000_000,
  max: 35_000_000,
};

const CRF: Record<ExportQuality, number> = { standard: 23, high: 18, max: 15 };

export const EXPORT_PRESETS: readonly ExportPreset[] = [
  {
    id: "instagram_reel",
    label: "Instagram Reel",
    detail: "1080×1920, up to 90 seconds. Instagram recompresses; high is the practical master.",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSec: 90,
    maxBytes: null,
    branded: true,
    bitrate: SOCIAL_BITRATE,
    crf: CRF,
  },
  {
    id: "instagram_story",
    label: "Instagram Story",
    detail: "1080×1920, 15 seconds. Longer edits should use the Reel preset.",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSec: 15,
    maxBytes: null,
    branded: true,
    bitrate: SOCIAL_BITRATE,
    crf: CRF,
  },
  {
    id: "tiktok",
    label: "TikTok",
    detail: "1080×1920. This preset caps at 3 minutes; the hook still belongs in the first seconds.",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSec: 180,
    maxBytes: null,
    branded: true,
    bitrate: SOCIAL_BITRATE,
    crf: CRF,
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    detail: "1080×1920, up to 3 minutes. 30 or 60 fps.",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSec: 180,
    maxBytes: null,
    branded: true,
    bitrate: SOCIAL_BITRATE,
    crf: CRF,
  },
  {
    id: "youtube_landscape",
    label: "YouTube 16:9",
    detail: "1920×1080 master for a listing film. Capped at 10 minutes in this editor.",
    width: 1920,
    height: 1080,
    fps: 30,
    maxDurationSec: 600,
    maxBytes: null,
    branded: true,
    bitrate: LANDSCAPE_BITRATE,
    crf: CRF,
  },
  {
    id: "facebook",
    label: "Facebook Reel",
    detail: "1080×1920, up to 90 seconds.",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSec: 90,
    maxBytes: null,
    branded: true,
    bitrate: SOCIAL_BITRATE,
    crf: CRF,
  },
  {
    id: "mls",
    label: "MLS unbranded",
    detail: "1920×1080, H.264, AAC, 30 fps, 3 minutes, 100 MB. No logo, agent name, phone, brokerage, or price.",
    width: 1920,
    height: 1080,
    fps: 30,
    maxDurationSec: 180,
    maxBytes: 100 * 1024 * 1024,
    branded: false,
    bitrate: { standard: 4_200_000, high: 8_000_000, max: 12_000_000 },
    crf: { standard: 23, high: 20, max: 18 },
  },
  {
    id: "custom",
    label: "Custom",
    detail: "Set the frame size. Width and height stay even and between 256 and 3840.",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSec: 600,
    maxBytes: null,
    branded: true,
    bitrate: LANDSCAPE_BITRATE,
    crf: CRF,
  },
] as const;

export const EXPORT_FPS: readonly ExportFps[] = [24, 30, 60];

export function exportPresetById(id: string): ExportPreset | null {
  return EXPORT_PRESETS.find((preset) => preset.id === id) ?? null;
}

export interface ExportSettings {
  presetId: string;
  width: number;
  height: number;
  fps: ExportFps;
  quality: ExportQuality;
  durationSec: number;
}

export function resolveExport(settings: ExportSettings): {
  preset: ExportPreset;
  width: number;
  height: number;
  fps: ExportFps;
  bitrate: number;
  crf: number;
  warnings: string[];
} | { error: string } {
  const preset = exportPresetById(settings.presetId);
  if (!preset) return { error: "Unknown export preset." };
  if (!EXPORT_FPS.includes(settings.fps)) return { error: "Frame rate must be 24, 30, or 60." };
  let width = preset.id === "custom" ? settings.width : preset.width;
  let height = preset.id === "custom" ? settings.height : preset.height;
  width = Math.round(width);
  height = Math.round(height);
  if (width % 2 || height % 2 || width < 256 || height < 256 || width > 3840 || height > 3840) {
    return { error: "Width and height must be even numbers from 256 to 3840." };
  }
  const warnings: string[] = [];
  if (settings.durationSec > preset.maxDurationSec) {
    warnings.push(`${preset.label} allows ${preset.maxDurationSec} seconds. This edit is ${Math.ceil(settings.durationSec)} seconds.`);
  }
  if (preset.id === "mls") {
    warnings.push("MLS export strips branding. Remove the logo, agent name, phone, and price before you render.");
    if (settings.fps !== 30) warnings.push("MLS delivery is safest at 30 fps.");
  }
  const bitrate = preset.bitrate[settings.quality];
  const bytes = estimateVideoBytes(bitrate, settings.durationSec);
  if (preset.maxBytes && bytes > preset.maxBytes) {
    warnings.push(`At ${settings.quality} quality this file is about ${Math.ceil(bytes / (1024 * 1024))} MB. The MLS cap is 100 MB. Use standard quality or a shorter cut.`);
  }
  return { preset, width, height, fps: settings.fps, bitrate, crf: preset.crf[settings.quality], warnings };
}

export function estimateVideoBytes(videoBitrate: number, durationSec: number, audioBitrate = 192_000): number {
  return Math.max(0, durationSec) * (videoBitrate + audioBitrate) / 8;
}

/** Text and logo layers an unbranded MLS file must not keep. */
export function mlsStripsBranding(): string[] {
  return ["logo", "agent name", "phone", "brokerage", "price", "call to action"];
}
