/**
 * Content library ("content bucket") shared by the admin UI and the API.
 * Bytes live in Firebase Storage under content-bucket/. Metadata will move
 * to Neon later; Firestore collection contentAssets is the current record.
 */

import { contentTypeForUpload, safeStorageFileName } from "./listingAccess";

export const CONTENT_PURPOSES = ["portfolio", "marketing", "go", "general"] as const;
export type ContentPurpose = (typeof CONTENT_PURPOSES)[number];

export const CONTENT_VISIBILITIES = ["public", "staff"] as const;
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number];

export const CONTENT_BUCKET_PREFIX = "content-bucket/";

const FIXED_UPLOAD_ORIGINS = [
  "https://iconicimagestx.vercel.app",
  "https://iconicimagestx.com",
  "https://www.iconicimagestx.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

/** Origins allowed to PUT a signed upload URL in the browser. */
export function isIconicUploadOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (FIXED_UPLOAD_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]*iconicimagestx[a-z0-9-]*\.vercel\.app$/i.test(origin);
}
export const CONTENT_COLLECTION = "contentAssets";

/** Same ceiling the listing uploader uses for a JSON body on the API. */
export const CONTENT_DIRECT_UPLOAD_LIMIT = 3_000_000;
export const CONTENT_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const CONTENT_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const CONTENT_LIST_LIMIT = 200;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export interface ContentWrite {
  fileName: string;
  contentType: string;
  kind: "image" | "video";
  sizeBytes: number | null;
  purpose: ContentPurpose;
  tags: string[];
  folder: string;
  visibility: ContentVisibility;
  alt: string;
}

export interface ContentListQuery {
  purpose?: ContentPurpose;
  tag?: string;
  folder?: string;
  search?: string;
}

export interface ContentAssetRecord {
  id: string;
  fileName: string;
  contentType: string;
  kind: "image" | "video";
  sizeBytes: number;
  purpose: ContentPurpose;
  tags: string[];
  folder: string;
  visibility: ContentVisibility;
  alt: string;
  url: string;
  createdAt: string | null;
  updatedAt: string | null;
  storagePath?: string;
  uploadedBy?: string;
  uploadedByEmail?: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function contentKind(contentType: string): "image" | "video" | null {
  if (IMAGE_TYPES.has(contentType)) return "image";
  if (VIDEO_TYPES.has(contentType)) return "video";
  return null;
}

export function maxBytesForKind(kind: "image" | "video"): number {
  return kind === "video" ? CONTENT_VIDEO_MAX_BYTES : CONTENT_IMAGE_MAX_BYTES;
}

export function normalizePurpose(value: unknown): ContentPurpose | null {
  const raw = String(value || "").trim().toLowerCase();
  return CONTENT_PURPOSES.includes(raw as ContentPurpose) ? (raw as ContentPurpose) : null;
}

export function normalizeVisibility(value: unknown): ContentVisibility | null {
  if (value == null || value === "") return "staff";
  const raw = String(value).trim().toLowerCase();
  return CONTENT_VISIBILITIES.includes(raw as ContentVisibility) ? (raw as ContentVisibility) : null;
}

export function normalizeFolder(value: unknown): string {
  return slugPiece(value, 48);
}

export function normalizeTags(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.flatMap((item) => String(item).split(","))
    : String(value || "").split(",");
  const tags: string[] = [];
  for (const part of parts) {
    const tag = slugPiece(part, 32);
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
}

export function normalizeAlt(value: unknown): string {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function parseContentWrite(input: {
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  purpose?: unknown;
  tags?: unknown;
  folder?: unknown;
  visibility?: unknown;
  alt?: unknown;
}, options: { requireSize?: boolean } = {}): Parsed<ContentWrite> {
  if (!String(input.fileName || "").trim()) {
    return { ok: false, error: "fileName is required." };
  }
  const fileName = safeStorageFileName(input.fileName);
  const contentType = contentTypeForUpload(fileName, typeof input.contentType === "string" ? input.contentType : "");
  const kind = contentKind(contentType);
  if (!kind) {
    return { ok: false, error: "Use a JPEG, PNG, WebP, GIF, HEIC, MP4, MOV, or WebM file." };
  }
  const purpose = normalizePurpose(input.purpose);
  if (!purpose) {
    return { ok: false, error: "purpose must be portfolio, marketing, go, or general." };
  }
  const visibility = normalizeVisibility(input.visibility);
  if (!visibility) {
    return { ok: false, error: "visibility must be public or staff." };
  }

  let sizeBytes: number | null = null;
  if (input.sizeBytes != null && input.sizeBytes !== "") {
    const size = Number(input.sizeBytes);
    if (!Number.isFinite(size) || size < 0) return { ok: false, error: "sizeBytes must be a number." };
    sizeBytes = Math.round(size);
    if (sizeBytes === 0) return { ok: false, error: "File is empty." };
    if (sizeBytes > maxBytesForKind(kind)) {
      return { ok: false, error: kind === "video" ? "Video files must be 200 MB or smaller." : "Images must be 25 MB or smaller." };
    }
  } else if (options.requireSize) {
    return { ok: false, error: "sizeBytes is required." };
  }

  return {
    ok: true,
    value: {
      fileName,
      contentType,
      kind,
      sizeBytes,
      purpose,
      tags: normalizeTags(input.tags),
      folder: normalizeFolder(input.folder),
      visibility,
      alt: normalizeAlt(input.alt),
    },
  };
}

export function parseContentListQuery(query: {
  purpose?: unknown;
  tag?: unknown;
  folder?: unknown;
  q?: unknown;
}): Parsed<ContentListQuery> {
  const parsed: ContentListQuery = {};
  if (query.purpose != null && String(query.purpose).trim()) {
    const purpose = normalizePurpose(query.purpose);
    if (!purpose) return { ok: false, error: "purpose must be portfolio, marketing, go, or general." };
    parsed.purpose = purpose;
  }
  if (query.tag != null && String(query.tag).trim()) {
    const tag = normalizeTags(query.tag)[0];
    if (!tag) return { ok: false, error: "tag is not a valid label." };
    parsed.tag = tag;
  }
  if (query.folder != null && String(query.folder).trim()) {
    parsed.folder = normalizeFolder(query.folder);
  }
  if (query.q != null && String(query.q).trim()) {
    parsed.search = String(query.q).trim().toLowerCase().slice(0, 80);
  }
  return { ok: true, value: parsed };
}

export function matchesContentFilters(
  asset: { purpose?: unknown; tags?: unknown; folder?: unknown; fileName?: unknown; alt?: unknown },
  filters: ContentListQuery,
): boolean {
  if (filters.purpose && asset.purpose !== filters.purpose) return false;
  if (filters.folder && normalizeFolder(asset.folder) !== filters.folder) return false;
  if (filters.tag) {
    const tags = Array.isArray(asset.tags) ? asset.tags.map((tag) => String(tag)) : [];
    if (!tags.includes(filters.tag)) return false;
  }
  if (filters.search) {
    const haystack = `${asset.fileName || ""} ${asset.alt || ""}`.toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

/** Storage path the server owns. Callers never invent this. */
export function buildContentStoragePath(assetId: string, purpose: ContentPurpose, fileName: string, now = Date.now()): string {
  if (!isContentAssetId(assetId)) throw new Error("Invalid content asset id.");
  return `${CONTENT_BUCKET_PREFIX}${purpose}/${assetId}/${now}_${safeStorageFileName(fileName)}`;
}

export function isContentAssetId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{16,28}$/.test(value);
}

/**
 * True only for this asset's object inside content-bucket/.
 * Listing, gallery, and Uploads paths are rejected.
 */
export function isContentBucketPath(assetId: string, purpose: ContentPurpose, storagePath: unknown): boolean {
  if (!isContentAssetId(assetId) || typeof storagePath !== "string") return false;
  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false;
  const prefix = `${CONTENT_BUCKET_PREFIX}${purpose}/${assetId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return Boolean(rest) && !rest.includes("/");
}

export function presentContentAsset(
  asset: ContentAssetRecord,
  viewer: { staff: boolean },
): ContentAssetRecord | null {
  if (asset.visibility !== "public" && !viewer.staff) return null;
  if (viewer.staff) return asset;
  return {
    id: asset.id,
    fileName: asset.fileName,
    contentType: asset.contentType,
    kind: asset.kind,
    sizeBytes: asset.sizeBytes,
    purpose: asset.purpose,
    tags: asset.tags,
    folder: asset.folder,
    visibility: "public",
    alt: asset.alt,
    url: asset.url,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function slugPiece(value: unknown, max: number): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}
