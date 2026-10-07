import { presetPrompt } from "@shared/iconicStudio";
import { ICONIC_POLISH_INSTRUCTION } from "@shared/orderEditPlan";
import type { ScratchAction } from "@shared/studioScratch";

export interface ScratchEditStep {
  action: ScratchAction;
  prompt: string;
}

export type ScratchDeskMode = "upload" | "edit" | "studio" | "staging";
export type ScratchPreference =
  | "full-basic"
  | "full-iconic"
  | "touchup"
  | "polish"
  | "twilight"
  | "grass"
  | "staging";
export type ScratchEditTool = "brush" | "clone" | "heal" | "remove";
export type ScratchStudioTool =
  | "fire"
  | "tv"
  | "sky"
  | "grass"
  | "pins"
  | "lines"
  | "text"
  | "shapes"
  | "logos"
  | "staging"
  | "twilight"
  | "object"
  | "floorplan";
export type SkyPreset = "dramatic" | "clear" | "sunset" | "overcast";

const BASIC_BATCH =
  "Prepare this listing photo as the first edit batch. Balance color and exposure, clear window glare, and replace a blown-out sky when the sky is visible. Keep the architecture, furnishings, and camera angle. Do not add anyone.";

const TOUCHUP =
  "Light touch only. Balance color slightly and clear small distractions. Do not restage the room, do not add objects, and keep the photo close to the original.";

export const PREFERENCES: Array<{
  id: ScratchPreference;
  kicker: string;
  label: string;
  action: ScratchEditStep["action"];
  prompt: string;
}> = [
  { id: "full-basic", kicker: "Full edit", label: "Basic", action: "edit", prompt: BASIC_BATCH },
  { id: "full-iconic", kicker: "Full edit", label: "Iconic", action: "edit", prompt: `${BASIC_BATCH} ${ICONIC_POLISH_INSTRUCTION}` },
  { id: "touchup", kicker: "", label: "Touch up only", action: "edit", prompt: TOUCHUP },
  { id: "polish", kicker: "", label: "Iconic Polish", action: "edit", prompt: ICONIC_POLISH_INSTRUCTION },
  { id: "twilight", kicker: "", label: "Twilight", action: "twilight", prompt: "Convert to twilight." },
  { id: "grass", kicker: "", label: "Grass", action: "grass", prompt: "Replace the lawn." },
  { id: "staging", kicker: "", label: "Virtual staging", action: "edit", prompt: presetPrompt("virtual_stage") },
];

export const EDIT_TOOLS: Array<{ id: ScratchEditTool; label: string }> = [
  { id: "brush", label: "Brush" },
  { id: "clone", label: "Clone" },
  { id: "heal", label: "Heal" },
  { id: "remove", label: "Remove" },
];

export const STUDIO_CORE: Array<{ id: ScratchStudioTool; label: string }> = [
  { id: "fire", label: "Fire to fireplaces" },
  { id: "tv", label: "TV screens to TVs" },
  { id: "sky", label: "Sky replacement" },
  { id: "grass", label: "Grass replacement" },
  { id: "pins", label: "Arrow pins" },
  { id: "lines", label: "Lines to aerials" },
  { id: "text", label: "Add text" },
  { id: "shapes", label: "Shapes / elements" },
  { id: "logos", label: "Images / logos" },
];

export const STUDIO_EXTRAS: Array<{ id: ScratchStudioTool; label: string }> = [
  { id: "staging", label: "Virtual staging" },
  { id: "twilight", label: "Twilight one-tap" },
  { id: "object", label: "Object remove" },
  { id: "floorplan", label: "Floorplan brand" },
];

export const SKY_PRESETS: Array<{ id: SkyPreset; label: string }> = [
  { id: "dramatic", label: "Dramatic" },
  { id: "clear", label: "Clear blue" },
  { id: "sunset", label: "Sunset" },
  { id: "overcast", label: "Overcast" },
];

const LOCAL_STUDIO = new Set<ScratchStudioTool>(["pins", "lines", "text", "shapes", "logos", "floorplan"]);

export function isLocalStudioTool(id: ScratchStudioTool): boolean {
  return LOCAL_STUDIO.has(id);
}

function withNotes(prompt: string, notes: string): ScratchEditStep[] {
  const extra = notes.trim();
  const steps: ScratchEditStep[] = [{ action: "edit", prompt }];
  if (extra.length >= 3) {
    steps[0] = { action: "edit", prompt: `${prompt} Special instructions: ${extra}` };
  }
  return steps;
}

export function preferenceSteps(id: ScratchPreference, notes: string): ScratchEditStep[] {
  const preference = PREFERENCES.find((item) => item.id === id) || PREFERENCES[1];
  if (preference.action === "twilight" || preference.action === "grass") {
    const steps: ScratchEditStep[] = [{ action: preference.action, prompt: preference.prompt }];
    const extra = notes.trim();
    if (extra.length >= 3) steps.push({ action: "revise", prompt: extra });
    return steps;
  }
  return withNotes(preference.prompt, notes);
}

export function editInstructionSteps(instruction: string): ScratchEditStep[] {
  const text = instruction.trim();
  const prompt = text.length >= 3
    ? text
    : "Refine this listing photo. Balance the light and keep the architecture and camera angle.";
  return [{ action: "edit", prompt }];
}

export function studioSteps(
  id: ScratchStudioTool,
  options: { skyPreset: SkyPreset; intensity: number; blend: number; instruction: string },
): ScratchEditStep[] | null {
  if (isLocalStudioTool(id)) return null;
  let prompt = "";
  let action: ScratchEditStep["action"] = "edit";
  if (id === "fire") {
    prompt = "Add a realistic fire in the existing fireplace or firepit only. Do not add a new structure or change the camera.";
  } else if (id === "tv") {
    prompt = presetPrompt("add_tv");
  } else if (id === "sky") {
    const name = SKY_PRESETS.find((item) => item.id === options.skyPreset)?.label || "Dramatic";
    prompt = `Replace the visible sky with a photoreal ${name.toLowerCase()} sky. Keep the blend soft around the roofline. Strength about ${options.intensity} of 100, feather about ${options.blend}. Keep the house and camera angle.`;
  } else if (id === "grass") {
    action = "grass";
    prompt = "Replace the lawn.";
  } else if (id === "staging") {
    prompt = presetPrompt("virtual_stage");
  } else if (id === "twilight") {
    action = "twilight";
    prompt = "Convert to twilight.";
  } else if (id === "object") {
    prompt = "Remove the distracting object or person the editor is pointing at. Rebuild only that area. Do not add anyone. Keep the architecture and camera angle.";
  }
  if (action === "twilight" || action === "grass") {
    const steps: ScratchEditStep[] = [{ action, prompt }];
    const extra = options.instruction.trim();
    if (extra.length >= 3) steps.push({ action: "revise", prompt: extra });
    return steps;
  }
  return withNotes(prompt, options.instruction);
}

export const STAGING_ROOMS = [
  { id: "living", label: "Living Room", api: "living" },
  { id: "bed", label: "Bedroom", api: "bed" },
  { id: "dining", label: "Dining", api: "dining" },
  { id: "kitchen", label: "Kitchen", api: "kitchen" },
  { id: "office", label: "Home Office", api: "home_office" },
  { id: "bathroom", label: "Bathroom", api: "bathroom" },
  { id: "patio", label: "Patio", api: "outdoor" },
  { id: "kids", label: "Kids Room", api: "kids_room" },
] as const;

export const STAGING_FURNITURE = [
  { id: "sofa", label: "Sofa set" },
  { id: "dining", label: "Dining set" },
  { id: "bedroom", label: "Bedroom set" },
  { id: "office", label: "Office set" },
  { id: "mixed", label: "Mixed" },
] as const;

export const STAGING_ANGLES = [
  { id: "single", label: "Single angle" },
  { id: "corner", label: "Corner pair" },
  { id: "wide", label: "Wide + detail" },
] as const;

export const STAGING_STYLES = [
  { id: "modern", label: "Modern", api: "modern" },
  { id: "scandinavian", label: "Scandinavian", api: "scandinavian" },
  { id: "midcentury", label: "Mid-Century", api: "mid-century modern" },
  { id: "coastal", label: "Coastal", api: "coastal" },
  { id: "farmhouse", label: "Farmhouse", api: "farmhouse" },
  { id: "luxury", label: "Luxury", api: "luxury" },
] as const;

export interface StagingRequest {
  roomId: string;
  furnitureId: string;
  angleId: string;
  styleId: string;
  intensity: number;
  density: number;
  notes: string;
  aiNotes: string;
}

export function stagingApi(request: Pick<StagingRequest, "roomId" | "styleId">) {
  const room = STAGING_ROOMS.find((item) => item.id === request.roomId) || STAGING_ROOMS[0];
  const style = STAGING_STYLES.find((item) => item.id === request.styleId) || STAGING_STYLES[0];
  return { roomType: room.api, style: style.api, roomLabel: room.label, styleLabel: style.label };
}

export function stagingGuidance(request: StagingRequest): string | null {
  const furniture = STAGING_FURNITURE.find((item) => item.id === request.furnitureId);
  const angle = STAGING_ANGLES.find((item) => item.id === request.angleId);
  const lines: string[] = [];
  if (furniture && furniture.id !== "sofa") lines.push(`Furniture pack: ${furniture.label}.`);
  if (angle && angle.id !== "single") lines.push(`Shoot plan: ${angle.label}.`);
  if (request.intensity !== 70) lines.push(`Staging intensity ${request.intensity} of 100.`);
  if (request.density !== 60) lines.push(`Furniture density ${request.density} of 100.`);
  const notes = [request.notes, request.aiNotes].map((item) => item.trim()).filter((item) => item.length >= 3);
  if (notes.length) lines.push(`Special instructions: ${notes.join(" ")}`);
  if (!lines.length) return null;
  return `Refine this virtual staging. Keep the architecture and camera angle. Do not add anyone. ${lines.join(" ")}`;
}
