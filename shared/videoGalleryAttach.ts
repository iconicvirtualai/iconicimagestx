/**
 * Attach a finished studio video to the order's gallery video section.
 * Lookup is by property address or order number. This never notifies the client.
 */

import { recordAddressText } from "./addressText";

export const GALLERY_ATTACH_NOTIFY = false;

export interface GalleryOrderRecord {
  id: string;
  orderNumber?: unknown;
  galleryId?: unknown;
  listingId?: unknown;
  address?: unknown;
  propertyAddress?: unknown;
  shootLocation?: unknown;
  addressLabel?: unknown;
}

export interface GalleryRecord {
  id: string;
  orderId?: unknown;
  listingId?: unknown;
  status?: unknown;
  videoLinks?: unknown;
  mediaItems?: unknown;
}

export interface ListingRecord {
  id: string;
  galleryId?: unknown;
  videos?: unknown;
  address?: unknown;
  propertyAddress?: unknown;
}

export interface GallerySearchHit {
  orderId: string;
  orderNumber: string;
  address: string;
  galleryId: string | null;
  listingId: string | null;
  videoSectionUrl: string | null;
  studioVideoUrl: string | null;
  galleryUrl: string | null;
}

export interface GalleryVideoAttachment {
  id: string;
  url: string;
  storagePath: string;
  fileName: string;
  name: string;
  title: string;
  type: "video";
  category: "reel" | "branded" | "unbranded";
  poster: string | null;
  posterUrl: string | null;
  thumbnailUrl: string | null;
  width: number;
  height: number;
  fps: number;
  presetId: string;
  jobId: string;
  source: "studio-video-editor";
  notifyClient: false;
  downloadable: boolean;
}

const STUDIO_TABS = ["photos", "videos", "tours", "revisions", "ai_studio"] as const;
export type StudioGalleryTabName = (typeof STUDIO_TABS)[number];

export function normalizeOrderQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, "");
}

export function orderNumberText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function searchableOrder(order: GalleryOrderRecord): { number: string; address: string; haystack: string } {
  const number = orderNumberText(order.orderNumber);
  const address = recordAddressText(order);
  const haystack = `${number} ${address} ${order.id}`.toLowerCase();
  return { number, address, haystack };
}

export function orderMatchesQuery(order: GalleryOrderRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return false;
  const compact = normalizeOrderQuery(needle);
  const fields = searchableOrder(order);
  if (fields.haystack.includes(needle)) return true;
  const compactNumber = normalizeOrderQuery(fields.number);
  return Boolean(compactNumber) && (compactNumber.includes(compact) || compact.includes(compactNumber));
}

export function listingVideoSectionUrl(listingId: string | null): string | null {
  if (!listingId) return null;
  return `/admin/listing/${encodeURIComponent(listingId)}?tab=video`;
}

export function studioVideoSectionUrl(listingId: string | null): string | null {
  if (!listingId) return null;
  return `/studio/${encodeURIComponent(listingId)}?tab=videos`;
}

export function galleryPageUrl(galleryId: string | null): string | null {
  if (!galleryId) return null;
  return `/gallery/${encodeURIComponent(galleryId)}`;
}

export function listingFileTabFromSearch(search: string): number | null {
  const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
  if (tab === "video" || tab === "videos") return 1;
  return null;
}

export function studioGalleryTabFromSearch(search: string): StudioGalleryTabName {
  const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
  if (tab === "video") return "videos";
  if (tab && (STUDIO_TABS as readonly string[]).includes(tab)) return tab as StudioGalleryTabName;
  return "photos";
}

export function searchGalleryOrders(orders: readonly GalleryOrderRecord[], query: string): GallerySearchHit[] {
  return orders.filter((order) => orderMatchesQuery(order, query)).slice(0, 12).map((order) => {
    const fields = searchableOrder(order);
    const galleryId = text(order.galleryId);
    const listingId = text(order.listingId);
    return {
      orderId: order.id,
      orderNumber: fields.number,
      address: fields.address,
      galleryId,
      listingId,
      videoSectionUrl: listingVideoSectionUrl(listingId),
      studioVideoUrl: studioVideoSectionUrl(listingId),
      galleryUrl: galleryPageUrl(galleryId),
    };
  });
}

export function resolveGalleryTarget(
  hit: GallerySearchHit,
  galleries: readonly GalleryRecord[],
  listings: readonly ListingRecord[],
): { gallery: GalleryRecord | null; listing: ListingRecord | null; error?: string } {
  const listing = hit.listingId ? listings.find((item) => item.id === hit.listingId) ?? null : null;
  const galleryFromOrder = hit.galleryId ? galleries.find((item) => item.id === hit.galleryId) ?? null : null;
  const galleryFromOrderId = galleries.find((item) => text(item.orderId) === hit.orderId) ?? null;
  const galleryFromListing = listing && text(listing.galleryId)
    ? galleries.find((item) => item.id === text(listing.galleryId)) ?? null
    : galleries.find((item) => text(item.listingId) === hit.listingId) ?? null;
  const gallery = galleryFromOrder || galleryFromOrderId || galleryFromListing;
  if (!gallery && !listing) {
    return { gallery: null, listing: null, error: "This order has no gallery yet. Open the project before adding a video." };
  }
  return { gallery, listing };
}

export function buildGalleryVideoAttachment(input: {
  url: string;
  storagePath: string;
  fileName: string;
  presetId: string;
  jobId: string;
  width: number;
  height: number;
  fps: number;
  poster?: string | null;
}): GalleryVideoAttachment {
  const unbranded = input.presetId === "mls";
  const vertical = input.height > input.width;
  const category = unbranded ? "unbranded" : vertical ? "reel" : "branded";
  const title = unbranded ? "Unbranded MLS video" : vertical ? "Listing reel" : "Listing video";
  return {
    id: `studio_${input.jobId}`,
    url: input.url,
    storagePath: input.storagePath,
    fileName: input.fileName,
    name: input.fileName,
    title,
    type: "video",
    category,
    poster: input.poster ?? null,
    posterUrl: input.poster ?? null,
    thumbnailUrl: input.poster ?? null,
    width: input.width,
    height: input.height,
    fps: input.fps,
    presetId: input.presetId,
    jobId: input.jobId,
    source: "studio-video-editor",
    notifyClient: false,
    downloadable: true,
  };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
