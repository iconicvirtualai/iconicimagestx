/**
 * Public share photos are served from GET /api/media/display/:listingId/:index.
 * The index is the position in this share set, not a storage path.
 * Listing ids are already unguessable, and a stable index keeps the CDN cache
 * (s-maxage) from fragmenting the way a signed token would.
 * MLS, full-res-only, PDF, zip, and raw files have no index.
 */

import type { StudioMedia } from "./clientGalleryLink.ts";

export interface ShareListing {
  id: string;
  [key: string]: unknown;
}

export interface ShareDisplayItem {
  name: string;
  /** Server-side fetch target. Never copied onto a public payload. */
  sourceUrl: string;
  kind: "image" | "floorPlan" | "poster";
}

const RASTER = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const VIDEO_FILE = /\.(mp4|m4v|mov|webm)(\?|#|$)/i;
const BLOCKED_EXT = /\.(zip|pdf|dng|cr2|cr3|nef|nrw|arw|srf|sr2|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic|heif|mp4|m4v|mov|webm)(\?|#|$)/i;
const FILE_KEYS = ["downloadUrl", "fileUrl", "originalUrl", "fullResUrl", "mlsUrl", "zipUrl", "printUrl", "reelUrl", "mp4Url", "rawUrl", "src"] as const;
const DISPLAY_KEYS = ["previewUrl", "displayUrl", "webUrl", "thumbnailUrl"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowOf(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" ? item as Record<string, unknown> : null;
}

function shareableUrl(value: unknown): string {
  const url = text(value);
  if (!url || url.startsWith("//") || url.includes("\\") || url.includes("..")) return "";
  if (url.startsWith("/")) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}

function mediaName(row: Record<string, unknown>, fallback: string): string {
  return text(row.name) || text(row.fileName) || text(row.title) || fallback;
}

function labelOf(row: Record<string, unknown>): string {
  return `${text(row.fileName)} ${text(row.name)} ${text(row.title)} ${text(row.path)} ${text(row.storagePath)}`.toLowerCase();
}

function isMls(row: Record<string, unknown>): boolean {
  const category = text(row.category).toLowerCase();
  const type = text(row.type).toLowerCase();
  if (category === "mls" || type === "mls") return true;
  const label = labelOf(row);
  if (/(^|[^a-z0-9])mls([^a-z0-9]|$)/.test(label)) return true;
  return /\/mls\//.test(label);
}

function isFullRes(row: Record<string, unknown>): boolean {
  const category = text(row.category).toLowerCase();
  const type = text(row.type).toLowerCase();
  if (category === "full-res" || category === "fullres" || type === "full-res" || type === "fullres") return true;
  const label = labelOf(row);
  if (/(^|[^a-z0-9])full[\s_-]?res([^a-z0-9]|$)/.test(label)) return true;
  return /\/full\//.test(label);
}

function isRasterUrl(url: string, row: Record<string, unknown>): boolean {
  if (!url || BLOCKED_EXT.test(url.split("#")[0]) || VIDEO_FILE.test(url.split("#")[0])) return false;
  if (RASTER.test(url.split("#")[0])) return true;
  const content = text(row.contentType).toLowerCase();
  return /^image\/(jpeg|jpg|png|webp|gif)/.test(content);
}

function blockedFileUrls(row: Record<string, unknown>, includeOwnUrl: boolean): Set<string> {
  const blocked = new Set<string>();
  for (const key of FILE_KEYS) {
    const url = shareableUrl(row[key]);
    if (url) blocked.add(url);
  }
  if (includeOwnUrl) {
    const own = shareableUrl(row.url);
    const share = shareableUrl(row.shareUrl);
    if (own) blocked.add(own);
    if (share) blocked.add(share);
  }
  return blocked;
}

/** A smaller sibling image. Never the full-res or MLS file itself. */
function separateDisplay(row: Record<string, unknown>): string {
  const blocked = blockedFileUrls(row, isFullRes(row));
  for (const key of DISPLAY_KEYS) {
    const url = shareableUrl(row[key]);
    if (!url || !isRasterUrl(url, row) || blocked.has(url)) continue;
    if (/\/mls\//i.test(url) || /\/full\//i.test(url)) continue;
    return url;
  }
  return "";
}

function photoSource(row: Record<string, unknown>): string {
  if (isMls(row)) return "";
  const type = text(row.type).toLowerCase();
  if (type === "video" || type === "reel" || type === "file" || type === "matterport") return "";
  const content = text(row.contentType).toLowerCase();
  if (content.startsWith("video/") || content === "application/pdf" || content === "application/zip") return "";
  const path = `${text(row.path)} ${text(row.storagePath)}`.toLowerCase();
  if (/\/(raw|downloads?|print|zips?)\//.test(path)) return "";
  const display = separateDisplay(row);
  if (isFullRes(row)) return display;
  if (display) return display;
  const url = shareableUrl(row.url) || shareableUrl(row.shareUrl);
  if (!url || !isRasterUrl(url, row)) return "";
  if (/\/(mls|full|raw|downloads?|print|zips?)\//i.test(url)) return "";
  return url;
}

function rasterPoster(row: Record<string, unknown>): string {
  if (isMls(row)) return "";
  for (const key of ["poster", "posterUrl", "thumbnailUrl"] as const) {
    const url = shareableUrl(row[key]);
    if (!url || !isRasterUrl(url, row)) continue;
    if (/\/(mls|full)\//i.test(url)) continue;
    return url;
  }
  return "";
}

function floorSource(row: Record<string, unknown>): string {
  if (isMls(row) || isFullRes(row)) return separateDisplay(row);
  return photoSource(row) || rasterPoster(row);
}

export function shareDisplayPath(listingId: string, index: number): string {
  return `/api/media/display/${encodeURIComponent(listingId)}/${index}`;
}

/**
 * Share-set order, shared by the payload and the display route:
 * eligible listing images, then floor-plan images, then video posters
 * that are not already in the set. Indexes do not change with payment.
 */
export function shareDisplayItems(listing: ShareListing): ShareDisplayItem[] {
  const items: ShareDisplayItem[] = [];
  const seen = new Set<string>();
  const push = (name: string, sourceUrl: string, kind: ShareDisplayItem["kind"]) => {
    if (!sourceUrl || seen.has(sourceUrl) || items.length >= 240) return;
    seen.add(sourceUrl);
    items.push({ name, sourceUrl, kind });
  };

  if (Array.isArray(listing.images)) {
    listing.images.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      push(mediaName(row, `Photo ${index + 1}`), photoSource(row), "image");
    });
  }
  for (const group of [listing.floorplans, listing.floorPlans]) {
    if (!Array.isArray(group)) continue;
    group.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      push(mediaName(row, `Floor plan ${index + 1}`), floorSource(row), "floorPlan");
    });
  }
  if (Array.isArray(listing.videos)) {
    listing.videos.forEach((item) => {
      const row = rowOf(item);
      if (!row) return;
      push(mediaName(row, "Video"), rasterPoster(row), "poster");
    });
  }
  return items;
}

function displayMedia(listingId: string, index: number, name: string): StudioMedia {
  const url = shareDisplayPath(listingId, index);
  return { url, displayUrl: url, name };
}

function posterIndex(row: Record<string, unknown>, items: ShareDisplayItem[]): number {
  const poster = rasterPoster(row);
  if (!poster) return -1;
  return items.findIndex((item) => item.sourceUrl === poster);
}

function isUnbranded(row: Record<string, unknown>): boolean {
  const category = text(row.category).toLowerCase();
  const type = text(row.type).toLowerCase();
  if (category === "unbranded" || type === "unbranded") return true;
  const name = `${text(row.name)} ${text(row.fileName)} ${text(row.title)}`.toLowerCase();
  return name.includes("unbranded");
}

function isBrandedPlayback(row: Record<string, unknown>): boolean {
  if (isMls(row) || isUnbranded(row)) return false;
  const category = text(row.category).toLowerCase();
  const type = text(row.type).toLowerCase();
  if (category === "branded" || type === "branded") return true;
  const name = `${text(row.name)} ${text(row.fileName)} ${text(row.title)}`.toLowerCase();
  return /(^|[^a-z])branded([^a-z]|$)/.test(name);
}

function isReelPlayback(row: Record<string, unknown>): boolean {
  if (isMls(row) || isUnbranded(row)) return false;
  const category = text(row.category).toLowerCase();
  const type = text(row.type).toLowerCase();
  return category === "reel" || type === "reel";
}

function deliveredVideoUrl(row: Record<string, unknown>): string {
  const url = shareableUrl(row.url) || shareableUrl(row.shareUrl);
  if (!url || !VIDEO_FILE.test(url.split("#")[0])) return "";
  if (/\/mls\//i.test(url)) return "";
  return url;
}

function withPoster(media: StudioMedia, listingId: string, index: number): StudioMedia {
  if (index < 0) return media;
  const poster = shareDisplayPath(listingId, index);
  return { ...media, poster, thumbnailUrl: poster, displayUrl: poster };
}

/**
 * Locked or unpaid: poster only, no video URL.
 * Paid or released: branded MP4 and reel, with the delivered file URL and
 * noDownload. Unbranded and MLS videos stay off.
 */
export function publicShareVideos(listing: ShareListing, playback: boolean): StudioMedia[] {
  if (!Array.isArray(listing.videos)) return [];
  const items = shareDisplayItems(listing);
  const videos: StudioMedia[] = [];
  for (const item of listing.videos) {
    const row = rowOf(item);
    if (!row) continue;
    const name = mediaName(row, "Video");
    const posterAt = posterIndex(row, items);
    if (playback && (isBrandedPlayback(row) || isReelPlayback(row))) {
      const url = deliveredVideoUrl(row);
      if (!url) continue;
      videos.push(withPoster({ url, name, noDownload: true }, listing.id, posterAt));
      continue;
    }
    if (posterAt < 0) continue;
    videos.push(withPoster({ url: null, name }, listing.id, posterAt));
  }
  return videos.slice(0, 40);
}

export function publicShareMedia(listing: ShareListing): { images: StudioMedia[]; floorPlans: StudioMedia[] } {
  const images: StudioMedia[] = [];
  const floorPlans: StudioMedia[] = [];
  shareDisplayItems(listing).forEach((item, index) => {
    const media = displayMedia(listing.id, index, item.name);
    if (item.kind === "image") images.push(media);
    if (item.kind === "floorPlan") floorPlans.push(media);
  });
  return {
    images: images.slice(0, 200),
    floorPlans: floorPlans.slice(0, 40),
  };
}
