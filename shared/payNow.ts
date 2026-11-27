/**
 * Pay Now on /book.
 * Subtotal = package + add-ons + travel − the $5 savings.
 * Processing is 2.8% of that subtotal, rounded half-up to cents.
 * Total = subtotal + processing. The total never goes below $0.
 * This module does not call Square or send mail.
 */

import type { BookingLineItem } from "./bookingPricing.ts";
import { ADJUSTMENT_LINE_IDS, adjustmentKind, isPromoInvoiceLine } from "./invoiceFace.ts";
import { processingFeeCents } from "./invoiceProcessing.ts";
import { isTravelFeeLine } from "./travelZones.ts";

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
  travelCents: number;
  addonCents: number;
  /** Package + add-ons + travel − savings. This is the processing base. */
  subtotalCents: number;
  /** Processing on the subtotal. Zero when processing is off. */
  processingCents: number;
  /** Package + add-ons + travel, before the savings. */
  totalBeforeSavingsCents: number;
  discountCents: number;
  /** Final amount. This is the Square amount, in cents. */
  totalCents: number;
}

export interface PayNowPresentation {
  /** Package + add-ons + travel − Pay Now savings. Processing is not included. */
  subtotal: number;
  savings: number;
  travel: number;
  processing: number;
  total: number;
}

export interface PayNowSquareLine {
  name: string;
  amountCents: number;
}

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

/** Cents taken off a final total. Floors at that total so the result is never negative. */
export function payNowDiscountCents(totalBeforeSavingsCents: number): number {
  const base = Number.isFinite(totalBeforeSavingsCents) ? Math.max(0, Math.round(totalBeforeSavingsCents)) : 0;
  return Math.min(PAY_NOW_DISCOUNT_CENTS, base);
}

function nonNegativeCents(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return 0;
  return Math.round(value);
}

export function quotePayNow(input: {
  packageCents: number;
  travelCents?: number;
  addonCents?: number;
  processingOn: boolean;
  processingPercent?: number;
}): PayNowQuote {
  const packageCents = nonNegativeCents(input.packageCents);
  const travelCents = nonNegativeCents(input.travelCents);
  const addonCents = nonNegativeCents(input.addonCents);
  const totalBeforeSavingsCents = packageCents + addonCents + travelCents;
  const discountCents = payNowDiscountCents(totalBeforeSavingsCents);
  const subtotalCents = totalBeforeSavingsCents - discountCents;
  const processingCents = input.processingOn
    ? processingFeeCents(subtotalCents, input.processingPercent)
    : 0;
  return {
    packageCents,
    travelCents,
    addonCents,
    subtotalCents,
    processingCents,
    totalBeforeSavingsCents,
    discountCents,
    totalCents: subtotalCents + processingCents,
  };
}

/** Booking checkout numbers. Savings come off before the 2.8% fee. */
export function presentPayNowPrice(input: {
  serviceDollars: number;
  travelDollars?: number;
  promoDollars?: number;
  feeDollars?: number;
  taxDollars?: number;
  payNow: boolean;
  processingOn: boolean;
  processingPercent?: number;
}): PayNowPresentation {
  const serviceCents = Math.max(0, dollarsToCents(input.serviceDollars));
  const travelCents = Math.max(0, dollarsToCents(input.travelDollars || 0));
  const promoCents = Math.max(0, dollarsToCents(input.promoDollars || 0));
  const feeCents = Math.max(0, dollarsToCents(input.feeDollars || 0));
  const taxCents = Math.max(0, dollarsToCents(input.taxDollars || 0));
  const beforeSavings = Math.max(0, serviceCents - promoCents + feeCents + travelCents);
  const savingsCents = input.payNow ? payNowDiscountCents(beforeSavings) : 0;
  const subtotalCents = beforeSavings - savingsCents;
  const processingCents = input.processingOn
    ? processingFeeCents(subtotalCents, input.processingPercent)
    : 0;
  return {
    subtotal: subtotalCents / 100,
    savings: savingsCents / 100,
    travel: travelCents / 100,
    processing: processingCents / 100,
    total: (subtotalCents + processingCents + taxCents) / 100,
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
 * Take $5 off before processing, then charge 2.8% on that subtotal.
 * Travel stays its own line and is inside the subtotal. Processing is last.
 */
export function applyPayNowSavings<T extends {
  lineItems: BookingLineItem[];
  total: number;
  subtotal?: number;
  tax?: number;
  processing?: number;
  processingPolicy?: string;
  amountDue?: number;
}>(sale: T, options?: { processingPercent?: number }): T {
  const without = sale.lineItems.filter((item) => item.id !== PAY_NOW_LINE_ID && !isProcessingLine(item));
  const centsOf = (items: BookingLineItem[]) => items.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
  const travel = without.filter((item) => isTravelFeeLine(item));
  const promos = without.filter((item) => isPromoInvoiceLine(item));
  const fees = without.filter((item) => adjustmentKind(item) === "fees");
  const services = without.filter((item) => !travel.includes(item) && !promos.includes(item) && !fees.includes(item));
  const processingOn = sale.processingPolicy === "included";
  const priced = presentPayNowPrice({
    serviceDollars: centsOf(services) / 100,
    travelDollars: centsOf(travel) / 100,
    promoDollars: Math.abs(centsOf(promos)) / 100,
    feeDollars: centsOf(fees) / 100,
    taxDollars: Number(sale.tax) || 0,
    payNow: true,
    processingOn,
    processingPercent: options?.processingPercent,
  });
  const savings = payNowSavingsLine(Math.round(priced.savings * 100));
  const next = [...services, ...promos, ...fees, ...travel];
  if (savings) next.push(savings);
  if (priced.processing > 0) {
    next.push({
      id: ADJUSTMENT_LINE_IDS.processing,
      name: "Processing",
      unitPrice: priced.processing,
      qty: 1,
      price: priced.processing,
      category: ADJUSTMENT_LINE_IDS.processing,
    });
  }
  return {
    ...sale,
    lineItems: next,
    subtotal: priced.subtotal,
    processing: priced.processing,
    total: priced.total,
    amountDue: priced.total,
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
