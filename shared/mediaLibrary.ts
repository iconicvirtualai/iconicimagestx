/**
 * Shared media-library rules. The browser and the API both use these so a
 * path that is safe to sign is the same path the Files page will request.
 * Bytes stay in Backblaze. This module never reads or writes them.
 */

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
export const MULTIPART_PART_BYTES = 8 * 1024 * 1024;
export const VIDEO_MULTIPART_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024 * 1024;
export const MAX_BULK = 20;
export const LIST_LIMIT = 300;
export const SEARCH_LIMIT = 120;
export const CLIENT_ZIP_MAX_BYTES = 400 * 1024 * 1024;
export const PREVIEW_LIMIT = 48;
export const PENDING_UPLOAD_MS = 24 * 60 * 60 * 1000;

export const ORDER_MEDIA_KINDS = ["Photos", "Video", "3D", "Floorplans", "Raw"] as const;
export type OrderMediaKind = (typeof ORDER_MEDIA_KINDS)[number];
export type FolderAccessLevel = "all_staff" | "owners_coordinators";
export type LibrarySort = "name" | "date" | "size" | "type";
export type LibrarySource = "upload" | "import";

export interface LibraryRoot {
  name: string;
  access: FolderAccessLevel;
}

/** Top-level drawers. Client jobs nest under Clients, and loose drops land in Inbox. */
export const LIBRARY_ROOTS: readonly LibraryRoot[] = [
  { name: "Clients", access: "all_staff" },
  { name: "Marketing", access: "all_staff" },
  { name: "Studio 105", access: "all_staff" },
  { name: "Podcast", access: "all_staff" },
  { name: "Admin", access: "owners_coordinators" },
  { name: "Inbox", access: "all_staff" },
];

const STAFF_ROLES = ["admin", "coordinator", "photographer", "editor"] as const;
const RAW_EXTENSIONS = new Set(["cr2", "cr3", "nef", "arw", "dng", "raf", "rw2", "orf", "srw"]);

export interface LibraryFileView {
  id: string;
  path: string;
  name: string;
  folder: string;
  size: number;
  contentType: string;
  tags: string[];
  notes: string;
  orderId: string;
  clientId: string;
  clientName: string;
  orderNumber: string;
  listingAddress: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: number;
  deletedAt: number | null;
  trashed: boolean;
  source: LibrarySource;
  previewUrl?: string;
}

export interface LibraryFolderView {
  id: string;
  path: string;
  name: string;
  parent: string;
  createdAt: number;
  createdBy: string;
  trashed: boolean;
  deletedAt: number | null;
  system: boolean;
}

export interface OrderTarget {
  id: string;
  clientName: string;
  address: string;
  orderNumber: string;
  clientId: string;
}

export function folderAccessAllows(role: string, access: FolderAccessLevel): boolean {
  if (access === "all_staff") return (STAFF_ROLES as readonly string[]).includes(role);
  return role === "admin" || role === "coordinator";
}

export function defaultAccessFor(root: string): FolderAccessLevel {
  return LIBRARY_ROOTS.find((item) => item.name === root)?.access ?? "all_staff";
}

export function isSystemRoot(path: string): boolean {
  return LIBRARY_ROOTS.some((item) => item.name === path);
}

export function parseAccess(input: unknown): FolderAccessLevel | null {
  if (input === "all_staff" || input === "owners_coordinators") return input;
  return null;
}

export function parseMediaKind(input: unknown): OrderMediaKind | null {
  if (typeof input !== "string") return null;
  return (ORDER_MEDIA_KINDS as readonly string[]).includes(input) ? (input as OrderMediaKind) : null;
}

export function topLevelFolder(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const slash = clean.indexOf("/");
  return slash === -1 ? clean : clean.slice(0, slash);
}

export function extensionOf(name: string): string {
  const base = name.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function sanitizeSegment(input: string, max = 120): string {
  const cleaned = input
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim();
  const cut = [...cleaned].slice(0, max).join("").trim();
  return cut || "Untitled";
}

/** Empty string is the library root. Anything else must be a safe relative path. */
export function normalizeLibraryPath(input: unknown): string | null {
  if (input === "") return "";
  if (typeof input !== "string") return null;
  if (input.length > 800 || input.includes("\0") || input.includes("\\")) return null;
  if (input.startsWith("/") || input.includes("//")) return null;
  const parts = input.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith(".") || part !== part.trim() || part.length > 180)) {
    return null;
  }
  return parts.join("/");
}

export function normalizeRelativePath(input: unknown): string | null {
  if (typeof input !== "string" || !input || input.length > 800) return null;
  if (input.includes("\\") || input.includes("\0")) return null;
  const parts = input.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const cleaned: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "..") return null;
    const safe = sanitizeSegment(part, 180);
    if (!safe || safe.startsWith(".")) return null;
    cleaned.push(safe);
  }
  return normalizeLibraryPath(cleaned.join("/"));
}

export function uploadDestination(currentFolder: unknown, relativePath: unknown): { folder: string; name: string } | null {
  const current = normalizeLibraryPath(currentFolder);
  const relative = normalizeRelativePath(relativePath);
  if (current === null || !relative) return null;
  const parts = relative.split("/");
  const name = parts.pop();
  if (!name) return null;
  const extra = parts.join("/");
  const folder = [current, extra].filter(Boolean).join("/");
  const landed = folder || "Inbox";
  if (normalizeLibraryPath(landed) === null || normalizeLibraryPath(`${landed}/${name}`) === null) return null;
  return { folder: landed, name };
}

export function uniquifyName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let index = 2; index < 500; index += 1) {
    const next = `${stem} (${index})${ext}`;
    if (!taken.has(next)) return next;
  }
  return `${stem} (${Date.now()})${ext}`;
}

export function ancestorPaths(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  for (let index = 1; index <= parts.length; index += 1) out.push(parts.slice(0, index).join("/"));
  return out;
}

export function replacePathPrefix(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (from && path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  return path;
}

export function trashObjectKey(liveKey: string, deletedAt: number, id: string): string {
  return `.trash/${deletedAt}/${id}/${liveKey}`;
}

export function isTrashKey(key: string): boolean {
  return key === ".trash" || key.startsWith(".trash/");
}

export function mediaKindFor(name: string, contentType: string): OrderMediaKind {
  const ext = extensionOf(name);
  if (RAW_EXTENSIONS.has(ext)) return "Raw";
  if (contentType.startsWith("video/")) return "Video";
  if (contentType === "application/pdf" || ext === "pdf") return "Floorplans";
  if (contentType.startsWith("image/")) return "Photos";
  return "Photos";
}

export function orderLibraryPath(input: {
  clientName?: string;
  address?: string;
  orderNumber?: string;
  orderId?: string;
  kind: OrderMediaKind;
}): string {
  const client = sanitizeSegment(input.clientName || "Unknown client");
  const place = sanitizeSegment(input.address || input.orderNumber || input.orderId || "Order");
  return `Clients/${client}/${place}/${input.kind}`;
}

export function orderClientFolder(input: {
  clientName?: string;
  address?: string;
  orderNumber?: string;
  orderId?: string;
}): string {
  const full = orderLibraryPath({ ...input, kind: "Photos" });
  return full.slice(0, full.lastIndexOf("/"));
}

export function normalizeContentType(input: unknown, name: string): string {
  const raw = typeof input === "string" ? input.split(";")[0].trim().toLowerCase() : "";
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(raw) && raw.length <= 120) return raw;
  const known: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    tif: "image/tiff",
    tiff: "image/tiff",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    pdf: "application/pdf",
    zip: "application/zip",
  };
  return known[extensionOf(name)] || "application/octet-stream";
}

export function isPreviewable(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType.startsWith("video/");
}

export function useMultipart(size: number, contentType: string): boolean {
  if (contentType.startsWith("video/") && size >= VIDEO_MULTIPART_BYTES) return true;
  return size >= MULTIPART_THRESHOLD_BYTES;
}

export function partCountFor(size: number): number {
  return Math.max(1, Math.ceil(size / MULTIPART_PART_BYTES));
}

export function parseByteSize(input: unknown): number | null {
  const size = typeof input === "number" ? input : typeof input === "string" && input.trim() ? Number(input) : NaN;
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) return null;
  return size;
}

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const tags: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const tag = item.replace(/[\u0000-\u001f]/g, "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag || tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue;
    tags.push(tag);
    if (tags.length >= 20) break;
  }
  return tags;
}

export function normalizeNotes(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\u0000/g, "").trim().slice(0, 2000);
}

export function searchTokens(...parts: Array<string | null | undefined | string[]>): string[] {
  const tokens = new Set<string>();
  const add = (value: string) => {
    const lower = value.toLowerCase();
    for (const word of lower.split(/[^a-z0-9]+/)) {
      if (word.length >= 2 || /^\d+$/.test(word)) tokens.add(word.slice(0, 40));
    }
    const compact = lower.replace(/[^a-z0-9]+/g, "");
    if (compact.length >= 2) tokens.add(compact.slice(0, 40));
  };
  for (const part of parts) {
    if (!part) continue;
    if (Array.isArray(part)) part.forEach(add);
    else add(part);
  }
  return [...tokens].slice(0, 80);
}

export function queryTokens(query: string): string[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 2 || /^\d+$/.test(word));
  return [...new Set(words.map((word) => word.slice(0, 40)))].slice(0, 8);
}

export function matchesAllTokens(tokens: readonly string[], required: readonly string[]): boolean {
  if (required.length === 0) return false;
  return required.every((token) => tokens.some((item) => item === token || item.includes(token)));
}

export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/["\r\n]/g, "").slice(0, 120) || "download";
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"`;
}

export function shouldZipDownloads(count: number, totalBytes: number): boolean {
  return count > 1 && totalBytes >= 0 && totalBytes <= CLIENT_ZIP_MAX_BYTES;
}

export function breadcrumbsFor(folder: string): { name: string; path: string }[] {
  const crumbs = [{ name: "Files", path: "" }];
  if (!folder) return crumbs;
  const parts = folder.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    crumbs.push({ name: parts[index], path: parts.slice(0, index + 1).join("/") });
  }
  return crumbs;
}

export function compareBySort(
  sort: LibrarySort,
  a: { name: string; createdAt: number; size: number; contentType: string },
  b: { name: string; createdAt: number; size: number; contentType: string },
): number {
  if (sort === "date") return b.createdAt - a.createdAt || a.name.localeCompare(b.name);
  if (sort === "size") return b.size - a.size || a.name.localeCompare(b.name);
  if (sort === "type") return a.contentType.localeCompare(b.contentType) || a.name.localeCompare(b.name);
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${Math.round(size)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function isLibraryDocId(input: unknown, kind: "m" | "f" | "u"): input is string {
  return typeof input === "string" && new RegExp(`^${kind}_[a-f0-9]{32}$`).test(input);
}

export function trashIsRestorable(deletedAt: number | null, now: number): boolean {
  return typeof deletedAt === "number" && now >= deletedAt && now - deletedAt < TRASH_RETENTION_MS;
}
