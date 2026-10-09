/**
 * In-memory repair for an order whose package never became line items.
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
  subtotal: number;
  total: number;
  pricing: { subtotal: number; tax: number; total: number };
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
  const subtotal = roundMoney(sumLineItemPrices(chargedServiceLines(lineItems) as BookingLineItem[]));
  const tax = nestedTax(record.pricing);
  const total = resolved.total || subtotal;
  return {
    lineItems,
    services: lineItems,
    subtotal,
    total,
    pricing: { subtotal, tax, total },
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

function nestedTax(pricing: unknown): number {
  if (!pricing || typeof pricing !== "object") return 0;
  const tax = Number((pricing as { tax?: unknown }).tax);
  return Number.isFinite(tax) ? tax : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
