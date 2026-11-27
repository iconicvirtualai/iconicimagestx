/**
 * Burned-in Iconic watermark for unpaid delivery previews.
 * The bytes themselves carry the mark. A CSS overlay is not the lock.
 */

import sharp from "sharp";

const PREVIEW_EDGE = 1400;
const WEB_EDGE = 2048;

function watermarkSvg(width: number, height: number): Buffer {
  const label = "ICONIC IMAGES";
  const rows = [0.18, 0.42, 0.66, 0.9];
  const texts = rows.map((y) =>
    `<text x="50%" y="${Math.round(height * y)}" text-anchor="middle" fill="rgba(255,255,255,0.78)" stroke="rgba(0,0,0,0.55)" stroke-width="2" font-family="Arial, sans-serif" font-size="${Math.max(28, Math.round(width / 16))}" font-weight="700" letter-spacing="6">${label}</text>`,
  ).join("");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(-24 ${Math.round(width / 2)} ${Math.round(height / 2)})">${texts}</g>
  </svg>`;
  return Buffer.from(svg);
}

export async function renderDeliveryJpeg(
  source: Buffer,
  options: { edge: number; watermark: boolean; quality?: number },
): Promise<Buffer | null> {
  try {
    const resized = await sharp(source, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: options.edge, height: options.edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: options.quality ?? 82 })
      .toBuffer();
    if (!options.watermark) return resized;
    const meta = await sharp(resized).metadata();
    const width = meta.width || options.edge;
    const height = meta.height || options.edge;
    return await sharp(resized)
      .composite([{ input: watermarkSvg(width, height), top: 0, left: 0 }])
      .jpeg({ quality: options.quality ?? 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

export function previewEdge(): number {
  return PREVIEW_EDGE;
}

export function webEdge(): number {
  return WEB_EDGE;
}

export async function deliveryCard(label: string, watermark: boolean): Promise<Buffer> {
  const width = 1200;
  const height = 800;
  const safe = label.replace(/[<>&"]/g, "").slice(0, 80) || "Media";
  const mark = watermark
    ? `<text x="50%" y="58%" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-family="Arial" font-size="42" font-weight="700" letter-spacing="4">ICONIC IMAGES</text>`
    : "";
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1d1c"/>
    <text x="50%" y="42%" text-anchor="middle" fill="#f5f2ea" font-family="Arial" font-size="28">${safe}</text>
    ${mark}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}
