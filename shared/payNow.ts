/**
 * Pay Now on /book. Processing is computed on the full package price.
 * The $5 savings comes off the final total, after processing, and the
 * total never goes below $0. This module does not call Square or send mail.
 */

import type { BookingLineItem } from "./bookingPricing.ts";
import { ADJUSTMENT_LINE_IDS } from "./invoiceFace.ts";
import { processingFeeCents } from "./invoiceProcessing.ts";

/** $5.00. The only Pay Now discount. */
export const PAY_NOW_DISCOUNT_CENTS = 500;

export const PAY_NOW_METHOD = "pay_now" as const;
export const PAY_LATER_METHOD = "pay_later" as const;

/** Radio title on /book. */
export const PAY_NOW_OPTION_LABEL = "Pay Now (save $5)";

/** Stored, summary, and Square discount line. */
export const PAY_NOW_SAVINGS_LABEL = "Pay Now savings";

export const PAY_NOW_LINE_ID = "pay-now-savings";

export interface PayNowQuote {
  packageCents: number;
  /** Processing on the full package. Zero when processing is off. */
  processingCents: number;
  /** Package plus processing, before the savings. */
  totalBeforeSavingsCents: number;
  discountCents: number;
  /** Final amount. This is the Square amount, in cents. */
  totalCents: number;
}

export interface PayNowSquareLine {
  name: string;
  amountCents: number;
}

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

/** Cents taken off a final total. Floors at that total so the result is never negative. */
export function payNowDiscountCents(totalBeforeSavingsCents: number): number {
  const base = Number.isFinite(totalBeforeSavingsCents) ? Math.max(0, Math.round(totalBeforeSavingsCents)) : 0;
  return Math.min(PAY_NOW_DISCOUNT_CENTS, base);
}

export function quotePayNow(input: {
  packageCents: number;
  processingOn: boolean;
  processingPercent?: number;
}): PayNowQuote {
  const packageCents = Number.isFinite(input.packageCents) ? Math.max(0, Math.round(input.packageCents)) : 0;
  const processingCents = input.processingOn
    ? processingFeeCents(packageCents, input.processingPercent)
    : 0;
  const totalBeforeSavingsCents = packageCents + processingCents;
  const discountCents = payNowDiscountCents(totalBeforeSavingsCents);
  return {
    packageCents,
    processingCents,
    totalBeforeSavingsCents,
    discountCents,
    totalCents: totalBeforeSavingsCents - discountCents,
  };
}

export function payNowDiscountDollars(totalBeforeSavingsDollars: number): number {
  return payNowDiscountCents(dollarsToCents(totalBeforeSavingsDollars)) / 100;
}

/** Visible negative line. Null when there is nothing to take off. */
export function payNowSavingsLine(discountCents: number): BookingLineItem | null {
  if (!Number.isFinite(discountCents) || discountCents <= 0) return null;
  const price = -(Math.round(discountCents) / 100);
  return {
    id: PAY_NOW_LINE_ID,
    name: PAY_NOW_SAVINGS_LABEL,
    unitPrice: price,
    qty: 1,
    price,
  };
}

function isProcessingLine(item: { id?: string; category?: string }): boolean {
  return item.id === ADJUSTMENT_LINE_IDS.processing || item.category === ADJUSTMENT_LINE_IDS.processing;
}

/**
 * Append Pay Now savings after processing and reduce the total.
 * Package and processing lines stay in front of the savings line.
 */
export function applyPayNowSavings<T extends { lineItems: BookingLineItem[]; total: number; amountDue?: number }>(sale: T): T {
  const beforeCents = dollarsToCents(sale.total);
  const discountCents = payNowDiscountCents(beforeCents);
  const line = payNowSavingsLine(discountCents);
  if (!line) return sale;
  const without = sale.lineItems.filter((item) => item.id !== PAY_NOW_LINE_ID);
  const processing = without.filter((item) => isProcessingLine(item));
  const rest = without.filter((item) => !isProcessingLine(item));
  const total = (beforeCents - discountCents) / 100;
  return {
    ...sale,
    lineItems: [...rest, ...processing, line],
    total,
    amountDue: total,
  };
}

/** Non-zero stored lines, in stored order, for the Square payment link. */
export function payNowSquareLines(lineItems: Array<{ name?: string; price?: number }>): PayNowSquareLine[] {
  return lineItems.flatMap((item) => {
    const amountCents = Math.round(Number(item.price) * 100);
    if (!Number.isFinite(amountCents) || amountCents === 0) return [];
    const name = String(item.name || "").trim();
    if (!name) return [];
    return [{ name, amountCents }];
  });
}
