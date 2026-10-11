/**
 * Plan for scripts/backfill-video-posters.ts.
 * Dry-run is the default. Planning does not read Storage or run ffmpeg.
 */

import { posterFrameSeconds } from "./videoPoster.ts";

const VIDEO_EXT = /\.(mp4|m4v|mov|webm)(\?|#|$)/i;
const RASTER_EXT = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const VIDEO_TYPES = new Set(["video", "reel"]);
const SKIP_TYPES = new Set(["photo", "aerial", "floorplan", "floor-plan", "file", "pdf", "matterport", "tour", "zip"]);

export const POSTER_SEEK_RULE = "2s, or 10% of duration when the clip is shorter than 2s";

export interface VideoPosterSourceDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface VideoPosterPlanItem {
  collection: "listings" | "galleries";
  docId: string;
  field: "videos" | "mediaItems" | "videoLinks";
  index: number;
  itemId: string;
  name: string;
  sourceUrl: string;
  sourceKind: "repo" | "storage" | "other";
  repoPath: string | null;
  seekSeconds: number;
  seekRule: string;
  storagePath: string;
}

export interface VideoPosterPlanInput {
  listings?: VideoPosterSourceDoc[];
  galleries?: VideoPosterSourceDoc[];
  listingId?: string | null;
  limit?: number | null;
}

export interface VideoPosterApplyDeps {
  write: boolean;
  loadRow: (item: VideoPosterPlanItem) => Promise<Record<string, unknown> | null>;
  readRepo: (repoPath: string) => Promise<Buffer | null>;
  downloadStorage: (url: string) => Promise<Buffer | null>;
  probeDuration: (bytes: Buffer, fileName: string) => Promise<number | null>;
  extractFrame: (bytes: Buffer, fileName: string, seekSeconds: number) => Promise<Buffer>;
  uploadJpeg: (storagePath: string, jpeg: Buffer) => Promise<string>;
  savePoster: (item: VideoPosterPlanItem, posterUrl: string) => Promise<void>;
}

export interface VideoPosterApplyResult {
  planned: number;
  written: number;
  skipped: number;
  seeks: number[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowOf(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" ? item as Record<string, unknown> : null;
}

export function hasStoredVideoPoster(row: Record<string, unknown>): boolean {
  for (const key of ["poster", "posterUrl", "thumbnailUrl"] as const) {
    const url = text(row[key]).split("#")[0];
    if (url && RASTER_EXT.test(url)) return true;
  }
  return false;
}

function isVideoItem(row: Record<string, unknown>): boolean {
  const type = text(row.type).toLowerCase();
  if (SKIP_TYPES.has(type)) return false;
  if (VIDEO_TYPES.has(type)) return true;
  const content = text(row.contentType).toLowerCase();
  if (content.startsWith("video/")) return true;
  const url = text(row.url) || text(row.shareUrl);
  return VIDEO_EXT.test(url.split("#")[0]);
}

export function repoMediaPath(row: Record<string, unknown>): string | null {
  const sourcePath = text(row.sourcePath).replace(/\\/g, "/");
  if (sourcePath.startsWith("public/media/") && !sourcePath.includes("..")) return sourcePath;
  const url = text(row.url) || text(row.shareUrl);
  let pathname = "";
  if (url.startsWith("/")) pathname = url.split("?")[0].split("#")[0];
  else {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith("/media/") || pathname.includes("..") || pathname.includes("\\")) return null;
  return `public${pathname}`;
}

export function isStorageMediaUrl(url: string): boolean {
  if (url.startsWith("gs://")) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com";
  } catch {
    return false;
  }
}

function safeId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned || "video").slice(0, 80);
}

function planRows(
  collection: "listings" | "galleries",
  docId: string,
  field: VideoPosterPlanItem["field"],
  rows: unknown,
): VideoPosterPlanItem[] {
  if (!Array.isArray(rows)) return [];
  const planned: VideoPosterPlanItem[] = [];
  rows.forEach((item, index) => {
    const row = rowOf(item);
    if (!row || !isVideoItem(row) || hasStoredVideoPoster(row)) return;
    const sourceUrl = text(row.url) || text(row.shareUrl) || text(row.sourcePath);
    if (!sourceUrl) return;
    const repoPath = repoMediaPath(row);
    const sourceKind = repoPath ? "repo" : isStorageMediaUrl(sourceUrl) ? "storage" : "other";
    const itemId = text(row.id) || `${field}-${index}`;
    planned.push({
      collection,
      docId,
      field,
      index,
      itemId,
      name: text(row.name) || text(row.fileName) || text(row.title) || "Video",
      sourceUrl,
      sourceKind,
      repoPath,
      seekSeconds: posterFrameSeconds(null),
      seekRule: POSTER_SEEK_RULE,
      storagePath: `video-posters/${collection}/${safeId(docId)}/${safeId(itemId)}.jpg`,
    });
  });
  return planned;
}

function includeDoc(doc: VideoPosterSourceDoc, listingId: string | null, collection: "listings" | "galleries"): boolean {
  if (!listingId) return true;
  if (doc.id === listingId) return true;
  if (collection === "galleries" && text(doc.data.listingId) === listingId) return true;
  return false;
}

export function planVideoPosterBackfill(input: VideoPosterPlanInput): VideoPosterPlanItem[] {
  const listingId = input.listingId?.trim() || null;
  const items: VideoPosterPlanItem[] = [];
  for (const doc of input.listings || []) {
    if (!includeDoc(doc, listingId, "listings")) continue;
    items.push(...planRows("listings", doc.id, "videos", doc.data.videos));
  }
  for (const doc of input.galleries || []) {
    if (!includeDoc(doc, listingId, "galleries")) continue;
    items.push(...planRows("galleries", doc.id, "mediaItems", doc.data.mediaItems));
    items.push(...planRows("galleries", doc.id, "videoLinks", doc.data.videoLinks));
  }
  const limit = input.limit;
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) return items.slice(0, Math.floor(limit));
  return items;
}

export function formatVideoPosterDryRun(items: VideoPosterPlanItem[]): string {
  const lines = [
    "Video poster backfill — DRY RUN. No frame is extracted, nothing is uploaded, and Firestore is not written.",
    `Planned ${items.length} video${items.length === 1 ? "" : "s"} missing a poster.`,
    `Seek: ${POSTER_SEEK_RULE}.`,
    "",
  ];
  if (items.length === 0) {
    lines.push("Every video already has a poster. Nothing to do.");
    return `${lines.join("\n")}\n`;
  }
  for (const item of items) {
    lines.push(`- ${item.collection}/${item.docId} ${item.field}[${item.index}] ${item.name}`);
    lines.push(`  source: ${item.repoPath || item.sourceUrl} (${item.sourceKind})`);
    lines.push(`  seek: ${item.seekSeconds}s`);
    lines.push(`  storage: ${item.storagePath}`);
  }
  lines.push("");
  lines.push("Re-run with --write on a machine that has ffmpeg to store the JPEGs.");
  return `${lines.join("\n")}\n`;
}

export function parseVideoPosterArgs(argv: string[]): {
  write: boolean;
  limit: number | null;
  listingId: string | null;
  unknown: string[];
} {
  let write = false;
  let limit: number | null = null;
  let listingId: string | null = null;
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--limit") {
      const raw = argv[i + 1];
      i += 1;
      const value = Number(raw);
      if (!raw || !Number.isInteger(value) || value < 0) unknown.push("--limit");
      else limit = value;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 0) unknown.push(arg);
      else limit = value;
      continue;
    }
    if (arg === "--listing") {
      const id = argv[i + 1];
      i += 1;
      if (!id || id.startsWith("--")) unknown.push("--listing");
      else listingId = id;
      continue;
    }
    if (arg.startsWith("--listing=")) {
      const id = arg.slice("--listing=".length).trim();
      if (!id) unknown.push(arg);
      else listingId = id;
      continue;
    }
    unknown.push(arg);
  }
  return { write, limit, listingId, unknown };
}

export async function applyVideoPosterBackfill(
  items: VideoPosterPlanItem[],
  deps: VideoPosterApplyDeps,
): Promise<VideoPosterApplyResult> {
  const result: VideoPosterApplyResult = { planned: items.length, written: 0, skipped: 0, seeks: [] };
  if (!deps.write) return result;
  for (const item of items) {
    const row = await deps.loadRow(item);
    if (!row || hasStoredVideoPoster(row)) {
      result.skipped += 1;
      continue;
    }
    const bytes = item.repoPath
      ? await deps.readRepo(item.repoPath)
      : item.sourceKind === "storage"
        ? await deps.downloadStorage(item.sourceUrl)
        : null;
    if (!bytes || bytes.length === 0) {
      result.skipped += 1;
      continue;
    }
    const duration = await deps.probeDuration(bytes, item.name);
    const seek = posterFrameSeconds(duration);
    result.seeks.push(seek);
    const jpeg = await deps.extractFrame(bytes, item.name, seek);
    if (!jpeg || jpeg.length < 16) {
      result.skipped += 1;
      continue;
    }
    const posterUrl = await deps.uploadJpeg(item.storagePath, jpeg);
    await deps.savePoster(item, posterUrl);
    result.written += 1;
  }
  return result;
}
