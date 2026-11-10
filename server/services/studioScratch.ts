/**
 * One-off coordinator edits. Calls the same OpenAI image edit used by Iconic Studio.
 * Does not write edit jobs, listings, or galleries.
 */

import fs from "fs/promises";
import path from "path";
import { promptNeedsImageModel, promptRequestsGrass, stripGrassInstructions } from "../../shared/grassEdit";
import { AI_EDIT_MISSING_KEY_NOTE, realEstateEditPrompt } from "../../shared/iconicStudio";
import {
  GRASS_REFERENCE_MISSING_NOTE,
  GRASS_REFERENCE_PUBLIC_PATH,
  GRASS_REFERENCE_RELATIVE_PATH,
  parseScratchEdit,
  scratchDownloadName,
} from "../../shared/studioScratch";
import { compositeGrass, lawnMaskPng, type GrassCompositeResult } from "./grassComposite";
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

function editError(err: unknown): OpenAiEditError {
  if (err instanceof OpenAiEditError) return err;
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 400;
  const message = err instanceof Error ? err.message : "The grass edit failed.";
  return new OpenAiEditError(message, status || 400);
}

export async function applyGrassToPhoto(
  photo: Buffer,
  mask?: Buffer,
  env?: NodeJS.ProcessEnv,
  readGrass?: () => Promise<{ bytes: Buffer; contentType: "image/jpeg" }>,
  fetchImpl?: typeof fetch,
): Promise<GrassCompositeResult> {
  const grass = readGrass ? await readGrass() : await readGrassReference(env);
  try {
    return await compositeGrass({
      photo,
      reference: grass.bytes,
      mask,
      apiKey: readOpenAiApiKey(env ?? process.env),
      fetchImpl,
    });
  } catch (err) {
    throw editError(err);
  }
}

export async function previewLawnMask(photo: Buffer, env?: NodeJS.ProcessEnv): Promise<{ png: Buffer | null; note: string }> {
  await readGrassReference(env);
  try {
    const mask = await lawnMaskPng(photo);
    return {
      png: mask.png,
      note: mask.png
        ? "Automatic lawn. Paint to add or erase it, then apply."
        : "No lawn detected. Grass was not added. The photo is unchanged.",
    };
  } catch (err) {
    throw editError(err);
  }
}

export async function editScratchPhoto(input: {
  action: string;
  prompt: string;
  bytes: Buffer;
  contentType: string;
  fileName?: string;
  mask?: Buffer;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  readGrass?: () => Promise<{ bytes: Buffer; contentType: "image/jpeg" }>;
}): Promise<{ bytes: Buffer; contentType: "image/jpeg"; downloadName: string; note: string }> {
  const parsed = parseScratchEdit({
    action: input.action,
    prompt: input.prompt,
    byteLength: input.bytes.length,
    contentType: input.contentType,
  });
  if (parsed.ok === false) throw new OpenAiEditError(parsed.error, 400);

  const wantsGrass = parsed.action === "grass" || parsed.attachGrass || promptRequestsGrass(parsed.prompt);
  let bytes = input.bytes;
  let note = "";

  if (parsed.action !== "grass" && promptNeedsImageModel(parsed.prompt)) {
    const apiKey = readOpenAiApiKey(input.env ?? process.env);
    if (!apiKey) throw new OpenAiEditError(AI_EDIT_MISSING_KEY_NOTE, 503);
    const edited = await editListingPhotoWithOpenAI({
      apiKey,
      prompt: realEstateEditPrompt(stripGrassInstructions(parsed.prompt)),
      bytes: input.bytes,
      contentType: "image/jpeg",
      fetchImpl: input.fetchImpl,
    });
    bytes = edited.bytes;
  } else if (!wantsGrass) {
    const apiKey = readOpenAiApiKey(input.env ?? process.env);
    if (!apiKey) throw new OpenAiEditError(AI_EDIT_MISSING_KEY_NOTE, 503);
    throw new OpenAiEditError("Describe the AI edit.", 400);
  }

  if (wantsGrass) {
    const grass = await applyGrassToPhoto(bytes, input.mask, input.env, input.readGrass, input.fetchImpl);
    if (!grass.applied) {
      return {
        bytes,
        contentType: "image/jpeg",
        downloadName: scratchDownloadName(input.fileName || "scratch.jpg"),
        note: bytes === input.bytes ? grass.note : "No lawn detected. Grass was not added.",
      };
    }
    bytes = grass.bytes;
    note = grass.note;
  }

  return {
    bytes,
    contentType: "image/jpeg",
    downloadName: scratchDownloadName(input.fileName || "scratch.jpg"),
    note,
  };
}
