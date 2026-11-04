/**
 * Public price display. The number comes from the packages catalog or from
 * pricingAdjustments. The fallback is the number the page showed before a
 * saved edit. Formatting matches that page when the amount is unchanged.
 */

import { APPRENTICESHIP_OVERAGE_LABEL } from "./bookingCatalog.ts";
import type { StaffCatalogPackage } from "./bookingCatalog.ts";
import { adjustmentAmount, type PricingAdjustment } from "./pricingSettings.ts";

export function dollars(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (!Number.isFinite(rounded)) return "$0";
  if (Number.isInteger(rounded)) return `$${rounded.toLocaleString("en-US")}`;
  return `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "249", "1,599", "75.50". The dollar sign stays outside this on /pricing. */
export function priceDigits(amount: number): string {
  return dollars(amount).slice(1);
}

/** "$5.00". Used where the page already prints cents. */
export function dollarsFixed(amount: number): string {
  const rounded = Math.round((Number(amount) || 0) * 100) / 100;
  return `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function packageAmount(catalog: StaffCatalogPackage[], id: string, fallback: number): number {
  const item = catalog.find((entry) => entry.id === id || entry.bookingId === id);
  return item && Number.isFinite(item.price) ? item.price : fallback;
}

export function feeAmount(adjustments: PricingAdjustment[], id: string, fallback: number): number {
  return adjustmentAmount(adjustments, id, fallback);
}

/** "$25 per 15-minute increment" at $25. Other amounts keep the same sentence. */
export function apprenticeshipOverageLabel(amount: number): string {
  if (amount === 25) return APPRENTICESHIP_OVERAGE_LABEL;
  const shown = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `$${shown} per 15-minute increment`;
}

/**
 * Leave a sentence alone when the price is unchanged.
 * "$10 per headshot" stays exact at $10 and follows a new amount otherwise.
 */
export function withCurrentDollars(template: string, seedAmount: number, amount: number): string {
  if (amount === seedAmount) return template;
  return template.split(`$${seedAmount}`).join(dollars(amount));
}

/**
 * Client package-card price. "Basics" is a label, not a number.
 * A matching amount keeps "$999/mo" and the other existing display strings.
 */
export function livePackageCardPrice(
  skin: { ids: readonly string[]; price: string; priceDisplay: string },
  catalog: StaffCatalogPackage[],
  adjustments: PricingAdjustment[],
): { price: string; priceDisplay: string } {
  if (skin.price === "Basics") return { price: skin.price, priceDisplay: skin.priceDisplay };
  const amounts = skin.ids.map((id) => {
    const pkg = catalog.find((entry) => entry.id === id || entry.bookingId === id);
    if (pkg && Number.isFinite(pkg.price)) return pkg.price;
    if (adjustments.some((entry) => entry.id === id)) return feeAmount(adjustments, id, Number.NaN);
    return Number.NaN;
  }).filter((value) => Number.isFinite(value));
  if (amounts.length === 0) return { price: skin.price, priceDisplay: skin.priceDisplay };
  const next = dollars(Math.min(...amounts));
  if (next === skin.price) return { price: skin.price, priceDisplay: skin.priceDisplay };
  const suffix = skin.priceDisplay.endsWith("/mo") ? "/mo" : "";
  return { price: next, priceDisplay: `${next}${suffix}` };
}
