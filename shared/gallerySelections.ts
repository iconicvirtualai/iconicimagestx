/**
 * Client photo selections on a gallery.
 * Hearts, the included count, and extra-photo math live here.
 * This module does not write Firestore, send email, send SMS, or charge a card.
 */

import { normalizeBookingLineItems, type BookingLineItem } from "./bookingPricing.ts";
import { orderServiceInvoicePatch } from "./staffInvoice.ts";

export const GALLERY_PICKS_COLLECTION = "clientPicks";
export const GALLERY_PICKS_DOC = "current";
export const EXTRA_PHOTO_LINE_ID = "gallery-extra-photos";
export const SELECTION_MODES = ["listing", "headshots"] as const;

export type SelectionMode = (typeof SELECTION_MODES)[number];
export type SelectionStatus = "open" | "submitted";
export type SelectionFilter = "all" | "selected" | "unselected";

const MAX_PICKS = 400;
const MAX_PRICE = 10000;
const SKIP_TYPES = new Set([
  "video",
  "reel",
  "tour",
  "matterport",
  "floorplan",
  "file",
  "pdf",
  "zip",
  "raw",
]);

export interface SelectionSettings {
  open: boolean;
  mode: SelectionMode;
  /** Included photos or finals. Null until staff types a count. */
  allowance: number | null;
  /** Dollars per photo past the allowance. Null means extras are not offered. */
  extraPhotoPrice: number | null;
}

export interface SelectionQuote {
  selectedCount: number;
  allowance: number | null;
  extraCount: number;
  extraPhotoPrice: number | null;
  extraTotal: number;
  extrasAllowed: boolean;
  overAllowance: boolean;
  canSubmit: boolean;
  blockReason: string | null;
}

export interface SelectionPhoto {
  id: string;
  fileName: string;
  archived: boolean;
}

export function selectionMode(value: unknown): SelectionMode {
  return value === "headshots" ? "headshots" : "listing";
}

export function selectionNoun(mode: SelectionMode, count = 2): string {
  const headshots = mode === "headshots";
  if (count === 1) return headshots ? "final" : "photo";
  return headshots ? "finals" : "photos";
}

export function extraPhotoLineName(mode: SelectionMode): string {
  return mode === "headshots" ? "Extra headshot finals" : "Extra photos";
}

/** Blank, empty, and non-numbers stay unset. Zero is a price staff typed. */
export function parseExtraPhotoPrice(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_PRICE) return null;
  return roundMoney(amount);
}

/** Blank stays unset. A typed count is a whole number from 0 through 400. */
export function parseAllowance(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_PICKS) return null;
  return amount;
}

export function settingsFromGallery(gallery: Record<string, unknown> | null | undefined): SelectionSettings {
  const data = gallery || {};
  return {
    open: data.selectionOpen === true,
    mode: selectionMode(data.selectionMode),
    allowance: parseAllowance(data.selectionAllowance),
    extraPhotoPrice: parseExtraPhotoPrice(data.selectionExtraPrice),
  };
}

function row(item: unknown): Record<string, unknown> {
  return item && typeof item === "object" ? item as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function selectionFileName(item: unknown, fallback: string): string {
  const data = row(item);
  return text(data.fileName) || text(data.deliveryName) || text(data.name) || text(data.title) || fallback;
}

export function isSelectableGalleryPhoto(item: unknown): boolean {
  const data = row(item);
  if (data.archived === true || data.culled === true || data.hiddenFromGallery === true) return false;
  const type = text(data.type || data.assetType || data.category).toLowerCase();
  if (SKIP_TYPES.has(type)) return false;
  const name = selectionFileName(data, "");
  if (/\.(mp4|mov|webm|m4v|pdf|zip|tif|tiff|dng|cr2|cr3|nef|arw)$/i.test(name)) return false;
  return Boolean(text(data.id));
}

export function selectionPhotos(items: unknown): SelectionPhoto[] {
  const seen = new Set<string>();
  const photos: SelectionPhoto[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    const data = row(item);
    const id = text(data.id);
    if (!id || seen.has(id)) continue;
    if (data.culled === true || data.hiddenFromGallery === true) continue;
    const type = text(data.type || data.assetType || data.category).toLowerCase();
    if (SKIP_TYPES.has(type)) continue;
    const fileName = selectionFileName(data, id);
    if (/\.(mp4|mov|webm|m4v|pdf|zip|tif|tiff|dng|cr2|cr3|nef|arw)$/i.test(fileName)) continue;
    seen.add(id);
    photos.push({ id, fileName, archived: data.archived === true });
  }
  return photos;
}

export function activeSelectionPhotos(items: unknown): SelectionPhoto[] {
  return selectionPhotos(items).filter((photo) => !photo.archived);
}

export function normalizePickIds(value: unknown, photos: SelectionPhoto[]): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(photos.filter((photo) => !photo.archived).map((photo) => photo.id));
  const ids: string[] = [];
  for (const entry of value) {
    const id = text(entry);
    if (!id || !allowed.has(id) || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= MAX_PICKS) break;
  }
  return ids;
}

export function pickIdsFromDoc(data: Record<string, unknown> | null | undefined): string[] {
  const ids = data?.mediaIds;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => text(id)).filter(Boolean).slice(0, MAX_PICKS);
}

export function selectionQuote(selectedCount: number, settings: SelectionSettings): SelectionQuote {
  const count = Math.max(0, Math.floor(selectedCount));
  const allowance = settings.allowance;
  const price = settings.extraPhotoPrice;
  const extrasAllowed = price != null;
  const overAllowance = allowance != null && count > allowance;
  const extraCount = overAllowance && allowance != null ? count - allowance : 0;
  const extraTotal = extrasAllowed && extraCount > 0 ? roundMoney(extraCount * price) : 0;
  let blockReason: string | null = null;
  if (!settings.open) blockReason = "Selections are not open on this gallery.";
  else if (allowance == null) blockReason = "Iconic has not set how many photos are included yet.";
  else if (overAllowance && !extrasAllowed) {
    const extra = extraCount;
    const noun = selectionNoun(settings.mode, extra);
    blockReason = `This gallery includes ${allowance}. Extra ${selectionNoun(settings.mode)} are not offered. Remove ${extra} ${noun} to submit.`;
  }
  return {
    selectedCount: count,
    allowance,
    extraCount,
    extraPhotoPrice: price,
    extraTotal,
    extrasAllowed,
    overAllowance,
    canSubmit: blockReason == null,
    blockReason,
  };
}

export function selectionFileList(photos: SelectionPhoto[], mediaIds: readonly string[]): string[] {
  const byId = new Map(photos.map((photo) => [photo.id, photo.fileName]));
  return mediaIds.map((id) => byId.get(id) || id);
}

export function selectionCsv(fileNames: readonly string[]): string {
  const lines = ["fileName", ...fileNames.map(csvCell)];
  return `${lines.join("\n")}\n`;
}

export function filterBySelection<T extends { id?: string | null }>(
  items: readonly T[],
  mediaIds: readonly string[],
  filter: SelectionFilter,
): T[] {
  if (filter === "all") return [...items];
  const selected = new Set(mediaIds);
  return items.filter((item) => {
    const id = text(item.id);
    const on = id ? selected.has(id) : false;
    return filter === "selected" ? on : !on;
  });
}

export function extraPhotoLine(mode: SelectionMode, quote: SelectionQuote): BookingLineItem | null {
  if (!quote.extrasAllowed || quote.extraCount <= 0 || quote.extraPhotoPrice == null) return null;
  return {
    id: EXTRA_PHOTO_LINE_ID,
    name: extraPhotoLineName(mode),
    unitPrice: quote.extraPhotoPrice,
    qty: quote.extraCount,
    price: quote.extraTotal,
    category: "extra-photo",
    description: `${quote.extraCount} past the ${quote.allowance} included`,
  };
}

export function withExtraPhotoLine(
  lineItems: unknown,
  mode: SelectionMode,
  quote: SelectionQuote,
): BookingLineItem[] {
  const kept = normalizeBookingLineItems(lineItems).filter((item) => item.id !== EXTRA_PHOTO_LINE_ID);
  const extra = extraPhotoLine(mode, quote);
  return extra ? [...kept, extra] : kept;
}

/**
 * Order and invoice patches for a submitted selection.
 * Uses the same order-service invoice patch the office already saves.
 * amountPaid is left alone. Nothing here creates a payment.
 * When neither document has line items, totals are left untouched and the
 * extra amount stays on the gallery for staff.
 */
export function selectionBillingPatches(
  order: Record<string, unknown>,
  invoice: Record<string, unknown> | null,
  mode: SelectionMode,
  quote: SelectionQuote,
): { order: Record<string, unknown>; invoice: Record<string, unknown> | null; recorded: boolean } {
  const noted: Record<string, unknown> = {
    selectionExtraCount: quote.extraCount,
    selectionExtraTotal: quote.extraTotal,
  };
  const baseLines = Array.isArray(order.lineItems)
    ? order.lineItems
    : Array.isArray(invoice?.lineItems)
      ? invoice.lineItems
      : null;
  if (!baseLines) return { order: noted, invoice: null, recorded: false };

  const nextOrder = {
    ...order,
    lineItems: withExtraPhotoLine(baseLines, mode, quote),
    processing: order.processing ?? invoice?.processing,
    fees: order.fees ?? invoice?.fees,
    travel: order.travel ?? invoice?.travel,
    pricing: order.pricing ?? (invoice && invoice.tax != null ? { tax: invoice.tax } : null),
  };
  const invoicePatch = orderServiceInvoicePatch(nextOrder, invoice || {});
  const orderPatch: Record<string, unknown> = { ...noted };
  if (Array.isArray(invoicePatch.lineItems)) orderPatch.lineItems = invoicePatch.lineItems;
  if (typeof invoicePatch.subtotal === "number") orderPatch.subtotal = invoicePatch.subtotal;
  if (typeof invoicePatch.tax === "number") orderPatch.tax = invoicePatch.tax;
  if (typeof invoicePatch.total === "number") orderPatch.total = invoicePatch.total;
  if (typeof invoicePatch.promoDiscount === "number") orderPatch.promoDiscount = invoicePatch.promoDiscount;
  return {
    order: orderPatch,
    invoice: Object.keys(invoicePatch).length > 0 ? { ...invoicePatch } : null,
    recorded: true,
  };
}

export function archiveUnselectedMedia<T>(
  items: readonly T[],
  selectedIds: readonly string[],
  archivedAt: string,
): { items: T[]; archivedCount: number } {
  const selected = new Set(selectedIds);
  let archivedCount = 0;
  const next = items.map((item) => {
    const data = row(item);
    if (!isSelectableGalleryPhoto(data)) return item;
    const id = text(data.id);
    if (!id || selected.has(id)) return item;
    archivedCount += 1;
    return { ...data, archived: true, archivedAt, archivedReason: "not_selected" } as T;
  });
  return { items: next, archivedCount };
}

export function moneyLabel(amount: number): string {
  return `$${roundMoney(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function overAllowanceCopy(settings: SelectionSettings, quote: SelectionQuote): string | null {
  if (!quote.overAllowance || quote.allowance == null) return null;
  if (!quote.extrasAllowed || quote.extraPhotoPrice == null) return quote.blockReason;
  const noun = selectionNoun(settings.mode, quote.extraCount);
  const verb = quote.extraCount === 1 ? "adds" : "add";
  return `${moneyLabel(quote.extraPhotoPrice)} per extra ${selectionNoun(settings.mode, 1)}. ${quote.extraCount} extra ${noun} ${verb} ${moneyLabel(quote.extraTotal)}.`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
