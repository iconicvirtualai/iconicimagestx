/**
 * Iconic Studio (team v1).
 * Full studio is for Iconic staff. Agent upsell and outside-photographer
 * SaaS stay off. Helpers here are safe to import from client and server.
 *
 * Default AI edits are planned from the order in shared/orderEditPlan.ts.
 * Presets here are staff overrides for one frame, not a photographer picker.
 */

import { recordAddressText } from "./addressText.ts";
import { isListingStoragePath, safeStorageFileName } from "./listingAccess";
import { studioEditorHref } from "./studioEditorHref";

/** Previous staff editor path. Live links use studioEditorHref. */
export const ICONIC_STUDIO_PATH = "/admin/iconic-studio";

/** Team studio is on. Later products stay flagged off in this PR. */
export const STUDIO_FLAGS = {
  teamStudio: true,
  agentUpsell: false,
  outsidePhotographerSaas: false,
  canvaBrand: false,
} as const;

export const EDIT_JOB_STATUSES = ["pending", "processing", "review", "approved", "failed", "rejected"] as const;
export type EditJobStatus = (typeof EDIT_JOB_STATUSES)[number];

export const AI_EDIT_PRESETS = [
  {
    id: "virtual_stage",
    label: "Virtual stage",
    prompt: "Virtually stage this room with photoreal furniture, a rug, and simple decor scaled to the space. Leave the walls, windows, floors, ceiling, and camera angle unchanged.",
  },
  {
    id: "remove_clutter",
    label: "Remove clutter",
    prompt: "Remove clutter, personal items, cords, and small mess. Rebuild only the cleared floor and surfaces so they look clean. Keep the furniture that belongs, plus the architecture and lighting.",
  },
  {
    id: "remove_cars",
    label: "Remove cars",
    prompt: "Remove vehicles from the driveway, garage apron, and street. Rebuild the pavement, curb, and landscaping so the empty space looks natural.",
  },
  {
    id: "add_fire",
    label: "Add fire",
    prompt: "Add a realistic burning fire inside the existing fireplace only. Do not move the fireplace or change the rest of the room.",
  },
  {
    id: "add_tv",
    label: "Add TV",
    prompt: "Add one realistic flat-screen television on the main wall, sized to the room, with a dark screen. Do not change the wall, furniture, or camera.",
  },
  {
    id: "add_people",
    label: "Add people",
    prompt: "Add two or three casually dressed adults, small in the frame, who look natural in a listing photo and do not block the room. Keep faces generic and the architecture unchanged.",
  },
  {
    id: "twilight",
    label: "Twilight",
    prompt: "Convert this exterior listing photo into a photoreal twilight. Turn on warm interior and landscape lights. Keep the architecture and camera angle. Use a natural evening sky.",
  },
  {
    id: "free_text",
    label: "AI edit",
    prompt: "",
  },
] as const;

export type AiEditType = (typeof AI_EDIT_PRESETS)[number]["id"];

export const AI_EDIT_MISSING_KEY_NOTE =
  "OPENAI_API_KEY is not configured on the server, so this photo was not edited.";

export const AI_EDIT_TIMEOUT_NOTE =
  "OpenAI took too long to edit this photo. The job was marked failed. Queue it again.";

export const AI_EDIT_READY_NOTE = "OpenAI edit is ready for review.";

export const EMPTY_LISTING_PHOTOS_NOTE = "No listing photos yet.";

/** Staff-facing job notes. Stored dev leftovers stay off the review card. */
export function visibleStudioNote(note: string): string {
  const text = note.trim();
  if (!text) return "";
  if (/\bTODO\b/i.test(text) || text.includes("OPENAI_API_KEY")) return "";
  return text;
}

export function framesFromListingImages(images: unknown): StudioFrame[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((item, index) => frameFromListingImage(item, index))
    .filter((frame): frame is StudioFrame => Boolean(frame));
}

export const AI_EDIT_SAMPLE_NOTE =
  "Sample layout only. Queue AI Edit calls OpenAI when this listing is loaded from the studio.";

/** Output sizes the Images edit API documents for gpt-image-1. */
export type ListingEditSize = "1024x1024" | "1536x1024" | "1024x1536";

export const RAW_IMPORT_LABEL = "RAW — import for AI queue";

const RAW_EXT = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq)$/i;
const PREVIEW_EXT = /\.(jpe?g|png|webp|gif)$/i;

export type CropPreset = "original" | "1:1" | "4:5" | "16:9";
export type QuarterTurn = 0 | 90 | 180 | 270;

export interface StudioAdjustments {
  exposure: number;
  shadows: number;
  saturation: number;
  sharpness: number;
  tint: number;
  rotate: QuarterTurn;
  crop: CropPreset;
}

export const DEFAULT_ADJUSTMENTS: StudioAdjustments = {
  exposure: 0,
  shadows: 0,
  saturation: 0,
  sharpness: 0,
  tint: 0,
  rotate: 0,
  crop: "original",
};

export interface StudioFrame {
  id: string;
  name: string;
  path: string;
  url: string;
  contentType: string;
  raw: boolean;
  previewable: boolean;
  studioApproved: boolean;
  studioRole?: string;
}

export interface AiEditRequest {
  listingId: string;
  type: AiEditType;
  prompt: string;
  imageUrl: string;
  sourcePath: string;
}

/** Staff editor for a listing. Old /admin/iconic-studio paths redirect to the same URL. */
export function iconicStudioHref(listingId?: string): string {
  return studioEditorHref(listingId);
}

export function canOpenIconicStudio(role: string | undefined): boolean {
  return role === "admin" || role === "coordinator" || role === "photographer" || role === "editor";
}

export function ingestJobId(listingId: string): string {
  return `ingest_${listingId}`;
}

export function shouldBumpStudioQueue(storagePath: string): boolean {
  return storagePath.includes("/raw/");
}

export function isRawStudioFile(name: string, contentType?: string): boolean {
  if (RAW_EXT.test(name)) return true;
  const type = String(contentType || "").toLowerCase();
  return type.includes("raw") || type.includes("dng") || type.includes("canon-cr") || type.includes("nikon");
}

export function isStudioPreviewable(name: string, contentType?: string): boolean {
  if (isRawStudioFile(name, contentType)) return false;
  const type = String(contentType || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif") return true;
  return PREVIEW_EXT.test(name);
}

export function finalsObjectPath(listingId: string, fileName: string, now = Date.now()): string {
  return `listings/${listingId}/finals/${now}_${safeStorageFileName(fileName)}`;
}

export function listingAddressLabel(listing: { address?: unknown; shootLocation?: unknown; propertyAddress?: unknown; addressLabel?: unknown } | null | undefined): string {
  return recordAddressText(listing) || "Untitled listing";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

export function clampAdjustments(input: Partial<StudioAdjustments> | null | undefined): StudioAdjustments {
  const source = input || {};
  const rotate = source.rotate === 90 || source.rotate === 180 || source.rotate === 270 ? source.rotate : 0;
  const crop = source.crop === "1:1" || source.crop === "4:5" || source.crop === "16:9" ? source.crop : "original";
  return {
    exposure: clamp(Number(source.exposure), -100, 100),
    shadows: clamp(Number(source.shadows), -100, 100),
    saturation: clamp(Number(source.saturation), -100, 100),
    sharpness: clamp(Number(source.sharpness), 0, 100),
    tint: clamp(Number(source.tint), -100, 100),
    rotate,
    crop,
  };
}

export function adjustmentsAreNeutral(input: StudioAdjustments): boolean {
  const adj = clampAdjustments(input);
  return adj.exposure === 0
    && adj.shadows === 0
    && adj.saturation === 0
    && adj.sharpness === 0
    && adj.tint === 0
    && adj.rotate === 0
    && adj.crop === "original";
}

/** CSS stand-in while the canvas preview is drawing. Sharpness is canvas-only. */
export function adjustmentCssFilter(input: Partial<StudioAdjustments> | null | undefined): string {
  const adj = clampAdjustments(input);
  const brightness = (1 + adj.exposure / 100).toFixed(3);
  const contrast = (1 + adj.shadows / 250).toFixed(3);
  const saturate = (1 + adj.saturation / 100).toFixed(3);
  const sepia = (Math.max(adj.tint, 0) / 500).toFixed(3);
  const hue = (-adj.tint * 0.35).toFixed(2);
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) sepia(${sepia}) hue-rotate(${hue}deg)`;
}

export function cropAspect(crop: CropPreset): number | null {
  if (crop === "1:1") return 1;
  if (crop === "4:5") return 4 / 5;
  if (crop === "16:9") return 16 / 9;
  return null;
}

export function cropRect(width: number, height: number, crop: CropPreset): { x: number; y: number; w: number; h: number } {
  const safeWidth = Math.max(0, Math.round(width));
  const safeHeight = Math.max(0, Math.round(height));
  const aspect = cropAspect(crop);
  if (!aspect || safeWidth === 0 || safeHeight === 0) {
    return { x: 0, y: 0, w: safeWidth, h: safeHeight };
  }
  const current = safeWidth / safeHeight;
  if (current > aspect) {
    const w = Math.round(safeHeight * aspect);
    return { x: Math.round((safeWidth - w) / 2), y: 0, w, h: safeHeight };
  }
  const h = Math.round(safeWidth / aspect);
  return { x: 0, y: Math.round((safeHeight - h) / 2), w: safeWidth, h };
}

function clamp255(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

/** One pixel of exposure, shadow lift, saturation, and warmth. Sharpness is a neighborhood pass. */
export function applyPixel(r: number, g: number, b: number, input: Partial<StudioAdjustments>): [number, number, number] {
  const adj = clampAdjustments(input);
  const exposure = 1 + adj.exposure / 100;
  let rr = r * exposure;
  let gg = g * exposure;
  let bb = b * exposure;

  const luma = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
  const shadow = adj.shadows / 100;
  if (shadow !== 0) {
    const weight = (1 - clamp(luma, 0, 1)) ** 1.4;
    const lift = shadow * 80 * weight;
    rr += lift;
    gg += lift;
    bb += lift;
  }

  const sat = 1 + adj.saturation / 100;
  const gray = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
  rr = gray + (rr - gray) * sat;
  gg = gray + (gg - gray) * sat;
  bb = gray + (bb - gray) * sat;

  const tint = adj.tint / 100;
  rr += tint * 28;
  bb -= tint * 28;
  return [clamp255(rr), clamp255(gg), clamp255(bb)];
}

export function sharpenLuma(center: number, neighborAverage: number, sharpness: number): number {
  const amount = clamp(sharpness, 0, 100) / 100;
  return clamp255(center + (center - neighborAverage) * amount * 1.5);
}

export function presetPrompt(type: string): string {
  return AI_EDIT_PRESETS.find((preset) => preset.id === type)?.prompt || "";
}

/** Guardrails around a preset or free-text request. Sent only to the image edit API. */
export function realEstateEditPrompt(userPrompt: string): string {
  const request = userPrompt.trim().replace(/\s+/g, " ");
  return [
    "Photoreal real-estate listing photo.",
    "Edit only the supplied photograph.",
    "Keep the same camera angle, architecture, windows, doors, flooring, and lighting.",
    "Do not add text, logos, watermarks, borders, or an illustrated style.",
    `Requested change: ${request}`,
  ].join(" ");
}

/** Landscape, portrait, or square output. Unknown dimensions stay landscape, the usual listing frame. */
export function listingPhotoEditSize(width: number, height: number): ListingEditSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1536x1024";
  }
  const ratio = width / height;
  if (ratio >= 1.15) return "1536x1024";
  if (ratio <= 0.87) return "1024x1536";
  return "1024x1024";
}

/**
 * Approve must publish the finished file.
 * AI jobs require the stored edit. Adjust jobs still fall back to their source.
 */
export function resolveStudioApprovePath(
  job: {
    kind?: unknown;
    status?: unknown;
    placeholder?: unknown;
    resultPath?: unknown;
    sourcePath?: unknown;
  },
  fallbackPath = "",
): { ok: true; sourcePath: string } | { ok: false; error: string } {
  const fallback = String(fallbackPath || "").trim();
  if (job.kind === "ai_edit") {
    if (job.status === "failed") {
      return { ok: false, error: "This AI edit failed. Queue it again before approving." };
    }
    if (job.status === "rejected") {
      return { ok: false, error: "This AI edit was rejected." };
    }
    const resultPath = typeof job.resultPath === "string" ? job.resultPath.trim() : "";
    if (job.placeholder === true || !resultPath) {
      return { ok: false, error: "This AI edit has no finished image to approve." };
    }
    return { ok: true, sourcePath: resultPath };
  }
  const resultPath = typeof job.resultPath === "string" ? job.resultPath.trim() : "";
  const sourcePath = typeof job.sourcePath === "string" ? job.sourcePath.trim() : "";
  const path = resultPath || sourcePath || fallback;
  if (!path) return { ok: false, error: "sourcePath is required." };
  return { ok: true, sourcePath: path };
}

export function parseAiEditRequest(body: unknown): { ok: true; value: AiEditRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body is required." };
  const row = body as Record<string, unknown>;
  const listingId = String(row.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return { ok: false, error: "A valid listing id is required." };
  }
  const type = String(row.type || "");
  if (!AI_EDIT_PRESETS.some((preset) => preset.id === type)) {
    return { ok: false, error: "Unknown AI edit type." };
  }
  const fallback = presetPrompt(type);
  const prompt = String(row.prompt ?? fallback).trim().slice(0, 2000);
  if (type === "free_text" && prompt.length < 3) {
    return { ok: false, error: "Describe the AI edit." };
  }
  const imageUrl = String(row.imageUrl || "").trim();
  if (!/^https:\/\/.+/i.test(imageUrl)) {
    return { ok: false, error: "imageUrl must be an https URL." };
  }
  const sourcePath = String(row.sourcePath || "").trim();
  if (!isListingStoragePath(listingId, sourcePath)) {
    return { ok: false, error: "sourcePath must be a photo, raw, or finals file on this listing." };
  }
  return {
    ok: true,
    value: {
      listingId,
      type: type as AiEditType,
      prompt: prompt || fallback,
      imageUrl,
      sourcePath,
    },
  };
}

/**
 * Adding a final may move an early gallery to ready_for_review.
 * Delivered and approved galleries stay put. This never sends mail.
 */
export function galleryStatusAfterStudioAdd(current: string | undefined): string {
  if (!current || current === "pending_upload" || current === "raw_uploaded" || current === "editing") {
    return "ready_for_review";
  }
  return current;
}

export function frameFromListingImage(raw: unknown, index = 0): StudioFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const path = typeof item.path === "string" ? item.path : "";
  const url = typeof item.url === "string" ? item.url : "";
  if (!path && !url) return null;
  const name = typeof item.name === "string" && item.name.trim()
    ? item.name.trim()
    : (path.split("/").pop() || `photo-${index + 1}`);
  const contentType = typeof item.contentType === "string" ? item.contentType : "";
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : (path || `idx-${index}`),
    name,
    path,
    url,
    contentType,
    raw: isRawStudioFile(name, contentType),
    previewable: isStudioPreviewable(name, contentType),
    studioApproved: item.studioApproved === true || path.includes("/finals/"),
    studioRole: typeof item.studioRole === "string" ? item.studioRole : undefined,
  };
}

export function sampleStudioFrames(): StudioFrame[] {
  return [
    {
      id: "sample-living",
      name: "living-room.jpg",
      path: "listings/sampledemo/photos/living-room.jpg",
      url: "",
      contentType: "image/jpeg",
      raw: false,
      previewable: true,
      studioApproved: false,
    },
    {
      id: "sample-raw",
      name: "frame.CR2",
      path: "listings/sampledemo/raw/frame.CR2",
      url: "",
      contentType: "image/x-canon-cr2",
      raw: true,
      previewable: false,
      studioApproved: false,
    },
  ];
}
