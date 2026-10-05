/**
 * Coordinator scratch pad.
 * Photos are edited in the browser session. This does not plan an order,
 * write a studio job, or open a gallery.
 */

import { isRawStudioFile } from "./iconicStudio";
import { orderExteriorTwilightPrompt } from "./orderEditPlan";

export const STUDIO_SCRATCH_PATH = "/admin/studio/scratch";
export const STUDIO_SCRATCH_API = "/api/studio/scratch";
export const GRASS_REFERENCE_PUBLIC_PATH = "/studio/grass-reference.jpg";
export const GRASS_REFERENCE_RELATIVE_PATH = "public/studio/grass-reference.jpg";
export const SCRATCH_MAX_BYTES = 4_000_000;
export const SCRATCH_MAX_FILES = 24;
export const SCRATCH_PROMPT_MAX = 2000;
export const SCRATCH_PROMPT_HEADER = "x-scratch-prompt";
export const SCRATCH_NAME_HEADER = "x-scratch-filename";
export const SCRATCH_ACTION_HEADER = "x-scratch-action";

export const SCRATCH_ACTIONS = ["edit", "revise", "twilight", "grass"] as const;
export type ScratchAction = (typeof SCRATCH_ACTIONS)[number];

export const GRASS_REPLACE_PROMPT =
  "Replace the lawn in the first image with healthy, even grass that matches the second image, the grass reference. Keep the house, hardscape, trees, sky, lighting, and camera angle. Change only the lawn.";

export const GRASS_REFERENCE_MISSING_NOTE =
  "Grass reference is missing. Add Cadi's lawn JPEG at public/studio/grass-reference.jpg (or set STUDIO_GRASS_REFERENCE_PATH).";

export function decodeScratchHeader(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function scratchJpegAllowed(name: string, contentType = ""): { ok: true } | { ok: false; error: string } {
  if (isRawStudioFile(name, contentType)) {
    return { ok: false, error: "RAW is the next pass. Drop a JPEG for now." };
  }
  const type = contentType.split(";")[0].trim().toLowerCase();
  const jpeg = type === "image/jpeg" || type === "image/jpg" || /\.jpe?g$/i.test(name);
  if (!jpeg) return { ok: false, error: "Scratch pad edits JPEGs. Drop a .jpg." };
  return { ok: true };
}

export function parseScratchEdit(input: {
  action: string;
  prompt: string;
  byteLength: number;
  contentType: string;
}): { ok: true; action: ScratchAction; prompt: string; attachGrass: boolean } | { ok: false; error: string } {
  const type = input.contentType.split(";")[0].trim().toLowerCase();
  if (type !== "image/jpeg") return { ok: false, error: "Scratch pad edits JPEGs. Drop a .jpg." };
  if (!input.byteLength) return { ok: false, error: "That photo was empty." };
  if (input.byteLength > SCRATCH_MAX_BYTES) {
    return { ok: false, error: "That photo is too large for the scratch pad. Export a smaller JPEG." };
  }
  const action = input.action.trim().toLowerCase();
  if (!(SCRATCH_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: "Unknown scratch action." };
  }
  if (action === "twilight") {
    return { ok: true, action: "twilight", prompt: orderExteriorTwilightPrompt(), attachGrass: false };
  }
  if (action === "grass") {
    return { ok: true, action: "grass", prompt: GRASS_REPLACE_PROMPT, attachGrass: true };
  }
  const userPrompt = input.prompt.trim().replace(/\s+/g, " ").slice(0, SCRATCH_PROMPT_MAX);
  if (userPrompt.length < 3) return { ok: false, error: "Describe the edit." };
  return { ok: true, action: action as ScratchAction, prompt: userPrompt, attachGrass: false };
}

export function scratchDownloadName(fileName: string): string {
  const baseName = fileName.split(/[/\\]/).pop() || "scratch";
  const base = baseName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "scratch"}-edit.jpg`;
}

export function scratchSelection(input: {
  ids: string[];
  selectedIds: string[];
  anchorId: string | null;
  clickedId: string;
  mode: "replace" | "toggle" | "range";
}): { selectedIds: string[]; anchorId: string; focusId: string } {
  const ids = input.ids.filter(Boolean);
  const clicked = input.clickedId;
  if (!ids.includes(clicked)) {
    const selectedIds = input.selectedIds.filter((id) => ids.includes(id));
    const anchorId = input.anchorId && ids.includes(input.anchorId) ? input.anchorId : ids[0] || clicked;
    return { selectedIds, anchorId, focusId: anchorId };
  }
  if (input.mode === "toggle") {
    const has = input.selectedIds.includes(clicked);
    const selectedIds = has
      ? input.selectedIds.filter((id) => id !== clicked)
      : [...input.selectedIds.filter((id) => ids.includes(id)), clicked];
    const next = selectedIds.length ? selectedIds : [clicked];
    return { selectedIds: next, anchorId: clicked, focusId: clicked };
  }
  if (input.mode === "range") {
    const anchor = input.anchorId && ids.includes(input.anchorId) ? input.anchorId : clicked;
    const start = ids.indexOf(anchor);
    const end = ids.indexOf(clicked);
    const [from, to] = start <= end ? [start, end] : [end, start];
    return { selectedIds: ids.slice(from, to + 1), anchorId: anchor, focusId: clicked };
  }
  return { selectedIds: [clicked], anchorId: clicked, focusId: clicked };
}
