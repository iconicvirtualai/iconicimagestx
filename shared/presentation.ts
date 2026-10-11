/**
 * Private listing presentation.
 * Staff mint an unguessable token. The public page reads photos already
 * stored on the listing, its linked gallery, or media-library folders.
 * This module does not send email or SMS.
 */

import { displaySafeImageUrl, originalNeedlesFor } from "./clientGalleryLink";
import { frameFromListingImage, listingAddressLabel } from "./iconicStudio";
import { hiddenPresentationKeys, rowHiddenFromPresentation } from "./portalListingDetail";
import { stripPublicMeta } from "./siteSeo";

export const PRESENTATION_PREVIEW_TOKEN = "preview";
export const PRESENTATION_PATH = "/present";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,80}$/;
const RAW_EXT = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const SKIP_TYPES = new Set(["video", "reel", "tour", "matterport", "file", "document"]);

export interface PresentationPhoto {
  id: string;
  url: string;
  alt: string;
  room: string;
}

export interface PresentationRoom {
  name: string;
  count: number;
}

export interface PresentationMeta {
  title: string;
  description: string;
  image: string;
  url: string;
}

export interface PublicPresentation {
  token: string;
  listingId: string | null;
  seeded: boolean;
  enabled: boolean;
  address: string;
  street: string;
  locality: string;
  agentName: string;
  clientName: string;
  price: string;
  beds: string;
  baths: string;
  photos: PresentationPhoto[];
  rooms: PresentationRoom[];
  meta: PresentationMeta;
}

export interface PresentationSource {
  token: string;
  listing?: Record<string, unknown> | null;
  galleries?: Array<Record<string, unknown>>;
  origin?: string;
}

type RandomBytes = (size: number) => { toString: (encoding: "base64url") => string };

export function presentationPath(token: string): string {
  return `${PRESENTATION_PATH}/${encodeURIComponent(token)}`;
}

export function isPresentationToken(value: string): boolean {
  return value === PRESENTATION_PREVIEW_TOKEN || TOKEN_PATTERN.test(value);
}

export function createPresentationToken(randomBytes: RandomBytes): string {
  return randomBytes(18).toString("base64url");
}

export function safePresentationUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;
  if (trimmed.startsWith("/")) {
    if (trimmed.includes("..")) return null;
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanLabel(value: string): string {
  return value.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function roomFromFields(row: Record<string, unknown>, folders: Map<string, string>): string {
  for (const key of ["room", "roomName", "roomType", "scene"]) {
    const value = text(row[key]);
    if (value && value.length <= 48 && !IMAGE_EXT.test(value) && !RAW_EXT.test(value)) return value;
  }
  const folderId = text(row.folderId);
  if (folderId && folders.has(folderId)) return folders.get(folderId) || "";
  return "";
}

function folderMap(listing: Record<string, unknown> | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const folders = listing?.mediaFolders;
  if (!Array.isArray(folders)) return map;
  for (const item of folders) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = text(row.id);
    const name = text(row.name);
    if (id && name) map.set(id, name);
  }
  return map;
}

function isRawPath(path: string, name: string): boolean {
  return RAW_EXT.test(name) || RAW_EXT.test(path) || path.includes("/raw/");
}

interface DraftPhoto {
  id: string;
  url: string;
  alt: string;
  room: string;
  order: number;
  index: number;
  path: string;
  sourcePath: string;
  final: boolean;
}

function pushDraft(
  drafts: DraftPhoto[],
  row: Record<string, unknown>,
  index: number,
  folders: Map<string, string>,
  needles: string[],
  fallbackRoom = "",
) {
  const path = text(row.path) || text(row.storagePath);
  const name = text(row.name) || text(row.fileName) || text(row.title) || path.split("/").pop() || "";
  const type = text(row.type).toLowerCase();
  if (type && SKIP_TYPES.has(type)) return;
  if (isRawPath(path, name)) return;
  const contentType = text(row.contentType).toLowerCase();
  const looksLikeImage = !contentType
    || contentType.startsWith("image/")
    || IMAGE_EXT.test(name)
    || IMAGE_EXT.test(path);
  if (!looksLikeImage) return;
  if (contentType && !contentType.startsWith("image/") && !IMAGE_EXT.test(name)) return;
  const url = displaySafeImageUrl(row, needles);
  if (!url) return;
  const room = roomFromFields(row, folders) || fallbackRoom;
  const order = typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index;
  const final = row.studioApproved === true || text(row.studioRole) === "final" || path.includes("/finals/");
  drafts.push({
    id: text(row.id) || path || url,
    url,
    alt: room ? `${room} photograph` : "Listing photograph",
    room,
    order,
    index,
    path,
    sourcePath: text(row.sourcePath),
    final,
  });
}

function listingDrafts(listing: Record<string, unknown> | null | undefined, hidden: Set<string>, needles: string[]): DraftPhoto[] {
  if (!listing || !Array.isArray(listing.images)) return [];
  const folders = folderMap(listing);
  const drafts: DraftPhoto[] = [];
  listing.images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    if (!frame || frame.raw || !frame.previewable) return;
    const row = item && typeof item === "object" ? { ...(item as Record<string, unknown>) } : {};
    row.url = row.url || frame.url;
    row.path = row.path || frame.path;
    row.name = row.name || frame.name;
    row.contentType = row.contentType || frame.contentType;
    row.id = row.id || frame.id;
    if (rowHiddenFromPresentation(row, hidden)) return;
    pushDraft(drafts, row, index, folders, needles);
  });
  return drafts;
}

function galleryDrafts(galleries: Array<Record<string, unknown>> | undefined, start: number, hidden: Set<string>, needles: string[]): DraftPhoto[] {
  const drafts: DraftPhoto[] = [];
  let index = start;
  for (const gallery of galleries || []) {
    const buckets = [gallery.mediaItems, gallery.images];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const item of bucket) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (rowHiddenFromPresentation(row, hidden)) continue;
        pushDraft(drafts, row, index, new Map(), needles);
        index += 1;
      }
    }
  }
  return drafts;
}

function preferFinals(drafts: DraftPhoto[]): DraftPhoto[] {
  const finals = drafts.filter((item) => item.final);
  if (finals.length === 0) return drafts;
  const replaced = new Set(finals.map((item) => item.sourcePath).filter(Boolean));
  const finalPaths = new Set(finals.map((item) => item.path).filter(Boolean));
  return drafts.filter((item) => {
    if (item.final) return true;
    if (item.path && replaced.has(item.path)) return false;
    if (item.path && finalPaths.has(item.path)) return false;
    return true;
  });
}

function dedupe(drafts: DraftPhoto[]): PresentationPhoto[] {
  const seen = new Set<string>();
  const photos: PresentationPhoto[] = [];
  const sorted = [...drafts].sort((a, b) => a.order - b.order || a.index - b.index);
  for (const item of sorted) {
    const key = item.path || item.url;
    if (seen.has(key) || seen.has(item.url)) continue;
    seen.add(key);
    seen.add(item.url);
    photos.push({
      id: item.id,
      url: item.url,
      alt: item.alt,
      room: item.room,
    });
  }
  return photos.slice(0, 200);
}

function presentationMediaRows(source: PresentationSource): unknown[] {
  const rows: unknown[] = [];
  const listingImages = source.listing?.images;
  if (Array.isArray(listingImages)) rows.push(...listingImages);
  for (const gallery of source.galleries || []) {
    if (Array.isArray(gallery.mediaItems)) rows.push(...gallery.mediaItems);
    if (Array.isArray(gallery.images)) rows.push(...gallery.images);
  }
  return rows;
}

export function collectPresentationPhotos(source: PresentationSource): PresentationPhoto[] {
  const hidden = hiddenPresentationKeys(source.listing);
  const needles = originalNeedlesFor(presentationMediaRows(source));
  const fromListing = listingDrafts(source.listing, hidden, needles);
  const fromGalleries = galleryDrafts(source.galleries, fromListing.length, hidden, needles);
  return dedupe(preferFinals([...fromListing, ...fromGalleries]));
}

export function presentationRooms(photos: PresentationPhoto[]): PresentationRoom[] {
  const rooms: PresentationRoom[] = [];
  for (const photo of photos) {
    const name = photo.room.trim();
    if (!name) continue;
    const last = rooms[rooms.length - 1];
    if (last && last.name.toLowerCase() === name.toLowerCase()) last.count += 1;
    else rooms.push({ name, count: 1 });
  }
  return rooms;
}

function addressParts(listing: Record<string, unknown> | null | undefined): { address: string; street: string; locality: string } {
  const source = listing?.address ?? listing?.shootLocation ?? listing?.propertyAddress;
  if (typeof source === "string" && source.trim()) {
    return { address: source.trim(), street: source.trim(), locality: "" };
  }
  if (source && typeof source === "object") {
    const row = source as Record<string, unknown>;
    const street = text(row.street);
    const locality = [text(row.city), [text(row.state), text(row.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const formatted = text(row.formatted);
    const address = formatted || [street, locality].filter(Boolean).join(", ");
    if (address) return { address, street: street || address, locality: street ? locality : "" };
  }
  const property = text(listing?.propertyAddress);
  if (property) return { address: property, street: property, locality: "" };
  const labeled = listingAddressLabel({
    address: listing?.address,
    shootLocation: listing?.shootLocation,
  });
  if (labeled && labeled !== "Untitled listing") return { address: labeled, street: labeled, locality: "" };
  return { address: "", street: "", locality: "" };
}

function agentNameOf(listing: Record<string, unknown> | null | undefined): string {
  if (!listing) return "";
  const direct = text(listing.agentName) || text(listing.listingAgent);
  if (direct) return direct;
  const agent = listing.agent;
  if (agent && typeof agent === "object") return text((agent as Record<string, unknown>).name);
  if (typeof agent === "string") return agent.trim();
  return "";
}

function priceOf(listing: Record<string, unknown> | null | undefined): string {
  const raw = listing?.listPrice ?? listing?.price;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(raw);
  }
  const value = text(raw);
  if (!value) return "";
  if (value.startsWith("$")) return value;
  const numeric = Number(value.replace(/[$,]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric);
  }
  return "";
}

function countOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const raw = text(value);
  return raw;
}

function absoluteUrl(origin: string, url: string): string {
  if (!url) return "";
  if (url.startsWith("/")) return `${origin.replace(/\/$/, "")}${url}`;
  return url;
}

export function buildPresentation(source: PresentationSource): PublicPresentation | null {
  const listing = source.listing || null;
  if (listing && listing.presentationEnabled === false) return null;
  const photos = collectPresentationPhotos(source);
  const { address, street, locality } = addressParts(listing);
  const agentName = agentNameOf(listing);
  // Share links are advertising pages. The client name stays off this payload.
  const clientName = "";
  const origin = source.origin || "";
  const path = presentationPath(source.token);
  const pageUrl = origin ? `${origin.replace(/\/$/, "")}${path}` : path;
  const titleAddress = address || "Private presentation";
  const description = photos.length
    ? `${photos.length} photograph${photos.length === 1 ? "" : "s"}${address ? ` of ${address}` : ""}. A private presentation from Iconic Images.`
    : "A private listing presentation from Iconic Images.";
  return {
    token: source.token,
    listingId: text(listing?.id) || null,
    seeded: false,
    enabled: true,
    address,
    street,
    locality,
    agentName,
    clientName,
    price: priceOf(listing),
    beds: countOf(listing?.bedrooms),
    baths: countOf(listing?.bathrooms),
    photos,
    rooms: presentationRooms(photos),
    meta: {
      title: `${titleAddress} · Iconic Images`,
      description,
      image: absoluteUrl(origin, photos[0]?.url || ""),
      url: pageUrl,
    },
  };
}

const SEEDED_PHOTOS: Array<{ src: string; room: string; alt: string }> = [
  { src: "/media/photos/luxury-exterior.jpg", room: "Exterior", alt: "Twilight exterior of a luxury home" },
  { src: "/media/photos/drone-hero.jpg", room: "Aerial", alt: "Aerial view over the property" },
  { src: "/media/before-after/aerial-estate.jpg", room: "Grounds", alt: "Aerial view of the estate and grounds" },
  { src: "/media/before-after/twilight-pool-lifestyle.jpg", room: "Rear pool", alt: "Rear pool and patio at twilight" },
  { src: "/media/before-after/pavilion-lifestyle.jpg", room: "Pavilion", alt: "Pool pavilion and outdoor lounge" },
  { src: "/media/photos/luxury-interior.jpg", room: "Interior", alt: "Interior of the home" },
  { src: "/media/photos/listing-living-01.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/listing-living-02.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/listing-living-03.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/listing-living-04.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/staged-living-room.jpg", room: "Living room", alt: "Staged living room" },
  { src: "/media/before-after/living-declutter.jpg", room: "Living room", alt: "Living room prepared for the listing" },
  { src: "/media/before-after/primary-suite-staged.jpg", room: "Primary suite", alt: "Primary suite" },
  { src: "/media/before-after/aerial-estate-close.jpg", room: "Aerial", alt: "Closer aerial of the home" },
];

/** Staff demo when Firebase is not attached. No agent name and no street address. */
export function seededPresentation(origin = ""): PublicPresentation {
  const photos = SEEDED_PHOTOS.map((item, index) => ({
    id: `seed-${index + 1}`,
    url: item.src,
    alt: item.alt,
    room: item.room,
  }));
  const path = presentationPath(PRESENTATION_PREVIEW_TOKEN);
  const pageUrl = origin ? `${origin.replace(/\/$/, "")}${path}` : path;
  return {
    token: PRESENTATION_PREVIEW_TOKEN,
    listingId: null,
    seeded: true,
    enabled: true,
    address: "",
    street: "",
    locality: "",
    agentName: "",
    clientName: "",
    price: "",
    beds: "",
    baths: "",
    photos,
    rooms: presentationRooms(photos),
    meta: {
      title: "Sample presentation · Iconic Images",
      description: `${photos.length} photographs. A private presentation from Iconic Images.`,
      image: absoluteUrl(origin, photos[0]?.url || ""),
      url: pageUrl,
    },
  };
}

export function injectPresentationMeta(html: string, meta: PresentationMeta): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="robots" content="noindex, nofollow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : "",
  ].filter(Boolean).join("\n    ");

  let next = stripPublicMeta(html).replace(/<title>[\s\S]*?<\/title>/gi, "");
  if (next.includes("</head>")) {
    next = next.replace("</head>", `    ${tags}\n  </head>`);
  } else {
    next = `${tags}\n${next}`;
  }
  return next;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
