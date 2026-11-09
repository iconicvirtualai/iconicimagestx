/**
 * Pay Now on /book. $5 off the package total before card processing.
 * The discount is integer cents and never drives the package subtotal below $0.
 * This module does not call Square or send mail.
 */

import type { BookingLineItem } from "./bookingPricing.ts";
import { processingFeeCents } from "./invoiceProcessing.ts";

/** $5.00. The only Pay Now discount. */
export const PAY_NOW_DISCOUNT_CENTS = 500;

export const PAY_NOW_METHOD = "pay_now" as const;
export const PAY_LATER_METHOD = "pay_later" as const;

/** Option title and the stored discount line. Cadi's exact label. */
export const PAY_NOW_OPTION_LABEL = "Pay Now (save $5)";

export const PAY_NOW_LINE_ID = "promo-pay-now";

export interface PayNowQuote {
  discountCents: number;
  /** Package cents after the discount, before processing. */
  subtotalBeforeProcessingCents: number;
  processingCents: number;
  /** Discounted subtotal plus processing. This is the Square amount, in cents. */
  totalCents: number;
}

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

/** Cents taken off a package. Floors at the package itself so the result is never negative. */
export function payNowDiscountCents(packageCents: number): number {
  const base = Number.isFinite(packageCents) ? Math.max(0, Math.round(packageCents)) : 0;
  return Math.min(PAY_NOW_DISCOUNT_CENTS, base);
}

export function quotePayNow(input: {
  packageCents: number;
  processingOn: boolean;
  processingPercent?: number;
}): PayNowQuote {
  const packageCents = Number.isFinite(input.packageCents) ? Math.max(0, Math.round(input.packageCents)) : 0;
  const discountCents = payNowDiscountCents(packageCents);
  const subtotalBeforeProcessingCents = packageCents - discountCents;
  const processingCents = input.processingOn
    ? processingFeeCents(subtotalBeforeProcessingCents, input.processingPercent)
    : 0;
  return {
    discountCents,
    subtotalBeforeProcessingCents,
    processingCents,
    totalCents: subtotalBeforeProcessingCents + processingCents,
  };
}

export function payNowDiscountDollars(packageDollars: number): number {
  return payNowDiscountCents(dollarsToCents(packageDollars)) / 100;
}

/** Visible negative line. Null when the package is already $0. */
export function payNowDiscountLine(packageDollars: number): BookingLineItem | null {
  const discountCents = payNowDiscountCents(dollarsToCents(packageDollars));
  if (discountCents <= 0) return null;
  const price = -(discountCents / 100);
  return {
    id: PAY_NOW_LINE_ID,
    name: PAY_NOW_OPTION_LABEL,
    unitPrice: price,
    qty: 1,
    price,
  };
}
