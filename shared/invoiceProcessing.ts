/**
 * 2.8% processing added on top of a sale, rounded half-up to cents.
 *
 * The cents formula matches the charge-mode helper on draft PR #132
 * (`processingFee` / `estimateBookingCharge`):
 *   floor((round(baseCents) * 28 + 500) / 1000)
 * which is round(baseCents * 0.028) without a binary float.
 *
 * On /book the processing base is max(0, service subtotal − promo).
 * Travel is quoted on its own line and is added after the fee.
 * Tax is not part of a booking estimate.
 *
 * INVOICE_PROCESSING_MODE=off (also disabled, legacy, or 0) is the
 * server-only kill switch. The booking page reads `processingEnabled`
 * from GET /api/bookings/catalog. Unset means the fee is on.
 */

import { buildSubmittedLineItems, sumLineItemPrices, type BookingPriceInput } from "./bookingPricing.ts";

export const PROCESSING_FEE_RATE = 0.028;
export const INVOICE_PROCESSING_MODE_ENV = "INVOICE_PROCESSING_MODE";
export const BOOKING_PROCESSING_LABEL = "Processing (2.8%)";

export interface BookingEstimate {
  /** Service lines before promo. */
  subtotal: number;
  promotions: number;
  /** max(0, subtotal − promotions). Travel stays outside. */
  processingBase: number;
  processing: number;
  travel: number;
  /** processingBase + processing + travel. */
  total: number;
}

/**
 * Server-only. Unset means new bookings include processing.
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
 * /book Total Estimate. The service subtotal is the catalog lines before
 * promo. Promo uses the same floor as calculateSidebarTotal. Travel is added
 * after processing and is not part of the 2.8% base.
 */
export function estimateBookingCharge(
  input: BookingPriceInput,
  travel = 0,
  applyProcessing = true,
): BookingEstimate {
  const items = buildSubmittedLineItems({ ...input, promo: null });
  const subtotal = roundMoney(sumLineItemPrices(items));
  const promotions = nonNegativeMoney(input.promo?.discount ?? 0);
  const processingBase = roundMoney(Math.max(0, subtotal - promotions));
  const travelAmount = nonNegativeMoney(travel);
  const processing = applyProcessing && processingBase > 0 ? processingFee(processingBase) : 0;
  return {
    subtotal,
    promotions,
    processingBase,
    processing,
    travel: travelAmount,
    total: roundMoney(processingBase + processing + travelAmount),
  };
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

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
