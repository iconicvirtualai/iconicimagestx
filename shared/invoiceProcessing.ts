/**
 * Processing on the Iconic invoice face.
 *
 * Today the charged total is the stored invoice total. A processing amount
 * is included only when staff already saved one. Nothing adds 2.8% by itself.
 *
 * `display` (the default) prints 2.8% of the subtotal and does not add it
 * to the total or to checkout. `charge` adds that fee on top, and only when
 * the invoice does not already have a processing amount.
 */

import { normalizeBookingLineItems } from "./bookingPricing.ts";
import { adjustmentKind, isPromoInvoiceLine, type InvoiceFace } from "./invoiceFace.ts";
import { amountStillDue, type InvoiceLike } from "./paymentAccess.ts";

export const PROCESSING_FEE_RATE = 0.028;
export const INVOICE_PROCESSING_MODE_ENV = "INVOICE_PROCESSING_MODE";
export const DEFAULT_INVOICE_PROCESSING_MODE = "display" as const;
export const INVOICE_TABLE_MIN_ROWS = 6;

const MONTHS = ["JAN.", "FEB.", "MAR.", "APR.", "MAY.", "JUN.", "JUL.", "AUG.", "SEP.", "OCT.", "NOV.", "DEC."];
const CHICAGO = "America/Chicago";

export type InvoiceProcessingMode = "display" | "charge";
export type ProcessingPresentation = "included" | "added" | "stored";

export interface PresentedInvoiceMoney {
  mode: InvoiceProcessingMode;
  subtotal: number;
  processing: number;
  presentation: ProcessingPresentation;
  promotions: number;
  fees: number;
  travel: number;
  tax: number;
  /** Invoice total. In display mode this is the stored total checkout is based on. */
  total: number;
  amountPaid: number;
  amountDue: number;
}

export function invoiceProcessingMode(
  env?: { INVOICE_PROCESSING_MODE?: string | null } | NodeJS.ProcessEnv,
): InvoiceProcessingMode {
  const source = env ?? process.env;
  const raw = String(source?.INVOICE_PROCESSING_MODE ?? "").trim().toLowerCase();
  return raw === "charge" ? "charge" : DEFAULT_INVOICE_PROCESSING_MODE;
}

/** 2.8% of the sale subtotal, rounded to cents. Zero for blank or negative sales. */
export function processingFee(subtotal: number): number {
  const base = Number(subtotal);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const cents = Math.round(base * 100);
  return Math.round((cents * 28) / 1000) / 100;
}

export function invoiceBlankRowCount(itemCount: number): number {
  const count = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
  if (count >= INVOICE_TABLE_MIN_ROWS) return 0;
  return INVOICE_TABLE_MIN_ROWS - count;
}

/** Template date, for example JAN. 01, 2027. Date-only values stay on that day. */
export function formatInvoiceDisplayDate(value: unknown): string {
  const key = invoiceCalendarDay(value);
  if (!key) return "";
  const [year, month, day] = key.split("-");
  const index = Number(month) - 1;
  if (!year || !day || index < 0 || index > 11) return "";
  return `${MONTHS[index]} ${day}, ${year}`;
}

export function saleSubtotal(invoice: { subtotal?: unknown; lineItems?: unknown } | null | undefined): number {
  if (!invoice) return 0;
  const explicit = explicitMoney(invoice.subtotal);
  if (explicit != null) return Math.max(0, explicit);
  const lines = normalizeBookingLineItems(invoice.lineItems);
  const services = lines.filter((item) => !isPromoInvoiceLine(item) && !adjustmentKind(item));
  return roundMoney(Math.max(0, services.reduce((sum, item) => sum + item.price, 0)));
}

/** Staff-saved processing already inside the invoice total. Zero when there is none. */
export function storedProcessingAmount(
  invoice: { processing?: unknown; lineItems?: unknown } | null | undefined,
): number {
  if (!invoice) return 0;
  const explicit = explicitMoney(invoice.processing);
  if (explicit != null) return explicit > 0 ? explicit : 0;
  const match = normalizeBookingLineItems(invoice.lineItems).find((item) => adjustmentKind(item) === "processing");
  if (!match || match.price === 0) return 0;
  return roundMoney(Math.abs(match.price));
}

/**
 * Totals printed on the invoice. Display mode never changes `total`.
 * Charge mode adds `processingFee(subtotal)` only when processing is not already stored.
 */
export function presentInvoiceMoney(
  face: InvoiceFace,
  mode: InvoiceProcessingMode = invoiceProcessingMode(),
): PresentedInvoiceMoney {
  const stored = face.processing != null && face.processing !== 0 ? roundMoney(face.processing) : 0;
  const quoted = stored > 0 ? stored : processingFee(face.subtotal);
  const added = mode === "charge" && stored === 0 ? quoted : 0;
  const total = roundMoney(face.total + added);
  const amountPaid = roundMoney(face.amountPaid);
  const amountDue = added > 0 ? roundMoney(Math.max(0, total - amountPaid)) : roundMoney(face.amountDue);
  return {
    mode,
    subtotal: roundMoney(face.subtotal),
    processing: quoted,
    presentation: stored > 0 ? "stored" : added > 0 ? "added" : "included",
    promotions: roundMoney(face.promotions),
    fees: roundMoney(face.fees),
    travel: roundMoney(face.travel),
    tax: roundMoney(face.tax),
    total,
    amountPaid,
    amountDue,
  };
}

/**
 * Dollars Square quick-pay and Stripe checkout charge.
 * Display mode returns the same balance checkout charges today.
 */
export function checkoutAmountDue(
  invoice: InvoiceLike,
  mode: InvoiceProcessingMode = invoiceProcessingMode(),
): number {
  const due = amountStillDue(invoice);
  if (mode !== "charge" || due <= 0) return due;
  if (storedProcessingAmount(invoice) > 0) return due;
  const fee = processingFee(saleSubtotal(invoice));
  if (fee <= 0) return due;
  return roundMoney(due + fee);
}

/**
 * Square order lines and total for the active mode.
 * Display mode returns the stored lines and total unchanged.
 */
export function squareOrderForProcessingMode(
  invoice: { lineItems?: unknown; total?: unknown; subtotal?: unknown; processing?: unknown },
  mode: InvoiceProcessingMode,
): { lineItems: unknown; total: number; added: number } {
  const total = roundMoney(Number(invoice.total) || 0);
  if (mode !== "charge" || storedProcessingAmount(invoice) > 0) {
    return { lineItems: invoice.lineItems, total, added: 0 };
  }
  const fee = processingFee(saleSubtotal(invoice));
  if (fee <= 0) return { lineItems: invoice.lineItems, total, added: 0 };
  const lines = Array.isArray(invoice.lineItems) ? invoice.lineItems.slice() : [];
  lines.push({
    id: "adjustment-processing",
    name: "Processing",
    qty: 1,
    unitPrice: fee,
    price: fee,
    category: "adjustment-processing",
  });
  return { lineItems: lines, total: roundMoney(total + fee), added: fee };
}

function explicitMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return roundMoney(amount);
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function invoiceCalendarDay(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
    if (dateOnly) return dateOnly[1];
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return chicagoKey(parsed);
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : chicagoKey(value);
  if (typeof value === "number" && Number.isFinite(value)) return chicagoKey(new Date(value));
  if (typeof value === "object") {
    const record = value as { seconds?: unknown; _seconds?: unknown; toDate?: () => Date };
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return chicagoKey(date);
    }
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : null;
    if (seconds == null) return null;
    return chicagoKey(new Date(seconds * 1000));
  }
  return null;
}

function chicagoKey(date: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}
