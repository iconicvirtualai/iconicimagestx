/**
 * Client portal uploads: video, social assets, and documents.
 * The browser sends bytes straight to storage. This module only checks the ticket.
 */

import { contentTypeForUpload, safeStorageFileName } from "./listingAccess.ts";

export const PORTAL_UPLOAD_KINDS = ["video", "social", "file"] as const;
export type PortalUploadKind = (typeof PORTAL_UPLOAD_KINDS)[number];

/** Signed uploads stay off the serverless body. Videos can be large. */
export const PORTAL_UPLOAD_LIMITS: Record<PortalUploadKind, number> = {
  video: 2 * 1024 * 1024 * 1024,
  social: 80 * 1024 * 1024,
  file: 40 * 1024 * 1024,
};

export const PORTAL_UPLOAD_ACCEPT: Record<PortalUploadKind, string> = {
  video: "video/mp4,video/quicktime,.mp4,.mov",
  social: "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/svg+xml,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.svg,.mp4,.mov",
  file: "application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt",
};

const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);
const SOCIAL_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "video/mp4",
  "video/quicktime",
]);
const FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const EXT_TYPE: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
};

export type PortalUploadDecision =
  | { ok: true; kind: PortalUploadKind; contentType: string; fileName: string }
  | { ok: false; error: string };

export function isPortalUploadKind(value: unknown): value is PortalUploadKind {
  return typeof value === "string" && (PORTAL_UPLOAD_KINDS as readonly string[]).includes(value);
}

export function portalUploadDecision(
  kind: unknown,
  fileName: unknown,
  providedType: unknown,
  byteSize: unknown,
): PortalUploadDecision {
  if (!isPortalUploadKind(kind)) return { ok: false, error: "Choose video, social, or a document." };
  const safeName = safeStorageFileName(fileName);
  if (!safeName || safeName === "upload") return { ok: false, error: "That file needs a name." };
  const size = typeof byteSize === "number" && Number.isFinite(byteSize) ? byteSize : Number.NaN;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "That file is empty." };
  if (size > PORTAL_UPLOAD_LIMITS[kind]) {
    const limit = kind === "video" ? "2 GB" : kind === "social" ? "80 MB" : "40 MB";
    return { ok: false, error: `That file is over the ${limit} limit.` };
  }
  const contentType = allowedContentType(kind, safeName, providedType);
  if (!contentType) return { ok: false, error: rejectionCopy(kind) };
  return { ok: true, kind, contentType, fileName: safeName };
}

export function portalUploadStoragePath(listingId: string, kind: PortalUploadKind, fileName: string, now = Date.now()): string {
  return `listings/${listingId}/client-uploads/${kind}/${now}_${safeStorageFileName(fileName)}`;
}

export function isPortalUploadStoragePath(listingId: string, kind: PortalUploadKind, storagePath: unknown): boolean {
  if (!listingId || typeof storagePath !== "string") return false;
  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false;
  const prefix = `listings/${listingId}/client-uploads/${kind}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

function allowedContentType(kind: PortalUploadKind, fileName: string, providedType: unknown): string {
  const provided = typeof providedType === "string" ? providedType : "";
  const resolved = contentTypeForUpload(fileName, provided);
  const fromExt = EXT_TYPE[extension(fileName)] || "";
  const candidate = fromExt || (resolved !== "application/octet-stream" ? resolved : "");
  const allow = kind === "video" ? VIDEO_TYPES : kind === "social" ? SOCIAL_TYPES : FILE_TYPES;
  return allow.has(candidate) ? candidate : "";
}

function extension(fileName: string): string {
  const match = /\.[a-z0-9]+$/i.exec(fileName.trim().toLowerCase());
  return match ? match[0] : "";
}

function rejectionCopy(kind: PortalUploadKind): string {
  if (kind === "video") return "Upload an MP4 or MOV video.";
  if (kind === "social") return "Upload an image, reel, or graphic (JPG, PNG, WebP, GIF, HEIC, SVG, MP4, or MOV).";
  return "Upload a PDF, Word document, or text file.";
}
