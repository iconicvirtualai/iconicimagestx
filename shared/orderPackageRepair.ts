/**
 * In-memory repair for an order whose package never became line items.
 * The patch is line items only. Stored totals, pricing, and payment fields stay put.
 * Callers that persist this patch must not send the office new-order email.
 */

import {
  chargedServiceLines,
  normalizeBookingLineItems,
  resolveSubmittedBooking,
  sumLineItemPrices,
  type BookingLineItem,
} from "./bookingPricing.ts";
import type { StaffCatalogPackage } from "./bookingCatalog.ts";

export interface OrderPackageRepair {
  lineItems: BookingLineItem[];
  services: BookingLineItem[];
}

export function planOrderPackageRepair(
  record: Record<string, unknown>,
  catalog?: StaffCatalogPackage[],
): OrderPackageRepair | null {
  if (hasPricedServices(record.lineItems) || hasPricedServices(record.services)) return null;
  const resolved = resolveSubmittedBooking({
    selectedService: record.selectedService,
    selectedBasics: record.selectedBasics,
    selectedAddOns: record.selectedAddOns,
    premiumUpgrade: record.premiumUpgrade,
    virtualStagingCredits: record.virtualStagingCredits,
    specializedPhotography: record.specializedPhotography,
    promoCode: record.promoCode,
    lineItems: record.lineItems,
    total: record.total ?? nestedTotal(record.pricing),
    pricing: record.pricing,
    lifeOfTheListingCare: record.lifeOfTheListingCare,
  }, catalog);
  const lineItems = resolved.lineItems.filter((item) => item.name.trim());
  if (chargedServiceLines(lineItems).length === 0) return null;
  warnWhenStoredTotalDiffers(record, lineItems);
  return {
    lineItems,
    services: lineItems,
  };
}

function hasPricedServices(value: unknown): boolean {
  return normalizeBookingLineItems(value).some((item) => {
    if (!item.name.trim()) return false;
    const id = String(item.id || "");
    if (id.startsWith("promo-") || item.name.startsWith("Promo Code:")) return false;
    return true;
  });
}

function nestedTotal(pricing: unknown): unknown {
  if (!pricing || typeof pricing !== "object") return undefined;
  return (pricing as { total?: unknown }).total;
}

function warnWhenStoredTotalDiffers(record: Record<string, unknown>, lineItems: BookingLineItem[]): void {
  const stored = [money(record.total), money(nestedTotal(record.pricing))].filter((amount): amount is number => amount != null);
  if (stored.length === 0) return;
  const rebuilt = roundMoney(sumLineItemPrices(chargedServiceLines(lineItems)));
  const drifted = [...new Set(stored.filter((amount) => Math.abs(amount - rebuilt) > 0.009))];
  if (drifted.length === 0) return;
  console.warn(
    `[Bookings] Package repair kept stored total ${drifted.join(" / ")}; catalog lines total ${rebuilt}.`,
  );
}

function money(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return roundMoney(parsed);
  }
  return undefined;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
