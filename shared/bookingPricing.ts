/**
 * Customer booking totals.
 *
 * calculateSidebarTotal matches BookingForm calculateTotal(), including the
 * Math.max(0, …) promo floor.
 * buildSubmittedLineItems matches handleBookNow's line list. Its `price`
 * fields are the extended amounts, and sumLineItemPrices is the submitted total.
 * Those two paths stay as they are today. Life of the Listing Care is accepted
 * on the input and never added to either number.
 */

import { services } from "../client/lib/services.ts";
import {
  ICONIC_FINISH_NAME,
  ICONIC_FINISH_PRICE,
  SPECIALIZED_BOTH_NAME,
  SPECIALIZED_BOTH_PRICE,
  SPECIALIZED_SOCIAL_NAME,
  SPECIALIZED_SOCIAL_PRICE,
  VIRTUAL_STAGING_UNIT_PRICE,
  basicsList,
  findAddOn,
} from "./bookingCatalog.ts";

export interface BookingPriceInput {
  selectedService?: string;
  selectedBasics?: string[];
  selectedAddOns?: string[];
  premiumUpgrade?: boolean;
  virtualStagingCredits?: number;
  specializedPhotography?: string;
  promo?: { code: string; discount: number } | null;
  lifeOfTheListingCare?: boolean;
}

export interface BookingLineItem {
  id?: string;
  name: string;
  unitPrice: number;
  qty: number;
  price: number;
}

export function calculateSidebarTotal(input: BookingPriceInput): number {
  void input.lifeOfTheListingCare;

  let total = 0;
  const selectedServiceData = services.find((service) => service.id === input.selectedService);
  if (selectedServiceData) total += selectedServiceData.price;

  for (const id of input.selectedBasics || []) {
    const basic = basicsList.find((item) => item.id === id);
    if (basic) total += basic.price;
  }

  for (const id of input.selectedAddOns || []) {
    const addon = findAddOn(id);
    if (addon) total += addon.price;
  }

  if (input.premiumUpgrade) total += ICONIC_FINISH_PRICE;
  if ((input.virtualStagingCredits || 0) > 0) {
    total += (input.virtualStagingCredits || 0) * VIRTUAL_STAGING_UNIT_PRICE;
  }

  if (input.specializedPhotography === "social") total += SPECIALIZED_SOCIAL_PRICE;
  if (input.specializedPhotography === "both") total += SPECIALIZED_BOTH_PRICE;

  if (input.promo) {
    total = Math.max(0, total - input.promo.discount);
  }

  return total;
}

export function buildSubmittedLineItems(input: BookingPriceInput): BookingLineItem[] {
  void input.lifeOfTheListingCare;

  const selectedServiceData = services.find((service) => service.id === input.selectedService);
  const items: BookingLineItem[] = [];

  if (selectedServiceData) {
    items.push({
      id: selectedServiceData.id,
      name: selectedServiceData.name,
      unitPrice: selectedServiceData.price,
      qty: 1,
      price: selectedServiceData.price,
    });
  }

  for (const id of input.selectedBasics || []) {
    const basic = basicsList.find((item) => item.id === id);
    if (basic) {
      items.push({
        id: basic.id,
        name: basic.name,
        unitPrice: basic.price,
        qty: 1,
        price: basic.price,
      });
    }
  }

  for (const id of input.selectedAddOns || []) {
    const addon = findAddOn(id);
    if (addon) {
      items.push({
        id: addon.id,
        name: addon.name,
        unitPrice: addon.price,
        qty: 1,
        price: addon.price,
      });
    }
  }

  if (input.premiumUpgrade) {
    items.push({
      id: "iconic-finish",
      name: ICONIC_FINISH_NAME,
      unitPrice: ICONIC_FINISH_PRICE,
      qty: 1,
      price: ICONIC_FINISH_PRICE,
    });
  }

  const credits = input.virtualStagingCredits || 0;
  if (credits > 0) {
    items.push({
      id: "virtual-staging",
      name: `Virtual Staging (${credits} credits)`,
      unitPrice: VIRTUAL_STAGING_UNIT_PRICE,
      qty: credits,
      price: credits * VIRTUAL_STAGING_UNIT_PRICE,
    });
  }

  if (input.specializedPhotography === "social") {
    items.push({
      id: "specialized-social",
      name: SPECIALIZED_SOCIAL_NAME,
      unitPrice: SPECIALIZED_SOCIAL_PRICE,
      qty: 1,
      price: SPECIALIZED_SOCIAL_PRICE,
    });
  }

  if (input.specializedPhotography === "both") {
    items.push({
      id: "specialized-both",
      name: SPECIALIZED_BOTH_NAME,
      unitPrice: SPECIALIZED_BOTH_PRICE,
      qty: 1,
      price: SPECIALIZED_BOTH_PRICE,
    });
  }

  if (input.promo) {
    items.push({
      id: `promo-${input.promo.code}`,
      name: `Promo Code: ${input.promo.code}`,
      unitPrice: -input.promo.discount,
      qty: 1,
      price: -input.promo.discount,
    });
  }

  return items;
}

export function sumLineItemPrices(items: Array<{ price: number }>): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

/** Same formatting as booking email Order Total and SMS Estimated total. */
export function orderTotalLabel(value: unknown): string {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

/**
 * Promo is one subtraction. When the negative promo line is already in
 * lineItems, do not also subtract promoDiscount in a display row.
 */
export function separatePromoDiscount(
  lineItems: Array<{ id?: string; name?: string; price?: number }>,
  promoDiscount: unknown,
): number {
  const discount = Number(promoDiscount) || 0;
  if (discount <= 0) return 0;
  const alreadyOnALine = lineItems.some((item) => {
    const name = String(item.name || "");
    const id = String(item.id || "");
    return name.startsWith("Promo Code:") || id.startsWith("promo-");
  });
  return alreadyOnALine ? 0 : discount;
}

export function normalizeBookingLineItems(items: unknown): BookingLineItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const price = Number(item.price) || 0;
    const qty = Number(item.qty) > 0 ? Number(item.qty) : 1;
    const unitPrice =
      item.unitPrice == null || item.unitPrice === ""
        ? price / qty
        : Number(item.unitPrice) || 0;
    const line: BookingLineItem = {
      name: String(item.name || ""),
      unitPrice,
      qty,
      price,
    };
    if (item.id != null && item.id !== "") line.id = String(item.id);
    return line;
  });
}
