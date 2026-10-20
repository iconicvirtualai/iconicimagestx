/**
 * $75 apprentice listing shoot (/realestate-75).
 *
 * One package. Hours are America/Chicago and differ from the company /book
 * week: weekdays 8:00–5:00 (last start 4:40), Saturday 9:00–12:00 (last start
 * 11:40), Sunday closed. Open times still come from the /book calendars.
 * The card total is the catalog $75 plus the site 2.8% processing line.
 */

import type { ApprenticeshipSlot } from "./apprenticeship.ts";
import { openBookingSlots, type BookingWeek } from "./bookingHours.ts";
import { computeInvoiceTotals } from "./invoiceProcessing.ts";
import type { TravelAssessment } from "./travelZones.ts";

export const RE75_LEAD_SOURCE = "Real Estate $75 apprentice (Google Ads)";
export const RE75_PACKAGE_ID = "apprentice-25";
export const RE75_PACKAGE_NAME = "Apprentice 25 / $75";
export const RE75_SUBTOTAL = 75;
export const RE75_DURATION_MINUTES = 20;
export const RE75_TIME_ZONE = "America/Chicago";
export const RE75_HORIZON_DAYS = 14;
export const RE75_OUTSIDE_MESSAGE = "Call us 281.356.0965";
export const RE75_TRAVEL_TBD_NOTE =
  "Travel fees for Cypress and Willis are still being confirmed (TBD). We will tell you before any travel fee is added.";
export const RE75_SAMPLES_CAPTION = "Recent Iconic Images listing photos";

export const RE75_PATHS = {
  home: "/realestate-75",
  schedule: "/realestate-75/schedule",
  samples: "/realestate-75/samples",
  how: "/realestate-75/how-it-works",
} as const;

export const RE75_PREVIEW_SOURCES = [
  RE75_PATHS.home,
  RE75_PATHS.schedule,
  RE75_PATHS.samples,
  RE75_PATHS.how,
] as const;

const WEEKDAY_START = 8 * 60;
const WEEKDAY_END = 17 * 60;
const SATURDAY_START = 9 * 60;
const SATURDAY_END = 12 * 60;
/** A Saturday slot must start strictly before noon. 11:40 is allowed. */
const SATURDAY_LATEST_START = 12 * 60;

export type RealEstate75Travel = "standard" | "tbd";

export interface RealEstate75Place {
  city: string;
  travelFee: RealEstate75Travel;
}

const PLACES: Array<RealEstate75Place & { zips: readonly string[] }> = [
  { city: "The Woodlands", travelFee: "standard", zips: ["77380", "77381", "77382", "77384", "77385"] },
  { city: "Spring", travelFee: "standard", zips: ["77373", "77379", "77386", "77388", "77389"] },
  { city: "Conroe", travelFee: "standard", zips: ["77301", "77302", "77303", "77304", "77306"] },
  { city: "Willis", travelFee: "tbd", zips: ["77318", "77378"] },
  { city: "Cypress", travelFee: "tbd", zips: ["77410", "77429", "77433"] },
];

const ZIP_PLACES = new Map<string, RealEstate75Place>();
for (const place of PLACES) {
  for (const zip of place.zips) ZIP_PLACES.set(zip, { city: place.city, travelFee: place.travelFee });
}

const CITY_PATTERNS: Array<{ pattern: RegExp; place: RealEstate75Place }> = [
  { pattern: /\bthe\s+woodlands\b/i, place: { city: "The Woodlands", travelFee: "standard" } },
  { pattern: /\bcypress\b/i, place: { city: "Cypress", travelFee: "tbd" } },
  { pattern: /\bwillis\b/i, place: { city: "Willis", travelFee: "tbd" } },
  { pattern: /\bconroe\b/i, place: { city: "Conroe", travelFee: "standard" } },
  { pattern: /\bspring\b/i, place: { city: "Spring", travelFee: "standard" } },
];

export type RealEstate75Area =
  | { status: "inside"; zip: string | null; city: string; travelFee: RealEstate75Travel }
  | { status: "outside"; message: typeof RE75_OUTSIDE_MESSAGE };

export function realEstate75Zips(): string[] {
  return [...ZIP_PLACES.keys()];
}

export function extractZipCodes(value: string): string[] {
  return [...value.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)].map((match) => match[1]);
}

/**
 * ZIP wins when one is present. A known city name is enough when there is no ZIP.
 * Anything else, including a known city paired with an outside ZIP, is outside.
 */
export function classifyRealEstate75Area(value: string): RealEstate75Area {
  const text = value.trim();
  const zips = extractZipCodes(text);
  if (zips.length) {
    const zip = zips[zips.length - 1];
    const place = ZIP_PLACES.get(zip);
    if (!place) return { status: "outside", message: RE75_OUTSIDE_MESSAGE };
    return { status: "inside", zip, city: place.city, travelFee: place.travelFee };
  }
  for (const candidate of CITY_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return { status: "inside", zip: null, city: candidate.place.city, travelFee: candidate.place.travelFee };
    }
  }
  return { status: "outside", message: RE75_OUTSIDE_MESSAGE };
}

export interface RealEstate75Quote {
  packageId: string;
  packageName: string;
  subtotal: number;
  processing: number;
  total: number;
  /** Shown on the page and again in the summary, before payment. */
  priceLine: string;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Same 2.8% line a /book invoice stores. Travel is not part of this quote. */
export function realEstate75Quote(applyProcessing = true): RealEstate75Quote {
  const totals = computeInvoiceTotals({
    subtotal: RE75_SUBTOTAL,
    applyProcessing,
  });
  const priceLine = applyProcessing
    ? `$75 + 2.8% processing fee (${money(totals.total)} total by card).`
    : money(totals.total);
  return {
    packageId: RE75_PACKAGE_ID,
    packageName: RE75_PACKAGE_NAME,
    subtotal: totals.subtotal,
    processing: totals.processing,
    total: totals.total,
    priceLine,
  };
}

/**
 * Cypress and Willis stay unpriced until travel for those cities is decided.
 * Miles are kept. The fee is not stored as $0.
 */
export function quoteRealEstate75Travel(travel: TravelAssessment): TravelAssessment {
  return {
    travelZone: null,
    travelMiles: travel.travelMiles,
    travelFeeCents: null,
    travelQuoted: true,
  };
}

export function realEstate75Week(horizonDays = RE75_HORIZON_DAYS): BookingWeek {
  const weekday = { startMinutes: WEEKDAY_START, endMinutes: WEEKDAY_END };
  const saturday = {
    startMinutes: SATURDAY_START,
    endMinutes: SATURDAY_END,
    latestStartMinutes: SATURDAY_LATEST_START,
  };
  return {
    timeZone: RE75_TIME_ZONE,
    horizonDays,
    days: [null, weekday, weekday, weekday, weekday, weekday, saturday],
  };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftIso(year: number, month: number, day: number, delta: number): string {
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function observedFixed(year: number, month: number, day: number): string[] {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const actual = isoDate(year, month, day);
  if (dow === 6) return [actual, shiftIso(year, month, day, -1)];
  if (dow === 0) return [actual, shiftIso(year, month, day, 1)];
  return [actual];
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return isoDate(year, month, day);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  return isoDate(year, month, day);
}

const holidayYears = new Map<number, Set<string>>();

/** Federal holidays this studio closes, plus the Friday after Thanksgiving. */
export function realEstate75HolidayDates(year: number): Set<string> {
  const cached = holidayYears.get(year);
  if (cached) return cached;
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const [y, m, d] = thanksgiving.split("-").map(Number);
  const dates = [
    ...observedFixed(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    lastWeekday(year, 5, 1),
    ...observedFixed(year, 6, 19),
    ...observedFixed(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    thanksgiving,
    shiftIso(y, m, d, 1),
    ...observedFixed(year, 12, 25),
  ];
  const set = new Set(dates);
  holidayYears.set(year, set);
  return set;
}

export function isRealEstate75Holiday(date: string): boolean {
  const match = date.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (!match) return false;
  return realEstate75HolidayDates(Number(match[1])).has(date);
}

export function openRealEstate75Slots(input: {
  now: Date;
  busy?: { start: string; end: string }[];
  horizonDays?: number;
}): ApprenticeshipSlot[] {
  const week = realEstate75Week(input.horizonDays ?? RE75_HORIZON_DAYS);
  return openBookingSlots({
    now: input.now,
    busy: input.busy ?? [],
    durationMinutes: RE75_DURATION_MINUTES,
    week,
  }).filter((slot) => !isRealEstate75Holiday(slot.date));
}

export function sanitizeGclid(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(trimmed)) return "";
  return trimmed;
}

export function withGclid(path: string, gclid: string): string {
  const id = sanitizeGclid(gclid);
  if (!id) return path;
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("gclid", id);
  const hashIndex = base.indexOf("#");
  const pathname = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
  return `${pathname}?${params.toString()}`;
}
