/**
 * Public apprenticeship booking.
 *
 * Prices, appointment caps, rules, and overage come from the booking catalog
 * (shared/bookingCatalog.ts, served at GET /api/bookings/catalog).
 * The $25 booking fee is a deposit on that package, charged through the same
 * Square deposit checkout senior living uses. Processing is the site 2.8% line.
 */

import { buildBookingInvoiceDraft } from "./bookingInvoice.ts";
import { buildSubmittedLineItems } from "./bookingPricing.ts";
import {
  APPRENTICESHIP_OVERAGE_LABEL,
  APPRENTICESHIP_RULES,
  bookingOffer,
  isApprenticeshipPackage,
  packagesForStaffEditor,
  type CatalogItem,
  type StaffCatalogPackage,
} from "./bookingCatalog.ts";
import { BOOKING_PROCESSING_LABEL } from "./invoiceProcessing.ts";
import { applyServerTravel, travelCustomerLine, type TravelAssessment } from "./travelZones.ts";

export const APPRENTICESHIP_ORDER_SOURCE = "apprenticeship";
export const APPRENTICESHIP_CALENDAR_ID = "steven@iconicimagestx.com";
export const APPRENTICESHIP_TIME_ZONE = "America/Chicago";
export const APPRENTICESHIP_BOOKING_FEE = 25;
export const APPRENTICESHIP_BOOKING_FEE_LINE = "Booking fee $25, credited toward your package";
export const APPRENTICESHIP_BALANCE_LINE = "The balance is invoiced after the shoot.";
export const APPRENTICESHIP_CALENDAR_FALLBACK =
  "Open times are not listed right now. Call or email and we will set the appointment with you.";
export const APPRENTICESHIP_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export { BOOKING_PROCESSING_LABEL };

export interface ApprenticeshipHours {
  timeZone: string;
  /** Minutes from midnight, inclusive start. */
  startMinutes: number;
  /** Minutes from midnight, exclusive end. A slot must finish by this time. */
  endMinutes: number;
  /** 0 Sunday … 6 Saturday. Default is Monday–Saturday. */
  days: number[];
  horizonDays: number;
  calendarId: string;
}

export interface ApprenticeshipPackageView extends CatalogItem {
  overage: string;
  durationMinutes: number;
  rules: string[];
}

export interface ApprenticeshipSlot {
  start: string;
  end: string;
  date: string;
  time: string;
  label: string;
}

export interface ApprenticeshipQuote {
  packageId: string;
  packageName: string;
  durationMinutes: number;
  subtotal: number;
  processing: number;
  processingLabel: string;
  travel: TravelAssessment;
  travelLabel: string;
  travelAmount: string | null;
  total: number;
  bookingFee: number;
  bookingFeeLine: string;
  balanceDue: number;
  balanceLine: string;
  lineItems: ReturnType<typeof buildBookingInvoiceDraft>["lineItems"];
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function apprenticeshipDurationMinutes(appointmentLimit: string | undefined, packageId: string): number {
  const text = (appointmentLimit || "").toLowerCase();
  const minutes = text.match(/(\d+)\s*minute/);
  if (minutes) {
    const value = Number(minutes[1]);
    if (value > 0 && value <= 24 * 60) return value;
  }
  const hours = text.match(/(\d+)\s*hour/);
  if (hours) {
    const value = Number(hours[1]) * 60;
    if (value > 0 && value <= 24 * 60) return value;
  }
  return packageId === "apprentice-50" ? 60 : 20;
}

export function apprenticeshipPackageViews(
  catalog: StaffCatalogPackage[] = packagesForStaffEditor([]),
): ApprenticeshipPackageView[] {
  const offer = bookingOffer(catalog);
  return offer.apprenticeshipPackages.map((item) => {
    const staff = catalog.find((entry) => entry.id === item.id);
    const rules = item.rules?.length ? item.rules : [...APPRENTICESHIP_RULES];
    return {
      ...item,
      rules,
      overage: staff?.overage || APPRENTICESHIP_OVERAGE_LABEL,
      durationMinutes: apprenticeshipDurationMinutes(item.appointmentLimit, item.id),
    };
  });
}

export function findApprenticeshipPackage(
  packageId: string,
  catalog: StaffCatalogPackage[] = packagesForStaffEditor([]),
): ApprenticeshipPackageView | null {
  const id = packageId.trim();
  if (!isApprenticeshipPackage(id)) return null;
  return apprenticeshipPackageViews(catalog).find((item) => item.id === id) || null;
}

function parseClock(value: string | undefined, fallback: number): number {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

function parseDays(value: string | undefined, fallback: number[]): number[] {
  if (!value || !value.trim()) return fallback;
  const days = value
    .split(/[^0-9]+/)
    .map((part) => Number(part))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length ? [...new Set(days)] : fallback;
}

function parseHorizon(value: string | undefined, fallback: number): number {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 60) return fallback;
  return days;
}

export function apprenticeshipHoursFromEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): ApprenticeshipHours {
  const startMinutes = parseClock(env.APPRENTICESHIP_DAY_START, 9 * 60);
  const endMinutes = parseClock(env.APPRENTICESHIP_DAY_END, 18 * 60);
  const days = parseDays(env.APPRENTICESHIP_WORK_DAYS, [1, 2, 3, 4, 5, 6]);
  const calendarId = (env.APPRENTICESHIP_CALENDAR_ID || APPRENTICESHIP_CALENDAR_ID).trim() || APPRENTICESHIP_CALENDAR_ID;
  const requestedZone = (env.APPRENTICESHIP_TIME_ZONE || APPRENTICESHIP_TIME_ZONE).trim() || APPRENTICESHIP_TIME_ZONE;
  let timeZone = APPRENTICESHIP_TIME_ZONE;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: requestedZone }).format(new Date());
    timeZone = requestedZone;
  } catch {
    timeZone = APPRENTICESHIP_TIME_ZONE;
  }
  return {
    timeZone,
    startMinutes,
    endMinutes: endMinutes > startMinutes ? endMinutes : 18 * 60,
    days,
    horizonDays: parseHorizon(env.APPRENTICESHIP_HORIZON_DAYS, 14),
    calendarId,
  };
}

export function apprenticeshipCalendarSetupNote(input: {
  calendarId: string;
  serviceAccountEmail: string | null;
  missingCredentials: boolean;
}): string {
  const email = input.serviceAccountEmail || "the service account email in FIREBASE_SERVICE_ACCOUNT";
  const share = `Steven needs to share ${input.calendarId} with ${email} and allow Make changes to events, or set up domain-wide delegation for ${email} with the Google Calendar scope ${APPRENTICESHIP_CALENDAR_SCOPE}.`;
  if (!input.missingCredentials) return share;
  return `Set FIREBASE_SERVICE_ACCOUNT to the Firebase service account JSON. ${share}`;
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY[parts.weekday] ?? 0,
  };
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wanted - got;
    if (delta === 0) return new Date(utc);
    utc += delta;
  }
  return new Date(utc);
}

function addCalendarDays(year: number, month: number, day: number, add: number) {
  const next = new Date(Date.UTC(year, month - 1, day + add));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    weekday: next.getUTCDay(),
  };
}

function clockLabel(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dayLabel(year: number, month: number, day: number, timeZone: string): string {
  const instant = zonedTimeToUtc(year, month, day, 12, 0, timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);
}

function overlaps(start: number, end: number, busy: { start: number; end: number }[]): boolean {
  return busy.some((block) => start < block.end && end > block.start);
}

export function openApprenticeshipSlots(input: {
  now: Date;
  busy: { start: string; end: string }[];
  durationMinutes: number;
  hours: ApprenticeshipHours;
}): ApprenticeshipSlot[] {
  const duration = input.durationMinutes;
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const busy = input.busy
    .map((block) => ({ start: Date.parse(block.start), end: Date.parse(block.end) }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start);
  const today = zonedParts(input.now, input.hours.timeZone);
  const slots: ApprenticeshipSlot[] = [];
  for (let offset = 0; offset < input.hours.horizonDays; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset);
    if (!input.hours.days.includes(date.weekday)) continue;
    for (
      let minute = input.hours.startMinutes;
      minute + duration <= input.hours.endMinutes;
      minute += duration
    ) {
      const start = zonedTimeToUtc(date.year, date.month, date.day, Math.floor(minute / 60), minute % 60, input.hours.timeZone);
      const end = new Date(start.getTime() + duration * 60 * 1000);
      if (start.getTime() <= input.now.getTime()) continue;
      if (overlaps(start.getTime(), end.getTime(), busy)) continue;
      const dateKey = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
      const time = clockLabel(minute);
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        date: dateKey,
        time,
        label: `${dayLabel(date.year, date.month, date.day, input.hours.timeZone)} · ${time}`,
      });
    }
  }
  return slots;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quoteApprenticeship(input: {
  packageId: string;
  address?: unknown;
  applyProcessing?: boolean;
  catalog?: StaffCatalogPackage[];
}): { ok: true; quote: ApprenticeshipQuote } | { ok: false; error: string } {
  const catalog = input.catalog ?? packagesForStaffEditor([]);
  const pkg = findApprenticeshipPackage(input.packageId, catalog);
  if (!pkg) return { ok: false, error: "Choose an apprenticeship package." };
  const traveled = applyServerTravel(
    buildSubmittedLineItems({ selectedBasics: [pkg.id], catalog }),
    input.address,
  );
  const draft = buildBookingInvoiceDraft({
    lineItems: traveled.lineItems,
    total: traveled.total,
    pricing: { subtotal: traveled.total, tax: 0 },
    clientEmail: "quote@iconicimagestx.com",
    clientName: "Quote",
    travel: traveled.travel,
    applyProcessing: input.applyProcessing !== false,
  });
  const travelLine = travelCustomerLine(traveled.travel);
  return {
    ok: true,
    quote: {
      packageId: pkg.id,
      packageName: pkg.appointmentLimit ? `${pkg.name} (${pkg.appointmentLimit})` : pkg.name,
      durationMinutes: pkg.durationMinutes,
      subtotal: draft.subtotal,
      processing: draft.processing ?? 0,
      processingLabel: BOOKING_PROCESSING_LABEL,
      travel: traveled.travel,
      travelLabel: travelLine.label,
      travelAmount: travelLine.amount,
      total: draft.total,
      bookingFee: APPRENTICESHIP_BOOKING_FEE,
      bookingFeeLine: APPRENTICESHIP_BOOKING_FEE_LINE,
      balanceDue: roundMoney(Math.max(0, draft.total - APPRENTICESHIP_BOOKING_FEE)),
      balanceLine: APPRENTICESHIP_BALANCE_LINE,
      lineItems: draft.lineItems,
    },
  };
}

export interface ApprenticeshipOrderInput {
  packageId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  slotStart: string | null;
  preferredTime: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseApprenticeshipOrder(
  body: unknown,
): { ok: true; value: ApprenticeshipOrderInput } | { ok: false; error: string; honeypot?: boolean } {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (text(raw.website) || text(raw.companyWebsite)) {
    return { ok: false, error: "Received.", honeypot: true };
  }
  const name = text(raw.name);
  const explicitFirst = text(raw.firstName);
  const explicitLast = text(raw.lastName);
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = explicitFirst || parts[0] || "";
  const lastName = explicitLast || parts.slice(1).join(" ") || (explicitFirst ? "" : "");
  const email = text(raw.email).toLowerCase();
  const phone = text(raw.phone);
  const address = text(raw.address);
  const packageId = text(raw.packageId);
  const slotStart = text(raw.slotStart);
  const preferredTime = text(raw.preferredTime);

  if (!isApprenticeshipPackage(packageId) || !findApprenticeshipPackage(packageId)) {
    return { ok: false, error: "Choose an apprenticeship package." };
  }
  if (firstName.length < 2) return { ok: false, error: "Enter your name." };
  if (`${firstName} ${lastName}`.trim().length > 80) return { ok: false, error: "Name is too long." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return { ok: false, error: "Enter a phone number." };
  if (address.length < 5) return { ok: false, error: "Enter the property address." };
  if (address.length > 200) return { ok: false, error: "Address is too long." };
  if (slotStart && Number.isNaN(Date.parse(slotStart))) return { ok: false, error: "Choose an open time." };
  if (preferredTime.length > 160) return { ok: false, error: "Preferred time is too long." };

  return {
    ok: true,
    value: {
      packageId,
      firstName,
      lastName: lastName || firstName,
      email,
      phone,
      address,
      slotStart: slotStart || null,
      preferredTime,
    },
  };
}

export function apprenticeshipBookingReturnPath(orderNumber: string): string {
  const params = new URLSearchParams({
    booking: "received",
    order: orderNumber,
  });
  return `/apprenticeship?${params.toString()}`;
}

export function usd(amount: number): string {
  const whole = Number.isInteger(amount);
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
