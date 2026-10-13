/**
 * Branded payment receipt. Table layout, inline styles, Arial/Helvetica.
 * Processing is 2.8% of the sale base, charged on top of the sale.
 * TOTAL PAID is the amount collected. A legacy or comped invoice that was
 * not charged the fee shows PROCESSING $0.00.
 *
 * The HTML renderer lives in shared/paymentReceiptLayout.ts so the admin
 * preview and sendEmail use the same built-in receipt. This file keeps the
 * invoice-to-receipt assembly, including the presentation link.
 */

import { receiptEmailNumber } from "../../shared/orderProjectInvoice";
import {
  paymentReceiptFromVars,
  receiptLines,
  receiptLogoUrl,
  receiptPaidLabel,
  receiptProcessing,
  renderPaymentReceipt,
  type PaymentReceiptContent,
  type ReceiptLine,
  type RenderedPaymentReceipt,
} from "../../shared/paymentReceiptLayout";
import { publicClientUrl, type PublicSiteEnv } from "../../shared/publicSiteUrl";
import { presentationLinkForReceipt, type ReceiptListingRef } from "./clientLinks";

export {
  paymentReceiptFromVars,
  receiptLines,
  receiptLogoUrl,
  receiptPaidLabel,
  receiptProcessing,
  renderPaymentReceipt,
};
export type { PaymentReceiptContent, ReceiptLine, RenderedPaymentReceipt };
export { processingFee } from "../../shared/invoiceProcessing";

export function buildPaymentReceipt(input: {
  invoice: Record<string, unknown>;
  invoiceId: string;
  paidAt?: Date;
  unlocked: boolean;
  amountPaid?: number;
  balance?: number;
  galleryId?: unknown;
  listing?: ReceiptListingRef | null;
  /** Preview only. Production leaves this unset and uses presentationLinkForReceipt. */
  presentationUrl?: string | null;
  env?: PublicSiteEnv;
}): RenderedPaymentReceipt {
  const lines = receiptLines(input.invoice.lineItems);
  const subtotal = finite(input.invoice.subtotal) ?? lines.reduce((sum, line) => sum + line.total, 0);
  const promotions = finite(input.invoice.promoDiscount) ?? finite(input.invoice.promotions) ?? 0;
  const fees = finite(input.invoice.fees) ?? 0;
  const totalPaid = input.amountPaid ?? finite(input.invoice.amountPaid) ?? finite(input.invoice.total) ?? 0;
  const balance = input.balance ?? 0;
  const processing = receiptProcessing({
    invoice: input.invoice,
    subtotal,
    promotions,
    fees,
    totalPaid,
  });
  const galleryId = text(input.galleryId) || text(input.invoice.galleryId);
  const galleryUrl = galleryId ? publicClientUrl(`/gallery/${encodeURIComponent(galleryId)}`, input.env) : "";
  const presentationUrl = input.presentationUrl === undefined
    ? (presentationLinkForReceipt(input.listing) || "")
    : (input.presentationUrl || "");
  return renderPaymentReceipt({
    clientName: text(input.invoice.clientName) || "there",
    invoiceNumber: receiptEmailNumber({
      invoiceNumber: input.invoice.invoiceNumber,
      id: input.invoiceId,
      createdAt: input.invoice.createdAt,
    }, input.paidAt),
    paidAtLabel: receiptPaidLabel(input.paidAt || new Date()),
    lines,
    subtotal,
    processing,
    promotions,
    fees,
    totalPaid,
    balance,
    galleryUrl,
    presentationUrl,
    unlocked: input.unlocked,
    logoUrl: receiptLogoUrl(input.env),
  });
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
