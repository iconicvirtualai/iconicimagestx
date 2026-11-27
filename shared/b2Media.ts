/**
 * Backblaze B2 media fields for the Aryeo migration.
 *
 * A listing or gallery may set storageBackend to "b2". Each file then carries
 * b2Key, the object key in the iconic-media bucket. Keys look like
 * aryeo-test/caroline-warren/front.jpg now and aryeo/<client>/<listing>/front.jpg
 * later. A parent b2Key is only a folder prefix for a single-segment child key.
 *
 * url, shareUrl, and downloadUrl are filled when a response is built. They are
 * not stored. Firebase files omit storageBackend, or set it to "firebase", and
 * keep the token URL already on the document.
 *
 * Lockbox codes for a migrated order live on orders.staffOnly.lockboxCode.
 * Staff order reads copy that onto lockboxCode. Client portal payloads do not
 * include staffOnly.
 */

export const B2_STORAGE_BACKEND = "b2" as const;
export const FIREBASE_STORAGE_BACKEND = "firebase" as const;

export const B2_MEDIA_ARRAY_KEYS = [
  "images",
  "videos",
  "floorplans",
  "floorPlans",
  "tours",
  "files",
  "downloads",
  "mlsFiles",
  "clientPortalUploads",
  "socialAssets",
  "designAssets",
  "cubiCasaImports",
  "mediaItems",
  "videoLinks",
  "tourLinks",
] as const;

/** Origins that display or download B2 objects in the browser. */
export const B2_PORTAL_ORIGINS = [
  "https://iconicimagestx.com",
  "https://www.iconicimagestx.com",
  "https://iconicimagestx.vercel.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
] as const;

/**
 * S3-compatible CORS for bucket iconic-media.
 * Apply on the bucket. The app does not set this itself.
 * Allowed methods are GET and HEAD. Browser image, video, and zip fetches
 * need the listed response headers exposed.
 */
export const B2_BUCKET_CORS = {
  CORSRules: [
    {
      AllowedOrigins: [...B2_PORTAL_ORIGINS],
      AllowedMethods: ["GET", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["Content-Length", "Content-Type", "Content-Disposition", "Accept-Ranges", "ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
} as const;

const CONTROL = /[\u0000-\u001F\u007F]/;

export function safeB2Key(value: unknown): string {
  if (typeof value !== "string") return "";
  const key = value.trim().replace(/^\/+/, "");
  if (!key || key.length > 1024) return "";
  if (key.includes("\\") || key.includes("..") || CONTROL.test(key)) return "";
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return key;
}

export function mediaUsesB2(item: Record<string, unknown>, parent?: Record<string, unknown> | null): boolean {
  if (item.storageBackend === FIREBASE_STORAGE_BACKEND) return false;
  if (item.storageBackend === B2_STORAGE_BACKEND) return Boolean(safeB2Key(item.b2Key));
  if (parent?.storageBackend === B2_STORAGE_BACKEND) return Boolean(safeB2Key(item.b2Key));
  return false;
}

/** Object key for one B2 file. Empty when the row stays on Firebase. */
export function resolveB2ObjectKey(item: Record<string, unknown>, parent?: Record<string, unknown> | null): string {
  if (!mediaUsesB2(item, parent)) return "";
  const own = safeB2Key(item.b2Key);
  if (!own) return "";
  const prefix = parent?.storageBackend === B2_STORAGE_BACKEND ? safeB2Key(parent.b2Key) : "";
  if (!prefix || own.includes("/") || own === prefix || own.startsWith(`${prefix}/`)) return own;
  return safeB2Key(`${prefix}/${own}`);
}

/** Identity used for arrangement and portal prefs. A presigned URL is not an id. */
export function stableMediaKey(row: Record<string, unknown>): string {
  for (const key of ["id", "path", "storagePath", "b2Key"]) {
    const value = typeof row[key] === "string" ? row[key].trim() : "";
    if (value) return value;
  }
  for (const key of ["url", "shareUrl"]) {
    const value = typeof row[key] === "string" ? row[key].trim() : "";
    if (value) return value;
  }
  return "";
}

export function savedDownloadName(row: Record<string, unknown>, objectKey = ""): string {
  for (const key of ["deliveryName", "fileName", "name", "title"]) {
    const value = typeof row[key] === "string" ? row[key].trim() : "";
    if (value && !value.includes("/") && !value.includes("\\")) return value.slice(0, 180);
  }
  const base = objectKey.split("/").pop() || "download";
  return base.slice(0, 180);
}

export function contentDispositionAttachment(filename: string): string {
  const cleaned = filename
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  const safe = cleaned || "download";
  return `attachment; filename="${safe}"`;
}

export function publicB2ObjectUrl(baseUrl: string, objectKey: string): string {
  const root = baseUrl.trim().replace(/\/+$/, "");
  const encoded = objectKey.split("/").map(encodeRfc3986).join("/");
  return `${root}/${encoded}`;
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Download link. Display still uses url so images and video stay inline. */
export function mediaDownloadHref(item: { url?: string | null; downloadUrl?: string | null } | null | undefined): string {
  const preferred = typeof item?.downloadUrl === "string" ? item.downloadUrl.trim() : "";
  if (preferred) return preferred;
  return typeof item?.url === "string" ? item.url : "";
}
