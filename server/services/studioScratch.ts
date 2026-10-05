/**
 * One-off coordinator edits. Calls the same OpenAI image edit used by Iconic Studio.
 * Does not write edit jobs, listings, or galleries.
 */

import fs from "fs/promises";
import path from "path";
import { AI_EDIT_MISSING_KEY_NOTE, realEstateEditPrompt } from "../../shared/iconicStudio";
import {
  GRASS_REFERENCE_MISSING_NOTE,
  GRASS_REFERENCE_PUBLIC_PATH,
  GRASS_REFERENCE_RELATIVE_PATH,
  parseScratchEdit,
  scratchDownloadName,
} from "../../shared/studioScratch";
import { OpenAiEditError, editListingPhotoWithOpenAI, readOpenAiApiKey } from "./openaiImageEdit";

export function grassReferenceCandidates(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string[] {
  const override = typeof env.STUDIO_GRASS_REFERENCE_PATH === "string" ? env.STUDIO_GRASS_REFERENCE_PATH.trim() : "";
  if (override) return [override];
  return [
    path.join(cwd, GRASS_REFERENCE_RELATIVE_PATH),
    path.join(cwd, "dist/spa/studio/grass-reference.jpg"),
  ];
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 32 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export async function readGrassReference(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ bytes: Buffer; contentType: "image/jpeg"; path: string }> {
  for (const filePath of grassReferenceCandidates(env)) {
    try {
      const bytes = await fs.readFile(filePath);
      if (isJpeg(bytes)) return { bytes, contentType: "image/jpeg", path: filePath };
    } catch {
      // The next candidate may exist after the Vite build copies public/.
    }
  }
  throw new OpenAiEditError(GRASS_REFERENCE_MISSING_NOTE, 503);
}

export async function grassReferenceStatus(env: NodeJS.ProcessEnv = process.env): Promise<{
  ready: boolean;
  publicPath: string;
  note: string;
}> {
  try {
    await readGrassReference(env);
    return {
      ready: true,
      publicPath: GRASS_REFERENCE_PUBLIC_PATH,
      note: "Using the lawn reference at /studio/grass-reference.jpg.",
    };
  } catch (err) {
    return {
      ready: false,
      publicPath: GRASS_REFERENCE_PUBLIC_PATH,
      note: err instanceof Error ? err.message : GRASS_REFERENCE_MISSING_NOTE,
    };
  }
}

export async function editScratchPhoto(input: {
  action: string;
  prompt: string;
  bytes: Buffer;
  contentType: string;
  fileName?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  readGrass?: () => Promise<{ bytes: Buffer; contentType: "image/jpeg" }>;
}): Promise<{ bytes: Buffer; contentType: "image/jpeg"; downloadName: string }> {
  const parsed = parseScratchEdit({
    action: input.action,
    prompt: input.prompt,
    byteLength: input.bytes.length,
    contentType: input.contentType,
  });
  if (parsed.ok === false) throw new OpenAiEditError(parsed.error, 400);

  let references: Array<{ bytes: Buffer; contentType: string; filename: string }> | undefined;
  if (parsed.attachGrass) {
    const grass = input.readGrass ? await input.readGrass() : await readGrassReference(input.env);
    references = [{ bytes: grass.bytes, contentType: grass.contentType, filename: "grass-reference.jpg" }];
  }

  const apiKey = readOpenAiApiKey(input.env ?? process.env);
  if (!apiKey) throw new OpenAiEditError(AI_EDIT_MISSING_KEY_NOTE, 503);

  const edited = await editListingPhotoWithOpenAI({
    apiKey,
    prompt: realEstateEditPrompt(parsed.prompt),
    bytes: input.bytes,
    contentType: "image/jpeg",
    references,
    fetchImpl: input.fetchImpl,
  });
  return {
    bytes: edited.bytes,
    contentType: edited.contentType,
    downloadName: scratchDownloadName(input.fileName || "scratch.jpg"),
  };
}
