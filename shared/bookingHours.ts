/**
 * Weekly hours for /book.
 * One company default, plus a per-photographer override.
 * America/Chicago. Weekday start and finish follow the apprenticeship day
 * window so Monday–Friday stay on the current clock. Saturday, Sunday, and
 * Steven's week are booking rules and do not follow APPRENTICESHIP_WORK_DAYS.
 * Travel gaps stay on BOOKING_TRAVEL_BUFFER_MINUTES.
 */

import {
  apprenticeshipHoursFromEnv,
  zonedTimeToUtc,
  type ApprenticeshipSlot,
} from "./apprenticeship.ts";

export const STEVEN_BANDA_ID = "steven-banda";
export const SATURDAY_LATEST_START_MINUTES = 12 * 60;
export const STEVEN_FINISH_MINUTES = 17 * 60;
export const SATURDAY_DELIVERY_NOTE =
  "Saturday shoots are delivered Monday unless you add same-day delivery.";

export interface BookingDayHours {
  /** Minutes from midnight, inclusive. */
  startMinutes: number;
  /** A slot must finish by this minute. */
  endMinutes: number;
  /** A slot must start strictly before this minute. */
  latestStartMinutes?: number;
}

export interface BookingWeek {
  timeZone: string;
  horizonDays: number;
  /** Index 0 is Sunday. null is closed. */
  days: Array<BookingDayHours | null>;
}

export interface BookingHoursConfig {
  company: BookingWeek;
  /** Public photographer id → week. Missing ids use the company week. */
  photographers: Record<string, BookingWeek>;
}

export interface BookingHourWindow {
  timeZone: string;
  horizonDays: number;
  startMinutes: number;
  endMinutes: number;
}

export function bookingHoursFromEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): BookingHoursConfig {
  const base = apprenticeshipHoursFromEnv(env);
  return bookingHoursFromWindow({
    timeZone: base.timeZone,
    horizonDays: base.horizonDays,
    startMinutes: base.startMinutes,
    endMinutes: base.endMinutes,
  });
}

export function bookingHoursFromWindow(window: BookingHourWindow): BookingHoursConfig {
  const weekday: BookingDayHours = {
    startMinutes: window.startMinutes,
    endMinutes: window.endMinutes,
  };
  const saturday: BookingDayHours = {
    ...weekday,
    latestStartMinutes: SATURDAY_LATEST_START_MINUTES,
  };
  const company: BookingWeek = {
    timeZone: window.timeZone,
    horizonDays: window.horizonDays,
    days: [null, weekday, weekday, weekday, weekday, weekday, saturday],
  };
  const stevenDay: BookingDayHours | null = STEVEN_FINISH_MINUTES > window.startMinutes
    ? { startMinutes: window.startMinutes, endMinutes: STEVEN_FINISH_MINUTES }
    : null;
  return {
    company,
    photographers: {
      [STEVEN_BANDA_ID]: {
        timeZone: window.timeZone,
        horizonDays: window.horizonDays,
        days: [stevenDay, stevenDay, stevenDay, stevenDay, stevenDay, stevenDay, stevenDay],
      },
    },
  };
}

export function weekForPhotographer(config: BookingHoursConfig, photographerId: string): BookingWeek {
  return config.photographers[photographerId] ?? config.company;
}

export function isSaturdayCalendarDate(date: string): boolean {
  const match = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const weekday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return weekday === 6;
}

export function saturdayDeliveryNote(date: string | null | undefined): string | null {
  if (!date || !isSaturdayCalendarDate(date)) return null;
  return SATURDAY_DELIVERY_NOTE;
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

export function openBookingSlots(input: {
  now: Date;
  busy: { start: string; end: string }[];
  durationMinutes: number;
  week: BookingWeek;
}): ApprenticeshipSlot[] {
  const duration = input.durationMinutes;
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const busy = input.busy
    .map((block) => ({ start: Date.parse(block.start), end: Date.parse(block.end) }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start);
  const today = zonedParts(input.now, input.week.timeZone);
  const slots: ApprenticeshipSlot[] = [];
  for (let offset = 0; offset < input.week.horizonDays; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset);
    const day = input.week.days[date.weekday] ?? null;
    if (!day) continue;
    const latestStart = day.latestStartMinutes ?? Number.POSITIVE_INFINITY;
    for (
      let minute = day.startMinutes;
      minute + duration <= day.endMinutes;
      minute += duration
    ) {
      if (minute >= latestStart) continue;
      const start = zonedTimeToUtc(
        date.year,
        date.month,
        date.day,
        Math.floor(minute / 60),
        minute % 60,
        input.week.timeZone,
      );
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
        label: `${dayLabel(date.year, date.month, date.day, input.week.timeZone)} · ${time}`,
      });
    }
  }
  return slots;
}
