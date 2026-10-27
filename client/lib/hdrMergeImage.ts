import { mergeHdrPixels } from "@shared/hdrMerge";
import { loadScratchImage } from "@/lib/scratchPhoto";

/** Blend a bracket into one JPEG. Frames are scaled to the first image. */
export async function mergeBracketToJpeg(frames: Array<{ name: string; url: string }>): Promise<File> {
  if (frames.length < 2) throw new Error("A bracket needs at least two frames.");
  const images = await Promise.all(frames.map((frame) => loadScratchImage(frame.url)));
  const width = images[0].naturalWidth || images[0].width;
  const height = images[0].naturalHeight || images[0].height;
  if (!width || !height) throw new Error("Those frames could not be read.");
  const pixels = images.map((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the HDR merge.");
    ctx.drawImage(image, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  });
  const merged = mergeHdrPixels(pixels, width, height);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the HDR merge.");
  const pixelsOut = new Uint8ClampedArray(merged.length);
  pixelsOut.set(merged);
  ctx.putImageData(new ImageData(pixelsOut, width, height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob((file) => (file ? resolve(file) : reject(new Error("Could not encode the HDR merge."))), "image/jpeg", 0.92);
  });
  const stem = frames[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/(?:[_+-](?:ev)?[+-]?\d+(?:\.\d+)?ev?|[_-][abc])$/i, "") || "hdr";
  return new File([blob], `${stem}-hdr.jpg`, { type: "image/jpeg" });
}
