import {
  applyPixel,
  clampAdjustments,
  cropRect,
  sharpenLuma,
  type StudioAdjustments,
} from "@shared/iconicStudio";

export function paintProceduralRoom(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = 960;
  canvas.height = 640;
  const wall = ctx.createLinearGradient(0, 0, 0, 640);
  wall.addColorStop(0, "#d5e3ea");
  wall.addColorStop(0.42, "#f6f1e8");
  wall.addColorStop(1, "#c8b59a");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 960, 640);
  ctx.fillStyle = "#f8f3ea";
  ctx.fillRect(70, 60, 820, 400);
  ctx.fillStyle = "#9fd9cf";
  ctx.fillRect(640, 100, 190, 240);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.strokeRect(644, 104, 182, 232);
  ctx.fillStyle = "#0d9488";
  ctx.fillRect(130, 310, 300, 150);
  ctx.fillStyle = "#134e4a";
  ctx.fillRect(150, 250, 140, 78);
  ctx.fillStyle = "#d6d3d1";
  ctx.fillRect(70, 460, 820, 180);
}

export function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the photo for adjustment."));
    image.src = url;
  });
}

export function renderAdjustedJpeg(
  image: CanvasImageSource & { width: number; height: number },
  adjustments: StudioAdjustments,
  maxEdge = 2000,
): string {
  const adj = clampAdjustments(adjustments);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) throw new Error("Canvas is not available.");
  sourceCtx.drawImage(image, 0, 0, width, height);

  const crop = cropRect(width, height, adj.crop);
  const cropped = sourceCtx.getImageData(crop.x, crop.y, Math.max(1, crop.w), Math.max(1, crop.h));
  const data = cropped.data;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = applyPixel(data[i], data[i + 1], data[i + 2], adj);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  if (adj.sharpness > 0) {
    const copy = new Uint8ClampedArray(data);
    const w = cropped.width;
    const h = cropped.height;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = (y * w + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const center = copy[i + channel];
          const neighbors = (
            copy[i - 4 + channel]
            + copy[i + 4 + channel]
            + copy[i - w * 4 + channel]
            + copy[i + w * 4 + channel]
          ) / 4;
          data[i + channel] = sharpenLuma(center, neighbors, adj.sharpness);
        }
      }
    }
  }

  const temp = document.createElement("canvas");
  temp.width = cropped.width;
  temp.height = cropped.height;
  const tempCtx = temp.getContext("2d");
  if (!tempCtx) throw new Error("Canvas is not available.");
  tempCtx.putImageData(cropped, 0, 0);

  const turns = adj.rotate;
  const swap = turns === 90 || turns === 270;
  const out = document.createElement("canvas");
  out.width = swap ? cropped.height : cropped.width;
  out.height = swap ? cropped.width : cropped.height;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas is not available.");
  outCtx.save();
  outCtx.translate(out.width / 2, out.height / 2);
  outCtx.rotate((turns * Math.PI) / 180);
  outCtx.drawImage(temp, -cropped.width / 2, -cropped.height / 2);
  outCtx.restore();
  return out.toDataURL("image/jpeg", 0.9);
}
