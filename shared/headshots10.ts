/**
 * $10 Tuesday headshots at Iconic Studios (/headshots-10).
 *
 * A $10 booking fee is due today and counts toward the headshots. One headshot
 * is paid in full ($10.28 with the 2.8% processing fee). Larger orders leave
 * the rest, plus 2.8% on that balance, due on delivery. The fee is charged on
 * each payment, using the same cent rounding as the rest of the site.
 *
 * Slots are Tuesdays 10:00 AM–2:00 PM America/Chicago, 10 minutes, last start
 * 1:50 PM. Those lengths, the per-person cap, and the two-slot threshold are
 * config. Unconfirmed copy stays marked [CONFIRM].
 */

import type { ApprenticeshipSlot } from "./apprenticeship.ts";
import { openBookingSlots, type BookingWeek } from "./bookingHours.ts";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { clientNotifyLive } from "./clientNotify.ts";
import { processingFee } from "./invoiceProcessing.ts";
import { isRealEstate75Holiday, sanitizeGclid } from "./realestate75.ts";

export const HEADSHOTS_LEAD_SOURCE = "Tuesday $10 headshots (Google Ads)";
export const HEADSHOTS_ORDER_SOURCE = "headshots-10";
export const HEADSHOTS_TIME_ZONE = "America/Chicago";
export const HEADSHOTS_UNIT_PRICE = 10;
export const HEADSHOTS_BOOKING_FEE = 10;
export const HEADSHOTS_SLOT_MINUTES = 10;
export const HEADSHOTS_DAY_START_MINUTES = 10 * 60;
export const HEADSHOTS_DAY_END_MINUTES = 14 * 60;
/** Last start is 1:50 PM. A start at that minute is still bookable. */
export const HEADSHOTS_LAST_START_MINUTES = 13 * 60 + 50;
export const HEADSHOTS_DATE_COUNT = 4;
export const HEADSHOTS_HORIZON_DAYS = 35;
export const HEADSHOTS_MAX_QUANTITY = 10;
export const HEADSHOTS_DOUBLE_SLOT_AT = 6;
export const HEADSHOTS_SLOT_CAPACITY = 1;
export const HEADSHOTS_HOLD_MINUTES = 60;
export const HEADSHOTS_HOLD_PREFIX = "HOLD · $10 fee due · ";
export const HEADSHOTS_UNPAID_NOTE = "Booking fee NOT PAID YET. Hold until the Square payment lands.";
export const HEADSHOTS_PAID_NOTE = "Booking fee PAID. The $10 counts toward the headshots.";

export const HEADSHOTS_STUDIO_NAME = "Iconic Studios";
export const HEADSHOTS_STUDIO_ADDRESS = "26410 Oakridge Dr. Ste 105, Spring, TX 77380";
export const HEADSHOTS_STUDIO_LINE = `${HEADSHOTS_STUDIO_NAME}, ${HEADSHOTS_STUDIO_ADDRESS}`;
export const HEADSHOTS_H1 = "$10 Tuesdays! Headshots for $10/Ea.";
export const HEADSHOTS_SEO_TITLE = `${HEADSHOTS_H1} | Iconic Images`;
export const HEADSHOTS_SEO_DESCRIPTION =
  "$10 Tuesdays at Iconic Studios in Spring. Headshots for $10 each, 10am-2pm. Buy as many as you like.";
export const HEADSHOTS_FACTS = [
  "$10 Tuesdays",
  "Headshots $10/Ea.",
  "10am-2pm",
  "Buy as many as you like",
  "Spring, TX",
] as const;
/** Kept for the quote object. The page prints the fee only inside Due today and Balance on delivery. */
export const HEADSHOTS_PRICE_LINE = "$10 per headshot + 2.8% processing fee.";
export const HEADSHOTS_RESERVE_LINE = "Reserve a time to hold your spot.";
export const HEADSHOTS_FULL_LINE = "This Tuesday is full. Pick the next one.";
export const HEADSHOTS_CALENDAR_FALLBACK =
  "Open times are not listed right now. Call or email and we will set the time with you.";
export const HEADSHOTS_MAPS_QUERY = "26410 Oakridge Dr Ste 105, Spring, TX 77380";
export const HEADSHOTS_PARKING_PLACEHOLDER = "[parking and entrance note]";
export const HEADSHOTS_DELIVERY_PLACEHOLDER = "[CONFIRM: delivery time and retouching]";
export const HEADSHOTS_POLICY_PLACEHOLDER = "[CONFIRM: reschedule/cancel policy]";
export const HEADSHOTS_HEADSHOT_MEANING_PLACEHOLDER =
  "[CONFIRM: how many frames or looks are included in each $10 headshot]";
export const HEADSHOTS_MAX_PLACEHOLDER = "[CONFIRM: maximum 10 headshots per booking]";
export const HEADSHOTS_WALKIN_PLACEHOLDER = "[CONFIRM: walk-ins]";
export const HEADSHOTS_BACKGROUND_PLACEHOLDER = "[CONFIRM: background options]";
export const HEADSHOTS_GROUP_PLACEHOLDER = "[CONFIRM: max per person / group bookings]";
export const HEADSHOTS_DELIVERY_FAQ_PLACEHOLDER = "[CONFIRM: delivery time]";
export const HEADSHOTS_RETOUCH_PLACEHOLDER = "[CONFIRM: retouching included]";
export const HEADSHOTS_OTHER_SERVICES_PLACEHOLDER = "[CONFIRM: wording]";

export const HEADSHOT_PATHS = {
  home: "/headshots-10",
  book: "/headshots-10/book",
  how: "/headshots-10/how-it-works",
  faq: "/headshots-10/faq",
  location: "/headshots-10/location",
} as const;

export const HEADSHOT_PREVIEW_SOURCES = [
  HEADSHOT_PATHS.home,
  HEADSHOT_PATHS.book,
  HEADSHOT_PATHS.how,
  HEADSHOT_PATHS.faq,
  HEADSHOT_PATHS.location,
] as const;

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface HeadshotPhoto {
  src: string;
  /** Transparent cutout used in the hero. Circles keep the original frame. */
  cutout?: string;
  alt: string;
  /** Portrait frames use a top crop so the face stays in the cover. */
  objectPosition?: "top" | "center";
}

const HEADSHOT_ALT = "Studio headshot by Iconic Images";

/**
 * The five studio finals Cadi picked. Strip order mixes backdrops.
 * The hero is a staggered cutout of three of them (left, center, right).
 */
export const HEADSHOT_PHOTOS: readonly HeadshotPhoto[] = [
  { src: "/images/headshots-10/headshot-3.jpg", cutout: "/images/headshots-10/headshot-3.webp", alt: HEADSHOT_ALT, objectPosition: "top" },
  { src: "/images/headshots-10/headshot-7.jpg", cutout: "/images/headshots-10/headshot-7.webp", alt: HEADSHOT_ALT, objectPosition: "top" },
  { src: "/images/headshots-10/headshot-2.jpg", cutout: "/images/headshots-10/headshot-2.webp", alt: HEADSHOT_ALT, objectPosition: "top" },
  { src: "/images/headshots-10/headshot-12.jpg", cutout: "/images/headshots-10/headshot-12.webp", alt: HEADSHOT_ALT, objectPosition: "top" },
  { src: "/images/headshots-10/headshot-10.jpg", cutout: "/images/headshots-10/headshot-10.webp", alt: HEADSHOT_ALT, objectPosition: "top" },
];

const HEADSHOT_HERO_SRCS = [
  "/images/headshots-10/headshot-10.jpg",
  "/images/headshots-10/headshot-12.jpg",
  "/images/headshots-10/headshot-7.jpg",
];

export function visibleHeadshotPhotos(photos: readonly HeadshotPhoto[] = HEADSHOT_PHOTOS): HeadshotPhoto[] {
  return photos.filter((photo) => photo.src.trim().length > 0 && photo.alt.trim().length > 0);
}

/** Three cutouts for the staggered hero. Hidden until three photos exist. */
export function headshotHeroGroup(photos: readonly HeadshotPhoto[] = HEADSHOT_PHOTOS): HeadshotPhoto[] {
  const visible = visibleHeadshotPhotos(photos);
  if (visible.length < 3) return [];
  const bySrc = new Map(visible.map((photo) => [photo.src, photo]));
  const picked = HEADSHOT_HERO_SRCS.map((src) => bySrc.get(src)).filter((photo): photo is HeadshotPhoto => Boolean(photo));
  if (picked.length === 3) return picked;
  return visible.slice(0, 3);
}

/** Circular samples. Hidden until three photos exist, and never more than five. */
export function headshotPhotoStrip(photos: readonly HeadshotPhoto[] = HEADSHOT_PHOTOS): HeadshotPhoto[] {
  const visible = visibleHeadshotPhotos(photos);
  if (visible.length < 3) return [];
  return visible.slice(0, 5);
}

export interface HeadshotQuote {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Processing on the whole order (booking charge plus delivery charge). */
  processing: number;
  total: number;
  bookingFee: number;
  dueTodayProcessing: number;
  dueToday: number;
  balanceSubtotal: number;
  balanceProcessing: number;
  balanceTotal: number;
  /** Hidden when nothing is left for delivery. */
  balanceLine: string | null;
  dueTodayLine: string;
  priceLine: string;
  slotsNeeded: number;
}

export interface HeadshotSlotChoice {
  start: string;
  end: string;
  date: string;
  time: string;
  label: string;
  photographerId: string;
}

export function headshotsWeek(): BookingWeek {
  const tuesday = {
    startMinutes: HEADSHOTS_DAY_START_MINUTES,
    endMinutes: HEADSHOTS_DAY_END_MINUTES,
    latestStartMinutes: HEADSHOTS_DAY_END_MINUTES,
  };
  return {
    timeZone: HEADSHOTS_TIME_ZONE,
    horizonDays: HEADSHOTS_HORIZON_DAYS,
    days: [null, null, tuesday, null, null, null, null],
  };
}

export function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function headshotConfig(env: Record<string, string | undefined> = {}): {
  maxQuantity: number;
  doubleSlotAt: number;
  slotCapacity: number;
} {
  return {
    maxQuantity: boundedInt(env.HEADSHOTS_MAX_QUANTITY, HEADSHOTS_MAX_QUANTITY, 1, 30),
    doubleSlotAt: boundedInt(env.HEADSHOTS_DOUBLE_SLOT_AT, HEADSHOTS_DOUBLE_SLOT_AT, 2, 30),
    slotCapacity: boundedInt(env.HEADSHOTS_SLOT_CAPACITY, HEADSHOTS_SLOT_CAPACITY, 1, 5),
  };
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function clampHeadshotQuantity(value: unknown, maxQuantity = HEADSHOTS_MAX_QUANTITY): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(maxQuantity, parsed);
}

export function headshotSlotsNeeded(quantity: number, doubleSlotAt = HEADSHOTS_DOUBLE_SLOT_AT): number {
  return quantity >= doubleSlotAt ? 2 : 1;
}

export function headshotConversionValue(quantity: number): number {
  return clampHeadshotQuantity(quantity) * HEADSHOTS_UNIT_PRICE;
}

export function headshotConversionKey(transactionId: string): string {
  return `headshot-conversion-${transactionId.trim()}`;
}

/** Paid confirmation only, and only the first time this booking id is seen. */
export function shouldRecordHeadshotConversion(input: {
  paid: boolean;
  transactionId: string;
  alreadySeen: boolean;
}): boolean {
  return input.paid === true && input.transactionId.trim().length > 0 && input.alreadySeen !== true;
}

/**
 * Due today is the $10 booking fee plus 2.8% on that $10.
 * The balance is whatever headshots remain, plus 2.8% on that balance.
 */
export function quoteHeadshots(quantity: number, applyProcessing = true, maxQuantity = HEADSHOTS_MAX_QUANTITY): HeadshotQuote {
  const qty = clampHeadshotQuantity(quantity, maxQuantity);
  const subtotal = roundMoney(qty * HEADSHOTS_UNIT_PRICE);
  const bookingFee = Math.min(HEADSHOTS_BOOKING_FEE, subtotal);
  const dueTodayProcessing = applyProcessing ? processingFee(bookingFee) : 0;
  const dueToday = roundMoney(bookingFee + dueTodayProcessing);
  const balanceSubtotal = roundMoney(subtotal - bookingFee);
  const balanceProcessing = applyProcessing && balanceSubtotal > 0 ? processingFee(balanceSubtotal) : 0;
  const balanceTotal = roundMoney(balanceSubtotal + balanceProcessing);
  const processing = roundMoney(dueTodayProcessing + balanceProcessing);
  const total = roundMoney(subtotal + processing);
  const balanceLine = balanceSubtotal > 0
    ? applyProcessing
      ? `Balance on delivery: ${money(balanceSubtotal)} + 2.8%`
      : `Balance on delivery: ${money(balanceSubtotal)}`
    : null;
  return {
    quantity: qty,
    unitPrice: HEADSHOTS_UNIT_PRICE,
    subtotal,
    processing,
    total,
    bookingFee,
    dueTodayProcessing,
    dueToday,
    balanceSubtotal,
    balanceProcessing,
    balanceTotal,
    balanceLine,
    dueTodayLine: `Due today: ${money(dueToday)}`,
    priceLine: applyProcessing ? HEADSHOTS_PRICE_LINE : `${money(HEADSHOTS_UNIT_PRICE)} per headshot.`,
    slotsNeeded: headshotSlotsNeeded(qty),
  };
}

export function headshotLineItems(quantity: number, maxQuantity = HEADSHOTS_MAX_QUANTITY) {
  const qty = clampHeadshotQuantity(quantity, maxQuantity);
  const price = roundMoney(qty * HEADSHOTS_UNIT_PRICE);
  return [{
    id: "tuesday-headshot",
    name: "Tuesday headshot",
    unitPrice: HEADSHOTS_UNIT_PRICE,
    qty,
    price,
  }];
}

function chicagoParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: HEADSHOTS_TIME_ZONE,
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

function isoFromChicagoDay(year: number, month: number, day: number, addDays: number): string {
  const next = new Date(Date.UTC(year, month - 1, day + addDays));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** Next Tuesdays, including holidays. A Tuesday already past 1:50 PM starts next week. */
export function upcomingHeadshotTuesdays(now: Date, count = HEADSHOTS_DATE_COUNT): string[] {
  const parts = chicagoParts(now);
  const minutes = parts.hour * 60 + parts.minute;
  let delta = (2 - parts.weekday + 7) % 7;
  if (delta === 0 && minutes >= HEADSHOTS_LAST_START_MINUTES) delta = 7;
  const dates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(isoFromChicagoDay(parts.year, parts.month, parts.day, delta + index * 7));
  }
  return dates;
}

export function isHeadshotHoliday(date: string): boolean {
  return isRealEstate75Holiday(date);
}

export function openHeadshotSlots(input: {
  now: Date;
  busy?: { start: string; end: string }[];
}): ApprenticeshipSlot[] {
  return openBookingSlots({
    now: input.now,
    busy: input.busy ?? [],
    durationMinutes: HEADSHOTS_SLOT_MINUTES,
    week: headshotsWeek(),
  }).filter((slot) => !isHeadshotHoliday(slot.date));
}

/**
 * One published opening per start, up to the slot capacity.
 * Orders at the two-slot threshold only keep a start when the same photographer
 * is also free for the following 10 minutes. The returned end covers both.
 */
export function publishHeadshotSlots<T extends { start: string; end: string; photographerId: string }>(
  slots: T[],
  quantity: number,
  options?: { capacity?: number; doubleSlotAt?: number },
): T[] {
  const capacity = options?.capacity ?? HEADSHOTS_SLOT_CAPACITY;
  const needed = headshotSlotsNeeded(quantity, options?.doubleSlotAt ?? HEADSHOTS_DOUBLE_SLOT_AT);
  const byStart = new Map<string, T[]>();
  for (const slot of slots) {
    const group = byStart.get(slot.start) ?? [];
    group.push(slot);
    byStart.set(slot.start, group);
  }
  const starts = [...byStart.keys()].sort();
  const published: T[] = [];
  for (const start of starts) {
    const group = byStart.get(start) ?? [];
    const matches = group.filter((slot) => {
      if (needed === 1) return true;
      return (byStart.get(slot.end) ?? []).some((next) => next.photographerId === slot.photographerId);
    });
    for (const slot of matches.slice(0, capacity)) {
      if (needed === 1) {
        published.push(slot);
        continue;
      }
      const follower = (byStart.get(slot.end) ?? []).find((next) => next.photographerId === slot.photographerId);
      published.push(follower ? { ...slot, end: follower.end } : slot);
    }
  }
  return published;
}

export interface HeadshotOrderInput {
  quantity: number;
  slotStart: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gclid: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseHeadshotOrder(
  body: unknown,
  options?: { maxQuantity?: number },
): { ok: true; value: HeadshotOrderInput } | { ok: false; error: string; honeypot?: boolean } {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (text(raw.website) || text(raw.companyWebsite)) {
    return { ok: false, error: "Received.", honeypot: true };
  }
  const maxQuantity = options?.maxQuantity ?? HEADSHOTS_MAX_QUANTITY;
  const quantity = clampHeadshotQuantity(raw.quantity, maxQuantity);
  if (Number(raw.quantity) > maxQuantity) {
    return { ok: false, error: `Choose between 1 and ${maxQuantity} headshots.` };
  }
  const firstName = text(raw.firstName);
  const lastName = text(raw.lastName);
  const email = text(raw.email).toLowerCase();
  const phone = text(raw.phone);
  const slotStart = text(raw.slotStart);
  if (firstName.length < 2 || lastName.length < 1) return { ok: false, error: "Enter your first and last name." };
  if (`${firstName} ${lastName}`.length > 80) return { ok: false, error: "Name is too long." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter an email address." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return { ok: false, error: "Enter a phone number." };
  if (!slotStart || Number.isNaN(Date.parse(slotStart))) return { ok: false, error: "Choose an open time." };
  return {
    ok: true,
    value: {
      quantity,
      slotStart,
      firstName,
      lastName,
      email,
      phone,
      gclid: sanitizeGclid(raw.gclid),
    },
  };
}

export function headshotBookingReturnPath(orderNumber: string): string {
  const params = new URLSearchParams({
    booking: "received",
    paid: "1",
    order: orderNumber,
  });
  return `${HEADSHOT_PATHS.book}?${params.toString()}`;
}

export function headshotHoldExpiresAt(created: Date, minutes = HEADSHOTS_HOLD_MINUTES): string {
  return new Date(created.getTime() + minutes * 60 * 1000).toISOString();
}

function timeValue(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return null;
}

/** True when a headshot order is still waiting on the $10 fee and the 60-minute hold has run out. */
export function headshotHoldExpired(order: Record<string, unknown>, now: Date): boolean {
  if (order.source !== HEADSHOTS_ORDER_SOURCE) return false;
  if (order.status !== "awaiting_deposit") return false;
  if ((Number(order.depositPaid) || 0) > 0) return false;
  const explicit = timeValue(order.holdExpiresAt);
  const created = timeValue(order.createdAt);
  const expires = explicit ?? (created == null ? null : created + HEADSHOTS_HOLD_MINUTES * 60 * 1000);
  return expires != null && expires <= now.getTime();
}

/** Client confirmation mail stays off unless client notifications are live. */
export function headshotClientMailEnabled(
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): boolean {
  return clientNotifyLive(env);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function headshotConfirmationEmailHtml(input: {
  clientName: string;
  whenDate: string;
  whenTime: string;
  quantity: number;
  quote: HeadshotQuote;
  orderNumber: string;
  pageUrl: string;
  wearUrl: string;
}): string {
  const balance = input.quote.balanceLine
    ? `<p>${escapeHtml(input.quote.balanceLine)}. That charge is ${escapeHtml(money(input.quote.balanceTotal))}.</p>`
    : "<p>This booking is paid in full once the booking fee is received. Nothing further is due on delivery.</p>";
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#081228;">
    <h1 style="font-size:24px;">${escapeHtml(HEADSHOTS_H1)}</h1>
    <p>Hi ${escapeHtml(input.clientName)},</p>
    <p>Your Tuesday time is reserved once the $10 booking fee is paid. The $10 counts toward your headshots.</p>
    <p><strong>${escapeHtml(input.whenDate)}</strong> at <strong>${escapeHtml(input.whenTime)}</strong><br/>
    ${input.quantity} headshot${input.quantity === 1 ? "" : "s"}<br/>
    ${escapeHtml(input.quote.dueTodayLine)}<br/>
    Order total ${escapeHtml(money(input.quote.total))}</p>
    ${balance}
    <p>${escapeHtml(HEADSHOTS_STUDIO_LINE)}</p>
    <p>${escapeHtml(HEADSHOTS_PARKING_PLACEHOLDER)}</p>
    <p><a href="${escapeHtml(input.wearUrl)}">What to wear</a></p>
    <p>${escapeHtml(HEADSHOTS_POLICY_PLACEHOLDER)}</p>
    <p>Confirmation: <strong>${escapeHtml(input.orderNumber)}</strong></p>
    <p style="font-size:13px;">${escapeHtml(LEGAL_BUSINESS_NAME)} · ${escapeHtml(BUSINESS_CONTACT.line)}</p>
    <p><a href="${escapeHtml(input.pageUrl)}">${escapeHtml(input.pageUrl)}</a></p>
  </div>`;
}

function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function headshotCalendarIcs(input: {
  start: string;
  end: string;
  orderNumber: string;
  quantity: number;
}): string {
  const uid = `${input.orderNumber.replace(/[^A-Za-z0-9]/g, "") || "headshot"}@iconicimagestx.com`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Iconic Images//Tuesday Headshots//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(input.start)}`,
    `DTEND:${icsStamp(input.end)}`,
    `SUMMARY:${icsText(`$10 Tuesday Headshots (${input.quantity})`)}`,
    `LOCATION:${icsText(HEADSHOTS_STUDIO_LINE)}`,
    `DESCRIPTION:${icsText(`${input.quantity} headshot${input.quantity === 1 ? "" : "s"} at ${HEADSHOTS_STUDIO_LINE}. ${HEADSHOTS_PARKING_PLACEHOLDER}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export const HEADSHOT_PAY_FAQ =
  "A $10 booking fee is due when you book. That charge is $10.28. The $10 counts toward your headshots. One headshot is paid in full. If you buy more, the balance is due on delivery.";
