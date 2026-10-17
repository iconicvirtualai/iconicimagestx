/**
 * Holiday Buy Now checkout. Free RSVPs stay free.
 * Paid Social Saves and 'Tis the Season orders use a Square payment link
 * for the saved order total. This is not a Square invoice publish.
 */

import { clientEmailContactLineHtml } from "./clientEmailContact.ts";
import { squarePaymentNote } from "./paymentAccess.ts";
import { publicClientUrl } from "./publicSiteUrl.ts";

export const HOLIDAY_SOCIAL_SAVES_LEAD = "Thankful social saves";
export const HOLIDAY_SEASON_LEAD = "Tis the season client shoots";
export const HOLIDAY_RSVP_LEAD = "Thankful client holiday event RSVP";

const PAID_LEADS = new Set<string>([HOLIDAY_SOCIAL_SAVES_LEAD, HOLIDAY_SEASON_LEAD]);

export type HolidayCheckoutKind = "paid" | "free" | "none";

export function holidayCheckoutKind(leadSource: unknown, total: unknown): HolidayCheckoutKind {
  const lead = typeof leadSource === "string" ? leadSource.trim() : "";
  if (lead === HOLIDAY_RSVP_LEAD) return "free";
  if (!PAID_LEADS.has(lead)) return "none";
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) return "free";
  return "paid";
}

/** Names only. Values stay in the environment. */
export function squareCheckoutMissingEnv(env: Record<string, string | undefined> = process.env): string[] {
  const missing: string[] = [];
  if (!env.SQUARE_ACCESS_TOKEN) missing.push("SQUARE_ACCESS_TOKEN");
  if (!env.SQUARE_LOCATION_ID) missing.push("SQUARE_LOCATION_ID");
  return missing;
}

export function holidayReturnPath(leadSource: string, orderNumber: string): string {
  const params = new URLSearchParams({
    paid: "1",
    order: orderNumber,
  });
  const query = params.toString();
  if (leadSource === HOLIDAY_SEASON_LEAD) return `/tis-the-season?${query}#book`;
  return `/thankful?${query}#social-saves`;
}

export function holidayPaymentLinkBody(input: {
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
  itemName: string;
  email?: string;
  locationId: string;
  redirectUrl: string;
}): Record<string, unknown> {
  const cents = Math.round(input.amount * 100);
  const key = `holiday-${input.invoiceId}`;
  return {
    idempotency_key: key.length <= 45 ? key : key.slice(0, 45),
    quick_pay: {
      name: `Iconic Images ${input.itemName}`.slice(0, 255),
      price_money: {
        amount: cents,
        currency: "USD",
      },
      location_id: input.locationId,
    },
    checkout_options: {
      redirect_url: input.redirectUrl,
    },
    ...(input.email ? { pre_populated_data: { buyer_email: input.email } } : {}),
    payment_note: squarePaymentNote(input.invoiceId, input.invoiceNumber),
  };
}

function escapeHolidayHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Client confirmation for a holiday RSVP or Buy Now. Not the real-estate booking shell. */
export function holidayOrderReceivedHtml(input: {
  clientName: string;
  serviceName: string;
  whenDate: string;
  whenTime: string;
  total: string;
  requestId: string;
  pagePath: string;
  complimentary: boolean;
}): string {
  const pageUrl = publicClientUrl(input.pagePath);
  const whenTime = input.whenTime.trim() || "We'll confirm the time";
  const payLine = input.complimentary
    ? "This RSVP is complimentary. No payment is due."
    : `Amount due: <strong>${escapeHolidayHtml(input.total)}</strong>. If checkout did not open, we will text a secure payment link.`;
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#1a120e;padding:20px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#f6efe4;margin:0;font-size:24px;font-weight:500;">Iconic Images</h1>
      <p style="color:#e7d3a1;margin:6px 0 0;font-size:12px;letter-spacing:0.14em;">HOLIDAY 2026</p>
    </div>
    <h2 style="color:#1a120e;font-weight:500;">We received your request</h2>
    <p>Hi ${escapeHolidayHtml(input.clientName)},</p>
    <p>Thank you. We have <strong>${escapeHolidayHtml(input.serviceName)}</strong> for <strong>${escapeHolidayHtml(input.whenDate)}</strong> at <strong>${escapeHolidayHtml(whenTime)}</strong>.</p>
    <p>${payLine}</p>
    <p style="color:#666666;font-size:13px;">Confirmation ID: <strong>${escapeHolidayHtml(input.requestId)}</strong></p>
    <p><a href="${escapeHolidayHtml(pageUrl)}" style="color:#9b2c3a;">View the holiday page</a></p>
    <div style="border-top:1px solid #eeeeee;margin-top:28px;padding-top:16px;text-align:center;color:#666666;font-size:12px;">
      <p>${clientEmailContactLineHtml("#666666")}</p>
      <p><a href="${escapeHolidayHtml(pageUrl)}" style="color:#666666;text-decoration:underline;">iconicimagestx.vercel.app</a></p>
    </div>
  </div>`;
}
