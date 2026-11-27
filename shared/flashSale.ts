/**
 * Prepaid Black Friday bundles. The fee matches other card checkouts.
 * It is quoted here for the checkout page and the Square charge.
 * The newsletter does not print it.
 */

import { BOOKING_PROCESSING_LABEL, processingFeeCents } from "./invoiceProcessing.ts";

export const FLASH_SALE_SOURCE = "flash-sale";
export const FLASH_SALE_TIME_ZONE = "America/Chicago";

/** Fri Nov 27, 2026, 11:59:59.999 PM Central. DST has ended, so this is UTC-6. */
export const SALE_ENDS_MS = Date.parse("2026-11-28T05:59:59.999Z");

export const FLASH_SALE_ADDONS = [
  { id: "floor-plan", label: "2D Floor Plan" },
  { id: "reel", label: "Social Media Walk Through Reel" },
] as const;

export type FlashSaleAddon = (typeof FLASH_SALE_ADDONS)[number]["id"];

export interface FlashSaleBundle {
  shoots: 5 | 10;
  subtotalCents: number;
  perShootCents: number;
  label: string;
}

export const FLASH_SALE_BUNDLES: readonly FlashSaleBundle[] = [
  { shoots: 5, subtotalCents: 125_000, perShootCents: 25_000, label: "5 shoots" },
  { shoots: 10, subtotalCents: 225_000, perShootCents: 22_500, label: "10 shoots" },
];

export interface FlashSaleQuote {
  shoots: 5 | 10;
  label: string;
  subtotalCents: number;
  processingCents: number;
  totalCents: number;
  processingLabel: string;
}

export function flashSaleOpen(now = Date.now()): boolean {
  return now <= SALE_ENDS_MS;
}

/** Site-wide bar while the sale is open. The editor's AI staging line stays the fallback. */
export const FLASH_SALE_BAR_HREF = "/black-friday";
export const FLASH_SALE_BAR_FULL = "BLACK FRIDAY SALE · 5 SHOOTS $1,250 · 10 SHOOTS $2,250 · ENDS FRI NOV 27";
export const FLASH_SALE_BAR_SHORT = "BLACK FRIDAY · 5 FOR $1,250 · 10 FOR $2,250";

export function flashSaleBundle(shoots: number): FlashSaleBundle | null {
  return FLASH_SALE_BUNDLES.find((bundle) => bundle.shoots === shoots) ?? null;
}

export function flashSaleAddon(id: string): (typeof FLASH_SALE_ADDONS)[number] | null {
  return FLASH_SALE_ADDONS.find((addon) => addon.id === id) ?? null;
}

/** 2.8% on the bundle price, same rounding as a booking invoice. */
export function quoteFlashSale(shoots: number): FlashSaleQuote | null {
  const bundle = flashSaleBundle(shoots);
  if (!bundle) return null;
  const processingCents = processingFeeCents(bundle.subtotalCents);
  return {
    shoots: bundle.shoots,
    label: bundle.label,
    subtotalCents: bundle.subtotalCents,
    processingCents,
    totalCents: bundle.subtotalCents + processingCents,
    processingLabel: BOOKING_PROCESSING_LABEL,
  };
}

export function formatFlashCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function flashSaleCheckoutPath(shoots: 5 | 10): string {
  return `/black-friday?bundle=${shoots}`;
}
