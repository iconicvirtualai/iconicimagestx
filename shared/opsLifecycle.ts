/**
 * Admin shoot lifecycle.
 * Delivery, the photographer list, and the upload queue were three lists of
 * the same jobs. A shoot lives in one stage: scheduled, uploading and editing,
 * review, or delivered. Old routes redirect here and keep their query string.
 * This module does not upload, send email, or write a gallery.
 */

import { buildPhotographerPortal, type PhotographerJobCard, type PhotographerStudioJob } from "./photographerPortal.ts";
import type { MediaDeliveryRow } from "./mediaDelivery.ts";

export const OPS_PATH = "/admin/ops";
export const OPS_PREVIEW_PATH = "/admin/ops/preview";

export const OPS_STAGES = ["shoots", "uploads", "review", "delivered"] as const;
export type OpsStage = (typeof OPS_STAGES)[number];

export const OPS_STAGE_LABEL: Record<OpsStage, string> = {
  shoots: "Shoots",
  uploads: "Uploads and editing",
  review: "Review and approve",
  delivered: "Delivered",
};

export const OPS_STAGE_DETAIL: Record<OpsStage, string> = {
  shoots: "Scheduled and assigned",
  uploads: "Photographer uploads, Studio, HDR and cull",
  review: "Studio review and the gallery hold",
  delivered: "With the client",
};

const DELIVERED_LISTING = new Set(["delivered", "delivered_paid", "delivered_unpaid"]);

export interface EditingDesk {
  hdr: number;
  cull: number;
  studio: number;
  line: string;
}

export interface OpsJob {
  id: string;
  listingId: string | null;
  address: string;
  clientName: string;
  photographerName: string;
  stage: OpsStage;
  card: PhotographerJobCard | null;
  delivery: MediaDeliveryRow | null;
  desk: EditingDesk;
}

export function isOpsStage(value: string | null | undefined): value is OpsStage {
  return Boolean(value && (OPS_STAGES as readonly string[]).includes(value));
}

/** Delivery filter bookmarks land on the matching stage. Other params stay. */
export function stageFromDeliveryFilter(filter: string | null): OpsStage {
  if (filter === "delivered") return "delivered";
  if (filter === "undelivered") return "review";
  if (filter === "pending") return "uploads";
  return "review";
}

function withParams(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Old Photography tabs. Every original query key is copied onto the new URL.
 * Photographers keep their portal. Admins and coordinators leave it for Shoots.
 */
export function legacyOpsTarget(input: { pathname: string; search: string; role: string }): string {
  const path = input.pathname.split("?")[0].split("#")[0];
  const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
  if (path === "/admin/upload" || path.startsWith("/admin/upload/")) {
    if (input.role === "photographer") return withParams("/admin/photographer", params);
    if (!isOpsStage(params.get("stage"))) params.set("stage", "uploads");
    return withParams(OPS_PATH, params);
  }
  if (path === "/admin/delivery" || path.startsWith("/admin/delivery/")) {
    if (!isOpsStage(params.get("stage"))) params.set("stage", stageFromDeliveryFilter(params.get("filter")));
    return withParams(OPS_PATH, params);
  }
  if (path === "/admin/photographer" || path.startsWith("/admin/photographer/")) {
    if (input.role === "photographer") return withParams("/admin/photographer", params);
    if (!isOpsStage(params.get("stage"))) params.set("stage", "shoots");
    return withParams(OPS_PATH, params);
  }
  if (!isOpsStage(params.get("stage"))) params.set("stage", "shoots");
  return withParams(OPS_PATH, params);
}

export function editingDesk(jobs: PhotographerStudioJob[]): EditingDesk {
  let hdr = 0;
  let cull = 0;
  let studio = 0;
  for (const job of jobs) {
    const blob = `${text(job.type)} ${text(job.label)} ${text(job.origin)}`.toLowerCase();
    if (blob.includes("hdr")) hdr += 1;
    else if (blob.includes("cull") || blob.includes("raw_ingest") || blob.includes("raw ingest")) cull += 1;
    else studio += 1;
  }
  const parts: string[] = [];
  if (cull) parts.push(`Cull ${cull}`);
  if (hdr) parts.push(`HDR ${hdr}`);
  if (studio) parts.push(`Studio ${studio}`);
  return {
    hdr,
    cull,
    studio,
    line: parts.length
      ? parts.join(" · ")
      : "No HDR or cull job yet. Studio edits from the order after the upload.",
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function photographerName(listing: Record<string, unknown> | undefined): string {
  if (!listing) return "";
  return text(listing.photographerName) || text(listing.assignedPhotographerName);
}

function deliveryRank(row: MediaDeliveryRow): number {
  if (row.deliveryStatus === "undelivered") return 0;
  if (row.deliveryStatus === "pending") return 1;
  return 2;
}

export function opsStageFor(card: PhotographerJobCard | null, delivery: MediaDeliveryRow | null): OpsStage {
  const listingStatus = card?.listingStatus || "";
  if (delivery?.deliveryStatus === "delivered" || DELIVERED_LISTING.has(listingStatus)) return "delivered";
  if (card?.action.kind === "closed") return "delivered";

  const review = (card?.studio.review || 0) > 0
    || (card?.studio.failed || 0) > 0
    || card?.action.kind === "review"
    || card?.action.kind === "done"
    || delivery?.deliveryStatus === "undelivered"
    || (delivery?.studio.review || 0) > 0
    || (delivery?.studio.failed || 0) > 0;
  if (review) return "review";

  const editing = (card?.imageCount || 0) > 0
    || (card?.studio.editing || 0) + (card?.studio.queued || 0) + (card?.studio.waitingOnPhoto || 0) + (card?.studio.approved || 0) > 0
    || (delivery?.mediaCount || 0) > 0
    || (delivery?.studio.active || 0) > 0
    || (card?.action.kind === "upload" && card.when === "past");
  if (editing) return "uploads";
  return "shoots";
}

export function buildOpsBoard(input: {
  listings: Array<Record<string, unknown>>;
  studioJobs?: PhotographerStudioJob[];
  deliveryRows?: MediaDeliveryRow[];
  today?: string;
}): OpsJob[] {
  const studioJobs = input.studioJobs || [];
  const listings = input.listings || [];
  const cards = buildPhotographerPortal({
    listings,
    studioJobs,
    today: input.today,
  });
  const cardIds = new Set(cards.map((card) => card.id));
  const listingById = new Map(listings.map((listing) => [text(listing.id), listing]));
  const deliveryByListing = new Map<string, MediaDeliveryRow>();
  const loose: MediaDeliveryRow[] = [];

  for (const row of input.deliveryRows || []) {
    const listingId = row.listingId || "";
    if (listingId && cardIds.has(listingId)) {
      const current = deliveryByListing.get(listingId);
      if (!current || deliveryRank(row) < deliveryRank(current)) deliveryByListing.set(listingId, row);
      continue;
    }
    loose.push(row);
  }

  const jobs: OpsJob[] = cards.map((card) => {
    const delivery = deliveryByListing.get(card.id) || null;
    const mine = studioJobs.filter((job) => text(job.listingId) === card.id);
    return {
      id: card.id,
      listingId: card.id,
      address: card.address,
      clientName: card.clientName,
      photographerName: photographerName(listingById.get(card.id)),
      stage: opsStageFor(card, delivery),
      card,
      delivery,
      desk: editingDesk(mine),
    };
  });

  for (const row of loose) {
    const id = row.listingId || `gallery:${row.galleryId || row.id}`;
    if (jobs.some((job) => job.id === id || job.delivery?.id === row.id)) continue;
    jobs.push({
      id,
      listingId: row.listingId,
      address: row.address,
      clientName: row.clientName || "No client name",
      photographerName: "",
      stage: opsStageFor(null, row),
      card: null,
      delivery: row,
      desk: editingDesk([]),
    });
  }

  const order: Record<OpsStage, number> = { shoots: 0, uploads: 1, review: 2, delivered: 3 };
  return jobs.sort((a, b) => order[a.stage] - order[b.stage] || a.address.localeCompare(b.address));
}

export function filterOpsStage(jobs: OpsJob[], stage: OpsStage): OpsJob[] {
  return jobs.filter((job) => job.stage === stage);
}

/** Sample board used only when Firebase Admin is not configured. */
export function sampleOpsBoard(today = "2026-10-27"): OpsJob[] {
  return buildOpsBoard({
    today,
    listings: [
      {
        id: "sampleShoot0001",
        status: "scheduled",
        address: "14 Maple Drive, Austin, TX",
        clientName: "Sample Client",
        photographerName: "Sample Photographer",
        apptDate: "2026-11-02",
        apptTime: "10:00 AM",
        appointmentDuration: 90,
        services: ["Showcase"],
        accessInfo: "Lockbox on the gate",
        images: [],
      },
      {
        id: "sampleUpload001",
        status: "uploaded",
        address: "10 Oak Street, Austin, TX",
        clientName: "Sample Client",
        photographerName: "Sample Photographer",
        apptDate: "2026-10-20",
        apptTime: "1:00 PM",
        images: [{ name: "front.jpg" }, { name: "kitchen.jpg" }],
      },
      {
        id: "sampleReview001",
        status: "uploaded",
        address: "22 River Road, Austin, TX",
        clientName: "Sample Client",
        photographerName: "Sample Photographer",
        apptDate: "2026-10-18",
        images: [{ name: "living.jpg" }],
      },
      {
        id: "sampleDone00001",
        status: "delivered",
        address: "8 Cedar Lane, Austin, TX",
        clientName: "Sample Client",
        photographerName: "Sample Photographer",
        apptDate: "2026-10-12",
        images: [{ name: "final.jpg" }],
      },
    ],
    studioJobs: [
      { listingId: "sampleUpload001", status: "processing", origin: "order", type: "photo", sourcePath: "listings/sampleUpload001/photos/front.jpg" },
      { listingId: "sampleUpload001", status: "pending", origin: "order", type: "hdr", label: "HDR", sourcePath: "listings/sampleUpload001/photos/front.jpg" },
      { listingId: "sampleUpload001", status: "pending", origin: "raw_ingest", type: "raw_ingest", label: "Cull", sourcePath: "listings/sampleUpload001/raw/frame.CR2" },
      { listingId: "sampleReview001", status: "review", origin: "order", type: "photo", sourcePath: "listings/sampleReview001/photos/living.jpg" },
      { listingId: "sampleDone00001", status: "approved", origin: "order", type: "photo", sourcePath: "listings/sampleDone00001/photos/final.jpg" },
    ],
    deliveryRows: [
      {
        id: "galleryUpload001",
        galleryId: "galleryUpload001",
        listingId: "sampleUpload001",
        orderId: "orderUpload0001",
        address: "10 Oak Street, Austin, TX",
        clientName: "Sample Client",
        galleryStatus: "editing",
        deliveryStatus: "pending",
        label: "Pending",
        mediaCount: 4,
        studio: { active: 1, review: 0, approved: 0, failed: 0 },
        moves: ["undelivered", "delivered"],
        projectMissing: false,
        galleryMissing: false,
      },
      {
        id: "galleryReview001",
        galleryId: "galleryReview001",
        listingId: "sampleReview001",
        orderId: "orderReview0001",
        address: "22 River Road, Austin, TX",
        clientName: "Sample Client",
        galleryStatus: "ready_for_review",
        deliveryStatus: "undelivered",
        label: "Undelivered",
        mediaCount: 12,
        studio: { active: 0, review: 1, approved: 1, failed: 0 },
        moves: ["pending", "delivered"],
        projectMissing: false,
        galleryMissing: false,
      },
      {
        id: "galleryDone00001",
        galleryId: "galleryDone00001",
        listingId: "sampleDone00001",
        orderId: "orderDone000001",
        address: "8 Cedar Lane, Austin, TX",
        clientName: "Sample Client",
        galleryStatus: "delivered",
        deliveryStatus: "delivered",
        label: "Delivered",
        mediaCount: 30,
        studio: { active: 0, review: 0, approved: 1, failed: 0 },
        moves: ["pending", "undelivered"],
        projectMissing: false,
        galleryMissing: false,
      },
    ],
  });
}
