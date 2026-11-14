const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_EDGE = 1600;
const TARGET_BYTES = 1_600_000;

function readFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = src;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not resize that image."));
    }, "image/jpeg", quality);
  });
}

/** Shrink a headshot or logo before upload. The server still rejects anything over 2 MB. */
export async function prepareProfileImage(file: File): Promise<string> {
  const type = file.type.toLowerCase();
  if (!ACCEPTED.has(type)) throw new Error("Upload a JPEG, PNG, or WebP image.");
  if (file.size <= 700_000 && type === "image/jpeg") return readFile(file);
  if (typeof document === "undefined") {
    if (file.size > TARGET_BYTES) throw new Error("That photo is over 2 MB. Choose a smaller image.");
    return readFile(file);
  }
  const image = await loadImage(await readFile(file));
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not resize that image.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.86;
  let blob = await canvasBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > 0.5) {
    quality = Math.round((quality - 0.12) * 100) / 100;
    blob = await canvasBlob(canvas, quality);
  }
  if (blob.size > 2_000_000) throw new Error("That photo is still over 2 MB after resizing. Try a smaller image.");
  return readFile(blob);
}
