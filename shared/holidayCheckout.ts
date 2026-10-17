/**
 * Holiday Buy Now checkout. Free RSVPs stay free.
 * Paid Social Saves and 'Tis the Season orders use a Square payment link
 * for the saved order total. This is not a Square invoice publish.
 */

import { squarePaymentNote } from "./paymentAccess.ts";

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
