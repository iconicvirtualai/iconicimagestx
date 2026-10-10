/**
 * How the client gallery decides what a delivered file is.
 * Signals, in order: type / category / assetType, mime, then filename extension.
 * Width and height are used only to tell a vertical reel from a landscape video
 * and a very large photo from a normal one. Payment flags are not decided here.
 */

export interface ClientGalleryItem {
  id?: string;
  fileName?: string | null;
  title?: string | null;
  name?: string | null;
  type?: string | null;
  url?: string | null;
  shareUrl?: string | null;
  embedUrl?: string | null;
  poster?: string | null;
  thumbnailUrl?: string | null;
  contentType?: string | null;
  mimeType?: string | null;
  category?: string | null;
  variant?: string | null;
  assetType?: string | null;
  provider?: string | null;
  fileSize?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  canDownload?: boolean;
  locked?: boolean;
}

export type ClientGalleryKind =
  | "locked"
  | "mls-photo"
  | "fullres-photo"
  | "photo"
  | "branded-video"
  | "unbranded-video"
  | "video"
  | "reel"
  | "tour"
  | "floorplan-image"
  | "floorplan-pdf"
  | "aerial-photo"
  | "aerial-video"
  | "file";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v"]);
const LINK_DOWNLOAD_TYPES = new Set(["video", "reel", "tour", "matterport"]);

const FLOOR_FILE = /floor[\s_-]?plan\.(png|jpe?g|webp|pdf)$/i;
const AERIAL = /(^|[^a-z0-9])(aerials?|drone)([^a-z0-9]|$)/i;
const REEL = /(^|[^a-z0-9])reels?([^a-z0-9]|$)/i;
const MLS = /(^|[^a-z0-9])mls([^a-z0-9]|$)/i;
const UNBRANDED = /(^|[^a-z0-9])unbranded([^a-z0-9]|$)/i;
const BRANDED = /(^|[^a-z0-9])branded([^a-z0-9]|$)/i;
const FULLRES =
  /(^|[^a-z0-9])(full[\s_-]?res|hi[\s_-]?res|high[\s_-]?res)([^a-z0-9]|$)/i;

export function galleryHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\")) return null;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function galleryItemName(item: ClientGalleryItem): string {
  const name = item.fileName || item.title || item.name;
  return typeof name === "string" && name.trim() ? name.trim() : "Media";
}

export function galleryFileSize(item: ClientGalleryItem): number | null {
  const value =
    typeof item.fileSize === "string" ? Number(item.fileSize) : item.fileSize;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  return value;
}

export function formatGalleryFileSize(bytes: number | null): string {
  if (bytes == null) return "Size not on file";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  const shown = value.toFixed(digits).replace(/\.0$/, "");
  return `${shown} ${units[unit]}`;
}

export function galleryKindLabel(
  kind: ClientGalleryKind,
  item: ClientGalleryItem,
): string {
  switch (kind) {
    case "mls-photo":
      return "MLS photo";
    case "fullres-photo":
      return "Full resolution";
    case "photo":
      return "Photo";
    case "branded-video":
      return "Branded video";
    case "unbranded-video":
      return "Unbranded video";
    case "video":
      return "Video";
    case "reel":
      return "Reel";
    case "tour":
      return "3D tour";
    case "floorplan-image":
    case "floorplan-pdf":
      return "Floor plan";
    case "aerial-photo":
    case "aerial-video":
      return "Aerial";
    case "file":
      return galleryFileTypeLabel(item);
    default:
      return "Locked";
  }
}

export function galleryFileTypeLabel(item: ClientGalleryItem): string {
  const mime = mimeOf(item);
  const ext = extOf(galleryItemName(item)) || extOf(item.url || "");
  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (mime.includes("zip") || ext === "zip") return "ZIP";
  if (ext) return ext.toUpperCase();
  if (mime) return mime.split("/")[1]?.toUpperCase() || "File";
  return "File";
}

/** Same rule the delivery page already used: link-type media is not a file download. */
export function galleryOffersDownload(item: ClientGalleryItem): boolean {
  if (item.locked === true || item.canDownload !== true) return false;
  const type = text(item.type);
  if (LINK_DOWNLOAD_TYPES.has(type)) return false;
  return Boolean(galleryHttpUrl(item.url));
}

export function classifyClientGalleryItem(
  item: ClientGalleryItem,
): ClientGalleryKind {
  if (item.locked === true || !hasAnyUrl(item)) return "locked";

  const type = text(item.type);
  const category =
    text(item.category) || text(item.variant) || text(item.assetType);
  const name = `${item.fileName || ""} ${item.title || ""} ${item.name || ""}`;
  const fileExt =
    extOf(galleryItemName(item)) ||
    extOf(item.url || "") ||
    extOf(item.shareUrl || "");
  const mime = mimeOf(item);
  const videoFile =
    mime.startsWith("video/") ||
    VIDEO_EXT.has(fileExt) ||
    type === "video" ||
    type === "reel";
  const imageFile =
    mime.startsWith("image/") ||
    type.startsWith("image/") ||
    IMAGE_EXT.has(fileExt) ||
    type === "photo" ||
    type === "mls" ||
    type === "twilight" ||
    type === "vsai";
  const pdfFile =
    mime === "application/pdf" ||
    type === "application/pdf" ||
    fileExt === "pdf" ||
    type === "pdf";
  const zipFile = mime.includes("zip") || fileExt === "zip" || type === "zip";
  const floorSignal = isFloorplan(type, category, galleryItemName(item));
  const aerialSignal =
    type === "aerial" || category === "aerial" || AERIAL.test(name);
  const reelSignal =
    type === "reel" ||
    category === "reel" ||
    REEL.test(galleryItemName(item)) ||
    REEL.test(text(item.title));
  const tourSignal =
    type === "tour" ||
    type === "matterport" ||
    category === "tour" ||
    category === "matterport" ||
    Boolean(text(item.provider)) ||
    isMatterportUrl(item);

  if (tourSignal && !videoFile) return "tour";
  if (floorSignal && !videoFile) {
    if (pdfFile || (!imageFile && !IMAGE_EXT.has(fileExt)))
      return "floorplan-pdf";
    return "floorplan-image";
  }
  if (aerialSignal && videoFile) return "aerial-video";
  if (aerialSignal && imageFile) return "aerial-photo";
  // A named reel, branded file, or unbranded file keeps that label.
  // Portrait size is only the fallback that turns an unlabeled video into a reel.
  if (videoFile && reelSignal) return "reel";
  if (videoFile && UNBRANDED.test(`${type} ${category} ${name}`))
    return "unbranded-video";
  if (videoFile && BRANDED.test(`${type} ${category} ${name}`))
    return "branded-video";
  if (videoFile && isPortrait(item)) return "reel";
  if (videoFile) return "video";
  if (
    zipFile ||
    pdfFile ||
    type === "file" ||
    type === "document" ||
    type === "other"
  )
    return "file";
  if ((type === "mls" || category === "mls" || MLS.test(name)) && !videoFile)
    return "mls-photo";
  if (
    imageFile &&
    (type === "fullres" ||
      type === "full-res" ||
      category === "fullres" ||
      category === "full-res" ||
      FULLRES.test(name) ||
      isLargePhoto(item))
  ) {
    return "fullres-photo";
  }
  if (imageFile || type === "photo") return "photo";
  return "file";
}

export function galleryVideoUrl(item: ClientGalleryItem): string | null {
  const fileNameExt = extOf(galleryItemName(item));
  const mime = mimeOf(item);
  const candidates = [item.url, item.embedUrl, item.shareUrl];
  for (const candidate of candidates) {
    const url = galleryHttpUrl(candidate);
    if (url && VIDEO_EXT.has(extOf(url))) return url;
  }
  if (VIDEO_EXT.has(fileNameExt) || mime.startsWith("video/")) {
    for (const candidate of candidates) {
      const url = galleryHttpUrl(candidate);
      if (url) return url;
    }
  }
  return null;
}

export function galleryPosterUrl(item: ClientGalleryItem): string | null {
  return galleryHttpUrl(item.poster) || galleryHttpUrl(item.thumbnailUrl);
}

export function galleryTourEmbedUrl(item: ClientGalleryItem): string | null {
  const embed = galleryHttpUrl(item.embedUrl);
  if (embed) return embed;
  const url = galleryHttpUrl(item.url) || galleryHttpUrl(item.shareUrl);
  if (url && isMatterportUrl(item)) return url;
  return null;
}

export function galleryTourLink(item: ClientGalleryItem): string | null {
  return (
    galleryHttpUrl(item.shareUrl) ||
    galleryHttpUrl(item.url) ||
    galleryHttpUrl(item.embedUrl)
  );
}

export function galleryShareUrl(item: ClientGalleryItem): string | null {
  return (
    galleryHttpUrl(item.shareUrl) ||
    galleryHttpUrl(item.url) ||
    galleryHttpUrl(item.embedUrl)
  );
}

export function galleryFrameStyle(
  kind: ClientGalleryKind,
  item: ClientGalleryItem,
): Record<string, string> | undefined {
  if (kind === "reel") {
    const ratio = pixelRatio(item) || "9 / 16";
    const vertical = !pixelRatio(item) || isPortrait(item);
    return vertical
      ? {
          aspectRatio: ratio,
          maxHeight: "78dvh",
          width: "min(100%, calc(78dvh * 9 / 16))",
          maxWidth: "100%",
        }
      : {
          aspectRatio: ratio,
          width: "100%",
          maxWidth: "100%",
          maxHeight: "78dvh",
        };
  }
  if (
    kind === "branded-video" ||
    kind === "unbranded-video" ||
    kind === "video" ||
    kind === "aerial-video"
  ) {
    return {
      aspectRatio: pixelRatio(item) || "16 / 9",
      width: "100%",
      maxWidth: "100%",
    };
  }
  if (
    kind === "fullres-photo" ||
    kind === "floorplan-image" ||
    kind === "aerial-photo"
  ) {
    return { maxHeight: "80dvh" };
  }
  return undefined;
}

export function galleryGridClass(kind: ClientGalleryKind): string {
  if (kind === "mls-photo" || kind === "photo" || kind === "locked")
    return "col-span-1 min-w-0";
  return "col-span-2 min-w-0 lg:col-span-4";
}

function hasAnyUrl(item: ClientGalleryItem): boolean {
  return Boolean(
    galleryHttpUrl(item.url) ||
      galleryHttpUrl(item.shareUrl) ||
      galleryHttpUrl(item.embedUrl),
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function mimeOf(item: ClientGalleryItem): string {
  return text(item.contentType) || text(item.mimeType);
}

function extOf(value: string): string {
  const path = value.split("?")[0]?.split("#")[0] || "";
  const decoded = safeDecode(path);
  const match = decoded.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isFloorplan(
  type: string,
  category: string,
  fileName: string,
): boolean {
  if (type === "floorplan" || type === "floor-plan" || type === "floor_plan")
    return true;
  if (category === "floorplan" || category === "floor-plan") return true;
  return FLOOR_FILE.test(fileName);
}

function isMatterportUrl(item: ClientGalleryItem): boolean {
  const candidates = [item.embedUrl, item.url, item.shareUrl];
  return candidates.some((candidate) => {
    const url = galleryHttpUrl(candidate);
    if (!url || url.startsWith("/")) return false;
    try {
      return new URL(url).hostname.toLowerCase().includes("matterport.com");
    } catch {
      return false;
    }
  });
}

function numberOf(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function isPortrait(item: ClientGalleryItem): boolean {
  const width = numberOf(item.width);
  const height = numberOf(item.height);
  if (!width || !height) return false;
  return height / width >= 1.15;
}

function isLargePhoto(item: ClientGalleryItem): boolean {
  const width = numberOf(item.width);
  const height = numberOf(item.height);
  if (!width || !height) return false;
  return Math.max(width, height) >= 3500;
}

function pixelRatio(item: ClientGalleryItem): string | null {
  const width = numberOf(item.width);
  const height = numberOf(item.height);
  if (!width || !height) return null;
  return `${width} / ${height}`;
}
