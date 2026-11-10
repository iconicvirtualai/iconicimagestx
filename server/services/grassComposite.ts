/**
 * Lawn composite.
 *
 * The lawn mask is built in-process. There is no extra model download and no
 * image-edit call. A downscaled frame is classified by color and texture, then
 * the lawn is the ground-plane region connected to the lower half of the photo:
 * healthy, patchy, dormant, and bare yard ground. Trees, shrubs, beds, the
 * house, hardscape, sky, and people stay outside that region.
 *
 * The mask is filled with pixels from Cadi's grass reference, tiled and
 * compressed toward the lawn's horizon, color-matched to the lawn, and shaded
 * with the original light. Only masked pixels are replaced. Every other sample
 * is copied from the oriented original before the JPEG encode.
 */

import sharp from "sharp";
import {
  GRASS_APPLIED_NOTE,
  GRASS_MASK_EMPTY_NOTE,
  GRASS_UNCHANGED_NOTE,
} from "../../shared/grassEdit";

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

  const tile = await grassTile(input.reference);
  const painted = paintLawn(photo, mask, tile);
  const jpeg = await sharp(Buffer.from(painted.raw), {
    raw: { width: photo.width, height: photo.height, channels: 3 },
  })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();

  return {
    bytes: jpeg,
    applied: true,
    note: GRASS_APPLIED_NOTE,
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

async function grayFrom(pipeline: ReturnType<typeof sharp>, width: number, height: number): Promise<Uint8Array> {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const out = new Uint8Array(width * height);
  const channels = Math.max(1, info.channels || 1);
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * channels] || 0;
  return out;
}

async function softenMask(alpha: Uint8Array, width: number, height: number, sigma = 0): Promise<Uint8Array> {
  let pipeline = sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } });
  if (sigma > 0) pipeline = pipeline.blur(sigma);
  const out = await grayFrom(pipeline, width, height);
  for (let i = 0; i < out.length; i += 1) if (out[i] < 8) out[i] = 0;
  return out;
}

async function encodeMask(alpha: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

interface Tile {
  data: Uint8Array;
  width: number;
  height: number;
}

async function grassTile(reference: Buffer): Promise<Tile> {
  const meta = await sharp(reference, { failOn: "none" }).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 8 || height < 8) {
    throw Object.assign(new Error("The grass reference could not be read."), { status: 503 });
  }
  const side = Math.min(720, width, height);
  const left = Math.max(0, Math.floor((width - side) / 2));
  const top = Math.min(Math.max(0, Math.floor(height * 0.52)), height - side);
  const { data, info } = await sharp(reference, { failOn: "none" })
    .rotate()
    .extract({ left, top, width: side, height: side })
    .removeAlpha()
    .blur(0.7)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

function paintLawn(photo: Rgb, alpha: Uint8Array, tile: Tile): { raw: Uint8Array; alpha: Uint8Array } {
  const { data, width, height } = photo;
  const raw = new Uint8Array(data);
  const horizon = estimateHorizon(alpha, width, height);
  const vanishX = estimateVanishX(alpha, width, height, horizon);
  const span = Math.max(1, height - horizon);
  const rowSrcY = new Float32Array(height);
  let acc = 0;
  for (let y = 0; y < height; y += 1) {
    rowSrcY[y] = acc;
    const depth = y <= horizon ? 0.05 : clamp((y - horizon) / span, 0.05, 1);
    acc += Math.pow(depth, 0.8) * 2.6;
  }

  const stats = matchStats(data, alpha, width, height, tile, rowSrcY, horizon, span, vanishX);
  const shade = shadeRatio(data, width, height);

  for (let y = 0; y < height; y += 1) {
    const depth = y <= horizon ? 0.08 : clamp((y - horizon) / span, 0.08, 1);
    const xScale = (tile.width * 9) / (width * depth);
    const srcY = mirror(rowSrcY[y], tile.height);
    const shear = rowSrcY[y] * 0.37;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(tile.height - 1, y0 + 1);
    const fy = srcY - y0;
    for (let x = 0; x < width; x += 1) {
      const a = alpha[y * width + x];
      if (a === 0) continue;
      const srcX = mirror((x - vanishX) * xScale + shear, tile.width);
      const x0 = Math.floor(srcX);
      const x1 = Math.min(tile.width - 1, x0 + 1);
      const fx = srcX - x0;
      const sample = bilinear(tile, x0, y0, x1, y1, fx, fy);
      const amount = a / 255;
      const light = shade[y * width + x];
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        const transferred = (sample[c] - stats.grassMean[c]) * stats.scale[c] + stats.sceneMean[c];
        const lit = clamp(transferred * light, 0, 255);
        raw[i + c] = clamp(data[i + c] * (1 - amount) + lit * amount, 0, 255);
      }
    }
  }
  return { raw, alpha };
}

function bilinear(tile: Tile, x0: number, y0: number, x1: number, y1: number, fx: number, fy: number): [number, number, number] {
  const sample = (x: number, y: number) => {
    const i = (y * tile.width + x) * 3;
    return [tile.data[i], tile.data[i + 1], tile.data[i + 2]] as const;
  };
  const a = sample(x0, y0);
  const b = sample(x1, y0);
  const c = sample(x0, y1);
  const d = sample(x1, y1);
  const out = [0, 0, 0] as [number, number, number];
  for (let channel = 0; channel < 3; channel += 1) {
    const top = a[channel] * (1 - fx) + b[channel] * fx;
    const bottom = c[channel] * (1 - fx) + d[channel] * fx;
    out[channel] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

function matchStats(
  data: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  tile: Tile,
  rowSrcY: Float32Array,
  horizon: number,
  span: number,
  vanishX: number,
) {
  const scene = [0, 0, 0];
  const sceneSq = [0, 0, 0];
  const grass = [0, 0, 0];
  const grassSq = [0, 0, 0];
  let count = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 8000)));
  for (let y = 0; y < height; y += step) {
    const depth = y <= horizon ? 0.08 : clamp((y - horizon) / span, 0.08, 1);
    const xScale = (tile.width * 9) / (width * depth);
    const srcY = Math.floor(mirror(rowSrcY[y], tile.height));
    for (let x = 0; x < width; x += step) {
      if (alpha[y * width + x] < 200) continue;
      const i = (y * width + x) * 3;
      const srcX = Math.floor(mirror((x - vanishX) * xScale, tile.width));
      const t = (srcY * tile.width + srcX) * 3;
      for (let c = 0; c < 3; c += 1) {
        scene[c] += data[i + c];
        sceneSq[c] += data[i + c] * data[i + c];
        grass[c] += tile.data[t + c];
        grassSq[c] += tile.data[t + c] * tile.data[t + c];
      }
      count += 1;
    }
  }
  if (count < 8) {
    return { sceneMean: [90, 130, 60], grassMean: [90, 140, 70], scale: [1, 1, 1] };
  }
  const sceneMean = scene.map((value) => value / count);
  const grassMean = grass.map((value) => value / count);
  const scale = [0, 1, 2].map((c) => {
    const sceneStd = Math.sqrt(Math.max(0, sceneSq[c] / count - sceneMean[c] * sceneMean[c]));
    const grassStd = Math.sqrt(Math.max(0, grassSq[c] / count - grassMean[c] * grassMean[c]));
    return clamp((sceneStd / Math.max(6, grassStd)) * 0.7, 0.28, 1.05);
  });
  return { sceneMean, grassMean, scale };
}

function shadeRatio(data: Uint8Array, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    const p = i * 3;
    luma[i] = data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;
  }
  const radius = clamp(Math.round(Math.min(width, height) * 0.03), 6, 48);
  const blurred = boxBlurFloat(luma, width, height, radius);
  const ratio = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i += 1) {
    ratio[i] = clamp(luma[i] / Math.max(8, blurred[i]), 0.55, 1.22);
  }
  return ratio;
}

function estimateHorizon(alpha: Uint8Array, width: number, height: number): number {
  const tops: number[] = [];
  for (let x = 0; x < width; x += 3) {
    for (let y = 0; y < height; y += 1) {
      if (alpha[y * width + x] >= 128) {
        tops.push(y);
        break;
      }
    }
  }
  if (!tops.length) return Math.round(height * 0.42);
  tops.sort((a, b) => a - b);
  const far = tops[Math.floor(tops.length * 0.18)];
  return clamp(Math.round(far - height * 0.06), Math.round(height * 0.02), Math.round(height * 0.8));
}

function estimateVanishX(alpha: Uint8Array, width: number, height: number, horizon: number): number {
  let sum = 0;
  let count = 0;
  const far = horizon + height * 0.18;
  for (let y = 0; y < far; y += 2) {
    for (let x = 0; x < width; x += 4) {
      if (alpha[y * width + x] < 128) continue;
      sum += x;
      count += 1;
    }
  }
  return count > 12 ? sum / count : width / 2;
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
      const skin = r > 145 && g > 85 && b > 55 && r > g + 18 && r > b + 22 && g > b && sat > 0.16 && sat < 0.68 && value > 0.4 && value < 0.96;
      if (sky || hard || mulch || skin) {
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
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const r = Math.max(1, radius);
  const div = r * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = -r; x <= r; x += 1) sum += src[row + clamp(x, 0, width - 1)];
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / div;
      sum -= src[row + clamp(x - r, 0, width - 1)];
      sum += src[row + clamp(x + r + 1, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) sum += tmp[clamp(y, 0, height - 1) * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / div;
      sum -= tmp[clamp(y - r, 0, height - 1) * width + x];
      sum += tmp[clamp(y + r + 1, 0, height - 1) * width + x];
    }
  }
  return out;
}
