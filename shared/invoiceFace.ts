/**
 * Sections on the Iconic invoice face.
 * Processing is included only when the invoice already has a non-zero processing amount.
 */

import type { BookingLineItem } from "./bookingPricing.ts";
import { normalizeBookingLineItems } from "./bookingPricing.ts";

export const ADJUSTMENT_LINE_IDS = {
  processing: "adjustment-processing",
  fees: "adjustment-fees",
  travel: "adjustment-travel",
} as const;

export type InvoiceAdjustmentKind = keyof typeof ADJUSTMENT_LINE_IDS;

export interface InvoiceFaceLine {
  name: string;
  description?: string;
  qty: number;
  price: number;
}

export interface InvoiceFace {
  services: InvoiceFaceLine[];
  subtotal: number;
  /** Null when this invoice has no processing amount. */
  processing: number | null;
  promotions: number;
  promoCode: string;
  fees: number;
  travel: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
}

export interface InvoiceFaceRow {
  id: "subtotal" | "processing" | "promotions" | "fees" | "travel" | "tax";
  label: string;
  amount: number;
  signed: "add" | "subtract";
}

export function isPromoInvoiceLine(item: { id?: string; name?: string }): boolean {
  const name = String(item.name || "");
  const id = String(item.id || "");
  return name.startsWith("Promo Code:") || id.startsWith("promo-");
}

export function adjustmentKind(item: { id?: string; category?: string }): InvoiceAdjustmentKind | null {
  const id = String(item.id || "");
  const category = String(item.category || "");
  const kinds = Object.keys(ADJUSTMENT_LINE_IDS) as InvoiceAdjustmentKind[];
  for (const kind of kinds) {
    const key = ADJUSTMENT_LINE_IDS[kind];
    if (id === key || category === key) return kind;
  }
  return null;
}

export function invoiceAdjustmentLine(kind: InvoiceAdjustmentKind, amount: number): BookingLineItem {
  const price = roundMoney(Math.max(0, amount));
  const name = kind === "processing" ? "Processing" : kind === "fees" ? "Fees" : "Travel";
  return {
    id: ADJUSTMENT_LINE_IDS[kind],
    name,
    unitPrice: price,
    qty: 1,
    price,
    category: ADJUSTMENT_LINE_IDS[kind],
  };
}

/**
 * Rows under the line items. Processing is omitted unless the invoice has one.
 * Travel is omitted until a travel amount is on the invoice. Promotions, fees,
 * and tax stay visible so those sections are always on the face.
 */
export function invoiceFaceRows(face: Pick<InvoiceFace, "subtotal" | "processing" | "promotions" | "promoCode" | "fees" | "travel" | "tax">): InvoiceFaceRow[] {
  const rows: InvoiceFaceRow[] = [
    { id: "subtotal", label: "Subtotal", amount: roundMoney(face.subtotal), signed: "add" },
  ];
  if (face.processing != null && face.processing !== 0) {
    rows.push({ id: "processing", label: "Processing", amount: roundMoney(face.processing), signed: "add" });
  }
  const promo = face.promoCode.trim();
  rows.push({
    id: "promotions",
    label: promo ? `Promotions (${promo})` : "Promotions",
    amount: roundMoney(face.promotions),
    signed: "subtract",
  });
  rows.push({ id: "fees", label: "Fees", amount: roundMoney(face.fees), signed: "add" });
  if (face.travel !== 0) {
    rows.push({ id: "travel", label: "Travel", amount: roundMoney(face.travel), signed: "add" });
  }
  rows.push({ id: "tax", label: "Tax", amount: roundMoney(face.tax), signed: "add" });
  return rows;
}

export function invoiceChargeTotal(face: Pick<InvoiceFace, "subtotal" | "processing" | "promotions" | "fees" | "travel" | "tax">): number {
  return roundMoney(
    Math.max(0, roundMoney(face.subtotal) - roundMoney(face.promotions))
    + (face.processing != null ? roundMoney(face.processing) : 0)
    + roundMoney(face.fees)
    + roundMoney(face.travel)
    + roundMoney(face.tax),
  );
}

/** Build the client/staff face from a stored invoice. Does not invent a processing fee. */
export function invoiceFaceFromStored(data: Record<string, unknown>): InvoiceFace {
  const lines = normalizeBookingLineItems(data.lineItems);
  const services = lines.filter((item) => !isPromoInvoiceLine(item) && !adjustmentKind(item));
  const subtotal = explicitAmount(data.subtotal) ?? roundMoney(services.reduce((sum, item) => sum + item.price, 0));
  const processingAmount = explicitAmount(data.processing) ?? lineAmount(lines, "processing");
  const processing = processingAmount != null && processingAmount !== 0 ? processingAmount : null;
  const fees = explicitAmount(data.fees) ?? lineAmount(lines, "fees") ?? 0;
  const travel = explicitAmount(data.travel) ?? lineAmount(lines, "travel") ?? 0;
  const promoFromLines = roundMoney(lines.filter(isPromoInvoiceLine).reduce((sum, item) => sum + Math.abs(item.price), 0));
  const fieldPromo = explicitAmount(data.promoDiscount);
  const promotions = promoFromLines > 0 ? promoFromLines : (fieldPromo ?? 0);
  const promoCode = typeof data.promoCode === "string" ? data.promoCode.trim() : "";
  const tax = explicitAmount(data.tax) ?? 0;
  const amountPaid = explicitAmount(data.amountPaid) ?? 0;
  const computed = invoiceChargeTotal({ subtotal, processing, promotions, fees, travel, tax });
  const total = explicitAmount(data.total) ?? computed;
  const amountDue = explicitAmount(data.amountDue) ?? roundMoney(Math.max(0, total - amountPaid));
  return {
    services: services.map((item) => ({
      name: item.name,
      description: item.description,
      qty: item.qty,
      price: item.price,
    })),
    subtotal,
    processing,
    promotions,
    promoCode,
    fees,
    travel,
    tax,
    total,
    amountPaid,
    amountDue,
  };
}

function lineAmount(lines: BookingLineItem[], kind: InvoiceAdjustmentKind): number | null {
  const match = lines.find((item) => adjustmentKind(item) === kind);
  if (!match) return null;
  return roundMoney(match.price);
}

function explicitAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return roundMoney(amount);
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
