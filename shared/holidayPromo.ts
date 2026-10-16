/**
 * ’Tis the Season — locked by Cadi.
 *
 * Studio Party: $89 per family, 4-family minimum, 1 hour at $60/hr.
 * 4 × $89 + $60 = $416. The $400+ headline is the floor.
 *
 * Studio Celebration: $79 per family, 6-family minimum, 4 hours at $55/hr.
 * 6 × $79 + 4 × $55 = $694, above the $650+ headline.
 *
 * Package B, Package C, and any Chef menu need a session at least 7 days ahead.
 * Add-on menus are listed without prices.
 */

import { zonedTimeToUtc } from "./apprenticeship.ts";
import { BUSINESS_CONTACT } from "./businessContact.ts";
import {
  cleanText,
  formatUsd,
  isHoneypot,
  phoneDigits,
  PUBLIC_PROCESSING_LABEL,
  validEmail,
  validIsoDate,
  validPhone,
  withProcessing,
} from "./publicRequests.ts";

export const HOLIDAY_PROMO_NAME = "’Tis the Season to be Iconic: Show Off a Little!";
export const HOLIDAY_PROMO_PATH = "/tis-the-season";
export const HOLIDAY_HOOK = "It's early this year, on purpose. You book it. We shoot it.";
export const HOLIDAY_BOOK_START = "2026-11-27";
export const HOLIDAY_BOOK_END = "2026-12-14";
export const HOLIDAY_BOOK_WINDOW = "November 27 – December 14, 2026";
export const HOLIDAY_SESSION_PLACE = "Studio 105";
export const HOLIDAY_GIFT =
  "Studio access is for Iconic clients. One free client testimonial video with every client shoot booked.";
export const HOLIDAY_PROMO_CODE = "#ClientJingle2026";
export const HOLIDAY_LEAD_DAYS = 7;
export const HOLIDAY_LEAD_RULE =
  "Package B, Package C, and any Chef menu must be booked at least 7 days ahead.";
export const HOLIDAY_CALENDAR_NOTE = `We'll confirm this time. Call ${BUSINESS_CONTACT.phoneDisplay} if you need another hour.`;
export const HOLIDAY_DAY_START_MINUTES = 10 * 60;
export const HOLIDAY_DAY_END_MINUTES = 17 * 60;
export const HOLIDAY_SLOT_BUFFER_MINUTES = 5;
export const HOLIDAY_SOURCE = "tis-the-season";
export const HOLIDAY_LEAD = "’Tis the Season";

export const HOLIDAY_ADDONS = [
  {
    id: "branding",
    name: "Branding decorations",
    detail: "Balloon arch, team colors, team sign or logo on the TV slideshow.",
    chef: false,
  },
  { id: "chef-half", name: "Half Chef menu", detail: "For 10–12.", chef: true },
  { id: "chef-full", name: "Full Chef menu", detail: "For 36–48.", chef: true },
  { id: "chef-dessert", name: "Chef dessert menu", detail: "For 10, 20, or 40.", chef: true },
] as const;

export type HolidayAddonId = (typeof HOLIDAY_ADDONS)[number]["id"];

export type HolidayPackageId = "single" | "party" | "celebration";

export type HolidayPackage = {
  id: HolidayPackageId;
  letter: "A" | "B" | "C";
  name: string;
  headline: string;
  summary: string;
  minFamilies: number;
  /** Flat session price, or the per-family rate when pricing is per-family. */
  rate: number;
  pricing: "flat" | "per-family";
  rentalHours: number;
  rentalHourly: number;
  includes: string[];
};

export const HOLIDAY_PACKAGES: readonly HolidayPackage[] = [
  {
    id: "single",
    letter: "A",
    name: "Single Shoots",
    headline: "$99",
    summary: "15 min, 2 holiday sets, 10 photos",
    minFamilies: 1,
    rate: 99,
    pricing: "flat",
    rentalHours: 0,
    rentalHourly: 0,
    includes: ["15 min", "2 holiday sets", "10 photos"],
  },
  {
    id: "party",
    letter: "B",
    name: "Studio Party",
    headline: "$400+",
    summary: "4-family minimum. 1 hour at $60/hr. 2 sets, 10 photos per family.",
    minFamilies: 4,
    rate: 89,
    pricing: "per-family",
    rentalHours: 1,
    rentalHourly: 60,
    includes: ["4-family minimum", "1 hour at $60/hr", "$89 per family", "2 sets", "10 photos per family"],
  },
  {
    id: "celebration",
    letter: "C",
    name: "Studio Celebration",
    headline: "$650+",
    summary: "6-family minimum. 4 hours at $55/hr. 2 sets, 10 photos per family.",
    minFamilies: 6,
    rate: 79,
    pricing: "per-family",
    rentalHours: 4,
    rentalHourly: 55,
    includes: ["6-family minimum", "4 hours at $55/hr", "$79 per family", "2 sets", "10 photos per family"],
  },
];

export type HolidayMathLine = { label: string; amount: number };

export type HolidayQuote = {
  packageId: HolidayPackageId;
  letter: HolidayPackage["letter"];
  name: string;
  headline: string;
  families: number;
  pricing: HolidayPackage["pricing"];
  rate: number;
  rentalHours: number;
  rentalRate: number;
  familySubtotal: number;
  rentalTotal: number;
  subtotal: number;
  processing: number;
  total: number;
  lines: HolidayMathLine[];
};

export function holidayPackage(id: string): HolidayPackage | undefined {
  return HOLIDAY_PACKAGES.find((item) => item.id === id);
}

export function quoteHolidayPackage(packageId: string, families: number): HolidayQuote | null {
  const pkg = holidayPackage(packageId);
  if (!pkg) return null;
  const count = pkg.pricing === "flat" ? 1 : families;
  if (!Number.isInteger(count) || count < pkg.minFamilies || count > 40) return null;
  const familySubtotal = pkg.pricing === "flat" ? pkg.rate : count * pkg.rate;
  const rentalTotal = pkg.rentalHours * pkg.rentalHourly;
  const subtotal = familySubtotal + rentalTotal;
  const money = withProcessing(subtotal);
  const lines: HolidayMathLine[] = [];
  if (pkg.pricing === "flat") {
    lines.push({ label: pkg.name, amount: pkg.rate });
  } else {
    lines.push({ label: `${count} ${count === 1 ? "family" : "families"} × ${formatUsd(pkg.rate)}`, amount: familySubtotal });
    lines.push({
      label: `${pkg.rentalHours} hr studio rental × ${formatUsd(pkg.rentalHourly)}/hr`,
      amount: rentalTotal,
    });
  }
  lines.push({ label: "Session before processing", amount: money.subtotal });
  lines.push({ label: PUBLIC_PROCESSING_LABEL, amount: money.processing });
  return {
    packageId: pkg.id,
    letter: pkg.letter,
    name: pkg.name,
    headline: pkg.headline,
    families: count,
    pricing: pkg.pricing,
    rate: pkg.rate,
    rentalHours: pkg.rentalHours,
    rentalRate: pkg.rentalHourly,
    familySubtotal,
    rentalTotal,
    subtotal: money.subtotal,
    processing: money.processing,
    total: money.total,
    lines,
  };
}

const CHICAGO = "America/Chicago";

export function holidayToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function holidayAddon(id: string) {
  return HOLIDAY_ADDONS.find((item) => item.id === id);
}

export function selectedHolidayAddons(ids: readonly string[]) {
  return ids.map((id) => holidayAddon(id)).filter((item): item is (typeof HOLIDAY_ADDONS)[number] => Boolean(item));
}

export function holidayNeedsLead(packageId: string, addonIds: readonly string[]): boolean {
  if (packageId === "party" || packageId === "celebration") return true;
  return selectedHolidayAddons(addonIds).some((item) => item.chef);
}

/** Earliest session date inside the book window, including the 7-day rule. */
export function holidayEarliestDate(input: { packageId: string; addonIds: readonly string[]; today: string }): string {
  const notice = holidayNeedsLead(input.packageId, input.addonIds) ? addIsoDays(input.today, HOLIDAY_LEAD_DAYS) : input.today;
  return notice > HOLIDAY_BOOK_START ? notice : HOLIDAY_BOOK_START;
}

export interface HolidaySlot {
  start: string;
  end: string;
  date: string;
  /** 24-hour clock, HH:MM, America/Chicago. */
  clock: string;
  time: string;
  label: string;
}

export interface HolidayBusyInterval {
  start: string;
  end: string;
}

function holidaySessionPlan(packageId: string): { duration: number; step: number } | null {
  if (packageId === "celebration") return { duration: 4 * 60, step: 3 * 60 };
  if (packageId === "party") return { duration: 60, step: 60 };
  if (packageId === "single") return { duration: 15, step: 30 };
  return null;
}

function holidayDates(): string[] {
  const dates: string[] = [];
  let cursor = HOLIDAY_BOOK_START;
  while (cursor <= HOLIDAY_BOOK_END) {
    dates.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return dates;
}

function clockOf(value: string): string | null {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clockLabel(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function holidayDayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(zonedTimeToUtc(year, month, day, 12, 0, CHICAGO));
}

function overlapsBuffered(start: number, end: number, busy: { start: number; end: number }[], bufferMs: number): boolean {
  return busy.some((block) => start < block.end + bufferMs && end > block.start - bufferMs);
}

/** Open studio times inside the book window. Package length sets the slot. */
export function openHolidaySlots(input: {
  now: Date;
  packageId: string;
  addonIds?: readonly string[];
  today?: string;
  busy?: readonly HolidayBusyInterval[];
}): HolidaySlot[] {
  const plan = holidaySessionPlan(input.packageId);
  if (!plan) return [];
  const today = input.today && validIsoDate(input.today) ? input.today : holidayToday(input.now);
  const earliest = holidayEarliestDate({
    packageId: input.packageId,
    addonIds: input.addonIds || [],
    today,
  });
  if (earliest > HOLIDAY_BOOK_END) return [];
  const bufferMs = HOLIDAY_SLOT_BUFFER_MINUTES * 60 * 1000;
  const durationMs = plan.duration * 60 * 1000;
  const busy = (input.busy || [])
    .map((block) => ({ start: Date.parse(block.start), end: Date.parse(block.end) }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start);
  const slots: HolidaySlot[] = [];
  for (const date of holidayDates()) {
    if (date < earliest) continue;
    const [year, month, day] = date.split("-").map(Number);
    const labelDay = holidayDayLabel(date);
    for (
      let minute = HOLIDAY_DAY_START_MINUTES;
      minute + plan.duration <= HOLIDAY_DAY_END_MINUTES;
      minute += plan.step
    ) {
      const start = zonedTimeToUtc(year, month, day, Math.floor(minute / 60), minute % 60, CHICAGO);
      const endMs = start.getTime() + durationMs;
      if (start.getTime() <= input.now.getTime()) continue;
      if (overlapsBuffered(start.getTime(), endMs, busy, bufferMs)) continue;
      const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      const time = clockLabel(minute);
      slots.push({
        start: start.toISOString(),
        end: new Date(endMs).toISOString(),
        date,
        clock,
        time,
        label: `${labelDay} · ${time}`,
      });
    }
  }
  return slots;
}

export function holidayMinimumQuote(packageId: HolidayPackageId): HolidayQuote {
  const pkg = holidayPackage(packageId);
  if (!pkg) throw new Error(`Unknown holiday package ${packageId}`);
  const quote = quoteHolidayPackage(packageId, pkg.minFamilies);
  if (!quote) throw new Error(`Holiday package ${packageId} has no minimum quote`);
  return quote;
}

export type HolidayBookingRecord = {
  clientName: string;
  email: string;
  clientEmail: string;
  phone: string;
  clientPhone: string;
  title: string;
  selectedService: string;
  packageId: HolidayPackageId;
  packageLetter: HolidayPackage["letter"];
  packageName: string;
  families: number;
  promoCode: typeof HOLIDAY_PROMO_CODE;
  addonIds: HolidayAddonId[];
  addonNames: string[];
  leadDaysRequired: boolean;
  lineItems: Array<{ id: string; name: string; qty: number; unitPrice: number; price: number }>;
  subtotal: number;
  processing: number;
  total: number;
  pricing: { subtotal: number; tax: number; processing: number; total: number };
  scheduledDate: string;
  scheduledTime: string;
  slotStart: string;
  slotEnd: string;
  requestedDate: string;
  address: string;
  propertyAddress: string;
  notes: string;
  vibeNote: string;
  source: typeof HOLIDAY_SOURCE;
  leadSource: typeof HOLIDAY_LEAD;
  officeFlag: true;
  needsOfficeReview: true;
  clientEmailSent: false;
  payLinkOffered: false;
};

export type HolidayParseResult =
  | { ok: true; record: HolidayBookingRecord; quote: HolidayQuote }
  | { ok: false; error: string; honeypot?: boolean };

function addonIdsFrom(value: unknown): { ok: true; ids: HolidayAddonId[] } | { ok: false; error: string } {
  const raw = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  const ids: HolidayAddonId[] = [];
  for (const entry of raw) {
    const id = cleanText(entry, 40);
    if (!id) continue;
    const addon = holidayAddon(id);
    if (!addon) return { ok: false, error: "Choose an add-on from the list." };
    if (!ids.includes(addon.id)) ids.push(addon.id);
  }
  return { ok: true, ids };
}

export function parseHolidayBooking(input: unknown, options?: { today?: string; slots?: readonly HolidaySlot[] }): HolidayParseResult {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (isHoneypot(body.website)) return { ok: false, error: "Request received.", honeypot: true };
  const today = options?.today && validIsoDate(options.today) ? options.today : holidayToday();

  const name = cleanText(body.name, 80);
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  const email = cleanText(body.email, 120).toLowerCase();
  if (!validEmail(email)) return { ok: false, error: "Enter a valid email." };
  const phone = cleanText(body.phone, 30);
  if (!validPhone(phone)) return { ok: false, error: "Enter a phone number." };

  const packageId = cleanText(body.packageId, 40);
  const pkg = holidayPackage(packageId);
  if (!pkg) return { ok: false, error: "Choose a package." };

  const addons = addonIdsFrom(body.addons);
  if (addons.ok === false) return { ok: false, error: addons.error };
  const needsLead = holidayNeedsLead(pkg.id, addons.ids);
  const earliest = holidayEarliestDate({ packageId: pkg.id, addonIds: addons.ids, today });

  const preferredDate = cleanText(body.preferredDate, 10);
  const preferredTime = cleanText(body.preferredTime, 8);
  const slotStart = cleanText(body.slotStart, 40);
  if (preferredDate && (!validIsoDate(preferredDate) || preferredDate < HOLIDAY_BOOK_START || preferredDate > HOLIDAY_BOOK_END)) {
    return { ok: false, error: "Choose a date between November 27 and December 14, 2026." };
  }
  if (preferredDate && needsLead && (earliest > HOLIDAY_BOOK_END || preferredDate < earliest)) {
    return { ok: false, error: "Choose a session at least 7 days ahead." };
  }

  const slots = options?.slots ?? openHolidaySlots({ now: new Date(), packageId: pkg.id, addonIds: addons.ids, today });
  const clock = clockOf(preferredTime);
  const slot = (slotStart ? slots.find((item) => item.start === slotStart) : undefined)
    || (preferredDate && clock ? slots.find((item) => item.date === preferredDate && item.clock === clock) : undefined);
  if (!slot) return { ok: false, error: "Choose a session time." };
  if (needsLead && (earliest > HOLIDAY_BOOK_END || slot.date < earliest)) {
    return { ok: false, error: "Choose a session at least 7 days ahead." };
  }

  const rawFamilies = Number(body.families);
  const families = pkg.pricing === "flat" ? 1 : rawFamilies;
  if (pkg.pricing === "per-family" && (!Number.isInteger(families) || families < pkg.minFamilies || families > 40)) {
    return {
      ok: false,
      error: `${pkg.name} needs at least ${pkg.minFamilies} families.`,
    };
  }

  const quote = quoteHolidayPackage(pkg.id, families);
  if (!quote) return { ok: false, error: "Choose a package." };

  const notes = cleanText(body.notes, 800);
  const lineItems = [
    pkg.pricing === "flat"
      ? { id: "package", name: pkg.name, qty: 1, unitPrice: pkg.rate, price: pkg.rate }
      : {
          id: "families",
          name: `${pkg.name} families`,
          qty: quote.families,
          unitPrice: pkg.rate,
          price: quote.familySubtotal,
        },
    ...(quote.rentalTotal > 0
      ? [{
          id: "rental",
          name: `Studio rental (${quote.rentalHours} hr)`,
          qty: quote.rentalHours,
          unitPrice: pkg.rentalHourly,
          price: quote.rentalTotal,
        }]
      : []),
    {
      id: "processing",
      name: PUBLIC_PROCESSING_LABEL,
      qty: 1,
      unitPrice: quote.processing,
      price: quote.processing,
    },
  ];

  const record: HolidayBookingRecord = {
    clientName: name,
    email,
    clientEmail: email,
    phone,
    clientPhone: phoneDigits(phone),
    title: `${pkg.letter}: ${pkg.name}`,
    selectedService: pkg.name,
    packageId: pkg.id,
    packageLetter: pkg.letter,
    packageName: pkg.name,
    families: quote.families,
    promoCode: HOLIDAY_PROMO_CODE,
    addonIds: addons.ids,
    addonNames: selectedHolidayAddons(addons.ids).map((item) => item.name),
    leadDaysRequired: needsLead,
    lineItems,
    subtotal: quote.subtotal,
    processing: quote.processing,
    total: quote.total,
    pricing: { subtotal: quote.subtotal, tax: 0, processing: quote.processing, total: quote.total },
    scheduledDate: slot.date,
    scheduledTime: slot.time,
    slotStart: slot.start,
    slotEnd: slot.end,
    requestedDate: slot.date,
    address: HOLIDAY_SESSION_PLACE,
    propertyAddress: HOLIDAY_SESSION_PLACE,
    notes,
    vibeNote: [
      HOLIDAY_LEAD,
      `Package ${pkg.letter}: ${pkg.name}`,
      `Headline ${pkg.headline}`,
      `Families: ${quote.families}`,
      `Session: ${formatUsd(quote.subtotal)}`,
      `${PUBLIC_PROCESSING_LABEL}: ${formatUsd(quote.processing)}`,
      `Quoted total: ${formatUsd(quote.total)}`,
      `Code: ${HOLIDAY_PROMO_CODE}`,
      `Add-ons: ${selectedHolidayAddons(addons.ids).map((item) => item.name).join(", ") || "None"}`,
      needsLead ? HOLIDAY_LEAD_RULE : "No 7-day notice on this request.",
      `Book window: ${HOLIDAY_BOOK_WINDOW}`,
      `Time: ${slot.label}`,
      `Place: ${HOLIDAY_SESSION_PLACE}`,
      "Office flag: review this request.",
      "Client email was not sent.",
      "This request is not a charge.",
      notes,
    ].filter(Boolean).join("\n"),
    source: HOLIDAY_SOURCE,
    leadSource: HOLIDAY_LEAD,
    officeFlag: true,
    needsOfficeReview: true,
    clientEmailSent: false,
    payLinkOffered: false,
  };

  return { ok: true, record, quote };
}
