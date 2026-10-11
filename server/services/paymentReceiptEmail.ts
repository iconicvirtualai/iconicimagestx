/**
 * Branded payment receipt. Table layout, inline styles, Arial/Helvetica.
 * Processing is 2.8% of the subtotal, shown as included. The total paid is
 * the amount collected, never subtotal plus the fee.
 *
 * TODO: dedupe processingFee with #132 INVOICE_PROCESSING_MODE when that
 * branch merges. This copy stays local so the receipt does not import #132.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "../../shared/businessContact";
import { receiptEmailNumber } from "../../shared/orderProjectInvoice";
import { publicClientUrl, type PublicSiteEnv } from "../../shared/publicSiteUrl";
import { presentationLinkForReceipt, type ReceiptListingRef } from "./clientLinks";

const FONT = "Arial, Helvetica, sans-serif";
const YELLOW = "#FFE500";
const TEAL = "#14B8C4";
const GREEN = "#16A34A";
const ROW = "#F3F4F6";

/** 2.8% of subtotal, rounded to the nearest cent. Included, not added on top. */
export function processingFee(subtotal: number): number {
  const cents = Math.round((Number(subtotal) || 0) * 100);
  if (cents <= 0) return 0;
  return Math.round(cents * 0.028) / 100;
}

export function receiptLogoUrl(env?: PublicSiteEnv): string {
  return publicClientUrl("/media/logos/iconic-graffiti-logo.png", env);
}

export function receiptPaidLabel(date: Date): string {
  const months = ["JAN.", "FEB.", "MAR.", "APR.", "MAY.", "JUN.", "JUL.", "AUG.", "SEP.", "OCT.", "NOV.", "DEC."];
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${months[date.getUTCMonth()]} ${day}, ${date.getUTCFullYear()}`;
}

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: number;
  total: number;
}

export interface PaymentReceiptContent {
  clientName: string;
  invoiceNumber: string;
  paidAtLabel: string;
  lines: ReceiptLine[];
  subtotal: number;
  processing: number;
  promotions: number;
  fees: number;
  totalPaid: number;
  balance: number;
  galleryUrl: string;
  presentationUrl: string;
  /** Downloads section. Omitted on a partial payment. */
  unlocked: boolean;
  logoUrl: string;
}

export interface RenderedPaymentReceipt {
  subject: string;
  html: string;
  text: string;
}

export function receiptLines(lineItems: unknown): ReceiptLine[] {
  if (!Array.isArray(lineItems)) return [];
  const lines: ReceiptLine[] = [];
  for (const item of lineItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Service";
    const qtyRaw = Number(row.qty ?? row.quantity ?? 1);
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
    const unit = finite(row.unitPrice);
    const linePrice = finite(row.price);
    const explicitTotal = finite(row.total);
    const total = explicitTotal ?? linePrice ?? (unit != null ? roundCents(unit * qty) : 0);
    const shownUnit = unit ?? (qty ? roundCents(total / qty) : total);
    lines.push({ name, qty, unit: shownUnit, total });
  }
  return lines;
}

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
    processing: processingFee(subtotal),
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

export function renderPaymentReceipt(content: PaymentReceiptContent): RenderedPaymentReceipt {
  const subject = `Payment received — ${content.invoiceNumber || "Iconic Images"}`;
  return {
    subject,
    html: receiptHtml(content),
    text: receiptText(content),
  };
}

/** Built-in template variables are strings. Used when a caller does not pass HTML. */
export function paymentReceiptFromVars(
  vars: Record<string, string>,
  env?: PublicSiteEnv,
): RenderedPaymentReceipt {
  let lines: ReceiptLine[] = [];
  if (vars.lineItemsJson) {
    try {
      lines = receiptLines(JSON.parse(vars.lineItemsJson));
    } catch {
      lines = [];
    }
  }
  const subtotal = dollars(vars.subtotal) || lines.reduce((sum, line) => sum + line.total, 0);
  const totalPaid = dollars(vars.totalPaid) || dollars(vars.amount);
  return renderPaymentReceipt({
    clientName: vars.clientName || "there",
    invoiceNumber: vars.invoiceNumber || "",
    paidAtLabel: vars.paidAt || "",
    lines,
    subtotal,
    processing: processingFee(subtotal),
    promotions: dollars(vars.promotions),
    fees: dollars(vars.fees),
    totalPaid,
    balance: dollars(vars.balance),
    galleryUrl: vars.galleryUrl || "",
    presentationUrl: vars.presentationUrl || "",
    unlocked: vars.unlocked === "true" || (dollars(vars.balance) <= 0 && totalPaid > 0),
    logoUrl: vars.logoUrl || receiptLogoUrl(env),
  });
}

function receiptHtml(content: PaymentReceiptContent): string {
  const rows = content.lines.length > 0
    ? content.lines.map((line, index) => lineRow(line, index)).join("")
    : lineRow({ name: "Payment", qty: 1, unit: content.totalPaid, total: content.totalPaid }, 0);
  const downloads = content.unlocked ? downloadsBlock(content) : balanceBlock(content);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.invoiceNumber)} receipt</title>
<style>
@media only screen and (max-width: 480px) {
  .totals-desktop { display: none !important; }
  .totals-mobile { display: table !important; width: 100% !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:700px;font-family:${FONT};color:#111111;">
${headerBlock(content)}
<tr><td style="padding:28px 28px 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:#222222;">
Hi ${escapeHtml(content.clientName)}, we received your payment for invoice ${escapeHtml(content.invoiceNumber)}.
</td></tr>
<tr><td style="padding:12px 20px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT};">
<tr>
<td bgcolor="#000000" style="background:#000000;color:#ffffff;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1px;padding:12px 14px;">DESCRIPTION</td>
<td bgcolor="#000000" align="right" style="background:#000000;color:#ffffff;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1px;padding:12px 10px;">QTY.</td>
<td bgcolor="#000000" align="right" style="background:#000000;color:#ffffff;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1px;padding:12px 10px;">PRICE</td>
<td bgcolor="#000000" align="right" style="background:#000000;color:#ffffff;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1px;padding:12px 14px;">TOTAL</td>
</tr>
${rows}
</table>
</td></tr>
<tr><td style="padding:22px 20px 8px;">
<table class="totals-desktop" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #000000;border-collapse:separate;font-family:${FONT};">
<tr>
${totalCell("SUB TOTAL", money(content.subtotal), false)}
${totalCell("PROCESSING", money(content.processing), false, "INCLUDED")}
${totalCell("PROMOTIONS", money(content.promotions), false)}
${totalCell("FEES", money(content.fees), false)}
${totalCell("TOTAL PAID", money(content.totalPaid), true)}
</tr>
</table>
<table class="totals-mobile" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="display:none;border:2px solid #000000;border-collapse:separate;font-family:${FONT};">
${totalRow("SUB TOTAL", money(content.subtotal), false)}
${totalRow("PROCESSING", money(content.processing), false, "INCLUDED")}
${totalRow("PROMOTIONS", money(content.promotions), false)}
${totalRow("FEES", money(content.fees), false)}
${totalRow("TOTAL PAID", money(content.totalPaid), true)}
</table>
</td></tr>
<tr><td style="padding:8px 24px 4px;font-family:${FONT};font-size:12px;line-height:1.45;color:#6b7280;">
Processing is 2.8% of the subtotal and is included in the total. It is not an extra charge.
</td></tr>
${downloads}
${footerBlock()}
</table>
</td></tr>
</table>
</body>
</html>`;
}

function headerBlock(content: PaymentReceiptContent): string {
  return `<tr><td bgcolor="#000000" style="background:#000000;padding:28px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td valign="top" style="font-family:${FONT};">
<div style="font-family:${FONT};font-size:32px;line-height:1;font-weight:bold;letter-spacing:6px;color:${YELLOW};">RECEIPT</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.4;font-weight:bold;letter-spacing:3px;color:${YELLOW};padding-top:10px;">PAYMENT RECEIVED</div>
<div style="font-family:${FONT};font-size:13px;line-height:1.5;color:#ffffff;padding-top:16px;">INVOICE NO : ${escapeHtml(content.invoiceNumber)}</div>
<div style="font-family:${FONT};font-size:13px;line-height:1.5;color:#ffffff;padding-top:4px;">${escapeHtml(content.paidAtLabel)}</div>
</td>
<td valign="top" align="right" width="160" style="padding-left:12px;">
<img src="${escapeHtml(content.logoUrl)}" alt="Iconic Images" width="140" style="display:block;border:0;outline:none;text-decoration:none;width:140px;max-width:140px;height:auto;">
</td>
</tr>
</table>
</td></tr>`;
}

function lineRow(line: ReceiptLine, index: number): string {
  const bg = index % 2 === 0 ? ROW : "#ffffff";
  return `<tr>
<td bgcolor="${bg}" style="background:${bg};font-family:${FONT};font-size:13px;font-weight:bold;letter-spacing:0.5px;color:${TEAL};padding:14px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.name.toUpperCase())}</td>
<td bgcolor="${bg}" align="right" style="background:${bg};font-family:${FONT};font-size:13px;color:#374151;padding:14px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(String(line.qty))}</td>
<td bgcolor="${bg}" align="right" style="background:${bg};font-family:${FONT};font-size:13px;color:#374151;padding:14px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(money(line.unit))}</td>
<td bgcolor="${bg}" align="right" style="background:${bg};font-family:${FONT};font-size:13px;color:#111111;padding:14px;border-bottom:1px solid #e5e7eb;">${escapeHtml(money(line.total))}</td>
</tr>`;
}

function totalRow(label: string, value: string, emphasis: boolean, note?: string): string {
  const valueStyle = emphasis
    ? "font-size:22px;font-weight:bold;color:#111111;"
    : "font-size:14px;font-weight:bold;color:#111111;";
  const noteHtml = note
    ? `<div style="font-family:${FONT};font-size:10px;font-weight:bold;letter-spacing:0.6px;color:${GREEN};padding-top:2px;">${note}</div>`
    : "";
  return `<tr>
<td style="padding:12px 16px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:0.8px;color:#111111;border-bottom:1px solid #e5e7eb;">${label}</td>
<td align="right" style="padding:12px 16px;font-family:${FONT};${valueStyle}border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}${noteHtml}</td>
</tr>`;
}

function totalCell(label: string, value: string, emphasis: boolean, note?: string): string {
  const valueStyle = emphasis
    ? `font-size:22px;font-weight:bold;color:#111111;`
    : `font-size:14px;font-weight:bold;color:#111111;`;
  const noteHtml = note
    ? `<div style="font-family:${FONT};font-size:10px;font-weight:bold;letter-spacing:0.6px;color:${GREEN};padding-top:3px;">${note}</div>`
    : "";
  return `<td valign="top" align="center" style="padding:14px 6px;font-family:${FONT};">
<div style="font-family:${FONT};font-size:10px;font-weight:bold;letter-spacing:0.8px;color:#111111;">${label}</div>
<div style="font-family:${FONT};${valueStyle}padding-top:6px;">${escapeHtml(value)}</div>
${noteHtml}
</td>`;
}

function downloadsBlock(content: PaymentReceiptContent): string {
  const presentation = content.presentationUrl.trim();
  const gallery = content.galleryUrl.trim();
  if (!presentation && !gallery) return "";
  const primaryHref = presentation || gallery;
  const primaryLabel = presentation ? "View your listing presentation" : "Your downloads &amp; invoice";
  const secondary = presentation && gallery
    ? `<tr><td align="center" style="padding-top:12px;font-family:${FONT};font-size:14px;">
<a href="${escapeHtml(gallery)}" style="color:${TEAL};font-family:${FONT};font-weight:bold;text-decoration:underline;">Your downloads &amp; invoice</a>
</td></tr>`
    : "";
  return `<tr><td style="padding:28px 24px 12px;">
<div style="font-family:${FONT};font-size:22px;line-height:1.3;font-weight:bold;color:#111111;">Your downloads are ready</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
<tr><td bgcolor="#000000" style="background:#000000;border-radius:4px;">
<a href="${escapeHtml(primaryHref)}" style="display:inline-block;padding:14px 22px;font-family:${FONT};font-size:15px;font-weight:bold;color:${YELLOW};text-decoration:none;">${primaryLabel}</a>
</td></tr>
${secondary}
</table>
</td></tr>`;
}

function balanceBlock(content: PaymentReceiptContent): string {
  if (content.balance <= 0) return "";
  return `<tr><td style="padding:20px 24px 8px;font-family:${FONT};font-size:14px;color:#111111;">
Balance due: <strong>${escapeHtml(money(content.balance))}</strong>. Downloads stay locked until the invoice is paid in full.
</td></tr>`;
}

function footerBlock(): string {
  return `<tr><td bgcolor="#000000" style="background:#000000;padding:28px 24px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td valign="top" style="font-family:${FONT};font-size:13px;line-height:1.55;color:#ffffff;">
<div style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:0.6px;color:${GREEN};padding-bottom:8px;">PAYMENT INFORMATION:</div>
${escapeHtml(LEGAL_BUSINESS_NAME)}<br>
${escapeHtml(BUSINESS_CONTACT.phoneDisplay)}<br>
<a href="${escapeHtml(BUSINESS_CONTACT.emailHref)}" style="color:#ffffff;text-decoration:none;font-family:${FONT};">${escapeHtml(BUSINESS_CONTACT.email)}</a>
</td>
<td valign="top" align="right" style="font-family:${FONT};font-size:13px;line-height:1.55;color:#ffffff;">
${escapeHtml(BUSINESS_CONTACT.streetAddress)}<br>
${escapeHtml(BUSINESS_CONTACT.addressLine2)}
</td>
</tr>
</table>
<div style="font-family:${FONT};font-size:13px;font-weight:bold;letter-spacing:3px;color:${TEAL};padding-top:22px;">THANK YOU FOR BEING ICONIC</div>
</td></tr>`;
}

function receiptText(content: PaymentReceiptContent): string {
  const itemLines = (content.lines.length > 0 ? content.lines : [{
    name: "Payment",
    qty: 1,
    unit: content.totalPaid,
    total: content.totalPaid,
  }]).map((line) => `${line.name}  qty ${line.qty}  ${money(line.unit)}  ${money(line.total)}`);
  const links: string[] = [];
  if (content.unlocked) {
    links.push("Your downloads are ready");
    if (content.presentationUrl) links.push(`View your listing presentation: ${content.presentationUrl}`);
    if (content.galleryUrl) links.push(`Your downloads & invoice: ${content.galleryUrl}`);
  } else if (content.balance > 0) {
    links.push(`Balance due: ${money(content.balance)}. Downloads stay locked until the invoice is paid in full.`);
  }
  return [
    "RECEIPT",
    "PAYMENT RECEIVED",
    `Invoice ${content.invoiceNumber}`,
    content.paidAtLabel,
    "",
    `Hi ${content.clientName}, we received your payment.`,
    "",
    ...itemLines,
    "",
    `SUB TOTAL ${money(content.subtotal)}`,
    `PROCESSING ${money(content.processing)} INCLUDED`,
    `PROMOTIONS ${money(content.promotions)}`,
    `FEES ${money(content.fees)}`,
    `TOTAL PAID ${money(content.totalPaid)}`,
    "",
    "Processing is 2.8% of the subtotal and is included in the total. It is not an extra charge.",
    "",
    ...links,
    "",
    "PAYMENT INFORMATION:",
    LEGAL_BUSINESS_NAME,
    BUSINESS_CONTACT.phoneDisplay,
    BUSINESS_CONTACT.email,
    BUSINESS_CONTACT.address,
    "",
    "THANK YOU FOR BEING ICONIC",
  ].filter((line) => line !== undefined).join("\n");
}

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function roundCents(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function dollars(value: string | undefined): number {
  if (!value) return 0;
  const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
