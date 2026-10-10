/**
 * Resolves a staff-shared /studio/:id or /gallery/:id without reading
 * Firestore. The route loads documents with the Admin SDK and passes them here.
 * This does not send email or SMS.
 */

import { addressText } from "./addressText.ts";
import { frameFromListingImage } from "./iconicStudio";
import { clientGalleryDownloadsUnlocked, lockDownloadsOn, requirePaymentOn } from "./paymentAccess";

export const RELEASED_GALLERY_STATUSES = ["delivered", "approved"] as const;

export type GalleryLinkDoc = Record<string, unknown> & { id: string };

export interface ClientGalleryLinkInput {
  id: string;
  /** galleries/{id}, when that document exists. */
  gallery: GalleryLinkDoc | null;
  /** listings/{id}, when that document exists. */
  listing: GalleryLinkDoc | null;
  /** Galleries whose listingId or explicit galleryId points at this listing. */
  relatedGalleries: GalleryLinkDoc[];
  /** orders/{id}, when the shared id is an order and not a gallery or listing. */
  order: GalleryLinkDoc | null;
  /** orderRequests/{id}, same as order. */
  orderRequest: GalleryLinkDoc | null;
  /** Gallery named by the order or order request, already loaded. */
  pointedGallery: GalleryLinkDoc | null;
  /** Listing named by the order or order request, already loaded. */
  pointedListing: GalleryLinkDoc | null;
  /** Galleries found by orderId when the shared id is an order. */
  galleriesByOrderId: GalleryLinkDoc[];
}

export interface StudioMedia {
  url: string;
  name: string;
  /** Full-res or MLS file. Present only on the owner view, and only when downloads are unlocked. */
  downloadUrl?: string;
}

export interface StudioRevision {
  id: string;
  type: string;
  photoIndex: number | null;
  description: string;
  status: string;
  createdAt: string;
}

/**
 * Advertising page for /studio/:id.
 * Display photos, video, tour, floor plan, address, and agent name.
 * No download URLs, invoice, order fields, revisions, or client contact info.
 */
export interface PublicStudioProject {
  id: string;
  address: string;
  agentName: string;
  services: string[];
  images: StudioMedia[];
  videos: StudioMedia[];
  tourUrl: string;
  floorPlans: StudioMedia[];
  notice: string | null;
  /** Marks the share payload so the page does not write it back over the listing. */
  view: "public";
}

/** Owning client or staff. Adds delivery files and client contact on top of the share view. */
export interface OwnerStudioProject extends Omit<PublicStudioProject, "view"> {
  view: "owner";
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  revisions: StudioRevision[];
  lockDownloads: boolean;
  requirePayment: boolean;
  /** True when the owning client may download. Shared links still do not offer downloads. */
  downloadsUnlocked: boolean;
  invoice: { status: string } | null;
  files: StudioMedia[];
}

export type StudioProject = PublicStudioProject | OwnerStudioProject;

export type ClientGalleryLinkResult =
  | {
      ok: true;
      kind: "gallery";
      galleryId: string;
      released: boolean;
      status: string;
      staffNote: string;
    }
  | {
      ok: true;
      kind: "listing";
      openGalleryId: string | null;
      project: StudioProject;
    }
  | {
      ok: false;
      httpStatus: 400 | 403 | 404;
      code: "invalid_id" | "unknown" | "studio_disabled" | "studio_locked" | "dangling_pointer";
      message: string;
    };

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function invalidGalleryLinkMessage(id: string): string | null {
  if (ID_PATTERN.test(id)) return null;
  return `“${id}” is not a gallery or project id. Shared links use the id from Copy Studio Link (/studio/{project id}) or the delivery URL (/gallery/{gallery id}).`;
}

function statusOf(doc: GalleryLinkDoc | null): string {
  return typeof doc?.status === "string" ? doc.status : "";
}

function isReleased(doc: GalleryLinkDoc | null): boolean {
  return RELEASED_GALLERY_STATUSES.includes(statusOf(doc) as (typeof RELEASED_GALLERY_STATUSES)[number]);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpUrl(value: unknown): string {
  const url = text(value);
  return url.startsWith("https://") || url.startsWith("http://") ? url : "";
}

function galleryResult(doc: GalleryLinkDoc, via?: string): ClientGalleryLinkResult {
  const status = statusOf(doc) || "unknown";
  const released = isReleased(doc);
  const prefix = via ? `${via} ` : "";
  const staffNote = released
    ? `${prefix}Gallery ${doc.id} is ${status}. Open /gallery/${doc.id}.`
    : `${prefix}Gallery ${doc.id} exists, but its status is “${status}”. Photos stay hidden until a coordinator sets it to delivered or approved. This is not a missing link. The delivery URL is /gallery/${doc.id}.`;
  return {
    ok: true,
    kind: "gallery",
    galleryId: doc.id,
    released,
    status,
    staffNote,
  };
}

function addressOf(listing: GalleryLinkDoc): string {
  return addressText(listing.addressLabel)
    || addressText(listing.propertyAddress)
    || addressText(listing.address)
    || addressText(listing.shootLocation);
}

function servicesOf(listing: GalleryLinkDoc): string[] {
  if (!Array.isArray(listing.services)) return [];
  return listing.services
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string") {
        return (item as { name: string }).name.trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 24);
}

const PRIVATE_FILE = /\.(zip|pdf|dng|cr2|cr3|nef|nrw|arw|srf|sr2|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic)(\?|$)/i;
const PRIVATE_FOLDER = /\/(raw|downloads?|mls|full|print|zips?)\//i;

function rowOf(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" ? item as Record<string, unknown> : null;
}

/** Delivery files: raw camera files, zips, and anything stored under a download or MLS folder. */
function isPrivateMedia(path: string, name: string, url: string): boolean {
  if (PRIVATE_FOLDER.test(path) || path.includes("/raw/")) return true;
  return PRIVATE_FILE.test(name) || PRIVATE_FILE.test(url);
}

function mediaName(row: Record<string, unknown>, fallback: string): string {
  return text(row.name) || text(row.fileName) || text(row.title) || fallback;
}

function publicImages(listing: GalleryLinkDoc): StudioMedia[] {
  if (!Array.isArray(listing.images)) return [];
  const images: StudioMedia[] = [];
  listing.images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    const url = httpUrl(frame?.url);
    if (!frame || frame.raw || !url) return;
    if (isPrivateMedia(frame.path, frame.name, url)) return;
    images.push({ url, name: frame.name });
  });
  return images.slice(0, 200);
}

function publicVideos(listing: GalleryLinkDoc): StudioMedia[] {
  if (!Array.isArray(listing.videos)) return [];
  const videos: StudioMedia[] = [];
  for (const item of listing.videos) {
    const row = rowOf(item);
    if (!row) continue;
    const url = httpUrl(row.url);
    const name = mediaName(row, "Video");
    if (!url || isPrivateMedia(text(row.path) || text(row.storagePath), name, url)) continue;
    videos.push({ url, name });
  }
  return videos.slice(0, 40);
}

function publicTour(listing: GalleryLinkDoc): string {
  for (const key of ["tourUrl", "matterportUrl", "virtualTourUrl", "virtualTour", "threeDTourUrl", "tourLink"]) {
    const url = httpUrl(listing[key]);
    if (url && !isPrivateMedia("", key, url)) return url;
  }
  return "";
}

function agentNameOf(listing: GalleryLinkDoc): string {
  const direct = text(listing.agentName) || text(listing.listingAgent);
  if (direct) return direct;
  const agent = listing.agent;
  if (agent && typeof agent === "object") return text((agent as Record<string, unknown>).name);
  if (typeof agent === "string") return agent.trim();
  return "";
}

function publicFloorPlans(listing: GalleryLinkDoc): StudioMedia[] {
  const groups = [listing.floorplans, listing.floorPlans];
  const plans: StudioMedia[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      const row = rowOf(item);
      if (!row) continue;
      const url = httpUrl(row.url) || httpUrl(row.shareUrl);
      const name = mediaName(row, "Floor plan");
      const path = text(row.path) || text(row.storagePath);
      if (!url || isPrivateMedia(path, name, url)) continue;
      plans.push({ url, name });
    }
  }
  return plans.slice(0, 40);
}

function downloadUrlOf(row: Record<string, unknown>): string {
  for (const key of ["downloadUrl", "fullResUrl", "mlsUrl", "originalUrl", "zipUrl", "printUrl"]) {
    const url = httpUrl(row[key]);
    if (url) return url;
  }
  return "";
}

function ownerFiles(listing: GalleryLinkDoc): StudioMedia[] {
  const files: StudioMedia[] = [];
  const push = (url: string, name: string) => {
    if (!url || files.some((file) => file.url === url)) return;
    files.push({ url, name });
  };
  for (const key of ["zipUrl", "downloadUrl", "mlsUrl", "mlsPackageUrl", "fullResUrl"]) {
    push(httpUrl(listing[key]), key);
  }
  const groups = [listing.images, listing.files, listing.downloads, listing.mlsFiles, listing.floorplans, listing.floorPlans];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    group.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      const name = mediaName(row, `File ${index + 1}`);
      const path = text(row.path) || text(row.storagePath);
      const display = httpUrl(row.url);
      const download = downloadUrlOf(row);
      if (download) push(download, name);
      if (display && isPrivateMedia(path, name, display)) push(display, name);
    });
  }
  return files.slice(0, 200);
}

function ownerImageDownloads(listing: GalleryLinkDoc, images: StudioMedia[]): StudioMedia[] {
  const byUrl = new Map<string, string>();
  if (Array.isArray(listing.images)) {
    for (const item of listing.images) {
      const row = rowOf(item);
      if (!row) continue;
      const display = httpUrl(row.url);
      const download = downloadUrlOf(row);
      if (display && download && download !== display) byUrl.set(display, download);
    }
  }
  return images.map((image) => {
    const downloadUrl = byUrl.get(image.url);
    return downloadUrl ? { ...image, downloadUrl } : image;
  });
}

function ownerRevisions(listing: GalleryLinkDoc): StudioRevision[] {
  if (!Array.isArray(listing.revisions)) return [];
  return listing.revisions.slice(0, 40).map((item, index) => {
    const row = rowOf(item) || {};
    const photoIndex = typeof row.photoIndex === "number" ? row.photoIndex : null;
    return {
      id: text(row.id) || `revision-${index + 1}`,
      type: text(row.type) || "gallery",
      photoIndex,
      description: text(row.description),
      status: text(row.status) || "pending",
      createdAt: text(row.createdAt),
    };
  });
}

function invoiceOf(listing: GalleryLinkDoc): { status: string } | null {
  const nested = listing.invoice;
  if (nested && typeof nested === "object" && typeof (nested as { status?: unknown }).status === "string") {
    return { status: (nested as { status: string }).status };
  }
  const status = text(listing.invoiceStatus);
  return status ? { status } : null;
}

function pickReleasedGallery(listing: GalleryLinkDoc, related: GalleryLinkDoc[]): GalleryLinkDoc | null {
  const preferred = text(listing.galleryId) || text(listing.playtestGalleryId);
  const released = related.filter((doc) => isReleased(doc));
  if (preferred) {
    const match = released.find((doc) => doc.id === preferred);
    if (match) return match;
  }
  return released[0] || null;
}

function listingBlock(listing: GalleryLinkDoc, related: GalleryLinkDoc[]): ClientGalleryLinkResult | null {
  const linked = related
    .slice(0, 3)
    .map((doc) => `${doc.id} (${statusOf(doc) || "unknown"})`)
    .join(", ");
  const linkedSentence = linked
    ? ` Linked gallery: ${linked}.`
    : " No gallery document is linked to this project.";

  if (listing.lockStudio === true) {
    return {
      ok: false,
      httpStatus: 403,
      code: "studio_locked",
      message: `Project ${listing.id} exists in listings, but Lock Studio is on. Turn Lock Studio off on the project file before /studio/${listing.id} will open. This id is not missing.${linkedSentence}`,
    };
  }
  if (listing.studioEnabled === false) {
    return {
      ok: false,
      httpStatus: 403,
      code: "studio_disabled",
      message: `Project ${listing.id} exists in listings, but Client Studio is turned off, so /studio/${listing.id} stays closed. Turn Client Studio on from the project file.${linkedSentence}`,
    };
  }
  return null;
}

function listingResult(listing: GalleryLinkDoc, related: GalleryLinkDoc[]): ClientGalleryLinkResult {
  const blocked = listingBlock(listing, related);
  if (blocked) return blocked;

  const released = pickReleasedGallery(listing, related);
  if (released) {
    return {
      ok: true,
      kind: "listing",
      openGalleryId: released.id,
      project: publicProject(listing, related, null),
    };
  }

  const pending = related.find((doc) => !isReleased(doc));
  const notice = pending
    ? "Photos on the delivery gallery are not public yet. This page is the project studio."
    : null;
  return {
    ok: true,
    kind: "listing",
    openGalleryId: null,
    project: publicProject(listing, related, notice),
  };
}

function publicProject(listing: GalleryLinkDoc, _related: GalleryLinkDoc[], notice: string | null): PublicStudioProject {
  return {
    id: listing.id,
    address: addressOf(listing),
    agentName: agentNameOf(listing),
    services: servicesOf(listing),
    images: publicImages(listing),
    videos: publicVideos(listing),
    tourUrl: publicTour(listing),
    floorPlans: publicFloorPlans(listing),
    notice,
    view: "public",
  };
}

export interface OwnerStudioGate {
  invoice?: { status?: string } | null;
  downloadEnabled?: unknown;
  downloadsReleased?: unknown;
}

/** Private delivery view. Download URLs stay off until the existing payment lock opens. */
export function ownerStudioProject(
  listing: GalleryLinkDoc,
  pub: PublicStudioProject,
  gate: OwnerStudioGate = {},
): OwnerStudioProject {
  const invoiceStatus = text(gate.invoice?.status) || text(invoiceOf(listing)?.status);
  const invoice = invoiceStatus ? { status: invoiceStatus } : null;
  const downloadsUnlocked = clientGalleryDownloadsUnlocked({
    invoice,
    downloadEnabled: gate.downloadEnabled ?? listing.downloadEnabled,
    downloadsReleased: gate.downloadsReleased ?? listing.downloadsReleased,
    lockDownloads: listing.lockDownloads,
  });
  return {
    ...pub,
    view: "owner",
    clientName: text(listing.clientName),
    clientEmail: text(listing.clientEmail),
    clientPhone: text(listing.clientPhone),
    revisions: ownerRevisions(listing),
    lockDownloads: lockDownloadsOn(listing.lockDownloads),
    requirePayment: requirePaymentOn(listing.requirePayment),
    downloadsUnlocked,
    invoice,
    images: downloadsUnlocked ? ownerImageDownloads(listing, pub.images) : pub.images,
    files: downloadsUnlocked ? ownerFiles(listing) : [],
  };
}

function pointerMessage(id: string, via: string, galleryId: string, listingId: string): string {
  const target = galleryId ? `gallery ${galleryId}` : listingId ? `project ${listingId}` : "a linked record";
  return `${id} is ${via}, not a gallery link. It points at ${target}, and that document does not exist. Copy Studio Link from the project file, or use the delivery URL /gallery/{gallery id}.`;
}

export function decideClientGalleryLink(input: ClientGalleryLinkInput): ClientGalleryLinkResult {
  const invalid = invalidGalleryLinkMessage(input.id);
  if (invalid) {
    return { ok: false, httpStatus: 400, code: "invalid_id", message: invalid };
  }

  if (input.gallery) return galleryResult(input.gallery);

  if (input.listing) return listingResult(input.listing, input.relatedGalleries);

  const releasedRelated = input.relatedGalleries.find((doc) => isReleased(doc));
  if (releasedRelated) {
    return galleryResult(releasedRelated, `No listings/${input.id} document. `);
  }
  if (input.relatedGalleries[0]) {
    return galleryResult(
      input.relatedGalleries[0],
      `No listings/${input.id} document. A gallery is linked to that project id. `,
    );
  }

  const orderGallery = input.galleriesByOrderId.find((doc) => isReleased(doc)) || input.galleriesByOrderId[0] || null;
  if (orderGallery) {
    return galleryResult(orderGallery, `${input.id} is an order id. `);
  }
  if (input.pointedGallery) {
    return galleryResult(input.pointedGallery, `${input.id} points at this gallery. `);
  }
  if (input.pointedListing) return listingResult(input.pointedListing, input.relatedGalleries);

  if (input.order) {
    const galleryId = text(input.order.galleryId);
    const listingId = text(input.order.listingId);
    if (galleryId || listingId) {
      return {
        ok: false,
        httpStatus: 404,
        code: "dangling_pointer",
        message: pointerMessage(input.id, "an order", galleryId, listingId),
      };
    }
    return {
      ok: false,
      httpStatus: 404,
      code: "dangling_pointer",
      message: `${input.id} is an order, not a client gallery link. It has no gallery id and no project id. Open the order in admin and copy the project studio link (/studio/{project id}) or the delivery link (/gallery/{gallery id}).`,
    };
  }

  if (input.orderRequest) {
    const galleryId = text(input.orderRequest.galleryId);
    const listingId = text(input.orderRequest.listingId);
    if (galleryId || listingId) {
      return {
        ok: false,
        httpStatus: 404,
        code: "dangling_pointer",
        message: pointerMessage(input.id, "an order request", galleryId, listingId),
      };
    }
    return {
      ok: false,
      httpStatus: 404,
      code: "dangling_pointer",
      message: `${input.id} is an order request, not a client gallery link. It has no gallery id and no project id yet. Confirm the request or open the project, then share /studio/{project id} or /gallery/{gallery id}.`,
    };
  }

  return {
    ok: false,
    httpStatus: 404,
    code: "unknown",
    message: `No gallery and no project uses ${input.id}. Checked galleries/${input.id}, listings/${input.id}, galleries with listingId ${input.id}, orders/${input.id}, and orderRequests/${input.id}. /studio/${input.id} opens a project whose Client Studio link is on. /gallery/${input.id} opens a delivery gallery. This app does not resolve Fotello ids. Copy the link from the project file or the gallery delivery URL.`,
  };
}
