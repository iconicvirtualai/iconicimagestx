/**
 * Client delivery presentation: the media + invoice page a delivery email opens.
 * This is not the listing website and not the private listing presentation.
 * No Firestore and no mail transport.
 */

import { BUSINESS_CONTACT_LINE } from "./businessContact.ts";
import { CLIENT_EMAIL_NOTIFY_TEST_SINK, clientEmailNotifyLive } from "./aryeoEmailNotify.ts";
import { galleryDeliverySubject } from "./galleryDelivery.ts";
import { invoiceFaceFromStored } from "./invoiceFace.ts";
import { invoicePayLinkFor, type InvoicePaySource } from "./invoicePayLink.ts";
import { formatInvoiceAmount } from "./invoiceProcessing.ts";
import { invoiceAllowsDownload } from "./paymentAccess.ts";
import { publicClientUrl, type PublicSiteEnv } from "./publicSiteUrl.ts";
import { resolveB2ObjectKey, stableMediaKey } from "./b2Media.ts";
import { recordAddressText } from "./addressText.ts";
import { collectArrangementMedia, readMediaArrangement, sequenceArrangement } from "./mediaArrangement.ts";
import { shortOrderNumber } from "./orderProjectInvoice.ts";

export const CLIENT_DELIVERY_PREVIEW_ID = "preview";
export const CLIENT_DELIVERY_PREVIEW_PAID_ID = "preview-paid";
export const DELIVERY_UNLOCK_PROMPT = "Pay invoice to unlock watermark-free downloads";

const MEDIA_KEYS = ["images", "videos", "floorplans", "floorPlans", "mediaItems", "files", "tours", "videoLinks", "tourLinks"] as const;

export type DeliveryAssetKind = "photo" | "video" | "floorplan" | "tour" | "file";
export type DeliveryPayStatus = "paid" | "unpaid" | "comped";

export interface DeliveryAsset {
  name: string;
  kind: DeliveryAssetKind;
  section: string;
  raster: boolean;
  downloadable: boolean;
  localFile?: string;
  b2Key?: string;
  storagePath?: string;
  httpsUrl?: string;
}

export interface ClientDeliveryInvoiceLine {
  name: string;
  qty: number;
  price: number;
}

export interface ClientDeliveryInvoice {
  id: string;
  number: string;
  status: DeliveryPayStatus;
  total: number;
  subtotal: number;
  processing: number | null;
  amountDue: number;
  amountPaid: number;
  lines: ClientDeliveryInvoiceLine[];
  payPath: string | null;
  paidNote: string;
}

export interface ClientDeliveryMedia {
  id: string;
  name: string;
  kind: DeliveryAssetKind;
  section: string;
  watermarked: boolean;
  previewUrl: string;
  highUrl: string | null;
  webUrl: string | null;
}

export interface ClientDeliveryPresentation {
  id: string;
  sample: boolean;
  address: string;
  orderNumber: string;
  clientName: string;
  packageSummary: string;
  shootDate: string;
  deliveryDate: string;
  contactLine: string;
  paid: boolean;
  invoice: ClientDeliveryInvoice;
  media: ClientDeliveryMedia[];
  zipPrintUrl: string | null;
  zipWebUrl: string | null;
}

export interface ClientDeliveryNotifyMode {
  live: boolean;
  mode: "live" | "preview";
  clientNotifyLive: boolean;
  clientEmailNotifyLive: boolean;
  testSink: string;
  banner: string;
}

export interface ClientDeliveryDraft {
  listingId: string;
  galleryId: string;
  toName: string;
  toEmail: string;
  cc: string;
  subject: string;
  message: string;
  presentationUrl: string;
  presentationPath: string;
  invoice: ClientDeliveryInvoice;
  notify: ClientDeliveryNotifyMode;
}

export function isClientDeliveryPreview(id: string): boolean {
  return id === CLIENT_DELIVERY_PREVIEW_ID || id === CLIENT_DELIVERY_PREVIEW_PAID_ID;
}

export function clientDeliveryPreviewPaid(id: string): boolean {
  return id === CLIENT_DELIVERY_PREVIEW_PAID_ID;
}

export function clientDeliveryPath(id: string): string {
  return `/deliver/${encodeURIComponent(id)}`;
}

export function clientDeliveryPresentationUrl(id: string, env?: PublicSiteEnv): string {
  return publicClientUrl(clientDeliveryPath(id), env);
}

export function clientDeliveryNotifyMode(env: Record<string, string | undefined> = process.env): ClientDeliveryNotifyMode {
  const clientNotifyLive = env.CLIENT_NOTIFY_LIVE === "true";
  const emailNotifyLive = clientEmailNotifyLive(env);
  const live = clientNotifyLive && emailNotifyLive;
  return {
    live,
    mode: live ? "live" : "preview",
    clientNotifyLive,
    clientEmailNotifyLive: emailNotifyLive,
    testSink: CLIENT_EMAIL_NOTIFY_TEST_SINK,
    banner: live
      ? "Live delivery is on. Send emails the client. Test send goes only to internal QA."
      : "Safe preview. CLIENT_NOTIFY_LIVE and CLIENT_EMAIL_NOTIFY_LIVE are off, so Send does not email the client. Copy the presentation link, or send a test that stays with internal QA.",
  };
}

export function deliveryPaymentLabel(status: DeliveryPayStatus): "Paid" | "Unpaid" {
  return status === "unpaid" ? "Unpaid" : "Paid";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function withDeliveryFooter(message: string): string {
  const body = message.trim();
  if (body.includes(BUSINESS_CONTACT_LINE)) return body;
  return `${body}\n\n${BUSINESS_CONTACT_LINE}`;
}

export function clientDeliveryEmailHtml(message: string): string {
  const text = withDeliveryFooter(message);
  const blocks = text.split(/\n{2,}/).map((part) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#111;">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`,
  ).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#000;padding:20px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px;">ICONIC IMAGES</h1>
    </div>
    ${blocks}
  </div>`;
}

export function prepareDeliveryMessage(message: string): { ok: true; text: string; html: string } | { ok: false; error: string } {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Write a message before sending." };
  if (/cadi@/i.test(trimmed)) return { ok: false, error: "Client delivery mail uses photos@iconicimagestx.com." };
  if (trimmed.length > 8000) return { ok: false, error: "That message is too long." };
  const text = withDeliveryFooter(trimmed);
  const html = clientDeliveryEmailHtml(text);
  if (/cadi@/i.test(html)) return { ok: false, error: "Client delivery mail uses photos@iconicimagestx.com." };
  return { ok: true, text, html };
}

export function deliveryEmailList(value: string): string[] {
  return value.split(/[,;]/).map((item) => item.trim()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function money(value: number): string {
  return formatInvoiceAmount(value);
}

export function clientDeliveryMessage(input: {
  clientName: string;
  address: string;
  presentationUrl: string;
  invoice: ClientDeliveryInvoice;
}): string {
  const status = deliveryPaymentLabel(input.invoice.status);
  const pay = input.invoice.status === "unpaid"
    ? "Downloads stay watermarked until this invoice is paid. Pay from the presentation page."
    : "This invoice is paid. Watermark-free downloads are open on the presentation page.";
  const processing = input.invoice.processing && input.invoice.processing > 0
    ? `Processing ${money(input.invoice.processing)}.`
    : "";
  return [
    `Hi ${input.clientName || "there"},`,
    "",
    `Your photos for ${input.address || "the property"} are edited and ready.`,
    "",
    "Open your delivery presentation:",
    input.presentationUrl,
    "",
    `Invoice ${input.invoice.number} · ${money(input.invoice.total)} · ${status}`,
    processing,
    pay,
    "",
    BUSINESS_CONTACT_LINE,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

const SAMPLE_LINES: ClientDeliveryInvoiceLine[] = [
  { name: "Real estate photography", qty: 1, price: 275 },
  { name: "Twilight photos", qty: 1, price: 125 },
  { name: "Floor plan", qty: 1, price: 75 },
];

export function sampleDeliveryInvoice(paid: boolean): ClientDeliveryInvoice {
  const subtotal = 475;
  const processing = 14.25;
  const total = 489.25;
  return {
    id: paid ? "sample-paid" : "sample-unpaid",
    number: "INV-1042",
    status: paid ? "paid" : "unpaid",
    total,
    subtotal,
    processing,
    amountDue: paid ? 0 : total,
    amountPaid: paid ? total : 0,
    lines: SAMPLE_LINES,
    payPath: null,
    paidNote: paid ? "Paid at booking. Receipt is on this page." : "",
  };
}

export function sampleDeliveryAssets(): DeliveryAsset[] {
  const photo = (file: string, name: string): DeliveryAsset => ({
    name, kind: "photo", section: "Photos", raster: true, downloadable: true, localFile: file,
  });
  return [
    photo("portal-v2/deliver-hero.jpg", "Front elevation.jpg"),
    photo("portal-v2/deliver-living.jpg", "Living room.jpg"),
    photo("portal-v2/deliver-kitchen.jpg", "Kitchen.jpg"),
    photo("portal-v2/deliver-bath.jpg", "Primary bath.jpg"),
    photo("portal-v2/deliver-yard.jpg", "Backyard.jpg"),
    { name: "Walkthrough.mp4", kind: "video", section: "Video", raster: true, downloadable: false, localFile: "portal-v2/deliver-dining.jpg" },
    { name: "3D tour", kind: "tour", section: "3D Tour", raster: true, downloadable: false, localFile: "portal-v2/deliver-angle.jpg" },
    { name: "Floor plan.png", kind: "floorplan", section: "Floor plans", raster: true, downloadable: true, localFile: "playtest/TEST-delivery-qa-floorplan.png" },
  ];
}

function sectionFor(kind: DeliveryAssetKind): string {
  if (kind === "video") return "Video";
  if (kind === "tour") return "3D Tour";
  if (kind === "floorplan") return "Floor plans";
  if (kind === "file") return "Files";
  return "Photos";
}

function kindOf(row: Record<string, unknown>, name: string): DeliveryAssetKind {
  const type = String(row.type || row.assetType || row.category || "").toLowerCase();
  const lower = name.toLowerCase();
  if (type.includes("tour") || type.includes("matterport") || lower.includes("matterport")) return "tour";
  if (type === "video" || type === "reel" || /\.(mp4|mov|m4v|webm)$/.test(lower)) return "video";
  if (type.includes("floor") || type === "floorplan") return "floorplan";
  if (type === "file" || type === "document" || /\.(pdf|zip)$/.test(lower)) return "file";
  return "photo";
}

function httpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url.startsWith("https://") || url.length > 2000) return "";
  return url;
}

function localMedia(value: unknown): string {
  if (typeof value !== "string") return "";
  const path = value.trim().split("?")[0].split("#")[0];
  if (!path.startsWith("/media/")) return "";
  const relative = path.slice("/media/".length);
  if (!relative || relative.includes("..") || relative.includes("\\")) return "";
  return relative;
}

function storagePathOf(row: Record<string, unknown>): string {
  for (const key of ["storagePath", "path"]) {
    const value = typeof row[key] === "string" ? row[key].trim() : "";
    if (!value || value.includes("..") || value.startsWith("/") || value.startsWith("http")) continue;
    return value;
  }
  return "";
}

function assetFromRow(row: Record<string, unknown>, parent: Record<string, unknown>, section: string, fallbackName: string): DeliveryAsset | null {
  const name = [row.deliveryName, row.fileName, row.name, row.title].find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const label = (name || fallbackName).trim();
  if (!label) return null;
  const kind = kindOf(row, label);
  const imageFile = /\.(jpe?g|png|webp|gif)$/i.test(label);
  const photoLike = kind === "photo" || (kind === "floorplan" && !/\.pdf$/i.test(label));
  return {
    name: label,
    kind,
    section: section || sectionFor(kind),
    raster: photoLike || imageFile,
    downloadable: kind !== "tour" && kind !== "video",
    localFile: localMedia(row.url) || localMedia(row.shareUrl) || undefined,
    b2Key: resolveB2ObjectKey(row, parent) || undefined,
    storagePath: storagePathOf(row) || undefined,
    httpsUrl: httpsUrl(row.url) || httpsUrl(row.shareUrl) || undefined,
  };
}

function rawRows(record: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const key of MEDIA_KEYS) {
    const rows = Array.isArray(record[key]) ? record[key] : [];
    rows.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      const item = row as Record<string, unknown>;
      const id = stableMediaKey(item) || `${key}-${index}`;
      if (!map.has(id)) map.set(id, item);
    });
  }
  return map;
}

export function deliveryAssetsFromRecords(
  listing: Record<string, unknown> | null | undefined,
  gallery: Record<string, unknown> | null | undefined,
): DeliveryAsset[] {
  const listingMedia = listing ? collectArrangementMedia(listing) : [];
  const source = listingMedia.length > 0
    ? listing || {}
    : {
        ...(listing || {}),
        ...(gallery?.storageBackend ? { storageBackend: gallery.storageBackend, b2Key: gallery.b2Key } : {}),
        images: Array.isArray(gallery?.mediaItems) ? gallery.mediaItems : listing?.images,
        videos: gallery?.videos || listing?.videos,
        floorplans: gallery?.floorplans || listing?.floorplans,
        tours: gallery?.tourLinks || listing?.tours,
      };
  const parent = source as Record<string, unknown>;
  const media = collectArrangementMedia(parent);
  if (!media.length) return [];
  const arrangement = readMediaArrangement(parent.mediaArrangement);
  const address = recordAddressText(parent) || "property";
  const sequenced = sequenceArrangement(media, arrangement, address).filter((item) => !item.hiddenFromGallery);
  const rows = rawRows(parent);
  const assets: DeliveryAsset[] = [];
  for (const item of sequenced) {
    const row = rows.get(item.id) || { name: item.name, url: item.url, type: item.kind, path: item.path };
    const section = arrangement.sections.find((entry) => entry.id === item.sectionId)?.name || sectionFor(item.kind);
    const asset = assetFromRow(row, parent, section, item.deliveryName || item.name);
    if (asset) assets.push(asset);
  }
  return assets;
}

export function publicDeliveryMedia(id: string, assets: DeliveryAsset[], unlocked: boolean): ClientDeliveryMedia[] {
  return assets.map((asset, index) => {
    const base = `/api/deliver/${encodeURIComponent(id)}/media/${index}`;
    const web = unlocked && asset.raster && asset.downloadable;
    return {
      id: String(index),
      name: asset.name,
      kind: asset.kind,
      section: asset.section,
      watermarked: !unlocked,
      previewUrl: `${base}?variant=preview`,
      highUrl: unlocked && asset.downloadable ? `${base}?variant=print` : null,
      webUrl: web ? `${base}?variant=web` : null,
    };
  });
}

export function groupDeliveryMedia(media: ClientDeliveryMedia[]): Array<{ name: string; items: ClientDeliveryMedia[] }> {
  const groups: Array<{ name: string; items: ClientDeliveryMedia[] }> = [];
  for (const item of media) {
    const last = groups[groups.length - 1];
    if (!last || last.name !== item.section) groups.push({ name: item.section, items: [item] });
    else last.items.push(item);
  }
  return groups;
}

function packageSummary(record: Record<string, unknown> | null | undefined, assets: DeliveryAsset[]): string {
  const services = Array.isArray(record?.services)
    ? record.services.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
  if (services.length) return services.join(", ");
  const sections = [...new Set(assets.map((item) => item.section))];
  return sections.join(", ") || "Media delivery";
}

function dateText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
  }
  return "";
}

export function deliveryInvoiceFromStored(
  invoice: Record<string, unknown> | null | undefined,
  env?: PublicSiteEnv,
): ClientDeliveryInvoice {
  if (!invoice) {
    return {
      id: "",
      number: "Invoice",
      status: "unpaid",
      total: 0,
      subtotal: 0,
      processing: null,
      amountDue: 0,
      amountPaid: 0,
      lines: [],
      payPath: null,
      paidNote: "",
    };
  }
  const face = invoiceFaceFromStored(invoice);
  const statusText = String(invoice.status || "").toLowerCase();
  const settled = statusText === "comped" ? "comped" : invoiceAllowsDownload(invoice) ? "paid" : "unpaid";
  const id = typeof invoice.id === "string" ? invoice.id : "";
  const number = typeof invoice.invoiceNumber === "string" && invoice.invoiceNumber.trim()
    ? invoice.invoiceNumber.trim()
    : (id ? `Invoice ${id.slice(0, 8)}` : "Invoice");
  return {
    id,
    number,
    status: settled,
    total: face.total,
    subtotal: face.subtotal,
    processing: face.processing,
    amountDue: settled === "unpaid" ? face.amountDue : 0,
    amountPaid: face.amountPaid,
    lines: face.services.map((line) => ({ name: line.name, qty: line.qty, price: line.price })),
    payPath: settled === "unpaid" && id
      ? invoicePayLinkFor({ id, payToken: invoice.payToken, status: invoice.status } as InvoicePaySource, env)
      : null,
    paidNote: settled === "comped"
      ? "Comped. Downloads are open."
      : settled === "paid"
        ? "Paid. Receipt details are on this page."
        : "",
  };
}

export function buildClientDeliveryPresentation(input: {
  id: string;
  sample?: boolean;
  paid: boolean;
  address: string;
  orderNumber: string;
  clientName: string;
  packageSummary: string;
  shootDate: string;
  deliveryDate: string;
  invoice: ClientDeliveryInvoice;
  assets: DeliveryAsset[];
}): ClientDeliveryPresentation {
  const unlocked = input.paid;
  return {
    id: input.id,
    sample: input.sample === true,
    address: input.address,
    orderNumber: input.orderNumber,
    clientName: input.clientName,
    packageSummary: input.packageSummary,
    shootDate: input.shootDate,
    deliveryDate: input.deliveryDate,
    contactLine: BUSINESS_CONTACT_LINE,
    paid: unlocked,
    invoice: input.invoice,
    media: publicDeliveryMedia(input.id, input.assets, unlocked),
    zipPrintUrl: unlocked ? `/api/deliver/${encodeURIComponent(input.id)}/download.zip?variant=print` : null,
    zipWebUrl: unlocked ? `/api/deliver/${encodeURIComponent(input.id)}/download.zip?variant=web` : null,
  };
}

export function sampleDeliveryPresentation(id: string): ClientDeliveryPresentation | null {
  if (!isClientDeliveryPreview(id)) return null;
  const paid = clientDeliveryPreviewPaid(id);
  return buildClientDeliveryPresentation({
    id,
    sample: true,
    paid,
    address: "1842 Live Oak Lane, Spring, TX 77380",
    orderNumber: shortOrderNumber("#1042") || "#1042",
    clientName: "Jordan Hale",
    packageSummary: "Photos, twilight, floor plan, walkthrough, and 3D tour",
    shootDate: "November 20, 2026",
    deliveryDate: "November 27, 2026",
    invoice: sampleDeliveryInvoice(paid),
    assets: sampleDeliveryAssets(),
  });
}

export function presentationFromRecords(input: {
  id: string;
  listing?: Record<string, unknown> | null;
  gallery?: Record<string, unknown> | null;
  invoice?: Record<string, unknown> | null;
  paid: boolean;
  env?: PublicSiteEnv;
}): ClientDeliveryPresentation {
  const record = input.listing || input.gallery || {};
  const assets = deliveryAssetsFromRecords(input.listing, input.gallery);
  const orderNumber = shortOrderNumber(record.orderNumber) || shortOrderNumber(input.gallery?.orderNumber) || "";
  return buildClientDeliveryPresentation({
    id: input.id,
    paid: input.paid,
    address: recordAddressText(record) || recordAddressText(input.gallery || {}) || "Your property",
    orderNumber,
    clientName: String(record.clientName || input.gallery?.clientName || ""),
    packageSummary: packageSummary(record, assets),
    shootDate: dateText(record.apptDate || record.shootDate || input.gallery?.shootDate),
    deliveryDate: dateText(record.deliveredAt || input.gallery?.deliveredAt),
    invoice: deliveryInvoiceFromStored(input.invoice, input.env),
    assets,
  });
}

export function clientDeliveryDraft(input: {
  listingId?: string;
  galleryId?: string;
  clientName?: string;
  clientEmail?: string;
  cc?: string;
  address?: string;
  invoice: ClientDeliveryInvoice;
  notify?: ClientDeliveryNotifyMode;
  env?: PublicSiteEnv;
}): ClientDeliveryDraft {
  const galleryId = (input.galleryId || "").trim();
  const listingId = (input.listingId || "").trim();
  const id = galleryId || listingId || CLIENT_DELIVERY_PREVIEW_ID;
  const presentationPath = clientDeliveryPath(id);
  const presentationUrl = clientDeliveryPresentationUrl(id, input.env);
  const address = input.address?.trim() || "the property";
  const toName = input.clientName?.trim() || "";
  const invoice = input.invoice;
  return {
    listingId,
    galleryId,
    toName,
    toEmail: input.clientEmail?.trim() || "",
    cc: input.cc?.trim() || "",
    subject: galleryDeliverySubject(address),
    message: clientDeliveryMessage({ clientName: toName, address, presentationUrl, invoice }),
    presentationUrl,
    presentationPath,
    invoice,
    notify: input.notify || clientDeliveryNotifyMode(),
  };
}

export function sampleDeliveryDraft(env?: PublicSiteEnv): ClientDeliveryDraft {
  return clientDeliveryDraft({
    listingId: CLIENT_DELIVERY_PREVIEW_ID,
    galleryId: CLIENT_DELIVERY_PREVIEW_ID,
    clientName: "Jordan Hale",
    clientEmail: "jordan.hale@example.com",
    address: "1842 Live Oak Lane, Spring, TX 77380",
    invoice: sampleDeliveryInvoice(false),
    notify: clientDeliveryNotifyMode({}),
    env,
  });
}

/** Public media JSON must not carry storage URLs or object keys. */
export function presentationLeaksStorage(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /firebasestorage|storage\.googleapis|backblazeb2|b2Key|storagePath|fullResUrl|X-Amz-/i.test(text);
}
