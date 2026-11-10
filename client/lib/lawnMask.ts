export interface LawnStroke {
  mode: "add" | "erase";
  points: Array<{ x: number; y: number }>;
}

/** White is lawn. Strokes override an optional automatic mask. Points are 0–1 across the photo. */
export function rasterLawnMask(
  width: number,
  height: number,
  strokes: LawnStroke[],
  base?: CanvasImageSource | null,
): string {
  const maxEdge = 1024;
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  if (base) ctx.drawImage(base, 0, 0, w, h);
  const radius = Math.max(10, Math.round(Math.min(w, h) * 0.035));
  ctx.lineWidth = radius * 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    ctx.strokeStyle = stroke.mode === "erase" ? "#000000" : "#ffffff";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * (w - 1);
      const y = point.y * (h - 1);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (stroke.points.length > 1) ctx.stroke();
    for (const point of stroke.points) {
      ctx.beginPath();
      ctx.arc(point.x * (w - 1), point.y * (h - 1), radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas.toDataURL("image/png");
}

export function dataUrlToBlob(dataUrl: string, type = "image/png"): Blob {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
