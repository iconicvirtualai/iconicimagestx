import { sharpenLuma } from "@shared/iconicStudio";

export interface ScratchLook {
  exposure: number;
  highlights: number;
  shadows: number;
  blacks: number;
  whites: number;
  temperature: number;
  vibrance: number;
  saturation: number;
  sharpness: number;
  hue: number;
}

export const NEUTRAL_LOOK: ScratchLook = {
  exposure: 0,
  highlights: 0,
  shadows: 0,
  blacks: 0,
  whites: 0,
  temperature: 0,
  vibrance: 0,
  saturation: 0,
  sharpness: 0,
  hue: 0,
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rotateHue(r: number, g: number, b: number, degrees: number): [number, number, number] {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    r * (0.213 + cos * 0.787 - sin * 0.213) + g * (0.715 - cos * 0.715 - sin * 0.715) + b * (0.072 - cos * 0.072 + sin * 0.928),
    r * (0.213 - cos * 0.213 + sin * 0.143) + g * (0.715 + cos * 0.285 + sin * 0.14) + b * (0.072 - cos * 0.072 - sin * 0.283),
    r * (0.213 - cos * 0.213 - sin * 0.787) + g * (0.715 - cos * 0.715 + sin * 0.715) + b * (0.072 + cos * 0.928 + sin * 0.072),
  ];
}

export function lookIsNeutral(look: ScratchLook): boolean {
  return (Object.keys(NEUTRAL_LOOK) as Array<keyof ScratchLook>).every((key) => look[key] === 0);
}

/** Live preview. Sharpness is baked on Apply. */
export function lookCss(look: ScratchLook): string {
  const brightness = 1 + look.exposure / 140 + look.whites / 500 + look.highlights / 600;
  const contrast = 1 + look.shadows / 400 - look.blacks / 350;
  const saturate = 1 + look.saturation / 100 + look.vibrance / 180;
  const hue = look.hue * 1.8 - look.temperature * 0.15;
  const sepia = Math.max(0, look.temperature) / 500;
  return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) sepia(${sepia.toFixed(3)}) hue-rotate(${hue.toFixed(2)}deg)`;
}

export function applyLookPixel(r: number, g: number, b: number, look: ScratchLook): [number, number, number] {
  const exposure = 1 + look.exposure / 100;
  let rr = r * exposure;
  let gg = g * exposure;
  let bb = b * exposure;
  const luma = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
  const shadowWeight = (1 - Math.min(1, Math.max(0, luma))) ** 1.4;
  const highlightWeight = Math.min(1, Math.max(0, luma)) ** 1.4;
  const lift = (look.shadows / 100) * 80 * shadowWeight + (look.highlights / 100) * 70 * highlightWeight;
  const crush = (look.blacks / 100) * 50 * shadowWeight;
  const whites = (look.whites / 100) * 40 * highlightWeight;
  rr += lift - crush + whites;
  gg += lift - crush + whites;
  bb += lift - crush + whites;
  const temp = look.temperature / 100;
  rr += temp * 28;
  bb -= temp * 28;
  const gray = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
  const distance = Math.abs(rr - gray) + Math.abs(gg - gray) + Math.abs(bb - gray);
  const amount = 1 + look.saturation / 100 + (look.vibrance / 100) * (1 - Math.min(1, distance / 180));
  rr = gray + (rr - gray) * amount;
  gg = gray + (gg - gray) * amount;
  bb = gray + (bb - gray) * amount;
  if (look.hue !== 0) [rr, gg, bb] = rotateHue(rr, gg, bb, look.hue * 1.8);
  return [clampChannel(rr), clampChannel(gg), clampChannel(bb)];
}

export function renderScratchLook(
  image: CanvasImageSource & { width: number; height: number },
  look: ScratchLook,
  maxEdge = 2000,
): string {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(image, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = applyLookPixel(data[i], data[i + 1], data[i + 2], look);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  if (look.sharpness > 0) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const neighbors = (
            copy[i - 4 + channel]
            + copy[i + 4 + channel]
            + copy[i - width * 4 + channel]
            + copy[i + width * 4 + channel]
          ) / 4;
          data[i + channel] = sharpenLuma(copy[i + channel], neighbors, look.sharpness);
        }
      }
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}
