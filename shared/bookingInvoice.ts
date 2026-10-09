/**
 * Draft invoice payload for a booking. Totals are copied from the request.
 * This module does not call Square.
 */

import { normalizeEmail } from "./listingAccess.ts";
import { normalizeBookingLineItems, sumLineItemPrices, type BookingLineItem } from "./bookingPricing.ts";
import {
  isTravelFeeLine,
  travelInvoiceLine,
  type TravelAssessment,
} from "./travelZones.ts";

export interface BookingInvoiceDraftInput {
  lineItems: unknown;
  total: unknown;
  pricing?: { subtotal?: unknown; tax?: unknown } | null;
  clientEmail: string;
  clientId?: string | null;
  clientName: string;
  orderRequestId?: string | null;
  promoCode?: string | null;
  promoDiscount?: unknown;
  /** Server quote. When set, the draft line and total are rebuilt from it. */
  travel?: TravelAssessment | null;
}

export interface BookingInvoiceDraft {
  orderRequestId: string | null;
  orderId: string | null;
  clientId: string | null;
  clientEmail: string;
  clientName: string;
  lineItems: BookingLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: "draft";
  paymentProvider: "square";
  promoCode: string | null;
  promoDiscount: number;
  travelZone?: number | null;
  travelMiles?: number | null;
  travelFeeCents?: number | null;
  travelQuoted?: boolean;
}

export function buildBookingInvoiceDraft(input: BookingInvoiceDraftInput): BookingInvoiceDraft {
  let lineItems = normalizeBookingLineItems(input.lineItems);
  let total = Number(input.total) || 0;
  const travelFields: Pick<BookingInvoiceDraft, "travelZone" | "travelMiles" | "travelFeeCents" | "travelQuoted"> = {};
  if (input.travel) {
    lineItems = [...lineItems.filter((item) => !isTravelFeeLine(item)), travelInvoiceLine(input.travel)];
    total = Math.round(sumLineItemPrices(lineItems) * 100) / 100;
    travelFields.travelZone = input.travel.travelZone;
    travelFields.travelMiles = input.travel.travelMiles;
    travelFields.travelFeeCents = input.travel.travelFeeCents;
    travelFields.travelQuoted = input.travel.travelQuoted;
  }
  return {
    orderRequestId: input.orderRequestId || null,
    orderId: null,
    clientId: input.clientId || null,
    clientEmail: normalizeEmail(input.clientEmail),
    clientName: input.clientName,
    lineItems,
    subtotal: input.travel ? total : (Number(input.pricing?.subtotal ?? total) || 0),
    tax: Number(input.pricing?.tax) || 0,
    total,
    amountPaid: 0,
    amountDue: total,
    status: "draft",
    paymentProvider: "square",
    promoCode: input.promoCode || null,
    promoDiscount: Number(input.promoDiscount) || 0,
    ...travelFields,
  };
}

export function existingInvoiceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id ? id : null;
}

/** Unpaid invoices send the pay link. Paid invoices resend the receipt. */
export function invoiceDeliveryAction(paid: boolean): "send-invoice" | "payment_receipt" {
  return paid ? "payment_receipt" : "send-invoice";
}
