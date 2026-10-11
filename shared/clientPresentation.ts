/**
 * Client delivery presentation.
 *
 * Bean: the delivery email primary button should use `clientPresentationLinkFor`.
 * Leave `server/services/email.ts` as it is. The gallery URL stays the secondary
 * "Your downloads & invoice" link (`/gallery/:id` via `galleryDeliveryUrl`).
 * This module does not send email.
 */

import { invoicePayLinkFor, type InvoicePaySource } from "./invoicePayLink.ts";
import { studioOffersDownloads } from "./paymentAccess.ts";
import { publicClientUrl, type PublicSiteEnv } from "./publicSiteUrl.ts";

export const CLIENT_PRESENTATION_SEGMENT = "site";

const LISTING_ID = /^[A-Za-z0-9_-]{8,128}$/;
const AERIAL = /(^|[^a-z0-9])(aerials?|drone)([^a-z0-9]|$)/i;
const ORIGINAL_FILE = /\.(mp4|m4v|mov|webm|avi|mkv|zip|pdf|dng|cr2|cr3|nef|nrw|arw|srf|sr2|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic|heif)(\?|#|$)/i;
const RASTER = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const PDF = /\.pdf(\?|#|$)/i;
const ZIP = /\.zip(\?|#|$)/i;

export interface ClientPresentationSource {
  id?: unknown;
  listingId?: unknown;
}

export interface ClientListingStill {
  name: string;
  src: string;
  downloadUrl: string;
}

export interface ClientListingVideo {
  name: string;
  src: string;
  poster: string;
  downloadUrl: string;
}

export interface ClientListingPlan {
  name: string;
  src: string;
  pdfUrl: string;
  downloadUrl: string;
}

export interface ClientListingSite {
  access: "owner";
  locked: boolean;
  address: string;
  agentName: string;
  brand: string;
  heroUrl: string;
  photos: ClientListingStill[];
  aerials: ClientListingStill[];
  videos: ClientListingVideo[];
  tourUrl: string;
  floorPlans: ClientListingPlan[];
  zipUrl: string;
  payUrl: string;
  galleryHref: string;
}

export interface ClientListingPublic {
  access: "public";
}

export type ClientListingModel = ClientListingSite | ClientListingPublic;

/** `/studio/{listingId}/site` */
export function clientPresentationPath(listingId: string): string {
  return `/studio/${encodeURIComponent(listingId)}/${CLIENT_PRESENTATION_SEGMENT}`;
}

/**
 * Absolute URL for the delivery email's primary button.
 * An order or gallery passes `listingId`. A listing passes its own `id`.
 * When both are set, `listingId` wins. A missing or short id returns null.
 */
export function clientPresentationLinkFor(
  source: ClientPresentationSource | null | undefined,
  env?: PublicSiteEnv,
): string | null {
  const listingId = presentationListingId(source);
  if (!listingId) return null;
  return publicClientUrl(clientPresentationPath(listingId), env);
}

export function presentationListingId(source: ClientPresentationSource | null | undefined): string {
  if (!source || typeof source !== "object") return "";
  const listingId = text(source.listingId) || text(source.id);
  return LISTING_ID.test(listingId) ? listingId : "";
}

/**
 * Owner presentation model.
 * Locked views keep display-route previews, stream/preview video, and the
 * Matterport embed. Original files, raw MP4 URLs, PDF floor plans, and zip
 * links stay off until downloads are unlocked.
 * A public studio project stays public — this does not upgrade it.
 */
export function buildClientListingSite(
  project: unknown,
  options: { galleryId?: unknown; sampleStills?: boolean } = {},
): ClientListingModel {
  const record = row(project);
  if (!record || record.view !== "owner") return { access: "public" };

  const locked = !studioOffersDownloads(record.view, record.downloadsUnlocked);
  const sampleStills = options.sampleStills === true;
  const photos: ClientListingStill[] = [];
  const aerials: ClientListingStill[] = [];

  for (const item of asList(record.images)) {
    const still = stillFrom(item, locked, sampleStills);
    if (!still) continue;
    if (isAerial(still.name, still.src)) aerials.push(still);
    else photos.push(still);
  }

  const videos = asList(record.videos)
    .map((item) => videoFrom(item, locked, sampleStills))
    .filter((item): item is ClientListingVideo => Boolean(item));

  const floorPlans = asList(record.floorPlans)
    .map((item) => planFrom(item, locked, sampleStills))
    .filter((item): item is ClientListingPlan => Boolean(item));

  const heroUrl = photos[0]?.src || aerials[0]?.src || "";
  const payUrl = locked ? payLink(record) : "";

  return {
    access: "owner",
    locked,
    address: text(record.address),
    agentName: text(record.agentName),
    brand: "Iconic Images",
    heroUrl,
    photos,
    aerials,
    videos,
    tourUrl: matterportUrl(record.tourUrl),
    floorPlans,
    zipUrl: locked ? "" : zipFrom(record.files),
    payUrl,
    galleryHref: galleryHref(options.galleryId),
  };
}

function payLink(record: Record<string, unknown>): string {
  const explicit = safePayUrl(record.payUrl);
  if (explicit) return explicit;
  const invoice = row(record.invoice);
  if (!invoice) return "";
  return invoicePayLinkFor(invoice as InvoicePaySource) || "";
}

function safePayUrl(value: unknown): string {
  const url = text(value);
  if (!url.startsWith("https://")) return "";
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/invoice/")) return "";
    if (!text(parsed.searchParams.get("t"))) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function galleryHref(value: unknown): string {
  const id = text(value);
  if (!LISTING_ID.test(id)) return "";
  return `/gallery/${encodeURIComponent(id)}`;
}

function stillFrom(item: unknown, locked: boolean, sampleStills: boolean): ClientListingStill | null {
  const record = row(item);
  if (!record) return null;
  const name = text(record.name) || "Photograph";
  const src = locked ? lockedStillSrc(record, sampleStills) : openStillSrc(record);
  if (!src) return null;
  const downloadUrl = locked ? "" : downloadHref(record, src);
  return { name, src, downloadUrl };
}

function lockedStillSrc(record: Record<string, unknown>, sampleStills: boolean): string {
  for (const key of ["url", "displayUrl", "previewUrl"]) {
    const url = siteUrl(record[key]);
    if (isDisplayRoute(url)) return url;
    if (sampleStills && isSampleStill(url)) return url;
  }
  return "";
}

function openStillSrc(record: Record<string, unknown>): string {
  for (const key of ["url", "displayUrl", "previewUrl"]) {
    const url = siteUrl(record[key]);
    if (!url || isOriginalFile(url)) continue;
    if (isDisplayRoute(url) || isRaster(url) || isSampleStill(url)) return url;
  }
  return "";
}

function videoFrom(item: unknown, locked: boolean, sampleStills: boolean): ClientListingVideo | null {
  const record = row(item);
  if (!record) return null;
  const name = text(record.name) || "Film";
  const poster = posterSrc(record, locked, sampleStills);
  const src = locked ? lockedVideoSrc(record) : openVideoSrc(record);
  const downloadUrl = locked ? "" : fileHref(record.downloadUrl) || fileHref(record.rawUrl) || fileHref(record.url);
  if (!src && !poster) return null;
  return { name, src, poster, downloadUrl: locked ? "" : downloadUrl };
}

function lockedVideoSrc(record: Record<string, unknown>): string {
  for (const key of ["streamUrl", "previewUrl", "playbackUrl"]) {
    const url = siteUrl(record[key]);
    if (url && !isOriginalFile(url)) return url;
  }
  return "";
}

function openVideoSrc(record: Record<string, unknown>): string {
  const locked = lockedVideoSrc(record);
  if (locked) return locked;
  const url = siteUrl(record.url) || siteUrl(record.embedUrl);
  return url;
}

function posterSrc(record: Record<string, unknown>, locked: boolean, sampleStills: boolean): string {
  for (const key of ["poster", "thumbnailUrl", "displayUrl"]) {
    const url = siteUrl(record[key]);
    if (!url || isOriginalFile(url)) continue;
    if (isDisplayRoute(url)) return url;
    if (!isRaster(url)) continue;
    if (!locked || (sampleStills && isSampleStill(url))) return url;
  }
  return "";
}

function planFrom(item: unknown, locked: boolean, sampleStills: boolean): ClientListingPlan | null {
  const record = row(item);
  if (!record) return null;
  const name = text(record.name) || "Floor plan";
  const url = siteUrl(record.url) || siteUrl(record.displayUrl);
  if (!url) return null;
  if (isPdf(url, name)) {
    if (locked) return null;
    const pdfUrl = fileHref(url);
    return pdfUrl ? { name, src: "", pdfUrl, downloadUrl: pdfUrl } : null;
  }
  const src = locked ? lockedStillSrc({ ...record, url }, sampleStills) : openStillSrc({ ...record, url });
  if (!src) return null;
  return { name, src, pdfUrl: "", downloadUrl: locked ? "" : downloadHref(record, src) };
}

function zipFrom(files: unknown): string {
  for (const item of asList(files)) {
    const record = row(item);
    if (!record) continue;
    const url = fileHref(record.url);
    const name = text(record.name);
    if (url && (ZIP.test(url.split("#")[0]) || ZIP.test(name))) return url;
  }
  return "";
}

function downloadHref(record: Record<string, unknown>, src: string): string {
  return fileHref(record.downloadUrl) || fileHref(record.rawUrl) || (isDisplayRoute(src) ? "" : fileHref(src));
}

function matterportUrl(value: unknown): string {
  const url = siteUrl(value);
  if (!url.startsWith("https://")) return "";
  try {
    const parsed = new URL(url);
    if (!/(^|\.)matterport\.com$/i.test(parsed.hostname)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function isAerial(name: string, url: string): boolean {
  return AERIAL.test(`${name} ${url}`);
}

function isDisplayRoute(url: string): boolean {
  return url.startsWith("/api/media/display/");
}

function isSampleStill(url: string): boolean {
  if (!url.startsWith("/media/")) return false;
  if (url.includes("..")) return false;
  return (url.startsWith("/media/photos/") || url.startsWith("/media/playtest/")) && isRaster(url);
}

function isRaster(url: string): boolean {
  return RASTER.test(url.split("#")[0]);
}

function isPdf(url: string, name: string): boolean {
  return PDF.test(url.split("#")[0]) || PDF.test(name);
}

function isOriginalFile(url: string): boolean {
  return ORIGINAL_FILE.test(url.split("#")[0]);
}

function fileHref(value: unknown): string {
  const url = siteUrl(value);
  if (!url || isDisplayRoute(url)) return "";
  return url;
}

function siteUrl(value: unknown): string {
  const url = text(value);
  if (!url || url.startsWith("//") || url.includes("\\") || url.includes("..")) return "";
  if (url.startsWith("/")) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function row(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Fixture vars for a local delivery-email preview. Does not edit the template. */
export function deliveryEmailPreviewVars(env?: PublicSiteEnv): Record<string, string> {
  const presentationUrl = clientPresentationLinkFor(
    { id: "sample-order-01", listingId: "sample-listing-site" },
    env,
  ) || "";
  const paymentUrl = invoicePayLinkFor(
    { id: "sampleInvoice01", status: "sent", payToken: "samplePayToken0123456789ab" },
    env,
  ) || "";
  return {
    clientName: "Jordan Sample",
    address: "100 Playtest Lane, Austin, TX 78701",
    galleryUrl: presentationUrl,
    paymentUrl,
    invoiceAmount: "$1.00",
    expiresAt: "30 days",
  };
}
