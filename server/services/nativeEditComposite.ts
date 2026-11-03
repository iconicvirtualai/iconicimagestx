/**
 * Fit an OpenAI image edit back onto the native source.
 * The API canvas is smaller than a camera original. The source is the master.
 * Where the edit did not meaningfully change the picture, the original pixels stay.
 * Edited areas are the API image scaled to the source. JPG encoding is lossy.
 */

import sharp from "sharp";
import { OpenAiEditError } from "./openaiImageEdit";

export const NATIVE_JPEG_QUALITY = 98;
export const NATIVE_JPEG_CHROMA = "4:4:4";
/** After a small blur, a difference below this is resize noise, not an edit. */
export const EDIT_CHANGE_THRESHOLD = 28;
export const EDIT_DIFF_BLUR_SIGMA = 1.4;
export const EDIT_MASK_FEATHER_SIGMA = 1.6;
const MAX_PIXELS = 90_000_000;

export interface LetterboxRect {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

/** How a source frame is contained inside an API canvas. Bars sit outside this rect. */
export function letterboxRect(srcW: number, srcH: number, canvasW: number, canvasH: number): LetterboxRect {
  const scale = Math.min(canvasW / srcW, canvasH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return {
    left: (canvasW - width) / 2,
    top: (canvasH - height) / 2,
    width,
    height,
    scale,
  };
}

function contentExtract(rect: LetterboxRect, canvasW: number, canvasH: number) {
  const left = Math.max(0, Math.ceil(rect.left - 1e-6));
  const top = Math.max(0, Math.ceil(rect.top - 1e-6));
  const right = Math.min(canvasW, Math.floor(rect.left + rect.width + 1e-6));
  const bottom = Math.min(canvasH, Math.floor(rect.top + rect.height + 1e-6));
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;
  if (left === 0 && top === 0 && width === canvasW && height === canvasH) return null;
  return { left, top, width, height };
}

export async function decodeOrientedRgb(bytes: Buffer): Promise<{ raw: Buffer; width: number; height: number }> {
  const decoded = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "none" })
    .rotate()
    .toColorspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (decoded.info.channels !== 3 || !decoded.info.width || !decoded.info.height) {
    throw new OpenAiEditError("Studio could not read this photo in color.");
  }
  return { raw: decoded.data, width: decoded.info.width, height: decoded.info.height };
}

async function fittedCandidate(candidate: Buffer, srcW: number, srcH: number): Promise<{ raw: Buffer; apiWidth: number; apiHeight: number }> {
  const apiMeta = await sharp(candidate, { limitInputPixels: MAX_PIXELS, failOn: "none" }).rotate().metadata();
  const apiWidth = apiMeta.width || 0;
  const apiHeight = apiMeta.height || 0;
  if (apiWidth < 1 || apiHeight < 1) throw new OpenAiEditError("OpenAI returned an image with no dimensions.");
  const extract = contentExtract(letterboxRect(srcW, srcH, apiWidth, apiHeight), apiWidth, apiHeight);
  let pipeline = sharp(candidate, { limitInputPixels: MAX_PIXELS, failOn: "none" }).rotate().toColorspace("srgb");
  if (extract) pipeline = pipeline.extract(extract);
  const fitted = await pipeline
    .resize(srcW, srcH, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (fitted.info.width !== srcW || fitted.info.height !== srcH || fitted.info.channels !== 3) {
    throw new OpenAiEditError("Studio could not fit the edit back to the original photo.");
  }
  return { raw: fitted.data, apiWidth, apiHeight };
}

async function changeMask(source: Buffer, fitted: Buffer, width: number, height: number): Promise<Buffer> {
  const pixels = width * height;
  if (source.length < pixels * 3 || fitted.length < pixels * 3) {
    throw new OpenAiEditError("Studio could not compare the edit to the original photo.");
  }
  const diff = Buffer.alloc(pixels);
  for (let i = 0, p = 0; i < pixels; i += 1, p += 3) {
    const dr = Math.abs(source[p] - fitted[p]);
    const dg = Math.abs(source[p + 1] - fitted[p + 1]);
    const db = Math.abs(source[p + 2] - fitted[p + 2]);
    diff[i] = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
  }
  const blurred = await sharp(diff, { raw: { width, height, channels: 1 } })
    .blur(EDIT_DIFF_BLUR_SIGMA)
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  if (blurred.length < pixels) throw new OpenAiEditError("Studio could not build the edit mask.");
  const binary = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i += 1) binary[i] = blurred[i] >= EDIT_CHANGE_THRESHOLD ? 255 : 0;
  const feathered = await sharp(binary, { raw: { width, height, channels: 1 } })
    .blur(EDIT_MASK_FEATHER_SIGMA)
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  if (feathered.length < pixels) throw new OpenAiEditError("Studio could not feather the edit mask.");
  return feathered.subarray(0, pixels);
}

function compositeMask(source: Buffer, fitted: Buffer, mask: Buffer, width: number, height: number): Buffer {
  const out = Buffer.from(source.subarray(0, width * height * 3));
  const pixels = width * height;
  for (let i = 0, p = 0; i < pixels; i += 1, p += 3) {
    const weight = mask[i];
    if (!weight) continue;
    if (weight === 255) {
      out[p] = fitted[p];
      out[p + 1] = fitted[p + 1];
      out[p + 2] = fitted[p + 2];
      continue;
    }
    const keep = 255 - weight;
    out[p] = Math.round((source[p] * keep + fitted[p] * weight) / 255);
    out[p + 1] = Math.round((source[p + 1] * keep + fitted[p + 1] * weight) / 255);
    out[p + 2] = Math.round((source[p + 2] * keep + fitted[p + 2] * weight) / 255);
  }
  return out;
}

export async function encodeListingJpeg(raw: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .withIccProfile("srgb")
    .jpeg({ quality: NATIVE_JPEG_QUALITY, chromaSubsampling: NATIVE_JPEG_CHROMA })
    .toBuffer();
}

export async function compositeNativeEdit(source: Buffer, candidate: Buffer): Promise<{
  jpeg: Buffer;
  raw: Buffer;
  width: number;
  height: number;
  apiWidth: number;
  apiHeight: number;
  upscaledRegion: true;
}> {
  const decoded = await decodeOrientedRgb(source);
  const fitted = await fittedCandidate(candidate, decoded.width, decoded.height);
  const mask = await changeMask(decoded.raw, fitted.raw, decoded.width, decoded.height);
  const raw = compositeMask(decoded.raw, fitted.raw, mask, decoded.width, decoded.height);
  const jpeg = await encodeListingJpeg(raw, decoded.width, decoded.height);
  return {
    jpeg,
    raw,
    width: decoded.width,
    height: decoded.height,
    apiWidth: fitted.apiWidth,
    apiHeight: fitted.apiHeight,
    upscaledRegion: true,
  };
}
