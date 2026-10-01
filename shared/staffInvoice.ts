/**
 * Staff invoice editor math and routes.
 * Firestore only. This module does not call Square, email, or SMS.
 */

import { normalizeBookingLineItems, type BookingLineItem } from "./bookingPricing.ts";
import { cleanPersonName, normalizeEmail } from "./listingAccess.ts";

export interface StaffInvoiceForm {
  clientName: string;
  clientEmail: string;
  billToAddress: string;
  notes: string;
  services: Array<{ id?: string; name: string; price: number }>;
  promoCode: string;
  promoDiscount: number;
  tax: number;
}

/** Billing fields written onto the existing invoices doc. Links stay untouched. */
export interface InvoiceBillingPatch {
  clientName?: string;
  clientEmail?: string;
  billToAddress?: string;
  notes?: string;
  lineItems: BookingLineItem[];
  subtotal: number;
  tax: number;
  promoCode: string | null;
  promoDiscount: number;
  total: number;
  amountDue: number;
}

export function staffInvoicePath(invoiceId: string): string {
  return `/admin/invoice/${requiredId(invoiceId)}`;
}

/** Client checkout page. Staff create/view/manage must not navigate here. */
export function clientPaymentPath(invoiceId: string): string {
  return `/invoice/${requiredId(invoiceId)}`;
}

export function billToAddressText(address: unknown): string {
  if (!address) return "";
  if (typeof address === "string") {
    const text = address.trim();
    return text === "—" ? "" : text;
  }
  if (typeof address === "object") {
    const record = address as Record<string, unknown>;
    if (typeof record.formatted === "string" && record.formatted.trim()) return record.formatted.trim();
    return [record.street, record.city, record.state, record.zip]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

export function isPromoLine(item: { id?: string; name?: string }): boolean {
  const name = String(item.name || "");
  const id = String(item.id || "");
  return name.startsWith("Promo Code:") || id.startsWith("promo-");
}

function requiredId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invoice id is required.");
  return value.trim();
}

function cents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function promoCodeFromLine(item: { id?: string; name?: string }): string {
  const name = String(item.name || "");
  if (name.startsWith("Promo Code:")) return name.slice("Promo Code:".length).trim();
  const id = String(item.id || "");
  if (id.startsWith("promo-")) return id.slice("promo-".length).trim();
  return "";
}

/** Services for the editor, plus the promo shown in the promo fields. */
export function splitStaffInvoiceLines(lineItems: unknown, promoCode?: unknown, promoDiscount?: unknown): {
  services: BookingLineItem[];
  promoCode: string;
  promoDiscount: number;
} {
  const lines = normalizeBookingLineItems(lineItems);
  const services = lines.filter((item) => !isPromoLine(item));
  const promoLines = lines.filter((item) => isPromoLine(item));
  const fromLines = promoLines.reduce((sum, item) => sum + Math.abs(item.price), 0);
  const codeFromLine = promoLines.map(promoCodeFromLine).find(Boolean) || "";
  const fieldCode = typeof promoCode === "string" ? promoCode.trim() : "";
  const fieldDiscount = cents(promoDiscount);
  return {
    services,
    promoCode: fieldCode || codeFromLine,
    promoDiscount: fromLines > 0 ? cents(fromLines) : fieldDiscount,
  };
}

function serviceRows(services: unknown): BookingLineItem[] {
  return normalizeBookingLineItems(services).filter((item) => !isPromoLine(item) && (item.name.trim() || item.price !== 0));
}

function withPromoLine(services: BookingLineItem[], promoCode: string, promoDiscount: number): BookingLineItem[] {
  const lines = [...services];
  if (promoDiscount > 0) {
    const code = promoCode || "Discount";
    lines.push({
      id: `promo-${code}`,
      name: `Promo Code: ${code}`,
      unitPrice: -promoDiscount,
      qty: 1,
      price: -promoDiscount,
    });
  }
  return lines;
}

function personName(order: { clientName?: unknown; firstName?: unknown; lastName?: unknown }): string {
  const combined = `${order.firstName || ""} ${order.lastName || ""}`.trim();
  return cleanPersonName(order.clientName || combined);
}

/**
 * Staff editor save. Promo is applied once, as its own line, so the rows match the total.
 * amountPaid on the existing invoice is kept. Document id and order/project links are not in the patch.
 */
export function staffInvoiceSavePatch(
  form: StaffInvoiceForm,
  existing: { amountPaid?: unknown } = {},
): InvoiceBillingPatch {
  const services = serviceRows(form.services);
  const promoCode = form.promoCode.trim();
  const promoDiscount = cents(Math.max(0, Number(form.promoDiscount) || 0));
  const tax = cents(Math.max(0, Number(form.tax) || 0));
  const subtotal = cents(services.reduce((sum, item) => sum + item.price, 0));
  const total = cents(Math.max(0, subtotal - promoDiscount) + tax);
  const amountPaid = cents(Math.max(0, Number(existing.amountPaid) || 0));
  return {
    clientName: cleanPersonName(form.clientName) || "Client",
    clientEmail: normalizeEmail(form.clientEmail),
    billToAddress: form.billToAddress.trim(),
    notes: form.notes.trim(),
    lineItems: withPromoLine(services, promoCode, promoDiscount),
    subtotal,
    tax,
    promoCode: promoCode || null,
    promoDiscount,
    total,
    amountDue: cents(Math.max(0, total - amountPaid)),
  };
}

/**
 * Order service save → existing invoice.
 * Line items and the total are copied from the rows staff just saved.
 * A promo that is already a line stays one subtraction. A promo stored only as a field is kept
 * on the invoice and is not subtracted a second time.
 * The invoice document id is the caller's argument and is never part of this patch.
 */
export function orderServiceInvoicePatch(
  order: {
    lineItems?: unknown;
    pricing?: { tax?: unknown } | null;
    promoCode?: unknown;
    promoDiscount?: unknown;
    clientName?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
    clientEmail?: unknown;
    address?: unknown;
  },
  existing: { amountPaid?: unknown; tax?: unknown; clientName?: unknown; clientEmail?: unknown; billToAddress?: unknown } = {},
): Partial<InvoiceBillingPatch> {
  const patch: Partial<InvoiceBillingPatch> = {};
  const name = personName(order);
  if (name) patch.clientName = name;
  const email = normalizeEmail(order.email || order.clientEmail);
  if (email) patch.clientEmail = email;
  const address = billToAddressText(order.address);
  if (address) patch.billToAddress = address;

  if (!Array.isArray(order.lineItems)) return patch;

  const lineItems = normalizeBookingLineItems(order.lineItems).filter((item) => item.name.trim() || item.price !== 0);
  const services = lineItems.filter((item) => !isPromoLine(item));
  const subtotal = cents(services.reduce((sum, item) => sum + item.price, 0));
  const tax = order.pricing && order.pricing.tax != null && order.pricing.tax !== ""
    ? cents(Math.max(0, Number(order.pricing.tax) || 0))
    : cents(Math.max(0, Number(existing.tax) || 0));
  const total = cents(lineItems.reduce((sum, item) => sum + item.price, 0) + tax);
  const amountPaid = cents(Math.max(0, Number(existing.amountPaid) || 0));
  const split = splitStaffInvoiceLines(lineItems, order.promoCode, order.promoDiscount);

  patch.lineItems = lineItems;
  patch.subtotal = subtotal;
  patch.tax = tax;
  patch.promoCode = split.promoCode || null;
  patch.promoDiscount = split.promoDiscount;
  patch.total = total;
  patch.amountDue = cents(Math.max(0, total - amountPaid));
  return patch;
}
