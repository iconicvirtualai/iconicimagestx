export type StrokeTool = "brush" | "clone" | "heal" | "remove";

export interface ScratchStroke {
  tool: StrokeTool;
  points: Array<{ x: number; y: number }>;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

/** Bake local brush, clone, heal, and remove strokes into a JPEG. Points are 0–1 across the photo. */
export function bakeStrokes(
  image: CanvasImageSource & { width: number; height: number },
  strokes: ScratchStroke[],
  maxEdge = 1600,
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
  const radius = Math.max(8, Math.round(Math.min(width, height) * 0.035));

  const sample = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(width - 1, x));
    const sy = Math.max(0, Math.min(height - 1, y));
    const i = (sy * width + sx) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const write = (x: number, y: number, r: number, g: number, b: number, amount: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = clamp(data[i] * (1 - amount) + r * amount);
    data[i + 1] = clamp(data[i + 1] * (1 - amount) + g * amount);
    data[i + 2] = clamp(data[i + 2] * (1 - amount) + b * amount);
  };

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const anchor = stroke.points[0];
    for (const point of stroke.points) {
      const cx = Math.round(point.x * (width - 1));
      const cy = Math.round(point.y * (height - 1));
      for (let y = cy - radius; y <= cy + radius; y += 1) {
        for (let x = cx - radius; x <= cx + radius; x += 1) {
          const dist = Math.hypot(x - cx, y - cy) / radius;
          if (dist > 1) continue;
          const amount = (1 - dist) * 0.85;
          if (stroke.tool === "brush") {
            const [r, g, b] = sample(x, y);
            write(x, y, Math.min(255, r * 1.18), Math.min(255, g * 1.16), Math.min(255, b * 1.1), amount);
          } else if (stroke.tool === "heal") {
            const neighbors = [
              sample(x - 2, y),
              sample(x + 2, y),
              sample(x, y - 2),
              sample(x, y + 2),
            ];
            const r = neighbors.reduce((sum, pixel) => sum + pixel[0], 0) / neighbors.length;
            const g = neighbors.reduce((sum, pixel) => sum + pixel[1], 0) / neighbors.length;
            const b = neighbors.reduce((sum, pixel) => sum + pixel[2], 0) / neighbors.length;
            write(x, y, r, g, b, amount);
          } else if (stroke.tool === "remove") {
            const [r, g, b] = sample(x + radius, y + 2);
            write(x, y, r, g, b, amount);
          } else {
            const ox = Math.round((anchor.x - point.x) * (width - 1));
            const oy = Math.round((anchor.y - point.y) * (height - 1));
            const [r, g, b] = sample(x + ox + Math.round(width * 0.08), y + oy);
            write(x, y, r, g, b, amount);
          }
        }
      }
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export interface MarkupPoint {
  x: number;
  y: number;
  kind: "pin" | "line" | "text" | "shape" | "logo";
  text?: string;
}

export function bakeMarkup(
  image: CanvasImageSource & { width: number; height: number },
  marks: MarkupPoint[],
  maxEdge = 1600,
): string {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(image, 0, 0, width, height);
  marks.forEach((mark, index) => {
    const x = mark.x * width;
    const y = mark.y * height;
    ctx.strokeStyle = "#0d9488";
    ctx.fillStyle = "#0d9488";
    ctx.lineWidth = Math.max(2, width * 0.004);
    if (mark.kind === "pin") {
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), x, y);
    } else if (mark.kind === "line") {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(width / 2, 18);
      ctx.stroke();
    } else if (mark.kind === "shape") {
      ctx.strokeRect(x - 36, y - 24, 72, 48);
    } else if (mark.kind === "logo") {
      ctx.fillRect(x - 54, y - 14, 108, 28);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ICONIC", x, y);
    } else {
      ctx.font = "700 22px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(mark.text || "Label", x, y);
    }
  });
  return canvas.toDataURL("image/jpeg", 0.9);
}
