/**
 * Listing media library helpers.
 * Files stay on the existing listing photo model:
 *   Storage: listings/{listingId}/photos|raw/{timestamp}_{file}
 *   Firestore: listings/{listingId}.images[] and .mediaFolders[]
 * Custom folders are metadata. They do not add Storage prefixes, so the
 * photos/raw path check stays the upload boundary.
 */

import { contentTypeForUpload, safeStorageFileName } from "./listingAccess";

export const LISTING_MEDIA_STORAGE = {
  bucketEnv: "FIREBASE_STORAGE_BUCKET",
  defaultBucket: "iconic-images-aicon.firebasestorage.app",
  photosPrefix: "listings/{listingId}/photos/",
  rawPrefix: "listings/{listingId}/raw/",
  firestoreDoc: "listings/{listingId}",
  imagesField: "images",
  foldersField: "mediaFolders",
  cubiCasaField: "cubiCasaImports",
  mediaJobsCollection: "mediaJobs",
} as const;

export const CUBICASA_MANUAL_NEXT_STEP =
  "CubiCasa has no API client in this app. Place the order in CubiCasa, then paste the order ID and share URL in Studio → Templates.";

export const AI_EDIT_QUEUE_NOTE =
  "Queued on the existing mediaJobs list (same queue as Studio → aICON Editor). This does not call CubiCasa, Autoenhance, or Virtual Staging.";

export type StorageFolder = "photos" | "raw" | "other";
export type MediaSortKey = "name" | "date" | "size";
export type MediaSortDir = "asc" | "desc";

export interface MediaFileRecord {
  id: string;
  name: string;
  path: string;
  url: string;
  contentType: string;
  uploadedAt: string;
  uploadedBy: string;
  size: number | null;
  folderId: string | null;
  storageFolder: StorageFolder;
}

export interface MediaFolderRecord {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

const RESERVED_VIEWS = new Set(["all", "photos", "raw"]);

export function storageFolderFromPath(path: string): StorageFolder {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.includes("/raw/")) return "raw";
  if (normalized.includes("/photos/")) return "photos";
  return "other";
}

export function byteSize(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric);
}

export function formatFileSize(size: number | null): string {
  if (size == null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function canPreviewImage(file: Pick<MediaFileRecord, "contentType" | "name">): boolean {
  const type = file.contentType.toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif") return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

export function normalizeMediaFile(raw: unknown, index = 0): MediaFileRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const path = typeof item.path === "string" ? item.path : "";
  const url = typeof item.url === "string" ? item.url : "";
  if (!path && !url) return null;
  const name = typeof item.name === "string" && item.name.trim()
    ? item.name.trim()
    : (path.split("/").pop() || `file-${index + 1}`);
  const folderId = typeof item.folderId === "string" && item.folderId.trim() ? item.folderId.trim() : null;
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : (path || `idx-${index}`),
    name,
    path,
    url,
    contentType: contentTypeForUpload(name, typeof item.contentType === "string" ? item.contentType : undefined),
    uploadedAt: typeof item.uploadedAt === "string" ? item.uploadedAt : "",
    uploadedBy: typeof item.uploadedBy === "string" ? item.uploadedBy : "",
    size: byteSize(item.size),
    folderId,
    storageFolder: storageFolderFromPath(path),
  };
}

export function normalizeMediaFiles(raw: unknown): MediaFileRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => normalizeMediaFile(item, index))
    .filter((item): item is MediaFileRecord => Boolean(item));
}

export function sanitizeFolderName(raw: unknown): string {
  return String(raw || "")
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function normalizeMediaFolder(raw: unknown): MediaFolderRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const name = sanitizeFolderName(item.name);
  if (!id || !name || RESERVED_VIEWS.has(id)) return null;
  return {
    id,
    name,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    createdBy: typeof item.createdBy === "string" ? item.createdBy : "",
  };
}

export function normalizeMediaFolders(raw: unknown): MediaFolderRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const folders: MediaFolderRecord[] = [];
  for (const item of raw) {
    const folder = normalizeMediaFolder(item);
    if (!folder) continue;
    const key = folder.name.toLowerCase();
    if (seen.has(folder.id) || seen.has(key)) continue;
    seen.add(folder.id);
    seen.add(key);
    folders.push(folder);
  }
  return folders;
}

export function createFolderId(now = Date.now(), entropy = ""): string {
  const suffix = entropy || Math.random().toString(36).slice(2, 8);
  return `fld_${now.toString(36)}_${suffix}`;
}

export function filesInView(files: MediaFileRecord[], view: string): MediaFileRecord[] {
  if (!view || view === "all") return files;
  if (view === "photos" || view === "raw") {
    return files.filter((file) => !file.folderId && file.storageFolder === view);
  }
  return files.filter((file) => file.folderId === view);
}

export function sortMediaFiles(files: MediaFileRecord[], key: MediaSortKey, dir: MediaSortDir): MediaFileRecord[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...files].sort((a, b) => {
    if (key === "name") {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * factor;
    }
    if (key === "size") {
      return ((a.size ?? -1) - (b.size ?? -1)) * factor;
    }
    return ((Date.parse(a.uploadedAt) || 0) - (Date.parse(b.uploadedAt) || 0)) * factor;
  });
}

export function buildListingObjectPath(
  listingId: string,
  folder: "photos" | "raw",
  fileName: string,
  now = Date.now(),
): string {
  return `listings/${listingId}/${folder}/${now}_${safeStorageFileName(fileName)}`;
}

export function planFileMove(input: {
  file: Pick<MediaFileRecord, "path" | "name" | "storageFolder">;
  sourceListingId: string;
  destinationListingId: string;
  destinationStorageFolder: "photos" | "raw";
}): { mode: "metadata" | "copy"; nextPath: string } {
  const sameObject = input.sourceListingId === input.destinationListingId
    && input.file.storageFolder === input.destinationStorageFolder;
  if (sameObject) return { mode: "metadata", nextPath: input.file.path };
  return {
    mode: "copy",
    nextPath: buildListingObjectPath(
      input.destinationListingId,
      input.destinationStorageFolder,
      input.file.name,
    ),
  };
}

export function listingAddressLabel(listing: {
  propertyAddress?: unknown;
  address?: unknown;
  shootLocation?: unknown;
} | null | undefined): string {
  if (!listing) return "Listing";
  for (const value of [listing.propertyAddress, listing.address, listing.shootLocation]) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const address = value as { street?: unknown; city?: unknown; state?: unknown; zip?: unknown };
      const line = [address.street, address.city, address.state, address.zip]
        .filter((part) => typeof part === "string" && part.trim())
        .join(", ");
      if (line) return line;
    }
  }
  return "Listing";
}

export interface CubiCasaLibraryFile {
  name: string;
  path: string;
  url: string;
}

export function buildCubiCasaLibraryRequest(input: {
  listingId: string;
  files: CubiCasaLibraryFile[];
  requestedBy: string;
  requestedAt?: string;
}) {
  return {
    source: "media-library",
    provider: "cubicasa",
    status: "needs_manual_order",
    apiConnected: false,
    orderId: "",
    url: "",
    listingId: input.listingId,
    files: input.files.map((file) => ({
      name: file.name,
      path: file.path,
      url: file.url,
    })),
    requestedAt: input.requestedAt || new Date().toISOString(),
    requestedBy: input.requestedBy,
    nextStep: CUBICASA_MANUAL_NEXT_STEP,
  };
}
