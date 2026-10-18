/**
 * Iconic Client Holiday Event, Sat Nov 7, 2026.
 * Times are America/Chicago. Social rates are an explicit table.
 * The server quotes the Square amount from this file.
 */

import { mailboxAddress } from "./clientNotify.ts";
import { DELIVERY_QA_CLIENT_EMAIL } from "./deliveryQaClient.ts";
import { processingFeeCents } from "./invoiceProcessing.ts";

export const THANKFUL_EVENT_DATE = "2026-11-07";
export const THANKFUL_EVENT_WHEN = "Sat, Nov 7, 2026";
export const THANKFUL_EVENT_HOURS = "11 AM – 3 PM CT";

/** Studio 105 is closed to other work for the event itself. */
export const THANKFUL_BUSY_WINDOW = {
  date: THANKFUL_EVENT_DATE,
  start: "11:00",
  end: "15:00",
  timeZone: "America/Chicago",
} as const;

/**
 * Headcount, menu vote, and RSVP close Sat Oct 31, 2026 at 11:59:00 PM CT.
 * A request at that instant is still accepted. The next millisecond is not.
 * 11:59:00 PM CDT is 04:59:00 UTC on Nov 1.
 */
export const THANKFUL_RSVP_CLOSE_UTC = "2026-11-01T04:59:00.000Z";

export const THANKFUL_RSVP_CLOSED =
  "Headcount and menu votes closed Sat, Oct 31 at 11:59 PM CT.";

/** Day rate, in percent, by America/Chicago calendar day. */
export const SOCIAL_RATE_BY_DATE: Record<string, number> = {
  "2026-10-16": 50,
  "2026-10-17": 49,
  "2026-10-18": 47,
  "2026-10-19": 45,
  "2026-10-20": 43,
  "2026-10-21": 41,
  "2026-10-22": 39,
  "2026-10-23": 37,
  "2026-10-24": 35,
  "2026-10-25": 33,
  "2026-10-26": 31.5,
  "2026-10-27": 30,
  "2026-10-28": 28.5,
  "2026-10-29": 27,
  "2026-10-30": 25.5,
  "2026-10-31": 24,
  "2026-11-01": 23.5,
  "2026-11-02": 23,
  "2026-11-03": 22.5,
  "2026-11-04": 22,
  "2026-11-05": 21.5,
  "2026-11-06": 21,
  "2026-11-07": 20,
};

export const SOCIAL_PACKAGES = [
  { name: "The Baseline", monthlyDollars: 500 },
  { name: "The Growth Engine", monthlyDollars: 850 },
  { name: "The Professional Suite", monthlyDollars: 1500 },
  { name: "The Connected Core", monthlyDollars: 2000 },
  { name: "The Signature Tier", monthlyDollars: 2800 },
  { name: "The Authority Stack", monthlyDollars: 3200 },
  { name: "The Iconic Partnership", monthlyDollars: 4500 },
] as const;

export const SOCIAL_PRICING_ENDED =
  "Social pricing ended after Sat, Nov 7. Call 281.356.0965.";

export function chicagoDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function thankfulRsvpOpen(now: Date): boolean {
  return now.getTime() <= Date.parse(THANKFUL_RSVP_CLOSE_UTC);
}

const SOCIAL_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Null before Oct 16 and after Sat Nov 7 CT. Nov 7 itself stays at 20% through 11:59:59 PM. */
export function socialRateForDateKey(key: string): number | null {
  if (!SOCIAL_DATE_KEY.test(key)) return null;
  return Object.prototype.hasOwnProperty.call(SOCIAL_RATE_BY_DATE, key)
    ? SOCIAL_RATE_BY_DATE[key]
    : null;
}

export function socialRateForInstant(now: Date): number | null {
  return socialRateForDateKey(chicagoDateKey(now));
}

export interface SocialRateView {
  date: string;
  percent: number | null;
  ended: boolean;
  dropsTomorrow: boolean;
  preview: boolean;
}

/**
 * One Chicago day. A requested date is used only when preview is allowed.
 * Otherwise the view is today, and the requested day is not echoed back.
 */
export function socialRateView(now: Date, requestedDate: string | null, previewAllowed: boolean): SocialRateView {
  const today = chicagoDateKey(now);
  const asked = requestedDate && SOCIAL_DATE_KEY.test(requestedDate.trim()) ? requestedDate.trim() : null;
  const preview = Boolean(asked && asked !== today && previewAllowed);
  const date = preview && asked ? asked : today;
  const percent = socialRateForDateKey(date);
  return {
    date,
    percent,
    ended: percent == null,
    dropsTomorrow: percent != null && percent !== SOCIAL_RATE_BY_DATE[THANKFUL_EVENT_DATE],
    preview,
  };
}

/** Admin staff, or the delivery-QA test mailbox. Coordinators and other staff are not enough. */
export function socialRatePreviewAllowed(input: { role?: string | null; email?: string | null }): boolean {
  if (input.role === "admin") return true;
  return mailboxAddress(input.email || "") === DELIVERY_QA_CLIENT_EMAIL;
}

export function socialTermPercent(dayRate: number, months: number): number | null {
  if (months === 12) return dayRate + 10;
  if (months === 6) return dayRate + 5;
  if (months === 3 || months === 1) return dayRate;
  return null;
}

/** List price times (1 - rate), half-up to the cent. Rate may be a half percent. */
export function discountedCents(listCents: number, percent: number): number {
  const tenths = Math.round(percent * 10);
  return Math.round((listCents * (1000 - tenths)) / 1000);
}

export interface SocialTermQuote {
  percent: number;
  monthlyCents: number;
  termCents: number;
  processingCents: number;
  squareCents: number;
}

export function quoteSocialTerm(monthlyDollars: number, months: number, dayRate: number): SocialTermQuote | null {
  const percent = socialTermPercent(dayRate, months);
  if (percent == null) return null;
  const monthlyCents = discountedCents(Math.round(monthlyDollars * 100), percent);
  const termCents = Math.max(0, monthlyCents * months - (months === 3 ? 10000 : 0));
  const processingCents = processingFeeCents(termCents);
  return {
    percent,
    monthlyCents,
    termCents,
    processingCents,
    squareCents: termCents + processingCents,
  };
}

export interface ThankfulSocialQuote {
  ok: true;
  packageName: string;
  months: number;
  termDollars: number;
  squareDollars: number;
  quote: SocialTermQuote;
}

export function quoteThankfulSocialSave(input: {
  label?: unknown;
  packageName?: unknown;
  months?: unknown;
  now: Date;
}): ThankfulSocialQuote | { ok: false; error: string } {
  const rate = socialRateForInstant(input.now);
  if (rate == null) return { ok: false, error: SOCIAL_PRICING_ENDED };
  const parsed = parseSocialSave(input.label, input.packageName, input.months);
  if (!parsed) return { ok: false, error: "Choose a social package and a 12, 6, 3, or 1 month term." };
  const pack = SOCIAL_PACKAGES.find((item) => item.name === parsed.name);
  if (!pack) return { ok: false, error: "Choose a social package and a 12, 6, 3, or 1 month term." };
  const quote = quoteSocialTerm(pack.monthlyDollars, parsed.months, rate);
  if (!quote) return { ok: false, error: "Choose a social package and a 12, 6, 3, or 1 month term." };
  return {
    ok: true,
    packageName: pack.name,
    months: parsed.months,
    termDollars: quote.termCents / 100,
    squareDollars: quote.squareCents / 100,
    quote,
  };
}

function parseSocialSave(label: unknown, packageName: unknown, months: unknown): { name: string; months: number } | null {
  const named = typeof packageName === "string" ? packageName.trim() : "";
  const monthCount = Number(months);
  if (named && SOCIAL_PACKAGES.some((item) => item.name === named) && validMonths(monthCount)) {
    return { name: named, months: monthCount };
  }
  const text = typeof label === "string" ? label : "";
  const match = /Social Saves 2027:\s*(.+?),\s*(\d+)\s+months/i.exec(text);
  if (!match || !validMonths(Number(match[2]))) return null;
  const name = match[1].trim();
  if (!SOCIAL_PACKAGES.some((item) => item.name === name)) return null;
  return { name, months: Number(match[2]) };
}

function validMonths(months: number): months is 1 | 3 | 6 | 12 {
  return months === 1 || months === 3 || months === 6 || months === 12;
}
