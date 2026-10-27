/**
 * Exposure fusion for a bracket of JPEG frames that are already the same size.
 * Weights each pixel by how close its luminance is to middle gray, then by saturation.
 * This is the merge the photographer runs before culling. It does not call a vendor API.
 */

function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

function weight(r: number, g: number, b: number): number {
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const well = Math.exp(-((luma - 0.5) ** 2) / (2 * 0.18 * 0.18));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return well * (0.35 + sat) + 0.02;
}

export function mergeHdrPixels(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (!frames.length || width <= 0 || height <= 0) return out;
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let sum = 0;
    const offset = i * 4;
    for (const frame of frames) {
      if (frame.length < offset + 3) continue;
      const r = frame[offset];
      const g = frame[offset + 1];
      const b = frame[offset + 2];
      const w = weight(r, g, b);
      red += r * w;
      green += g * w;
      blue += b * w;
      sum += w;
    }
    if (sum <= 0) continue;
    out[offset] = clampByte(red / sum);
    out[offset + 1] = clampByte(green / sum);
    out[offset + 2] = clampByte(blue / sum);
    out[offset + 3] = 255;
  }
  return out;
}
