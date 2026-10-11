/**
 * Durable links between an order request, its project (listing), and one invoice.
 * Pure: no Firestore, no email, no Square. Callers copy stored totals; they do not reprice.
 */

import { buildBookingInvoiceDraft, type BookingInvoiceDraftInput } from "./bookingInvoice.ts";
import { isDerivedInvoiceId } from "./invoicePay.ts";

export function nonEmptyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id ? id : null;
}

/** Stable id so a second create for the same order hits the same invoice document. */
export function orderInvoiceDocId(orderRequestId: string): string {
  return `ordreq_${orderRequestId}`;
}

/** Stable id for a project that has no order. */
export function listingInvoiceDocId(listingId: string): string {
  return `listing_${listingId}`;
}

export function orderInvoiceButtonLabel(attached: boolean): "Create Invoice" | "View Invoice" {
  return attached ? "View Invoice" : "Create Invoice";
}

export function projectInvoiceButtonLabel(attached: boolean): "Create Invoice" | "Manage Invoice" {
  return attached ? "Manage Invoice" : "Create Invoice";
}

export interface InvoiceAnchor {
  orderRequestId?: unknown;
  orderId?: unknown;
  listingId?: unknown;
  /** Invoice id already stored on the order request. This one never moves. */
  orderInvoiceId?: unknown;
  listingInvoiceId?: unknown;
  /** Invoice document ids found by orderRequestId, orderId, or listingId. */
  foundInvoiceIds?: unknown[];
  /**
   * Firestore auto-id to use when nothing is linked yet.
   * Derived listing_ / ordreq_ / playtest- ids are ignored here.
   */
  createId?: unknown;
}

export interface InvoiceLinkPlan {
  /** Stored or discovered invoice, or null when nothing is linked yet. */
  invoiceId: string | null;
  attached: boolean;
  /** Document id to write. Equals invoiceId once an invoice is attached. */
  createId: string;
  /** Foreign keys only. Never totals, line items, or amount due. */
  invoiceFields: Record<string, string>;
  orderRequestFields: Record<string, string> | null;
  listingFields: Record<string, string> | null;
  orderFields: Record<string, string> | null;
}

function compact(fields: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Pick one invoice for this order and project.
 * The id stored on the order wins, then the listing, then a discovered document.
 * A new invoice uses the caller's Firestore auto-id. This function does not
 * derive listing_ or ordreq_ ids. Those remain a read-only lookup for old docs.
 */
export function planInvoiceLink(anchor: InvoiceAnchor): InvoiceLinkPlan {
  const orderRequestId = nonEmptyId(anchor.orderRequestId);
  const orderId = nonEmptyId(anchor.orderId);
  const listingId = nonEmptyId(anchor.listingId);
  const orderInvoiceId = nonEmptyId(anchor.orderInvoiceId);
  const listingInvoiceId = nonEmptyId(anchor.listingInvoiceId);
  const found = (anchor.foundInvoiceIds || [])
    .map(nonEmptyId)
    .filter((id): id is string => Boolean(id));
  const requested = nonEmptyId(anchor.createId);
  const fresh = requested && !isDerivedInvoiceId(requested) ? requested : null;

  const invoiceId = orderInvoiceId || listingInvoiceId || found[0] || null;
  const createId = invoiceId || fresh || "";

  if (!createId && !orderRequestId && !listingId && !orderId) {
    throw new Error("An order or project is required to link an invoice.");
  }

  const invoiceFields = compact({
    orderRequestId,
    orderId,
    listingId,
  });
  const linkId = createId || null;

  return {
    invoiceId,
    attached: Boolean(invoiceId),
    createId,
    invoiceFields,
    orderRequestFields: orderRequestId && linkId
      ? compact({ invoiceId: linkId, listingId, orderId })
      : null,
    listingFields: listingId && linkId
      ? compact({ invoiceId: linkId, orderRequestId, orderId })
      : null,
    orderFields: orderId && linkId
      ? compact({ invoiceId: linkId, orderRequestId, listingId })
      : null,
  };
}

/** Fields written onto a new listing so it stays paired with the order and its invoice. */
export function listingLinkFields(input: {
  orderRequestId: string;
  orderId?: unknown;
  invoiceId?: unknown;
}): { orderRequestId: string; orderId?: string; invoiceId?: string } {
  const fields: { orderRequestId: string; orderId?: string; invoiceId?: string } = {
    orderRequestId: input.orderRequestId,
  };
  const orderId = nonEmptyId(input.orderId);
  const invoiceId = nonEmptyId(input.invoiceId);
  if (orderId) fields.orderId = orderId;
  if (invoiceId) fields.invoiceId = invoiceId;
  return fields;
}

export function draftInvoiceNumber(invoiceId: string, now = new Date()): string {
  const year = now.getFullYear();
  const suffix = invoiceId.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "000001";
  return `INV-${year}-${suffix}`;
}

const HUMAN_INVOICE_NUMBER = /^INV-\d{4}-[A-Z0-9]+$/;
/** String(NaN).padStart(4, "0") stored as INV-year-0NaN. Not a real invoice number. */
const BROKEN_INVOICE_NUMBER = /^INV-\d{4}-0NaN$/i;

/** A generated INV-year-#### number. Rejects the INV-2026-0NaN sequence bug. */
export function isHumanInvoiceNumber(value: unknown): value is string {
  return typeof value === "string" && HUMAN_INVOICE_NUMBER.test(value.trim()) && !BROKEN_INVOICE_NUMBER.test(value.trim());
}

/** Any stored label except blank and the known INV-year-0NaN bug. */
export function isStoredInvoiceNumber(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !BROKEN_INVOICE_NUMBER.test(trimmed);
}

/**
 * Next INV-year-#### from stored numbers.
 * Only pure numeric suffixes count. Letter suffixes and NaN leftovers are ignored,
 * so the sequence can never become "0NaN".
 */
export function nextSequentialInvoiceNumber(existing: Iterable<unknown>, year: number): string {
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const value of existing) {
    if (typeof value !== "string" || !value.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const parsed = Number(suffix);
    if (!Number.isSafeInteger(parsed) || parsed < 0) continue;
    if (parsed > max) max = parsed;
  }
  const next = max + 1;
  const safe = Number.isSafeInteger(next) && next > 0 ? next : 1;
  return `${prefix}${String(safe).padStart(4, "0")}`;
}

/**
 * Number to show a person. A stored invoiceNumber is shown as-is when it is
 * a non-empty string and not the INV-year-0NaN bug. Falls back only when that
 * field is missing or bad. The fallback is INV-year- plus the last six letters
 * of the invoice id, and every surface below uses this same function.
 */
export function presentInvoiceNumber(stored: unknown, invoiceId?: unknown, now = new Date()): string {
  if (isStoredInvoiceNumber(stored)) return stored.trim();
  const id = typeof invoiceId === "string" ? invoiceId.trim() : "";
  if (id) return draftInvoiceNumber(id, now);
  return `INV-${now.getFullYear()}-0001`;
}

export interface InvoiceNumberSource {
  id?: unknown;
  invoiceNumber?: unknown;
  createdAt?: unknown;
}

/** Year for the missing-number fallback. A stored number does not use this date. */
export function invoiceNumberAsOf(value: unknown, now = new Date()): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    } catch {
      return now;
    }
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value.trim());
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return now;
}

function shownInvoiceNumber(source: InvoiceNumberSource, now = new Date()): string {
  const id = typeof source.id === "string" ? source.id : "";
  return presentInvoiceNumber(source.invoiceNumber, id, invoiceNumberAsOf(source.createdAt, now));
}

/** /invoice/:id and the public invoice payload. */
export function invoicePageInvoiceNumber(source: InvoiceNumberSource, now = new Date()): string {
  return shownInvoiceNumber(source, now);
}

/** brandedInvoicePdf and downloadBrandedInvoice. */
export function brandedInvoiceNumber(source: InvoiceNumberSource, now = new Date()): string {
  return shownInvoiceNumber(source, now);
}

/** Portal Order History and the listing Orders tab. */
export function orderHistoryInvoiceNumber(source: InvoiceNumberSource, now = new Date()): string {
  return shownInvoiceNumber(source, now);
}

/** AR and billing lists (revenue detail, client account invoices). */
export function billingListInvoiceNumber(source: InvoiceNumberSource, now = new Date()): string {
  return shownInvoiceNumber(source, now);
}

/** Invoice email. */
export function invoiceEmailNumber(source: InvoiceNumberSource, now = new Date()): string {
  return shownInvoiceNumber(source, now);
}

/** Payment receipt email. */
export function receiptEmailNumber(source: InvoiceNumberSource, now = new Date()): string {
  return shownInvoiceNumber(source, now);
}

export interface ClientBillingOrder {
  id?: unknown;
  invoiceId?: unknown;
  orderId?: unknown;
  createdAt?: unknown;
  submittedAt?: unknown;
  invoice?: { invoiceNumber?: unknown } | null;
}

export interface ClientBillingInvoiceDoc {
  id?: unknown;
  invoiceNumber?: unknown;
  createdAt?: unknown;
  orderRequestId?: unknown;
  orderId?: unknown;
}

/**
 * Number on /admin/client-billing.
 * The invoice document's stored invoiceNumber wins. The copy nested on the
 * order is used only when the invoice document has no real number. The old
 * INV- plus the first six characters of the order id is not a number.
 */
export function clientBillingInvoiceNumber(
  order: ClientBillingOrder,
  invoices: ClientBillingInvoiceDoc[] = [],
  now = new Date(),
): string {
  const invoiceId = nonEmptyId(order.invoiceId);
  const orderId = nonEmptyId(order.id);
  const linkedOrderId = nonEmptyId(order.orderId);
  const matches = invoices.filter((invoice) => {
    const id = nonEmptyId(invoice.id);
    if (invoiceId && id === invoiceId) return true;
    const requestId = nonEmptyId(invoice.orderRequestId);
    const invoiceOrderId = nonEmptyId(invoice.orderId);
    if (orderId && (requestId === orderId || invoiceOrderId === orderId)) return true;
    if (linkedOrderId && (requestId === linkedOrderId || invoiceOrderId === linkedOrderId)) return true;
    return false;
  });
  const preferred = (invoiceId ? matches.find((invoice) => nonEmptyId(invoice.id) === invoiceId) : undefined)
    || matches.find((invoice) => isStoredInvoiceNumber(invoice.invoiceNumber))
    || matches[0];
  const orderNumber = order.invoice?.invoiceNumber;
  const stored = isStoredInvoiceNumber(preferred?.invoiceNumber)
    ? preferred?.invoiceNumber
    : isStoredInvoiceNumber(orderNumber)
      ? orderNumber
      : preferred?.invoiceNumber ?? orderNumber;

  return shownInvoiceNumber({
    invoiceNumber: stored,
    id: nonEmptyId(preferred?.id) || invoiceId || orderId || "",
    createdAt: preferred?.createdAt ?? order.createdAt ?? order.submittedAt,
  }, now);
}

/** Copy the order's stored total and lines. Does not reprice from the catalog. */
export function invoiceDraftFromOrder(order: {
  id: string;
  lineItems?: unknown;
  total?: unknown;
  pricing?: { subtotal?: unknown; tax?: unknown; total?: unknown } | null;
  email?: unknown;
  clientEmail?: unknown;
  clientId?: unknown;
  clientName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  promoCode?: unknown;
  promoDiscount?: unknown;
}): BookingInvoiceDraftInput {
  const named = `${order.firstName || ""} ${order.lastName || ""}`.trim();
  return {
    lineItems: order.lineItems,
    total: Number(order.total) || Number(order.pricing?.total) || 0,
    pricing: order.pricing,
    clientEmail: String(order.email || order.clientEmail || ""),
    clientId: nonEmptyId(order.clientId),
    clientName: String(order.clientName || named || "Client"),
    orderRequestId: order.id,
    promoCode: typeof order.promoCode === "string" ? order.promoCode : null,
    promoDiscount: order.promoDiscount,
  };
}

export function projectLineItems(services: unknown, total: number): { name: string; price: number }[] {
  const names = Array.isArray(services)
    ? services.map((service) => {
      if (typeof service === "string") return service.trim();
      if (service && typeof service === "object" && "name" in service) {
        return String((service as { name?: unknown }).name || "").trim();
      }
      return "";
    }).filter(Boolean)
    : [];
  if (names.length === 0) {
    return total > 0 ? [{ name: "Project", price: total }] : [];
  }
  return names.map((name, index) => ({ name, price: index === 0 ? total : 0 }));
}

/** Project-only billing. Uses the project's stored total. */
export function invoiceDraftFromProject(project: {
  services?: unknown;
  total?: unknown;
  clientEmail?: unknown;
  clientId?: unknown;
  clientName?: unknown;
  orderRequestId?: unknown;
}): BookingInvoiceDraftInput {
  const total = Number(project.total) || 0;
  return {
    lineItems: projectLineItems(project.services, total),
    total,
    pricing: { subtotal: total, tax: 0 },
    clientEmail: String(project.clientEmail || ""),
    clientId: nonEmptyId(project.clientId),
    clientName: String(project.clientName || "Client"),
    orderRequestId: nonEmptyId(project.orderRequestId),
  };
}

/** Build the draft the admin create path stores. Totals come from the source record. */
export function buildLinkedInvoiceDraft(source: BookingInvoiceDraftInput) {
  return buildBookingInvoiceDraft(source);
}
