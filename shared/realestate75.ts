/**
 * Apprentice listing shoots (/realestate-75).
 *
 * Two catalog packages: Apprentice 25 ($75, 20 minutes) and Apprentice 50
 * ($125, 1 hour). Hours are America/Chicago and differ from the company /book
 * week: weekdays 8:00–5:00, Saturday 9:00–12:00, Sunday closed. A slot must
 * finish inside the window and start strictly before Saturday noon. The order
 * form asks for a date and time inside that week. It does not hold a live
 * calendar opening. The card total is the catalog price plus the site 2.8%
 * processing line.
 */

import type { ApprenticeshipSlot } from "./apprenticeship.ts";
import { openBookingSlots, type BookingWeek } from "./bookingHours.ts";
import { computeInvoiceTotals } from "./invoiceProcessing.ts";
import type { TravelAssessment } from "./travelZones.ts";

export const RE75_LEAD_SOURCE = "Real Estate $75 apprentice (Google Ads)";

export interface RealEstate75Package {
  id: "apprentice-25" | "apprentice-50";
  /** Line name stored on the order. Catalog ids stay apprentice-25 / apprentice-50. */
  name: string;
  photos: number;
  durationMinutes: number;
  subtotal: number;
  /** Honest upgrade line on the $125 card. The $75 card has none. */
  nudge: string | null;
}

export const RE75_PACKAGES: readonly RealEstate75Package[] = [
  {
    id: "apprentice-25",
    name: "Apprentice 25 / $75",
    photos: 25,
    durationMinutes: 20,
    subtotal: 75,
    nudge: null,
  },
  {
    id: "apprentice-50",
    name: "Apprentice 50 / $125",
    photos: 50,
    durationMinutes: 60,
    subtotal: 125,
    nudge: "More rooms? Go 50.",
  },
];

export type RealEstate75PackageId = RealEstate75Package["id"];

export const RE75_PACKAGE_ID: RealEstate75PackageId = "apprentice-25";
export const RE75_PACKAGE_NAME = "Apprentice 25 / $75";
export const RE75_SUBTOTAL = 75;
export const RE75_DURATION_MINUTES = 20;
export const RE75_TIME_ZONE = "America/Chicago";
export const RE75_HORIZON_DAYS = 14;
export const RE75_OUTSIDE_MESSAGE = "Call us 281.356.0965";
/** Shown when a requested apprentice time is Sunday, after Saturday noon, or outside the weekday window. */
export const RE75_TIME_MESSAGE =
  "Choose a weekday or Saturday morning. Sunday is closed, and Saturday shoots start before noon.";
export const RE75_TRAVEL_TBD_NOTE =
  "Travel fees for Cypress and Willis are still being confirmed (TBD). We will tell you before any travel fee is added.";
export const RE75_GALLERY_CAPTION = "Recent Iconic Images listing photos";
export const RE75_GALLERY_DISCLAIMER =
  "$75 and $125 shoots are photographed by an Iconic Images apprentice. Gallery shows recent Iconic Images listing work.";

export function isRealEstate75PackageId(value: unknown): value is RealEstate75PackageId {
  return value === "apprentice-25" || value === "apprentice-50";
}

/** Unknown ids fall back to the $75 package. Callers that must reject them check the id first. */
export function realEstate75Package(value: unknown): RealEstate75Package {
  return RE75_PACKAGES.find((item) => item.id === value) ?? RE75_PACKAGES[0];
}

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
export function realEstate75Quote(applyProcessing = true, packageId?: unknown): RealEstate75Quote {
  const pkg = realEstate75Package(packageId);
  const totals = computeInvoiceTotals({
    subtotal: pkg.subtotal,
    applyProcessing,
  });
  const priceLine = applyProcessing
    ? `$${pkg.subtotal} + 2.8% processing fee (${money(totals.total)} total by card).`
    : money(totals.total);
  return {
    packageId: pkg.id,
    packageName: pkg.name,
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
  /** 20 for Apprentice 25. 60 for Apprentice 50. The grid steps by this length. */
  durationMinutes?: number;
}): ApprenticeshipSlot[] {
  const week = realEstate75Week(input.horizonDays ?? RE75_HORIZON_DAYS);
  const durationMinutes = input.durationMinutes && input.durationMinutes > 0
    ? input.durationMinutes
    : RE75_DURATION_MINUTES;
  return openBookingSlots({
    now: input.now,
    busy: input.busy ?? [],
    durationMinutes,
    week,
  }).filter((slot) => !isRealEstate75Holiday(slot.date));
}

export interface RealEstate75OpenDay {
  date: string;
  times: string[];
}

/**
 * Requested apprentice times. Not live calendar openings.
 * Weekdays 8:00–5:00, Saturday before noon, Sunday closed, holidays closed.
 */
export function realEstate75OpenSchedule(input: {
  now?: Date;
  durationMinutes: number;
  horizonDays?: number;
}): RealEstate75OpenDay[] {
  const slots = openRealEstate75Slots({
    now: input.now ?? new Date(),
    durationMinutes: input.durationMinutes,
    horizonDays: input.horizonDays ?? RE75_HORIZON_DAYS,
  });
  const groups = new Map<string, string[]>();
  for (const slot of slots) {
    const times = groups.get(slot.date) || [];
    if (!times.includes(slot.time)) times.push(slot.time);
    groups.set(slot.date, times);
  }
  return [...groups.entries()].map(([date, times]) => ({ date, times }));
}

const DATE_MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** ISO day, or the short label createOrder stores ("Oct 21, 2026"). */
export function realEstate75DateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return null;
  const month = DATE_MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A requested date and clock time that still fits the apprentice week.
 * Returns the canonical slot label so the order stores "9:00 AM", not a hold.
 */
export function realEstate75AppointmentChoice(input: {
  date: unknown;
  time: unknown;
  durationMinutes: number;
  now?: Date;
}): { date: string; time: string } | null {
  const date = realEstate75DateKey(input.date);
  if (!date || typeof input.time !== "string") return null;
  const wanted = input.time.trim().toLowerCase().replace(/\s+/g, " ");
  if (!wanted) return null;
  const day = realEstate75OpenSchedule({
    now: input.now,
    durationMinutes: input.durationMinutes,
  }).find((entry) => entry.date === date);
  const time = day?.times.find((choice) => choice.toLowerCase() === wanted) || null;
  return time ? { date, time } : null;
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
