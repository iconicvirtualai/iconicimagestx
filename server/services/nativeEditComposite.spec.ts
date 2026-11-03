import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  NATIVE_JPEG_CHROMA,
  NATIVE_JPEG_QUALITY,
  compositeNativeEdit,
  decodeOrientedRgb,
  letterboxRect,
} from "./nativeEditComposite";

const GREEN = { r: 12, g: 140, b: 48 };
const RED = { r: 220, g: 16, b: 16 };

async function flatJpeg(width: number, height: number, color: { r: number; g: number; b: number }) {
  return sharp({
    create: { width, height, channels: 3, background: color },
  }).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
}

async function apiCandidate(width: number, height: number, srcW: number, srcH: number) {
  const box = letterboxRect(srcW, srcH, width, height);
  const contentW = Math.max(1, Math.round(box.width));
  const contentH = Math.max(1, Math.round(box.height));
  const content = await sharp({
    create: { width: contentW, height: contentH, channels: 3, background: GREEN },
  }).png().toBuffer();
  const patchW = Math.max(8, Math.round(contentW / 5));
  const patchH = Math.max(8, Math.round(contentH / 5));
  const patch = await sharp({
    create: { width: patchW, height: patchH, channels: 3, background: RED },
  }).png().toBuffer();
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).composite([
    { input: content, left: Math.round(box.left), top: Math.round(box.top) },
    {
      input: patch,
      left: Math.round(box.left + (contentW - patchW) / 2),
      top: Math.round(box.top + (contentH - patchH) / 2),
    },
  ]).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
}

function pixel(raw: Buffer, width: number, x: number, y: number) {
  const index = (y * width + x) * 3;
  return [raw[index], raw[index + 1], raw[index + 2]];
}

describe("native edit composite", () => {
  it("keeps source pixels outside the edit and maps a letterboxed API canvas back", async () => {
    const source = await flatJpeg(200, 100, GREEN);
    const candidate = await apiCandidate(1536, 1024, 200, 100);
    const decoded = await decodeOrientedRgb(source);
    const result = await compositeNativeEdit(source, candidate);
    expect(result.upscaledRegion).toBe(true);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.apiWidth).toBe(1536);
    expect(result.apiHeight).toBe(1024);
    expect(pixel(result.raw, result.width, 0, 0)).toEqual(pixel(decoded.raw, decoded.width, 0, 0));
    expect(pixel(result.raw, result.width, 199, 0)).toEqual(pixel(decoded.raw, decoded.width, 199, 0));
    const center = pixel(result.raw, result.width, 100, 50);
    const sourceCenter = pixel(decoded.raw, decoded.width, 100, 50);
    expect(center).not.toEqual(sourceCenter);
    expect(center[0]).toBeGreaterThan(sourceCenter[0] + 40);
  });

  it("uses oriented dimensions and exports sRGB 4:4:4 without the source GPS note", async () => {
    const wide = await flatJpeg(64, 32, GREEN);
    const tagged = await sharp(wide).withExif({
      IFD0: { ImageDescription: "secret-gps-GPSLatitude" },
    }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const candidate = await flatJpeg(32, 64, RED);
    expect(tagged.toString("latin1")).toContain("secret-gps-GPSLatitude");
    const result = await compositeNativeEdit(tagged, candidate);
    expect(result.width).toBe(32);
    expect(result.height).toBe(64);
    const meta = await sharp(result.jpeg).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(64);
    expect(meta.chromaSubsampling).toBe(NATIVE_JPEG_CHROMA);
    expect(meta.icc?.length).toBeGreaterThan(32);
    expect(meta.exif).toBeUndefined();
    expect(result.jpeg.toString("latin1")).not.toContain("secret-gps-GPSLatitude");
    expect(NATIVE_JPEG_QUALITY).toBe(98);
  });

  it("returns the source dimensions for 6140x4096, portrait, and 4624x3080", async () => {
    const cases = [
      { width: 6140, height: 4096, apiWidth: 1536, apiHeight: 1024 },
      { width: 4096, height: 6140, apiWidth: 1024, apiHeight: 1536 },
      { width: 4624, height: 3080, apiWidth: 1536, apiHeight: 1024 },
    ];
    for (const item of cases) {
      const source = await flatJpeg(item.width, item.height, GREEN);
      const candidate = await apiCandidate(item.apiWidth, item.apiHeight, item.width, item.height);
      const decoded = await decodeOrientedRgb(source);
      const result = await compositeNativeEdit(source, candidate);
      expect(result.width).toBe(item.width);
      expect(result.height).toBe(item.height);
      expect(result.apiWidth).toBe(item.apiWidth);
      expect(result.apiHeight).toBe(item.apiHeight);
      const meta = await sharp(result.jpeg).metadata();
      expect(meta.width).toBe(item.width);
      expect(meta.height).toBe(item.height);
      if (item.width === 4624) {
        expect(meta.width).toBe(4624);
        expect(meta.height).toBe(3080);
      }
      expect(pixel(result.raw, result.width, 0, 0)).toEqual(pixel(decoded.raw, decoded.width, 0, 0));
      expect(pixel(result.raw, result.width, item.width - 1, item.height - 1)).toEqual(
        pixel(decoded.raw, decoded.width, item.width - 1, item.height - 1),
      );
      const center = pixel(result.raw, result.width, Math.floor(item.width / 2), Math.floor(item.height / 2));
      const sourceCenter = pixel(decoded.raw, decoded.width, Math.floor(item.width / 2), Math.floor(item.height / 2));
      expect(center).not.toEqual(sourceCenter);
    }
  }, 120_000);
});
