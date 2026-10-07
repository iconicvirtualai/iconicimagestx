export interface FloorplanBrandOptions {
  replaceFooter: boolean;
  logoBar: boolean;
  autoLabel: boolean;
}

/** Cover a CubiCasa-style footer with the Iconic bar. The source image stays above the bar. */
export function brandFloorplan(
  image: CanvasImageSource & { width: number; height: number },
  options: FloorplanBrandOptions,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.width);
  canvas.height = Math.max(1, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(image, 0, 0);
  const barHeight = Math.max(36, Math.round(canvas.height * 0.09));
  const top = canvas.height - barHeight;
  if (options.replaceFooter) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, top, canvas.width, barHeight);
  }
  if (options.logoBar || options.autoLabel) {
    ctx.fillStyle = "#0d9488";
    ctx.fillRect(0, top, canvas.width, 3);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.max(12, Math.round(barHeight * 0.28))}px sans-serif`;
    ctx.textBaseline = "middle";
    if (options.logoBar) ctx.fillText("ICONIC IMAGES · TX", 16, top + barHeight / 2);
    if (options.autoLabel) {
      const label = "FLOOR PLAN";
      const width = ctx.measureText(label).width;
      ctx.fillText(label, canvas.width - width - 16, top + barHeight / 2);
    }
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}
