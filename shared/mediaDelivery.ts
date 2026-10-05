/**
 * Staff media delivery queue.
 * Labels are Iconic: Pending, Undelivered, Delivered.
 * Status is derived from the gallery document the client already uses.
 * Mark Delivered is not a silent status write — the server calls the
 * existing gallery deliver path, including the order release hold.
 * This module does not send email or SMS and does not run image edits.
 */

import { listingAddressLabel } from "./iconicStudio";

export const MEDIA_DELIVERY_STATUSES = ["pending", "undelivered", "delivered"] as const;
export type MediaDeliveryStatus = (typeof MEDIA_DELIVERY_STATUSES)[number];

export const MEDIA_DELIVERY_LABELS: Record<MediaDeliveryStatus, "Pending" | "Undelivered" | "Delivered"> = {
  pending: "Pending",
  undelivered: "Undelivered",
  delivered: "Delivered",
};

const EARLY_GALLERY_STATUSES = new Set(["", "pending_upload", "raw_uploaded", "editing"]);
const RELEASED_QUEUE_STATUSES = new Set(["delivered", "approved"]);

export interface MediaDeliveryStudio {
  active: number;
  review: number;
  approved: number;
  failed: number;
}

export interface MediaDeliveryRow {
  id: string;
  galleryId: string | null;
  listingId: string | null;
  orderId: string | null;
  address: string;
  clientName: string;
  galleryStatus: string;
  deliveryStatus: MediaDeliveryStatus;
  label: (typeof MEDIA_DELIVERY_LABELS)[MediaDeliveryStatus];
  mediaCount: number;
  studio: MediaDeliveryStudio;
  moves: MediaDeliveryStatus[];
}

export interface DeliveryGallerySource {
  id: string;
  status?: string;
  listingId?: string;
  orderId?: string;
  clientName?: string;
  address?: unknown;
  addressLabel?: unknown;
  title?: unknown;
  mediaCount?: number;
}

export interface DeliveryListingSource {
  id: string;
  address?: unknown;
  shootLocation?: unknown;
  galleryId?: string;
}

export interface DeliveryJobSource {
  id?: string;
  listingId?: string;
  status?: string;
}

export function isMediaDeliveryStatus(value: string): value is MediaDeliveryStatus {
  return (MEDIA_DELIVERY_STATUSES as readonly string[]).includes(value);
}

/**
 * Client visibility is the queue label.
 * approved and delivered both show media on the public gallery, so both are Delivered.
 * ready_for_review is on file and still hidden, so it is Undelivered.
 * Upload and editing stay Pending.
 */
export function mediaDeliveryFromGalleryStatus(status: string | undefined | null): MediaDeliveryStatus {
  const value = String(status || "").trim();
  if (RELEASED_QUEUE_STATUSES.has(value)) return "delivered";
  if (value === "ready_for_review") return "undelivered";
  if (EARLY_GALLERY_STATUSES.has(value)) return "pending";
  return "undelivered";
}

/**
 * Gallery status written for Pending and Undelivered.
 * Delivered is intentionally absent so callers use the gallery deliver route.
 */
export function galleryStatusForDeliveryMove(
  target: Exclude<MediaDeliveryStatus, "delivered">,
  hasMedia: boolean,
): string {
  if (target === "undelivered") return "ready_for_review";
  return hasMedia ? "editing" : "pending_upload";
}

export function deliveryMoveTargets(input: {
  galleryId?: string | null;
  deliveryStatus: MediaDeliveryStatus;
  galleryStatus?: string;
}): MediaDeliveryStatus[] {
  if (!input.galleryId) return [];
  const targets: MediaDeliveryStatus[] = [];
  if (input.deliveryStatus !== "pending") targets.push("pending");
  if (input.deliveryStatus !== "undelivered") targets.push("undelivered");
  if (input.galleryStatus !== "delivered") targets.push("delivered");
  return targets;
}

export function studioQueueLine(studio: MediaDeliveryStudio): string {
  const parts: string[] = [];
  if (studio.active) parts.push(`${studio.active} still editing`);
  if (studio.review) parts.push(`${studio.review} in review`);
  if (studio.approved) parts.push(`${studio.approved} approved`);
  if (studio.failed) parts.push(`${studio.failed} failed`);
  if (!parts.length) return "No Iconic Studio jobs on this listing.";
  return `Iconic Studio: ${parts.join(" · ")}`;
}

export function deliveryNotice(row: Pick<MediaDeliveryRow, "galleryId" | "galleryStatus">): string | null {
  if (!row.galleryId) {
    return "No gallery is linked yet, so this stays Pending.";
  }
  if (row.galleryStatus === "approved") {
    return "The client can open this gallery. Mark Delivered sends the gallery notice.";
  }
  if (row.galleryStatus === "delivered") {
    return "The gallery notice is already on this delivery.";
  }
  return null;
}

function emptyStudio(): MediaDeliveryStudio {
  return { active: 0, review: 0, approved: 0, failed: 0 };
}

export function tallyStudioJobs(jobs: DeliveryJobSource[]): MediaDeliveryStudio {
  const studio = emptyStudio();
  for (const job of jobs) {
    const status = String(job.status || "");
    if (status === "pending" || status === "processing") studio.active += 1;
    else if (status === "review") studio.review += 1;
    else if (status === "approved") studio.approved += 1;
    else if (status === "failed" || status === "rejected") studio.failed += 1;
  }
  return studio;
}

function rowAddress(input: {
  addressLabel?: unknown;
  address?: unknown;
  title?: unknown;
  listing?: DeliveryListingSource | null;
}): string {
  if (typeof input.addressLabel === "string" && input.addressLabel.trim()) return input.addressLabel.trim();
  const fromAddress = listingAddressLabel({ address: input.address });
  if (fromAddress !== "Untitled listing") return fromAddress;
  if (input.listing) {
    const fromListing = listingAddressLabel(input.listing);
    if (fromListing !== "Untitled listing") return fromListing;
  }
  if (typeof input.title === "string" && input.title.trim()) return input.title.trim();
  return "Untitled listing";
}

function listingJobs(jobs: DeliveryJobSource[], listingId: string): DeliveryJobSource[] {
  if (!listingId) return [];
  return jobs.filter((job) => job.listingId === listingId);
}

const STATUS_RANK: Record<MediaDeliveryStatus, number> = {
  undelivered: 0,
  pending: 1,
  delivered: 2,
};

function finalize(row: Omit<MediaDeliveryRow, "moves" | "label" | "deliveryStatus">): MediaDeliveryRow {
  const deliveryStatus = mediaDeliveryFromGalleryStatus(row.galleryStatus);
  const next: MediaDeliveryRow = {
    ...row,
    deliveryStatus,
    label: MEDIA_DELIVERY_LABELS[deliveryStatus],
    moves: [],
  };
  next.moves = deliveryMoveTargets(next);
  return next;
}

export function buildMediaDeliveryQueue(input: {
  galleries: DeliveryGallerySource[];
  listings?: DeliveryListingSource[];
  jobs?: DeliveryJobSource[];
}): MediaDeliveryRow[] {
  const listings = input.listings || [];
  const jobs = input.jobs || [];
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const seenGalleryIds = new Set<string>();
  const galleryListingIds = new Set<string>();

  const rows = input.galleries.map((gallery) => {
    seenGalleryIds.add(gallery.id);
    const listingId = String(gallery.listingId || "").trim();
    if (listingId) galleryListingIds.add(listingId);
    const listing = listingId ? listingById.get(listingId) || null : null;
    const galleryStatus = String(gallery.status || "");
    return finalize({
      id: gallery.id,
      galleryId: gallery.id,
      listingId: listingId || listing?.id || null,
      orderId: String(gallery.orderId || "").trim() || null,
      address: rowAddress({
        addressLabel: gallery.addressLabel,
        address: gallery.address,
        title: gallery.title,
        listing,
      }),
      clientName: String(gallery.clientName || "").trim(),
      galleryStatus,
      mediaCount: Math.max(0, Number(gallery.mediaCount) || 0),
      studio: tallyStudioJobs(listingJobs(jobs, listingId)),
    });
  });

  for (const listing of listings) {
    const linkedGallery = String(listing.galleryId || "").trim();
    if (linkedGallery && seenGalleryIds.has(linkedGallery)) continue;
    if (galleryListingIds.has(listing.id)) continue;
    const studio = tallyStudioJobs(listingJobs(jobs, listing.id));
    const hasStudioWork = studio.active + studio.review + studio.approved + studio.failed > 0;
    if (!hasStudioWork) continue;
    rows.push(finalize({
      id: `listing:${listing.id}`,
      galleryId: null,
      listingId: listing.id,
      orderId: null,
      address: rowAddress({ listing }),
      clientName: "",
      galleryStatus: "",
      mediaCount: 0,
      studio,
    }));
  }

  return rows.sort((a, b) => {
    const rank = STATUS_RANK[a.deliveryStatus] - STATUS_RANK[b.deliveryStatus];
    if (rank !== 0) return rank;
    return a.address.localeCompare(b.address);
  });
}

export function applyMediaDeliveryMove(row: MediaDeliveryRow, target: MediaDeliveryStatus): MediaDeliveryRow {
  if (!row.galleryId || !row.moves.includes(target)) return row;
  const galleryStatus = target === "delivered"
    ? "delivered"
    : galleryStatusForDeliveryMove(target, row.mediaCount > 0);
  const { moves: _moves, label: _label, deliveryStatus: _status, ...rest } = row;
  return finalize({ ...rest, galleryStatus });
}

export function sampleMediaDeliveryRows(): MediaDeliveryRow[] {
  return buildMediaDeliveryQueue({
    galleries: [
      {
        id: "galleryPending1",
        status: "editing",
        listingId: "listingPending1",
        orderId: "orderPending01",
        clientName: "Sample Client",
        addressLabel: "10 Oak Street, Austin, TX",
        mediaCount: 4,
      },
      {
        id: "galleryUndeliver1",
        status: "ready_for_review",
        listingId: "listingReady001",
        orderId: "orderReady0001",
        clientName: "Sample Client",
        addressLabel: "22 River Road, Austin, TX",
        mediaCount: 12,
      },
      {
        id: "galleryDelivered1",
        status: "delivered",
        listingId: "listingDone0001",
        orderId: "orderDone00001",
        clientName: "Sample Client",
        addressLabel: "8 Cedar Lane, Austin, TX",
        mediaCount: 30,
      },
    ],
    listings: [
      { id: "listingPending1", address: "10 Oak Street, Austin, TX" },
      { id: "listingReady001", address: "22 River Road, Austin, TX" },
      { id: "listingDone0001", address: "8 Cedar Lane, Austin, TX" },
      { id: "listingNoGallery", address: "4 Bare Studio, Austin, TX" },
    ],
    jobs: [
      { id: "job-pending", listingId: "listingPending1", status: "pending" },
      { id: "job-review", listingId: "listingReady001", status: "review" },
      { id: "job-approved", listingId: "listingReady001", status: "approved" },
      { id: "job-open", listingId: "listingNoGallery", status: "processing" },
    ],
  });
}
