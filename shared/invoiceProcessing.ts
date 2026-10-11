/**
 * Processing on a new Iconic sale.
 *
 * The fee is 2.8% on top of the sale. It is stored on the invoice when the
 * invoice is created. Later pages, the PDF, and checkout print and charge
 * that stored total. They do not compute a second fee.
 *
 * Processing base (tax excluded, travel excluded):
 *   max(0, service subtotal − promotions + fees)
 * Tax is a separate add-on in this codebase, so it is not part of the base.
 * Travel is quoted on its own line and is not part of the base either.
 * The $549 Showcase has no promo, no fees, and no tax, so the base is $549,
 * the fee is $15.37, and the total is $564.37.
 *
 * Rounding is integer cents, half-up: round(baseCents * 0.028).
 * That is floor((baseCents * 28 + 500) / 1000), which matches half-up
 * without a binary float.
 *
 * Legacy invoices are not rewritten here. Checkout keeps charging their
 * stored amountStillDue until a separate migration says otherwise.
 * INVOICE_PROCESSING_MODE=off is a server-only kill switch for new sales.
 * The client reads the stored invoice or the booking payload, not this env.
 */

import { buildSubmittedLineItems, normalizeBookingLineItems, sumLineItemPrices, type BookingPriceInput } from "./bookingPricing.ts";
import { adjustmentKind, isPromoInvoiceLine, type InvoiceFace } from "./invoiceFace.ts";
import { amountStillDue, type InvoiceLike } from "./paymentAccess.ts";

export const PROCESSING_FEE_RATE = 0.028;
export const INVOICE_PROCESSING_MODE_ENV = "INVOICE_PROCESSING_MODE";
export const INVOICE_TABLE_MIN_ROWS = 6;
export const BOOKING_PROCESSING_LABEL = "Processing (2.8%)";

export type ProcessingPolicy = "included" | "waived" | "stored";

const MONTHS = ["JAN.", "FEB.", "MAR.", "APR.", "MAY.", "JUN.", "JUL.", "AUG.", "SEP.", "OCT.", "NOV.", "DEC."];
const CHICAGO = "America/Chicago";

export interface PresentedInvoiceMoney {
  subtotal: number;
  processing: number;
  promotions: number;
  fees: number;
  travel: number;
  tax: number;
  /** Stored invoice total. This is what checkout charges. */
  total: number;
  amountPaid: number;
  amountDue: number;
}

export interface InvoiceTotalsInput {
  subtotal: number;
  promotions?: number;
  fees?: number;
  travel?: number;
  tax?: number;
  amountPaid?: number;
  /**
   * Stored processing, in dollars. When this is a number, it is used as-is
   * and 2.8% is not added again. Null means "compute it" when applyProcessing is on.
   */
  processing?: number | null;
  /** False skips the automatic fee. Used for legacy copies and the server kill switch. */
  applyProcessing?: boolean;
  comped?: boolean;
}

export interface InvoiceTotals {
  subtotal: number;
  promotions: number;
  fees: number;
  travel: number;
  tax: number;
  /** max(0, subtotal − promotions + fees). Tax and travel stay outside. */
  processingBase: number;
  processing: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  processingPolicy: ProcessingPolicy;
}

/**
 * Server-only. Unset means new sales include processing.
 * `off`, `disabled`, `legacy`, or `0` stops the automatic fee on new invoices.
 * Do not call this from the client bundle.
 */
export function processingEnabled(
  env?: { INVOICE_PROCESSING_MODE?: string | null } | NodeJS.ProcessEnv,
): boolean {
  const source = env ?? process.env;
  const raw = String(source?.INVOICE_PROCESSING_MODE ?? "").trim().toLowerCase();
  return raw !== "off" && raw !== "disabled" && raw !== "legacy" && raw !== "0";
}

/** 2.8% of the processing base, in dollars, rounded half-up to cents. */
export function processingFee(base: number): number {
  return fromCents(processingFeeCents(toCents(base)));
}

/** Integer cents. round(baseCents * 0.028), half-up. Zero when the base is not positive. */
export function processingFeeCents(baseCents: number): number {
  const cents = Math.round(Number(baseCents));
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.floor((cents * 28 + 500) / 1000);
}

/**
 * Totals for a new sale. A stored processing amount is kept and not doubled.
 * Comped, $0, and fully discounted sales (base at or below zero) get $0 processing.
 */
export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = nonNegativeMoney(input.subtotal);
  const promotions = nonNegativeMoney(input.promotions);
  const fees = nonNegativeMoney(input.fees);
  const travel = nonNegativeMoney(input.travel);
  const tax = nonNegativeMoney(input.tax);
  const amountPaid = nonNegativeMoney(input.amountPaid);
  const netServices = roundMoney(Math.max(0, subtotal - promotions));
  const processingBase = roundMoney(Math.max(0, netServices + fees));
  const saleBeforeProcessing = roundMoney(netServices + fees + travel + tax);
  const comped = input.comped === true;
  const stored = input.processing == null || !Number.isFinite(Number(input.processing))
    ? null
    : nonNegativeMoney(input.processing);

  let processing = 0;
  let processingPolicy: ProcessingPolicy = "waived";
  if (comped || saleBeforeProcessing <= 0 || processingBase <= 0) {
    processing = 0;
    processingPolicy = "waived";
  } else if (stored != null) {
    processing = stored;
    processingPolicy = "stored";
  } else if (input.applyProcessing !== false) {
    processing = processingFee(processingBase);
    processingPolicy = "included";
  }

  const total = roundMoney(saleBeforeProcessing + processing);
  return {
    subtotal,
    promotions,
    fees,
    travel,
    tax,
    processingBase,
    processing,
    total,
    amountPaid,
    amountDue: roundMoney(Math.max(0, total - amountPaid)),
    processingPolicy,
  };
}

/**
 * /book Total Estimate. The service subtotal is the catalog lines before
 * promo. Promo uses the same floor as calculateSidebarTotal. Travel is added
 * after processing and is not part of the 2.8% base. Fees are not on /book.
 */
export function estimateBookingCharge(
  input: BookingPriceInput,
  travel = 0,
  applyProcessing = true,
): InvoiceTotals {
  const items = buildSubmittedLineItems({ ...input, promo: null });
  return computeInvoiceTotals({
    subtotal: roundMoney(sumLineItemPrices(items)),
    promotions: input.promo?.discount ?? 0,
    fees: 0,
    travel,
    tax: 0,
    applyProcessing,
  });
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

/**
 * Printed invoice amounts. Whole dollars drop the cents (`$ 549`).
 * A non-zero cent part stays (`$ 15.37`). This does not round the charge.
 */
export function formatInvoiceAmount(value: number): string {
  const numeric = Number(value);
  const cents = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const digits = dollars.toLocaleString("en-US");
  const body = rem === 0 ? digits : `${digits}.${String(rem).padStart(2, "0")}`;
  return `${sign}$ ${body}`;
}

/** Invoice footer only. The public contact line stays dotted. */
export function formatInvoicePhone(display: string): string {
  const digits = display.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return display;
  return `${local.slice(0, 3)} | ${local.slice(3, 6)} | ${local.slice(6)}`;
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
 * What the invoice page and PDF print. This is the stored invoice.
 * It does not add 2.8%. New invoices already have that fee inside `total`.
 * Legacy invoices keep the total they were saved with.
 */
export function presentInvoiceMoney(face: InvoiceFace): PresentedInvoiceMoney {
  return {
    subtotal: roundMoney(face.subtotal),
    processing: face.processing != null ? roundMoney(face.processing) : 0,
    promotions: roundMoney(face.promotions),
    fees: roundMoney(face.fees),
    travel: roundMoney(face.travel),
    tax: roundMoney(face.tax),
    total: roundMoney(face.total),
    amountPaid: roundMoney(face.amountPaid),
    amountDue: roundMoney(face.amountDue),
  };
}

/**
 * Dollars Square and Stripe charge. Always the stored balance.
 * Processing is included only when it was stored on the invoice.
 */
export function checkoutAmountDue(invoice: InvoiceLike): number {
  return amountStillDue(invoice);
}

function toCents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

function fromCents(cents: number): number {
  return roundMoney(cents / 100);
}

function nonNegativeMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return roundMoney(amount);
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
