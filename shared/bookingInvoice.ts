/**
 * Draft invoice payload for a booking. Totals are copied from the request.
 * This module does not call Square.
 */

import { normalizeEmail } from "./listingAccess.ts";
import { normalizeBookingLineItems, type BookingLineItem } from "./bookingPricing.ts";

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
}

export function buildBookingInvoiceDraft(input: BookingInvoiceDraftInput): BookingInvoiceDraft {
  const total = Number(input.total) || 0;
  const lineItems = normalizeBookingLineItems(input.lineItems);
  return {
    orderRequestId: input.orderRequestId || null,
    orderId: null,
    clientId: input.clientId || null,
    clientEmail: normalizeEmail(input.clientEmail),
    clientName: input.clientName,
    lineItems,
    subtotal: Number(input.pricing?.subtotal ?? total) || 0,
    tax: Number(input.pricing?.tax) || 0,
    total,
    amountPaid: 0,
    amountDue: total,
    status: "draft",
    paymentProvider: "square",
    promoCode: input.promoCode || null,
    promoDiscount: Number(input.promoDiscount) || 0,
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
