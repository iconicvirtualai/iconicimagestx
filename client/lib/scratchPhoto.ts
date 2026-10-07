const MAX_EDGE = 2560;
const TARGET_BYTES = 3_200_000;

function readU16(bytes: Uint8Array, offset: number, little: boolean): number {
  if (offset + 1 >= bytes.length) return 0;
  return little
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes: Uint8Array, offset: number, little: boolean): number {
  if (offset + 3 >= bytes.length) return 0;
  return little
    ? (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
        0
    : ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
        0;
}

function asciiValue(bytes: Uint8Array, offset: number, count: number): string {
  let text = "";
  const end = Math.min(bytes.length, offset + count);
  for (let index = offset; index < end; index += 1) {
    const code = bytes[index];
    if (!code) break;
    text += String.fromCharCode(code);
  }
  return text;
}

function dateFromIfd(
  bytes: Uint8Array,
  tiff: number,
  ifd: number,
  little: boolean,
  depth: number,
): string {
  if (depth > 4 || ifd < 0 || ifd + 2 > bytes.length) return "";
  const count = readU16(bytes, ifd, little);
  let exifPointer = 0;
  let original = "";
  let digitized = "";
  let dateTime = "";
  for (let entry = 0; entry < count; entry += 1) {
    const at = ifd + 2 + entry * 12;
    if (at + 12 > bytes.length) break;
    const tag = readU16(bytes, at, little);
    const type = readU16(bytes, at + 2, little);
    const values = readU32(bytes, at + 4, little);
    const packed = readU32(bytes, at + 8, little);
    if (tag === 0x8769) exifPointer = packed;
    if (type === 2 && (tag === 0x0132 || tag === 0x9003 || tag === 0x9004)) {
      const text =
        values <= 4
          ? asciiValue(bytes, at + 8, values)
          : asciiValue(bytes, tiff + packed, values);
      if (tag === 0x9003) original = text;
      else if (tag === 0x9004) digitized = text;
      else dateTime = text;
    }
  }
  if (original) return original;
  if (exifPointer) {
    const nested = dateFromIfd(
      bytes,
      tiff,
      tiff + exifPointer,
      little,
      depth + 1,
    );
    if (nested) return nested;
  }
  return digitized || dateTime;
}

/** DateTimeOriginal from a JPEG APP1 block, or null when the file has no EXIF date. */
export function findExifShotTime(bytes: Uint8Array): number | null {
  for (let index = 0; index < bytes.length - 10; index += 1) {
    if (bytes[index] !== 0xff || bytes[index + 1] !== 0xe1) continue;
    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    const exif = index + 4;
    if (
      bytes[exif] !== 0x45 ||
      bytes[exif + 1] !== 0x78 ||
      bytes[exif + 2] !== 0x69 ||
      bytes[exif + 3] !== 0x66
    ) {
      index += 1 + length;
      continue;
    }
    const tiff = exif + 6;
    const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
    const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
    if ((!little && !big) || readU16(bytes, tiff + 2, little) !== 42)
      return null;
    const date = dateFromIfd(
      bytes,
      tiff,
      tiff + readU32(bytes, tiff + 4, little),
      little,
      0,
    );
    if (!/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(date)) return null;
    const ms = Date.parse(
      date.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T"),
    );
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export async function readJpegShotTime(file: Blob): Promise<number | null> {
  try {
    return findExifShotTime(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode this JPEG.")),
      "image/jpeg",
      quality,
    );
  });
}

/** Load a scratch blob URL without CORS mode so finetune can read the pixels. */
export function loadScratchImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not load this photo for finetune."));
    image.src = url;
  });
}

/** Shrink a JPEG so one scratch edit stays under the request limit. */
export async function compressScratchJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be read. Drop a JPEG.`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not prepare this JPEG.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.86;
  let blob = await toJpegBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > 0.5) {
    quality -= 0.08;
    blob = await toJpegBlob(canvas, quality);
  }
  if (blob.size > 4_000_000) {
    throw new Error(
      `${file.name} is still too large after resizing. Export a smaller JPEG.`,
    );
  }
  return blob;
}
