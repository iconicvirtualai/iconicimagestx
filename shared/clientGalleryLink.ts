/**
 * Resolves a staff-shared /studio/:id or /gallery/:id without reading
 * Firestore. The route loads documents with the Admin SDK and passes them here.
 * This does not send email or SMS.
 */

import { addressText } from "./addressText.ts";
import { frameFromListingImage } from "./iconicStudio";
import { clientGalleryDownloadsUnlocked } from "./paymentAccess";

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

export interface PublicStudioProject {
  id: string;
  address: string;
  clientName: string;
  services: string[];
  images: Array<{ url: string; name: string }>;
  videos: Array<{ url: string; name: string }>;
  tourUrl: string;
  revisions: Array<{
    id: string;
    type: string;
    photoIndex: number | null;
    description: string;
    status: string;
    createdAt: string;
  }>;
  lockDownloads: boolean;
  requirePayment: boolean;
  /** True when the owning client may download. Shared links still do not offer downloads. */
  downloadsUnlocked: boolean;
  invoice: { status: string } | null;
  notice: string | null;
  /** Marks the share payload so the page does not write it back over the listing. */
  view: "public";
}

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
      project: PublicStudioProject;
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

function publicImages(listing: GalleryLinkDoc): Array<{ url: string; name: string }> {
  if (!Array.isArray(listing.images)) return [];
  const images: Array<{ url: string; name: string }> = [];
  listing.images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    const url = httpUrl(frame?.url);
    if (!frame || frame.raw || !url) return;
    if (frame.path.includes("/raw/")) return;
    images.push({ url, name: frame.name });
  });
  return images.slice(0, 200);
}

function publicVideos(listing: GalleryLinkDoc): Array<{ url: string; name: string }> {
  if (!Array.isArray(listing.videos)) return [];
  const videos: Array<{ url: string; name: string }> = [];
  for (const item of listing.videos) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = httpUrl(row.url);
    if (!url || url.includes("/raw/")) continue;
    videos.push({ url, name: text(row.name) || "Video" });
  }
  return videos.slice(0, 40);
}

function publicRevisions(listing: GalleryLinkDoc): PublicStudioProject["revisions"] {
  if (!Array.isArray(listing.revisions)) return [];
  return listing.revisions.slice(0, 40).map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
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
  const invoice = invoiceOf(listing);
  return {
    id: listing.id,
    address: addressOf(listing),
    clientName: text(listing.clientName),
    services: servicesOf(listing),
    images: publicImages(listing),
    videos: publicVideos(listing),
    tourUrl: httpUrl(listing.tourUrl),
    revisions: publicRevisions(listing),
    lockDownloads: listing.lockDownloads === true,
    requirePayment: listing.requirePayment === true,
    downloadsUnlocked: clientGalleryDownloadsUnlocked({
      invoice,
      downloadEnabled: listing.downloadEnabled,
      downloadsReleased: listing.downloadsReleased,
      lockDownloads: listing.lockDownloads,
    }),
    invoice,
    notice,
    view: "public",
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
