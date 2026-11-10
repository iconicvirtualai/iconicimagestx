/**
 * Lawn composite.
 *
 * The mask is built in-process: color, texture, and a ground plane, including
 * bare dirt inside the lawn. Trees, beds, walks, the house, sky, and people
 * stay outside it.
 *
 * The fill is a masked inpaint. The model sees the photo, an alpha mask, and
 * Cadi's grass photo as a style reference. Only the masked lawn is copied back
 * onto the original full-resolution frame, with the original luminance kept so
 * shadows stay. The raw model frame is never returned.
 */

import {
  GRASS_APPLIED_NOTE,
  GRASS_INPAINT_PROMPT,
  GRASS_MASK_EMPTY_NOTE,
  GRASS_UNCHANGED_NOTE,
} from "../../shared/grassEdit";
import { grassInpaintSize, inpaintMaskedPhoto } from "./openaiImageEdit";

type Sharp = typeof import("sharp").default;

function loadSharp(): Promise<Sharp> {
  return import("sharp").then((mod) => mod.default);
}

const ANALYSIS_LONG_EDGE = 512;
const MIN_LAWN_FRACTION = 0.02;
const MAX_LAWN_FRACTION = 0.78;

export interface GrassCompositeInput {
  photo: Buffer;
  reference: Buffer;
  /** Staff override. White (or any channel above 128) is lawn. */
  mask?: Buffer;
  /** Keep the pre-JPEG raster so tests can prove non-lawn samples are exact. */
  retainRaw?: boolean;
  /** When set, the lawn fill is a masked inpaint. Tests may pass `inpaint` instead. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  inpaint?: (request: { image: Buffer; maskPng: Buffer; reference: Buffer; size: string }) => Promise<Buffer>;
}

export interface GrassCompositeResult {
  bytes: Buffer;
  applied: boolean;
  note: string;
  width: number;
  height: number;
  /** White lawn, black everything else, same size as the output raster. */
  maskPng: Buffer | null;
  raw?: Uint8Array;
  alpha?: Uint8Array;
}

interface Rgb {
  data: Uint8Array;
  width: number;
  height: number;
}

export async function compositeGrass(input: GrassCompositeInput): Promise<GrassCompositeResult> {
  const photo = await decodeRgb(input.photo);
  if (!photo) {
    throw Object.assign(new Error("That photo could not be read."), { status: 400 });
  }
  const mask = input.mask?.length
    ? await maskFromOverride(input.mask, photo.width, photo.height)
    : await maskFromSegmentation(photo);

  const coverage = mask ? coverageOf(mask) : 0;
  if (!mask || coverage < MIN_LAWN_FRACTION) {
    const emptyOverride = Boolean(input.mask?.length);
    return {
      bytes: input.photo,
      applied: false,
      note: emptyOverride ? GRASS_MASK_EMPTY_NOTE : GRASS_UNCHANGED_NOTE,
      width: photo.width,
      height: photo.height,
      maskPng: mask ? await encodeMask(mask, photo.width, photo.height) : null,
    };
  }

  const usedModel = Boolean(input.apiKey || input.inpaint);
  const painted = await fillMaskedLawn(photo, mask, input);
  const sharp = await loadSharp();
  const jpeg = await sharp(Buffer.from(painted.raw), {
    raw: { width: photo.width, height: photo.height, channels: 3 },
  })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();

  return {
    bytes: jpeg,
    applied: true,
    note: usedModel
      ? GRASS_APPLIED_NOTE
      : "Replaced the lawn with varied patches from Cadi's grass reference, seated in the original light. Trees, house, sky, and hardscape stay on the original photo.",
    width: photo.width,
    height: photo.height,
    maskPng: await encodeMask(mask, photo.width, photo.height),
    raw: input.retainRaw ? painted.raw : undefined,
    alpha: input.retainRaw ? painted.alpha : undefined,
  };
}

/** Automatic lawn mask for the editor preview. Null when no lawn is found. */
export async function lawnMaskPng(photo: Buffer): Promise<{ png: Buffer | null; width: number; height: number }> {
  const decoded = await decodeRgb(photo);
  if (!decoded) throw Object.assign(new Error("That photo could not be read."), { status: 400 });
  const mask = await maskFromSegmentation(decoded);
  if (!mask || coverageOf(mask) < MIN_LAWN_FRACTION) {
    return { png: null, width: decoded.width, height: decoded.height };
  }
  return { png: await encodeMask(mask, decoded.width, decoded.height), width: decoded.width, height: decoded.height };
}

async function decodeRgb(bytes: Buffer): Promise<Rgb | null> {
  try {
    const sharp = await loadSharp();
    const { data, info } = await sharp(bytes, { failOn: "none", limitInputPixels: 80_000_000 })
      .rotate()
      .removeAlpha()
      .toColorspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || info.channels < 3) return null;
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return null;
  }
}

async function downscale(photo: Rgb): Promise<Rgb> {
  const scale = ANALYSIS_LONG_EDGE / Math.max(photo.width, photo.height);
  if (scale >= 1) return photo;
  const width = Math.max(32, Math.round(photo.width * scale));
  const height = Math.max(32, Math.round(photo.height * scale));
  const sharp = await loadSharp();
  const { data, info } = await sharp(Buffer.from(photo.data), {
    raw: { width: photo.width, height: photo.height, channels: 3 },
  })
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

function coverageOf(alpha: Uint8Array): number {
  let strong = 0;
  for (let i = 0; i < alpha.length; i += 1) if (alpha[i] >= 128) strong += 1;
  return strong / alpha.length;
}

async function maskFromSegmentation(photo: Rgb): Promise<Uint8Array | null> {
  const low = await downscale(photo);
  const binary = segmentLawn(low.data, low.width, low.height);
  if (!binary) return null;
  return upsampleMask(binary, low.width, low.height, photo.width, photo.height);
}

async function maskFromOverride(mask: Buffer, width: number, height: number): Promise<Uint8Array | null> {
  try {
    const sharp = await loadSharp();
    const { data, info } = await sharp(mask, { failOn: "none", limitInputPixels: 40_000_000 })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = new Uint8Array(width * height);
    const channels = info.channels || 3;
    for (let i = 0; i < alpha.length; i += 1) {
      const p = i * channels;
      const luma = data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;
      alpha[i] = luma >= 128 ? 255 : 0;
    }
    return softenMask(alpha, width, height);
  } catch {
    throw Object.assign(new Error("The lawn mask could not be read."), { status: 400 });
  }
}

async function upsampleMask(binary: Uint8Array, sw: number, sh: number, width: number, height: number): Promise<Uint8Array> {
  const blurred = boxBlur(binary, sw, sh, 1);
  const sharp = await loadSharp();
  const resized = await grayFrom(
    sharp(Buffer.from(blurred), { raw: { width: sw, height: sh, channels: 1 } })
      .resize(width, height, { fit: "fill", kernel: "lanczos3" }),
    width,
    height,
  );
  for (let i = 0; i < resized.length; i += 1) if (resized[i] < 8) resized[i] = 0;
  const sigma = clamp(Math.round(Math.min(width, height) * 0.01), 2, 16);
  return softenMask(resized, width, height, sigma);
}

async function grayFrom(pipeline: ReturnType<Sharp>, width: number, height: number): Promise<Uint8Array> {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const out = new Uint8Array(width * height);
  const channels = Math.max(1, info.channels || 1);
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * channels] || 0;
  return out;
}

async function softenMask(alpha: Uint8Array, width: number, height: number, sigma = 0): Promise<Uint8Array> {
  const sharp = await loadSharp();
  let pipeline = sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } });
  if (sigma > 0) pipeline = pipeline.blur(sigma);
  const out = await grayFrom(pipeline, width, height);
  for (let i = 0; i < out.length; i += 1) if (out[i] < 8) out[i] = 0;
  return out;
}

async function encodeMask(alpha: Uint8Array, width: number, height: number): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

async function fillMaskedLawn(
  photo: Rgb,
  alpha: Uint8Array,
  input: GrassCompositeInput,
): Promise<{ raw: Uint8Array; alpha: Uint8Array }> {
  const fill = input.apiKey || input.inpaint
    ? await inpaintFill(photo, alpha, input)
    : await patchFill(photo, alpha, input.reference);
  return seatFill(photo, alpha, fill);
}

async function inpaintFill(photo: Rgb, alpha: Uint8Array, input: GrassCompositeInput): Promise<Rgb> {
  const target = grassInpaintSize(photo.width, photo.height);
  const sharp = await loadSharp();
  const image = await sharp(Buffer.from(photo.data), {
    raw: { width: photo.width, height: photo.height, channels: 3 },
  }).resize(target.width, target.height, { fit: "fill" }).png().toBuffer();
  const maskPng = await editMaskPng(alpha, photo.width, photo.height, target.width, target.height);
  const reference = await sharp(input.reference, { failOn: "none" }).rotate().resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const model = input.inpaint
    ? await input.inpaint({ image, maskPng, reference, size: target.size })
    : (await inpaintMaskedPhoto({
      apiKey: input.apiKey || "",
      prompt: GRASS_INPAINT_PROMPT,
      image,
      maskPng,
      reference,
      size: target.size,
      fetchImpl: input.fetchImpl,
    })).bytes;
  const { data, info } = await sharp(model, { failOn: "none" })
    .rotate()
    .resize(photo.width, photo.height, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/** Alpha 0 is the lawn the model may change. Everything else is opaque. */
async function editMaskPng(alpha: Uint8Array, srcW: number, srcH: number, dstW: number, dstH: number): Promise<Buffer> {
  const sharp = await loadSharp();
  const resized = await sharp(Buffer.from(alpha), { raw: { width: srcW, height: srcH, channels: 1 } })
    .resize(dstW, dstH, { fit: "fill" })
    .raw()
    .toBuffer();
  const rgba = Buffer.alloc(dstW * dstH * 4);
  const channels = Math.max(1, Math.round(resized.length / (dstW * dstH)));
  for (let i = 0; i < dstW * dstH; i += 1) {
    const lawn = (resized[i * channels] || 0) >= 128;
    const o = i * 4;
    rgba[o] = 255;
    rgba[o + 1] = 255;
    rgba[o + 2] = 255;
    rgba[o + 3] = lawn ? 0 : 255;
  }
  return sharp(rgba, { raw: { width: dstW, height: dstH, channels: 4 } }).png().toBuffer();
}

/**
 * Offline fallback. Random reference patches, rotated and scaled per cell,
 * blended across overlaps. Not a single repeating tile.
 */
async function patchFill(photo: Rgb, alpha: Uint8Array, reference: Buffer): Promise<Rgb> {
  const sources = await referencePatches(reference);
  const { width, height } = photo;
  const data = new Uint8Array(photo.data);
  const cell = Math.max(36, Math.round(Math.min(width, height) * 0.07));
  for (let y = 0; y < height; y += 1) {
    const gy = Math.floor(y / cell);
    const fy = (y % cell) / cell;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (alpha[index] === 0) continue;
      const gx = Math.floor(x / cell);
      const fx = (x % cell) / cell;
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      for (let oy = 0; oy <= 1; oy += 1) {
        for (let ox = 0; ox <= 1; ox += 1) {
          const wx = ox === 0 ? 1 - fx : fx;
          const wy = oy === 0 ? 1 - fy : fy;
          const w = wx * wy;
          if (w <= 0) continue;
          const sample = patchSample(sources, gx + ox, gy + oy, x, y, width, height);
          r += sample[0] * w;
          g += sample[1] * w;
          b += sample[2] * w;
          weight += w;
        }
      }
      const p = index * 3;
      data[p] = clamp(r / weight, 0, 255);
      data[p + 1] = clamp(g / weight, 0, 255);
      data[p + 2] = clamp(b / weight, 0, 255);
    }
  }
  return { data, width, height };
}

async function referencePatches(reference: Buffer): Promise<Rgb[]> {
  const sharp = await loadSharp();
  const base = sharp(reference, { failOn: "none" }).rotate().resize({ width: 900, withoutEnlargement: true });
  const patches: Rgb[] = [];
  for (const angle of [0, 90, 180, 270]) {
    const { data, info } = await base.clone().rotate(angle).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    patches.push({ data: new Uint8Array(data), width: info.width, height: info.height });
  }
  if (!patches.length) throw Object.assign(new Error("The grass reference could not be read."), { status: 503 });
  return patches;
}

function patchSample(sources: Rgb[], cellX: number, cellY: number, x: number, y: number, width: number, height: number): [number, number, number] {
  const pick = hash(cellX * 73856093 ^ cellY * 19349663);
  const source = sources[Math.floor(pick * sources.length) % sources.length];
  const scale = 0.65 + hash(cellX * 83492791 ^ cellY * 2971215073) * 0.8;
  const depth = 0.35 + 0.65 * (y / Math.max(1, height - 1));
  const sx = Math.floor(mirror((x - width / 2) * scale * depth + hash(cellX + 17) * source.width, source.width));
  const sy = Math.floor(mirror(y * scale * (0.45 + depth) + hash(cellY + 29) * source.height, source.height));
  const i = (Math.min(source.height - 1, sy) * source.width + Math.min(source.width - 1, sx)) * 3;
  return [source.data[i], source.data[i + 1], source.data[i + 2]];
}

/** Seat the fill in the original light. Low-frequency luminance stays the photo's. */
function seatFill(photo: Rgb, alpha: Uint8Array, fill: Rgb): { raw: Uint8Array; alpha: Uint8Array } {
  const { data, width, height } = photo;
  const raw = new Uint8Array(data);
  const count = width * height;
  const origY = new Float32Array(count);
  const fillY = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = i * 3;
    origY[i] = yOf(data[p], data[p + 1], data[p + 2]);
    const f = Math.min(fill.data.length - 3, p);
    fillY[i] = yOf(fill.data[f], fill.data[f + 1], fill.data[f + 2]);
  }
  const lightRadius = clamp(Math.round(Math.min(width, height) * 0.04), 8, 56);
  const detailRadius = clamp(Math.round(Math.min(width, height) * 0.012), 2, 10);
  const origLight = boxBlurFloat(origY, width, height, lightRadius);
  const fillDetail = boxBlurFloat(fillY, width, height, detailRadius);
  let sceneChroma = 0;
  let fillChroma = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(count / 6000)));
  for (let i = 0; i < count; i += step) {
    if (alpha[i] < 200) continue;
    const p = i * 3;
    sceneChroma += chromaOf(data[p], data[p + 1], data[p + 2]);
    const f = Math.min(fill.data.length - 3, p);
    fillChroma += chromaOf(fill.data[f], fill.data[f + 1], fill.data[f + 2]);
    samples += 1;
  }
  const chromaScale = samples
    ? clamp((sceneChroma / samples) * 1.15 / Math.max(8, fillChroma / samples), 0.4, 1.05)
    : 0.8;

  for (let i = 0; i < count; i += 1) {
    const amount = alpha[i] / 255;
    if (amount === 0) continue;
    const p = i * 3;
    const f = Math.min(fill.data.length - 3, p);
    const y = origLight[i] + (fillY[i] - fillDetail[i]) * 0.72;
    const [cb, cr] = cbcrOf(fill.data[f], fill.data[f + 1], fill.data[f + 2]);
    const [r, g, b] = fromYCbCr(y, 128 + (cb - 128) * chromaScale, 128 + (cr - 128) * chromaScale);
    raw[p] = clamp(data[p] * (1 - amount) + r * amount, 0, 255);
    raw[p + 1] = clamp(data[p + 1] * (1 - amount) + g * amount, 0, 255);
    raw[p + 2] = clamp(data[p + 2] * (1 - amount) + b * amount, 0, 255);
  }
  return { raw, alpha };
}

function yOf(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function cbcrOf(r: number, g: number, b: number): [number, number] {
  return [
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ];
}

function chromaOf(r: number, g: number, b: number): number {
  const [cb, cr] = cbcrOf(r, g, b);
  return Math.hypot(cb - 128, cr - 128);
}

function fromYCbCr(y: number, cb: number, cr: number): [number, number, number] {
  return [
    clamp(y + 1.402 * (cr - 128), 0, 255),
    clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128), 0, 255),
    clamp(y + 1.772 * (cb - 128), 0, 255),
  ];
}

function hash(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Lawn / turf / bare yard, excluding canopy, beds, hardscape, sky, and people.
 * Works on the analysis frame. Returns a 0/255 mask, or null when no lawn qualifies.
 */
export function segmentLawn(rgb: Uint8Array, width: number, height: number): Uint8Array | null {
  const count = width * height;
  const candidate = new Uint8Array(count);
  const bare = new Uint8Array(count);
  const blocked = new Uint8Array(count);
  const luma = new Float32Array(count);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const p = i * 3;
      const r = rgb[p];
      const g = rgb[p + 1];
      const b = rgb[p + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const value = max / 255;
      luma[i] = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const sky = (b > r + 12 && b > g + 4 && value > 0.42 && y < height * 0.8)
        || (value > 0.88 && sat < 0.16 && y < height * 0.62)
        || (y < height * 0.48 && b > g + 6 && r > g && sat > 0.1 && value > 0.32);
      const hard = sat < 0.12 && value > 0.46 && Math.abs(r - g) < 16 && Math.abs(g - b) < 20 && g < r + 12;
      const mulch = value < 0.22 && r > g + 2 && r > b + 8 && sat > 0.18 && y > height * 0.18;
      if (sky || hard || mulch) {
        blocked[i] = 1;
        continue;
      }
      const lawnGreen = g > r + 4 && g > b + 8 && g > 32 && g < 248 && sat > 0.1 && sat < 0.92 && value > 0.12 && value < 0.94;
      if (lawnGreen) candidate[i] = 1;
      const bareYard = y > height * 0.5
        && r > 55 && g > 50 && b + 16 < g
        && r < g + 28 && g + 18 >= r
        && sat > 0.12 && sat < 0.62
        && value > 0.16 && value < 0.72;
      if (bareYard) bare[i] = 1;
    }
  }

  suppressCanopy(candidate, luma, width, height);

  const mask = floodLowerLawn(candidate, bare, blocked, width, height);
  if (!mask) return null;
  trimSpikes(mask, width, height);
  smoothHorizon(mask, width, height);
  fillInteriorGaps(mask, blocked, width, height);
  extendBareGround(rgb, mask, blocked, width, height);
  fillInteriorGaps(mask, blocked, width, height);
  removePeople(rgb, mask, width, height);
  if (!lawnIsPlausible(mask, width, height)) return null;
  for (let i = 0; i < mask.length; i += 1) mask[i] = mask[i] ? 255 : 0;
  return mask;
}

function suppressCanopy(candidate: Uint8Array, luma: Float32Array, width: number, height: number) {
  const variance = new Float32Array(width * height);
  const radius = 2;
  let bottomSum = 0;
  let bottomCount = 0;
  const yCut = Math.floor(height * 0.68);
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      const i = y * width + x;
      if (!candidate[i]) continue;
      let sum = 0;
      let sq = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const value = luma[(y + dy) * width + x + dx];
          sum += value;
          sq += value * value;
          n += 1;
        }
      }
      const mean = sum / n;
      variance[i] = sq / n - mean * mean;
      if (y > yCut) {
        bottomSum += variance[i];
        bottomCount += 1;
      }
    }
  }
  const typical = bottomCount ? bottomSum / bottomCount : 80;
  const limit = Math.max(220, typical * 2.6);
  const canopyLine = Math.floor(height * 0.74);
  for (let y = 0; y < canopyLine; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (candidate[i] && variance[i] > limit) candidate[i] = 0;
    }
  }
}

function floodLowerLawn(
  candidate: Uint8Array,
  bare: Uint8Array,
  blocked: Uint8Array,
  width: number,
  height: number,
): Uint8Array | null {
  const mask = new Uint8Array(width * height);
  const kept = keepComponents(candidate, blocked, width, height, mask, Math.floor(height * 0.46), width * height * 0.008, height * 0.4);
  if (kept >= width * height * MIN_LAWN_FRACTION) return mask;
  const bareKept = keepComponents(bare, blocked, width, height, mask, Math.floor(height * 0.62), width * height * 0.04, height * 0.55);
  return kept + bareKept > 0 ? mask : null;
}

function keepComponents(
  candidate: Uint8Array,
  blocked: Uint8Array,
  width: number,
  height: number,
  mask: Uint8Array,
  seedY: number,
  minArea: number,
  minCentroid: number,
): number {
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let kept = 0;
  for (let y = seedY; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!candidate[start] || seen[start] || blocked[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail] = start;
      tail += 1;
      seen[start] = 1;
      const pixels: number[] = [];
      let sumY = 0;
      let touchesBottom = false;
      while (head < tail) {
        const p = queue[head];
        head += 1;
        pixels.push(p);
        const px = p % width;
        const py = Math.floor(p / width);
        sumY += py;
        if (py > height * 0.9) touchesBottom = true;
        const neighbors = [p - 1, p + 1, p - width, p + width];
        if (px === 0) neighbors[0] = -1;
        if (px === width - 1) neighbors[1] = -1;
        if (py === 0) neighbors[2] = -1;
        if (py === height - 1) neighbors[3] = -1;
        for (const next of neighbors) {
          if (next < 0 || seen[next] || !candidate[next] || blocked[next]) continue;
          seen[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
      const centroid = sumY / pixels.length;
      const bareNeedsGround = minArea > width * height * 0.02;
      if (pixels.length >= minArea && centroid > minCentroid && (!bareNeedsGround || touchesBottom)) {
        for (const p of pixels) mask[p] = 1;
        kept += pixels.length;
      }
    }
  }
  return kept;
}

function smoothHorizon(mask: Uint8Array, width: number, height: number) {
  const tops = new Int16Array(width);
  tops.fill(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (mask[y * width + x]) {
        tops[x] = y;
        break;
      }
    }
  }
  const window = Math.max(9, Math.round(width * 0.08) | 1);
  const half = Math.floor(window / 2);
  for (let x = 0; x < width; x += 1) {
    if (tops[x] >= height) continue;
    const samples: number[] = [];
    for (let i = x - half; i <= x + half; i += 1) {
      const col = Math.max(0, Math.min(width - 1, i));
      if (tops[col] < height) samples.push(tops[col]);
    }
    if (samples.length < 7) continue;
    samples.sort((a, b) => a - b);
    const smooth = samples[Math.floor(samples.length / 2)];
    const cut = Math.min(tops[x] + Math.round(height * 0.035), smooth + Math.round(height * 0.008));
    if (cut <= tops[x]) continue;
    for (let y = tops[x]; y < cut; y += 1) mask[y * width + x] = 0;
  }
}

function trimSpikes(mask: Uint8Array, width: number, height: number) {
  const tops = new Int16Array(width);
  tops.fill(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (mask[y * width + x]) {
        tops[x] = y;
        break;
      }
    }
  }
  const window = Math.max(5, Math.round(width * 0.05) | 1);
  const half = Math.floor(window / 2);
  const margin = Math.max(2, Math.round(height * 0.018));
  for (let x = 0; x < width; x += 1) {
    if (tops[x] >= height) continue;
    const samples: number[] = [];
    for (let i = x - half; i <= x + half; i += 1) {
      const col = Math.max(0, Math.min(width - 1, i));
      if (tops[col] < height) samples.push(tops[col]);
    }
    if (samples.length < 5) continue;
    samples.sort((a, b) => a - b);
    const smooth = samples[Math.floor(samples.length / 2)];
    if (tops[x] >= smooth - margin) continue;
    const cut = smooth;
    for (let y = 0; y < cut; y += 1) mask[y * width + x] = 0;
  }
}

function fillInteriorGaps(mask: Uint8Array, blocked: Uint8Array, width: number, height: number) {
  const top = new Int16Array(width);
  const bottom = new Int16Array(width);
  top.fill(-1);
  bottom.fill(-1);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (!mask[y * width + x]) continue;
      if (top[x] < 0) top[x] = y;
      bottom[x] = y;
    }
  }
  for (let x = 0; x < width; x += 1) {
    if (top[x] < 0) continue;
    for (let y = top[x]; y <= bottom[x]; y += 1) {
      const i = y * width + x;
      if (mask[i] || blocked[i]) continue;
      mask[i] = 1;
    }
  }
  fillSmallHoles(mask, blocked, width, height);
}

function fillSmallHoles(mask: Uint8Array, blocked: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const maxHole = width * height * 0.0016;
  const queue = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    seen[start] = 1;
    const pixels: number[] = [];
    let touchesBorder = false;
    let hard = 0;
    while (head < tail) {
      const p = queue[head];
      head += 1;
      pixels.push(p);
      if (blocked[p]) hard += 1;
      const x = p % width;
      const y = Math.floor(p / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      const neighbors = [p - 1, p + 1, p - width, p + width];
      if (x === 0) neighbors[0] = -1;
      if (x === width - 1) neighbors[1] = -1;
      if (y === 0) neighbors[2] = -1;
      if (y === height - 1) neighbors[3] = -1;
      for (const next of neighbors) {
        if (next < 0 || seen[next] || mask[next]) continue;
        seen[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
      if (pixels.length > maxHole) break;
    }
    if (!touchesBorder && pixels.length <= maxHole && hard / pixels.length < 0.4) {
      for (const p of pixels) mask[p] = 1;
    }
  }
}

/** Pull bare dirt and dry patches at the bottom of a lawn column into the mask. Walks and beds stay blocked. */
function extendBareGround(rgb: Uint8Array, mask: Uint8Array, blocked: Uint8Array, width: number, height: number) {
  const maxGap = Math.round(height * 0.2);
  for (let x = 0; x < width; x += 1) {
    let top = -1;
    let bottom = -1;
    let lawn = 0;
    for (let y = 0; y < height; y += 1) {
      if (!mask[y * width + x]) continue;
      lawn += 1;
      if (top < 0) top = y;
      bottom = y;
    }
    if (top < 0 || lawn < height * 0.05) continue;
    let gap = 0;
    for (let y = bottom; y < height && gap < maxGap; y += 1) {
      const i = y * width + x;
      if (blocked[i]) break;
      if (mask[i]) continue;
      const p = i * 3;
      if (!isYardGround(rgb[p], rgb[p + 1], rgb[p + 2])) break;
      mask[i] = 1;
      gap += 1;
    }
  }
}

function removePeople(rgb: Uint8Array, mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const maxWidth = Math.round(width * 0.22);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const p0 = start * 3;
    if (!isSkin(rgb[p0], rgb[p0 + 1], rgb[p0 + 2])) continue;
    const queue = [start];
    seen[start] = 1;
    const pixels: number[] = [];
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let head = 0;
    while (head < queue.length && pixels.length < width * height * 0.08) {
      const p = queue[head];
      head += 1;
      pixels.push(p);
      const x = p % width;
      const y = Math.floor(p / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [p - 1, p + 1, p - width, p + width];
      if (x === 0) neighbors[0] = -1;
      if (x === width - 1) neighbors[1] = -1;
      if (y === 0) neighbors[2] = -1;
      if (y === height - 1) neighbors[3] = -1;
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !mask[next]) continue;
        const n = next * 3;
        if (!isSkin(rgb[n], rgb[n + 1], rgb[n + 2])) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    const span = maxX - minX + 1;
    const tall = maxY - minY + 1;
    if (pixels.length > 40 && span <= maxWidth && tall > span * 1.35) {
      for (const p of pixels) mask[p] = 0;
    }
  }
}

function isSkin(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const value = max / 255;
  return r > 150 && g > 90 && b > 70 && r > g + 12 && r > b + 18 && g > b && (g - b) < 38 && sat > 0.14 && sat < 0.58 && value > 0.45 && value < 0.96;
}

function isYardGround(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const value = max / 255;
  if (value < 0.08) return false;
  const concrete = sat < 0.1 && value > 0.45 && Math.abs(r - g) < 14 && Math.abs(g - b) < 16;
  if (concrete) return false;
  const green = g + 2 >= r && g > b + 4 && g > 24;
  const earth = b + 8 < Math.max(r, g) && r > 35 && g > 30 && sat > 0.05 && sat < 0.72 && value < 0.86 && r < g + 55;
  return green || earth;
}

function lawnIsPlausible(mask: Uint8Array, width: number, height: number): boolean {
  let total = 0;
  let lower = 0;
  let upper = 0;
  const lowerY = Math.floor(height * 0.38);
  const upperY = Math.floor(height * 0.16);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      total += 1;
      if (y >= lowerY) lower += 1;
      if (y < upperY) upper += 1;
    }
  }
  const fraction = total / (width * height);
  if (fraction < MIN_LAWN_FRACTION || fraction > MAX_LAWN_FRACTION) return false;
  if (lower / total < 0.62) return false;
  if (upper / total > 0.04) return false;
  return true;
}

function mirror(value: number, size: number): number {
  const period = size * 2;
  let m = value % period;
  if (m < 0) m += period;
  return m >= size ? period - 1 - m : m;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function boxBlur(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const floats = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 1) floats[i] = src[i];
  const blurred = boxBlurFloat(floats, width, height, radius);
  const out = new Uint8Array(src.length);
  for (let i = 0; i < out.length; i += 1) out[i] = clamp(Math.round(blurred[i]), 0, 255);
  return out;
}

function boxBlurFloat(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const r = Math.max(1, radius);
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const prefix = new Float32Array(Math.max(width, height) + 1);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    prefix[0] = 0;
    for (let x = 0; x < width; x += 1) prefix[x + 1] = prefix[x] + src[row + x];
    for (let x = 0; x < width; x += 1) {
      const start = Math.max(0, x - r);
      const end = Math.min(width - 1, x + r);
      tmp[row + x] = (prefix[end + 1] - prefix[start]) / (end - start + 1);
    }
  }
  for (let x = 0; x < width; x += 1) {
    prefix[0] = 0;
    for (let y = 0; y < height; y += 1) prefix[y + 1] = prefix[y] + tmp[y * width + x];
    for (let y = 0; y < height; y += 1) {
      const start = Math.max(0, y - r);
      const end = Math.min(height - 1, y + r);
      out[y * width + x] = (prefix[end + 1] - prefix[start]) / (end - start + 1);
    }
  }
  return out;
}
