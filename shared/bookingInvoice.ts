/**
 * Draft invoice payload for a booking. Totals are copied from the request.
 * This module does not call Square.
 */

import { normalizeEmail } from "./listingAccess.ts";
import { normalizeBookingLineItems, sumLineItemPrices, type BookingLineItem } from "./bookingPricing.ts";
import { invoiceAdjustmentLine, adjustmentKind, isPromoInvoiceLine } from "./invoiceFace.ts";
import { computeInvoiceTotals, type ProcessingPolicy } from "./invoiceProcessing.ts";
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
  /**
   * True on a new booking. Adds 2.8% once and stores it.
   * False copies the stored total. Legacy orders and project drafts stay false.
   */
  applyProcessing?: boolean;
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
  processing?: number;
  processingPolicy?: ProcessingPolicy;
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

  const tax = Number(input.pricing?.tax) || 0;
  if (input.applyProcessing) {
    const priced = applyProcessingToDraftLines(lineItems, {
      promoDiscount: Number(input.promoDiscount) || 0,
      tax,
    });
    lineItems = priced.lineItems;
    total = priced.total;
    return {
      orderRequestId: input.orderRequestId || null,
      orderId: null,
      clientId: input.clientId || null,
      clientEmail: normalizeEmail(input.clientEmail),
      clientName: input.clientName,
      lineItems,
      subtotal: priced.subtotal,
      tax,
      total,
      amountPaid: 0,
      amountDue: total,
      status: "draft",
      paymentProvider: "square",
      promoCode: input.promoCode || null,
      promoDiscount: priced.promotions,
      processing: priced.processing,
      processingPolicy: priced.processingPolicy,
      ...travelFields,
    };
  }

  return {
    orderRequestId: input.orderRequestId || null,
    orderId: null,
    clientId: input.clientId || null,
    clientEmail: normalizeEmail(input.clientEmail),
    clientName: input.clientName,
    lineItems,
    subtotal: input.travel ? total : (Number(input.pricing?.subtotal ?? total) || 0),
    tax,
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

function applyProcessingToDraftLines(
  lineItems: BookingLineItem[],
  input: { promoDiscount: number; tax: number },
) {
  const services = lineItems.filter((item) => !isPromoInvoiceLine(item) && !adjustmentKind(item) && !isTravelFeeLine(item));
  const promoLines = lineItems.filter((item) => isPromoInvoiceLine(item));
  const travelLines = lineItems.filter((item) => isTravelFeeLine(item));
  const feeLines = lineItems.filter((item) => adjustmentKind(item) === "fees");
  const storedProcessing = lineItems.find((item) => adjustmentKind(item) === "processing");
  const subtotal = roundDraftMoney(services.reduce((sum, item) => sum + item.price, 0));
  const promoFromLines = roundDraftMoney(promoLines.reduce((sum, item) => sum + Math.abs(item.price), 0));
  const promotions = promoFromLines > 0 ? promoFromLines : roundDraftMoney(Math.max(0, input.promoDiscount));
  const fees = roundDraftMoney(feeLines.reduce((sum, item) => sum + item.price, 0));
  const travel = roundDraftMoney(travelLines.reduce((sum, item) => sum + item.price, 0));
  const totals = computeInvoiceTotals({
    subtotal,
    promotions,
    fees,
    travel,
    tax: input.tax,
    processing: storedProcessing ? storedProcessing.price : null,
    applyProcessing: !storedProcessing,
  });
  const next = [
    ...services,
    ...promoLines,
    ...feeLines,
    ...travelLines,
  ];
  if (totals.processing > 0 && !storedProcessing) {
    next.push(invoiceAdjustmentLine("processing", totals.processing));
  } else if (storedProcessing) {
    next.push(storedProcessing);
  }
  return { ...totals, lineItems: next };
}

function roundDraftMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
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
