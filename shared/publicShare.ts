/**
 * Public share photos are served from GET /api/media/display/:listingId/:index.
 * The index is this share set only. Gallery-only photos are not appended,
 * so a closed studio cannot be reached by guessing a later index.
 * MLS, full-res, and downloadable raster photos stay in the set. The payload
 * carries the display route, never the original file URL. PDF, zip, raw, and
 * non-image files have no index.
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

/**
 * Raster the display route may resize. A separate web image wins when one
 * exists. MLS, full-res, and downloadable files are still rasters: the route
 * resizes them and the public payload never receives this URL.
 * legacyDropTagged is the first share cut, used only by the read-only report.
 */
export function rasterShareSource(row: Record<string, unknown>, legacyDropTagged = false): string {
  if (legacyDropTagged && isMls(row)) return "";
  const type = text(row.type).toLowerCase();
  if (type === "video" || type === "reel" || type === "file" || type === "matterport") return "";
  const content = text(row.contentType).toLowerCase();
  if (content.startsWith("video/") || content === "application/pdf" || content === "application/zip") return "";
  const path = `${text(row.path)} ${text(row.storagePath)}`.toLowerCase();
  if (/\/(raw|downloads?|print|zips?)\//.test(path)) return "";
  const display = separateDisplay(row);
  if (legacyDropTagged && isFullRes(row)) return display;
  if (display) return display;
  const url = shareableUrl(row.url) || shareableUrl(row.shareUrl);
  if (!url || !isRasterUrl(url, row)) return "";
  if (legacyDropTagged && /\/(mls|full)\//i.test(url)) return "";
  if (/\/(raw|downloads?|print|zips?)\//i.test(url)) return "";
  return url;
}

function rasterPoster(row: Record<string, unknown>, legacyDropTagged = false): string {
  if (legacyDropTagged && isMls(row)) return "";
  for (const key of ["poster", "posterUrl", "thumbnailUrl"] as const) {
    const url = shareableUrl(row[key]);
    if (!url || !isRasterUrl(url, row)) continue;
    if (legacyDropTagged && /\/(mls|full)\//i.test(url)) continue;
    return url;
  }
  return "";
}

/** Display-set key for a video with no stored poster. Not a file URL. */
export const VIDEO_PLACEHOLDER_PREFIX = "video-placeholder:";

function videoFileUrl(row: Record<string, unknown>): string {
  const url = shareableUrl(row.url) || shareableUrl(row.shareUrl);
  if (!url || !VIDEO_FILE.test(url.split("#")[0])) return "";
  return url;
}

export function videoPlaceholderSource(row: Record<string, unknown>): string {
  if (rasterPoster(row)) return "";
  const file = videoFileUrl(row);
  const type = text(row.type).toLowerCase();
  const content = text(row.contentType).toLowerCase();
  const named = type === "video" || type === "reel" || content.startsWith("video/");
  if (!file && !named) return "";
  const id = text(row.id) || file || text(row.path) || text(row.storagePath) || text(row.name) || text(row.fileName);
  if (!id) return "";
  return `${VIDEO_PLACEHOLDER_PREFIX}${encodeURIComponent(id)}`;
}

export function isVideoPlaceholderSource(sourceUrl: string): boolean {
  return sourceUrl.startsWith(VIDEO_PLACEHOLDER_PREFIX);
}

function floorSource(row: Record<string, unknown>, legacyDropTagged = false): string {
  if (legacyDropTagged && (isMls(row) || isFullRes(row))) return separateDisplay(row);
  return rasterShareSource(row, legacyDropTagged) || rasterPoster(row, legacyDropTagged);
}

export function shareDisplayPath(listingId: string, index: number): string {
  return `/api/media/display/${encodeURIComponent(listingId)}/${index}`;
}

export interface ShareDisplayOptions {
  /** Report-only comparison with the cut that dropped MLS and full-res photos. */
  legacyDropTagged?: boolean;
}

function pushDisplay(
  items: ShareDisplayItem[],
  seen: Set<string>,
  name: string,
  sourceUrl: string,
  kind: ShareDisplayItem["kind"],
) {
  if (!sourceUrl || seen.has(sourceUrl) || items.length >= 240) return;
  seen.add(sourceUrl);
  items.push({ name, sourceUrl, kind });
}

/**
 * Share-set order, shared by the public payload and /api/media/display/:listingId/:index.
 * Listing images, then floor-plan images, then one slot per video.
 * A stored poster image is fetched and resized. A video with no poster
 * uses a placeholder key; the display route paints a card and does not
 * read the MP4. Indexes do not change with payment.
 * Gallery documents are not part of this set.
 */
export function shareDisplayItems(listing: ShareListing, options: ShareDisplayOptions = {}): ShareDisplayItem[] {
  const legacy = options.legacyDropTagged === true;
  const items: ShareDisplayItem[] = [];
  const seen = new Set<string>();

  if (Array.isArray(listing.images)) {
    listing.images.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      pushDisplay(items, seen, mediaName(row, `Photo ${index + 1}`), rasterShareSource(row, legacy), "image");
    });
  }
  for (const group of [listing.floorplans, listing.floorPlans]) {
    if (!Array.isArray(group)) continue;
    group.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      pushDisplay(items, seen, mediaName(row, `Floor plan ${index + 1}`), floorSource(row, legacy), "floorPlan");
    });
  }
  if (Array.isArray(listing.videos)) {
    listing.videos.forEach((item) => {
      const row = rowOf(item);
      if (!row) return;
      const poster = rasterPoster(row, legacy) || videoPlaceholderSource(row);
      pushDisplay(items, seen, mediaName(row, "Video"), poster, "poster");
    });
  }
  return items;
}

/** Stored poster image, or the placeholder key when the video has none. */
export function ownerPosterSource(row: Record<string, unknown>): string {
  return rasterPoster(row) || videoPlaceholderSource(row);
}

/**
 * Locked owner studio set. Same rasters and video slots as the public share.
 * A video with no stored poster keeps a placeholder slot. The MP4 is not
 * the fetch target.
 */
export function listingOwnerDisplayItems(listing: ShareListing): ShareDisplayItem[] {
  const items = [...shareDisplayItems(listing)];
  const seen = new Set(items.map((item) => item.sourceUrl));
  if (!Array.isArray(listing.videos)) return items;
  listing.videos.forEach((item) => {
    const row = rowOf(item);
    if (!row || rasterPoster(row)) return;
    pushDisplay(items, seen, mediaName(row, "Video"), videoPlaceholderSource(row), "poster");
  });
  return items;
}

function isGalleryFloor(row: Record<string, unknown>): boolean {
  const type = text(row.type).toLowerCase();
  const category = text(row.category).toLowerCase();
  return type === "floorplan" || type === "floor-plan" || category === "floorplan" || category === "floor-plan";
}

/**
 * Locked gallery set, in media-item order: raster photos and floor-plan
 * images, then one poster per video. PDF, zip, and raw files are omitted.
 */
export function galleryOwnerDisplayItems(media: unknown[]): ShareDisplayItem[] {
  const items: ShareDisplayItem[] = [];
  const seen = new Set<string>();
  const rows = media.map(rowOf).filter((row): row is Record<string, unknown> => Boolean(row));
  for (const row of rows) {
    const type = text(row.type).toLowerCase();
    if (type === "video" || type === "reel" || type === "matterport" || type === "tour" || type === "file" || type === "pdf") continue;
    const source = rasterShareSource(row);
    if (!source) continue;
    const floor = isGalleryFloor(row);
    pushDisplay(items, seen, mediaName(row, floor ? "Floor plan" : "Photo"), source, floor ? "floorPlan" : "image");
  }
  for (const row of rows) {
    const type = text(row.type).toLowerCase();
    if (type !== "video" && type !== "reel") continue;
    const poster = rasterPoster(row) || videoPlaceholderSource(row);
    pushDisplay(items, seen, mediaName(row, "Video"), poster, "poster");
  }
  return items;
}

/** Images and floor plans a share page would show. Posters are not photos. */
export function shareRasterCount(listing: ShareListing, legacyDropTagged = false): number {
  return shareDisplayItems(listing, { legacyDropTagged }).filter((item) => item.kind === "image" || item.kind === "floorPlan").length;
}

function displayMedia(listingId: string, index: number, name: string): StudioMedia {
  const url = shareDisplayPath(listingId, index);
  return { url, displayUrl: url, name };
}

function posterIndex(row: Record<string, unknown>, items: ShareDisplayItem[]): number {
  const poster = rasterPoster(row) || videoPlaceholderSource(row);
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
    if (playback && (isUnbranded(row) || isMls(row))) continue;
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
