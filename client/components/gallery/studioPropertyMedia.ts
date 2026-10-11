/**
 * Studio Tours tab: Matterport, floor plans, and aerials.
 * Photos stay on `images`. Videos stay on `videos`. This reader does not
 * look at those arrays, at `files`, or at `downloadUrl`.
 *
 * Bean: these are the only project fields the Tours tab reads. A missing
 * field is skipped. A string is treated as a URL. Arrays may hold strings
 * or objects. An item is kept only when it has an http(s) or root-relative URL.
 *
 * Project fields
 * - Tours: tourUrl, matterportUrl, virtualTourUrl, virtualTour, threeDTourUrl,
 *   tourLink, matterport, matterportTour, tours, virtualTours
 * - Floor plans: floorPlans, floorplans, floorPlan, floorPlanPdf, floorPlanPdfs,
 *   pdfFloorPlans, pdfFloorPlan
 * - Aerials: aerials, aerial, aerialPhotos, aerialPhoto, aerialVideos,
 *   aerialVideo, drone, drones, dronePhotos, droneVideos
 *
 * Item fields
 * - Identity / link: id, url, shareUrl, embedUrl, href
 * - Name: name, fileName, title
 * - Kind: type, category, assetType, variant, provider
 * - Mime: contentType, mimeType, mime
 * - Preview: thumbnailUrl, previewUrl, poster, thumbnail, preview,
 *   firstPageUrl, pagePreviewUrl
 *
 * Kind is decided from category, type, assetType, variant, provider, mime,
 * file extension, and the URL host. A host of matterport.com (or a subdomain
 * such as my.matterport.com) is a Matterport tour.
 */

export const STUDIO_TOUR_FIELDS = [
  "tourUrl",
  "matterportUrl",
  "virtualTourUrl",
  "virtualTour",
  "threeDTourUrl",
  "tourLink",
  "matterport",
  "matterportTour",
  "tours",
  "virtualTours",
] as const;

export const STUDIO_FLOOR_PLAN_FIELDS = [
  "floorPlans",
  "floorplans",
  "floorPlan",
  "floorPlanPdf",
  "floorPlanPdfs",
  "pdfFloorPlans",
  "pdfFloorPlan",
] as const;

export const STUDIO_AERIAL_FIELDS = [
  "aerials",
  "aerial",
  "aerialPhotos",
  "aerialPhoto",
  "aerialVideos",
  "aerialVideo",
  "drone",
  "drones",
  "dronePhotos",
  "droneVideos",
] as const;

export const STUDIO_ITEM_FIELDS = [
  "id",
  "url",
  "shareUrl",
  "embedUrl",
  "href",
  "name",
  "fileName",
  "title",
  "type",
  "category",
  "assetType",
  "variant",
  "provider",
  "contentType",
  "mimeType",
  "mime",
  "thumbnailUrl",
  "previewUrl",
  "poster",
  "thumbnail",
  "preview",
  "firstPageUrl",
  "pagePreviewUrl",
] as const;

export type StudioMediaView = "owner" | "public";

export function blockPublicVideoMenu(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export interface StudioTourItem {
  id: string;
  title: string;
  /** Matterport iframe src. Null when the tour is not a Matterport URL. */
  embedUrl: string | null;
  openUrl: string;
}

export interface StudioFloorPlanItem {
  id: string;
  title: string;
  url: string;
  kind: "image" | "pdf" | "video";
  /** First-page thumbnail, when the payload has one. Never the PDF itself. */
  previewUrl: string | null;
}

export interface StudioAerialItem {
  id: string;
  title: string;
  url: string;
  kind: "photo" | "video";
  posterUrl: string | null;
}

export interface StudioPropertyMediaSet {
  tours: StudioTourItem[];
  floorPlans: StudioFloorPlanItem[];
  aerials: StudioAerialItem[];
}

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXT = new Set(["mp4", "m4v", "mov", "webm", "ogv"]);
const TOUR_TYPES = new Set([
  "tour",
  "matterport",
  "virtual-tour",
  "virtual_tour",
  "3d-tour",
  "3d_tour",
  "3dtour",
]);
const AERIAL_TYPES = new Set([
  "aerial",
  "aerial-photo",
  "aerial-video",
  "aerial_photo",
  "aerial_video",
  "drone",
]);
const FLOOR_TYPES = new Set(["floorplan", "floor-plan", "floor_plan", "floor plan"]);
const PREVIEW_KEYS = [
  "thumbnailUrl",
  "previewUrl",
  "poster",
  "thumbnail",
  "preview",
  "firstPageUrl",
  "pagePreviewUrl",
] as const;
const LINK_KEYS = ["shareUrl", "url", "href", "embedUrl"] as const;

type Source = "tour" | "floor" | "aerial";
type Bucket =
  | "tour"
  | "floorplan-image"
  | "floorplan-pdf"
  | "floorplan-video"
  | "aerial-photo"
  | "aerial-video";

interface Candidate {
  bucket: Bucket;
  id: string;
  title: string;
  url: string;
  embedUrl: string | null;
  previewUrl: string | null;
}

export function readStudioPropertyMedia(project: unknown): StudioPropertyMediaSet {
  const record =
    project && typeof project === "object"
      ? (project as Record<string, unknown>)
      : {};
  const candidates = [
    ...collect(record, STUDIO_TOUR_FIELDS, "tour"),
    ...collect(record, STUDIO_FLOOR_PLAN_FIELDS, "floor"),
    ...collect(record, STUDIO_AERIAL_FIELDS, "aerial"),
  ];
  const seen = new Set<string>();
  const tours: StudioTourItem[] = [];
  const floorPlans: StudioFloorPlanItem[] = [];
  const aerials: StudioAerialItem[] = [];

  candidates.forEach((candidate, index) => {
    const key = dedupKey(candidate.embedUrl || candidate.url);
    if (seen.has(key)) return;
    seen.add(key);
    const id = candidate.id || `${candidate.bucket}-${index + 1}`;
    if (candidate.bucket === "tour") {
      tours.push({
        id,
        title: candidate.title,
        embedUrl: candidate.embedUrl,
        openUrl: candidate.url,
      });
      return;
    }
    if (candidate.bucket === "aerial-photo" || candidate.bucket === "aerial-video") {
      aerials.push({
        id,
        title: candidate.title,
        url: candidate.url,
        kind: candidate.bucket === "aerial-video" ? "video" : "photo",
        posterUrl: candidate.previewUrl,
      });
      return;
    }
    floorPlans.push({
      id,
      title: candidate.title,
      url: candidate.url,
      kind:
        candidate.bucket === "floorplan-video"
          ? "video"
          : candidate.bucket === "floorplan-image"
            ? "image"
            : "pdf",
      previewUrl: candidate.bucket === "floorplan-pdf" ? candidate.previewUrl : null,
    });
  });

  return { tours, floorPlans, aerials };
}

function collect(
  project: Record<string, unknown>,
  keys: readonly string[],
  source: Source,
): Candidate[] {
  const found: Candidate[] = [];
  keys.forEach((key) => {
    const value = project[key];
    const entries = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
    entries.forEach((entry, index) => {
      const candidate = toCandidate(entry, source, key, `${key}-${index + 1}`);
      if (candidate) found.push(candidate);
    });
  });
  return found;
}

function toCandidate(
  entry: unknown,
  source: Source,
  field: string,
  fallbackId: string,
): Candidate | null {
  const row = rowOf(entry);
  if (!row) return null;
  const links = LINK_KEYS.map((key) => httpUrl(row[key])).filter(Boolean);
  const embedUrl =
    matterportUrl(httpUrl(row.embedUrl)) || links.map(matterportUrl).find(Boolean) || null;
  const file = fileKind(row, links);
  const bucket = classify(row, source, field, file, Boolean(embedUrl));
  const openUrl = bucket === "tour" ? tourOpenUrl(links, embedUrl) : links[0] || "";
  if (!openUrl) return null;
  return {
    bucket,
    id: raw(row.id) || fallbackId,
    title: titleOf(row, bucket),
    url: openUrl,
    embedUrl: bucket === "tour" ? embedUrl : null,
    previewUrl: imagePreview(row),
  };
}

function tourOpenUrl(links: string[], embedUrl: string | null): string {
  const page = links.find((link) => !VIDEO_EXT.has(extOf(link)) && extOf(link) !== "pdf");
  return page || embedUrl || "";
}

function classify(
  row: Record<string, unknown>,
  source: Source,
  field: string,
  file: "video" | "pdf" | "image" | "other",
  matterport: boolean,
): Bucket {
  const videoField = field === "aerialVideos" || field === "aerialVideo" || field === "droneVideos";
  const pdfField =
    field === "floorPlanPdf" ||
    field === "floorPlanPdfs" ||
    field === "pdfFloorPlans" ||
    field === "pdfFloorPlan";
  const tour =
    (matterport || hasToken(row, TOUR_TYPES) || providerIsMatterport(row)) &&
    file !== "video" &&
    file !== "pdf" &&
    file !== "image";
  if (tour) return "tour";
  if (source === "aerial" || hasToken(row, AERIAL_TYPES) || videoField) {
    if (file === "pdf") return "floorplan-pdf";
    if (file === "image") return "aerial-photo";
    if (file === "video" || videoField || token(row, "aerial-video") || token(row, "aerial_video"))
      return "aerial-video";
    return "aerial-photo";
  }
  if (file === "video") return "floorplan-video";
  if (file === "image") return "floorplan-image";
  if (file === "pdf" || pdfField || source === "floor" || hasToken(row, FLOOR_TYPES))
    return "floorplan-pdf";
  return "tour";
}

function fileKind(
  row: Record<string, unknown>,
  links: string[],
): "video" | "pdf" | "image" | "other" {
  const mime = mimeOf(row);
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  const type = lower(row.type);
  if (type === "video" || type === "reel" || type === "aerial-video" || type === "aerial_video")
    return "video";
  if (type === "pdf" || type === "application/pdf") return "pdf";
  if (
    type === "photo" ||
    type === "image" ||
    type === "aerial-photo" ||
    type === "aerial_photo" ||
    type.startsWith("image/")
  ) {
    return "image";
  }
  const ext = extensionOf(row, links);
  if (VIDEO_EXT.has(ext)) return "video";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  return "other";
}

function imagePreview(row: Record<string, unknown>): string | null {
  for (const key of PREVIEW_KEYS) {
    const url = httpUrl(row[key]);
    if (!url || extOf(url) === "pdf") continue;
    return url;
  }
  return null;
}

function matterportUrl(url: string): string | null {
  return url && isMatterportHost(url) ? url : null;
}

function isMatterportHost(url: string): boolean {
  if (!url || url.startsWith("/")) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "matterport.com" || host.endsWith(".matterport.com");
  } catch {
    return false;
  }
}

function providerIsMatterport(row: Record<string, unknown>): boolean {
  return lower(row.provider).includes("matterport");
}

function hasToken(row: Record<string, unknown>, tokens: Set<string>): boolean {
  return [row.type, row.category, row.assetType, row.variant].some((value) =>
    tokens.has(lower(value)),
  );
}

function token(row: Record<string, unknown>, value: string): boolean {
  return [row.type, row.category, row.assetType, row.variant].some(
    (item) => lower(item) === value,
  );
}

function titleOf(row: Record<string, unknown>, bucket: Bucket): string {
  const name = raw(row.fileName) || raw(row.title) || raw(row.name);
  if (name && !/^https?:\/\//i.test(name)) return name;
  if (bucket === "tour") return "3D tour";
  if (bucket === "aerial-photo" || bucket === "aerial-video") return "Aerial";
  return "Floor plan";
}

function mimeOf(row: Record<string, unknown>): string {
  return lower(row.contentType) || lower(row.mimeType) || lower(row.mime);
}

function extensionOf(row: Record<string, unknown>, links: string[]): string {
  return (
    extOf(raw(row.fileName)) ||
    extOf(raw(row.name)) ||
    extOf(raw(row.title)) ||
    links.map(extOf).find(Boolean) ||
    ""
  );
}

function extOf(value: string): string {
  const path = value.split("?")[0]?.split("#")[0] || "";
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    decoded = path;
  }
  const match = decoded.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function rowOf(entry: unknown): Record<string, unknown> | null {
  if (typeof entry === "string") {
    const url = httpUrl(entry);
    return url ? { url } : null;
  }
  if (entry && typeof entry === "object") return entry as Record<string, unknown>;
  return null;
}

function httpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\")) return "";
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function dedupKey(url: string): string {
  return url.split("#")[0].replace(/\/$/, "");
}

function raw(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return raw(value).toLowerCase();
}
