/**
 * Thankful for You Always — Iconic Client Event 2026.
 * Photo times are 15 minutes, offered on 15-minute steps from 11:00 AM
 * through 2:45 PM CT. A 5-minute buffer is kept on both sides of anything
 * already on the photos@ calendar, including holds this page creates.
 * This module does not send mail and does not take payment.
 */

export const THANKFUL_EVENT_SOURCE = "thankful_event";
export const THANKFUL_TIME_ZONE = "America/Chicago";
export const THANKFUL_EVENT_DAY = "2026-11-14";
export const THANKFUL_SLOT_MINUTES = 15;
export const THANKFUL_BUFFER_MINUTES = 5;
export const THANKFUL_STEP_MINUTES = 15;
export const THANKFUL_WINDOW_START_MINUTES = 11 * 60;
export const THANKFUL_WINDOW_END_MINUTES = 15 * 60;
export const THANKFUL_PUBLIC_ORIGIN = "https://iconicimagestx.com";
export const THANKFUL_PAGE_PATH = "/thankful";

export const THANKFUL_HEADLINE = "Thankful for You Always";
export const THANKFUL_EVENT_TITLE = "Thankful for You Always ♥ : Iconic Client Event 2026";
export const THANKFUL_WHEN_LABEL = "Saturday, Nov 14, 2026 · 11 AM–3 PM CT";
export const THANKFUL_LOCATION_LINE =
  "Studio 105, 26410 Oakridge Dr. Ste 105, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com";
export const THANKFUL_STUDIO_ADDRESS = "Studio 105, 26410 Oakridge Dr. Ste 105, Spring, TX 77380";
export const THANKFUL_PHONE_DISPLAY = "281.356.0965";
export const THANKFUL_PHONE_HREF = "tel:+12813560965";
export const THANKFUL_EMAIL = "photos@iconicimagestx.com";
export const THANKFUL_EMAIL_HREF = "mailto:photos@iconicimagestx.com";

export const THANKFUL_DRINKS_NOTE =
  "Wine for adults, and non-alcoholic drinks for kids and anyone who prefers them. Drinks are served either way.";

export const THANKFUL_CLIENT_NOTE =
  "Iconic clients are welcome to ask about 50% off 2027 social packages.";

export interface ThankfulMenu {
  id: "menu-1" | "menu-2" | "menu-3";
  label: string;
  dishes: readonly string[];
}

export const THANKFUL_MENUS: readonly ThankfulMenu[] = [
  {
    id: "menu-1",
    label: "Menu 1",
    dishes: [
      "Smoked Turkey Sliders",
      "Three-Cheese Mac",
      "Caesar Salad Deviled Eggs",
      "Prosciutto Turnovers",
      "Caramel Apple Crisp Cheesecake",
    ],
  },
  {
    id: "menu-2",
    label: "Menu 2",
    dishes: [
      "Thanksgiving Stack",
      "Spinach & Artichoke Gratin Stuffed Mushrooms",
      "Ham & Cheese Pinwheels",
      "Creamed Corn",
      "Valrhona Chocolate Pecan Pie",
    ],
  },
  {
    id: "menu-3",
    label: "Menu 3",
    dishes: [
      "Holiday Charcuterie",
      "Bacon & Bleu Cheese Deviled Eggs",
      "Beef Tenderloin & Caramelized Onion Crostini",
      "Caprese Skewers",
      "Pumpkin Cheesecake",
    ],
  },
];

export interface ThankfulSlot {
  start: string;
  end: string;
  date: string;
  time: string;
  label: string;
}

export interface ThankfulBusySource {
  start: string;
  end: string;
  allDay?: boolean;
}

export interface ThankfulRsvpInput {
  name: string;
  email: string;
  phone: string;
  partySize: number;
  menuVote: ThankfulMenu["id"];
  menuName: string;
  menuDishes: string[];
  santa: boolean;
  notes: string;
  slotStart: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

export function thankfulZonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedParts(new Date(utc), THANKFUL_TIME_ZONE);
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wanted - got;
    if (delta === 0) return new Date(utc);
    utc += delta;
  }
  return new Date(utc);
}

function clockLabel(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dayLabel(): string {
  const instant = thankfulZonedTimeToUtc(2026, 11, 14, 12, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: THANKFUL_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);
}

function overlapsBuffered(start: number, end: number, busy: { start: number; end: number }[], bufferMs: number): boolean {
  return busy.some((block) => start < block.end + bufferMs && end > block.start - bufferMs);
}

/** All-day events that cover Nov 14 block the photo window. Timed events pass through. */
export function thankfulBusyIntervals(blocks: ThankfulBusySource[]): { start: string; end: string }[] {
  const windowStart = thankfulZonedTimeToUtc(2026, 11, 14, 10, 0).toISOString();
  const windowEnd = thankfulZonedTimeToUtc(2026, 11, 14, 16, 0).toISOString();
  const busy: { start: string; end: string }[] = [];
  for (const block of blocks) {
    const start = block.start.trim();
    const end = block.end.trim();
    if (!start || !end) continue;
    if (block.allDay) {
      const startDay = start.slice(0, 10);
      const endDay = end.slice(0, 10);
      if (startDay <= THANKFUL_EVENT_DAY && endDay > THANKFUL_EVENT_DAY) {
        busy.push({ start: windowStart, end: windowEnd });
      }
      continue;
    }
    busy.push({ start, end });
  }
  return busy;
}

export function openThankfulSlots(input: {
  now: Date;
  busy?: ThankfulBusySource[];
}): ThankfulSlot[] {
  const bufferMs = THANKFUL_BUFFER_MINUTES * 60 * 1000;
  const durationMs = THANKFUL_SLOT_MINUTES * 60 * 1000;
  const busy = thankfulBusyIntervals(input.busy || [])
    .map((block) => ({ start: Date.parse(block.start), end: Date.parse(block.end) }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start);
  const slots: ThankfulSlot[] = [];
  const labelDay = dayLabel();
  for (
    let minute = THANKFUL_WINDOW_START_MINUTES;
    minute + THANKFUL_SLOT_MINUTES <= THANKFUL_WINDOW_END_MINUTES;
    minute += THANKFUL_STEP_MINUTES
  ) {
    const start = thankfulZonedTimeToUtc(2026, 11, 14, Math.floor(minute / 60), minute % 60);
    const endMs = start.getTime() + durationMs;
    if (start.getTime() <= input.now.getTime()) continue;
    if (overlapsBuffered(start.getTime(), endMs, busy, bufferMs)) continue;
    const time = clockLabel(minute);
    slots.push({
      start: start.toISOString(),
      end: new Date(endMs).toISOString(),
      date: THANKFUL_EVENT_DAY,
      time,
      label: `${labelDay} · ${time}`,
    });
  }
  return slots;
}

export function findThankfulMenu(id: string): ThankfulMenu | null {
  return THANKFUL_MENUS.find((menu) => menu.id === id) || null;
}

export function parseThankfulRsvp(
  body: unknown,
): { ok: true; value: ThankfulRsvpInput } | { ok: false; error: string; honeypot?: boolean } {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (text(raw.website) || text(raw.companyWebsite)) {
    return { ok: false, error: "Received.", honeypot: true };
  }
  const name = text(raw.name);
  const email = text(raw.email).toLowerCase();
  const phone = text(raw.phone);
  const notes = text(raw.notes);
  const slotStart = text(raw.slotStart);
  if (!name || name.length > 120) return { ok: false, error: "Enter your name." };
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: "Enter a valid email." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return { ok: false, error: "Enter a phone number." };
  const partySize = partySizeOf(raw.partySize);
  if (partySize == null) return { ok: false, error: "Enter the number of people in your party." };
  const menu = findThankfulMenu(text(raw.menuVote));
  if (!menu) return { ok: false, error: "Choose one menu." };
  const santa = santaOf(raw.santa);
  if (santa == null) return { ok: false, error: "Let us know if you want Santa." };
  if (notes.length > 1000) return { ok: false, error: "Notes need to be 1000 characters or fewer." };
  if (!slotStart) return { ok: false, error: "Choose a photo time." };
  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      partySize,
      menuVote: menu.id,
      menuName: menu.label,
      menuDishes: [...menu.dishes],
      santa,
      notes,
      slotStart,
    },
  };
}

function partySizeOf(value: unknown): number | null {
  const raw = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isInteger(raw) || raw < 1 || raw > 50) return null;
  return raw;
}

function santaOf(value: unknown): boolean | null {
  if (value === true || value === "yes") return true;
  if (value === false || value === "no") return false;
  return null;
}
