/**
 * Grass is not an image-model prompt.
 * Iconic, Iconic Polish, the Grass tool, and the order queue all call the
 * same lawn composite. These helpers keep "add grass" out of the model text.
 */

export const GRASS_APPLIED_NOTE =
  "Replaced the lawn with a masked inpaint guided by Cadi's grass photo. Trees, house, sky, hardscape, and every other non-lawn pixel stay on the original photo.";

export const GRASS_INPAINT_PROMPT = [
  "The first image is the listing photograph. The second image is a real lawn and is only a style reference for blade color and texture.",
  "Replace only the transparent area of the mask, which is the lawn, including bare dirt and thin patches inside that lawn.",
  "Paint photoreal turf whose blades get finer toward the far edge of the lawn and coarser in the foreground. Do not use one texture scale for the whole yard.",
  "Keep the photograph's cast shadows, dappled shade, contrast, and white balance. Do not flatten or relight the lawn.",
  "Keep natural olive, straw, and green variation.",
  "Do not use neon green, a flat fill, a repeating stripe, or a crosshatched carpet texture.",
  "Do not change the house, trees, shrubs, flower beds, driveway, walkway, sky, people, or any pixel outside the mask.",
].join(" ");

export const GRASS_SKIPPED_NOTE = "No lawn detected. Grass was not added.";

export const GRASS_UNCHANGED_NOTE =
  "No lawn detected. Grass was not added. The photo is unchanged.";

export const GRASS_MASK_EMPTY_NOTE =
  "The lawn mask is empty. Grass was not added. The photo is unchanged.";

const GRASS_REQUEST =
  /\b(add|replace|insert|paint)\s+grass\b|\bgrass replacement\b|\breplace the lawn\b|\badd a lawn\b|\bnew lawn\b/i;

export function promptRequestsGrass(prompt: string): boolean {
  return GRASS_REQUEST.test(prompt);
}

/** Drop sentences that ask a model to invent grass. Other requests stay. */
export function stripGrassInstructions(prompt: string): string {
  const parts = prompt
    .split(/(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !GRASS_REQUEST.test(part));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function promptNeedsImageModel(prompt: string): boolean {
  return stripGrassInstructions(prompt).trim().length >= 3;
}

export function editWantsGrass(
  prompt: string,
  plan?: { grassReplacement?: boolean; iconicPolish?: boolean },
): boolean {
  if (plan?.grassReplacement || plan?.iconicPolish) return true;
  return promptRequestsGrass(prompt) || /iconic polish/i.test(prompt);
}
