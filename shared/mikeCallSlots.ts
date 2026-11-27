/**
 * Call windows for Mike Luna.
 * Monday–Friday, 9:00 AM–12:00 PM and 2:00 PM–4:00 PM America/Chicago.
 * Slots are 30 minutes and must finish inside the window.
 * Saturday, Sunday, and the midday gap are closed.
 */

import { zonedTimeToUtc } from "./apprenticeship.ts";

export const MIKE_CALL_TIME_ZONE = "America/Chicago";
export const MIKE_CALL_DURATION_MINUTES = 30;
export const MIKE_CALL_HORIZON_DAYS = 14;
export const MIKE_CALL_PHOTOGRAPHER_ID = "mike-luna";
export const MIKE_CALL_PHOTOGRAPHER_NAME = "Mike Luna";
export const MIKE_CALL_WINDOW_LABEL =
  "Monday–Friday, 9:00 AM–12:00 PM or 2:00 PM–4:00 PM CT";

export const MIKE_CALL_WINDOWS = [
  { id: "morning", label: "9:00 AM–12:00 PM", startMinutes: 9 * 60, endMinutes: 12 * 60 },
  { id: "afternoon", label: "2:00 PM–4:00 PM", startMinutes: 14 * 60, endMinutes: 16 * 60 },
] as const;

export type MikeCallWindowId = (typeof MIKE_CALL_WINDOWS)[number]["id"];

export interface MikeCallSlot {
  start: string;
  end: string;
  date: string;
  time: string;
  label: string;
  window: MikeCallWindowId;
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

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
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

function dayLabel(year: number, month: number, day: number): string {
  const instant = zonedTimeToUtc(year, month, day, 12, 0, MIKE_CALL_TIME_ZONE);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MIKE_CALL_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);
}

function busyIntervals(busy: { start: string; end: string }[]): Array<{ start: number; end: number }> {
  const intervals: Array<{ start: number; end: number }> = [];
  for (const block of busy) {
    const start = Date.parse(block.start);
    const end = Date.parse(block.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    intervals.push({ start, end });
  }
  return intervals;
}

function overlaps(start: number, end: number, busy: Array<{ start: number; end: number }>): boolean {
  return busy.some((block) => start < block.end && end > block.start);
}

export function mikeCallSlots(input: {
  now?: Date;
  busy?: { start: string; end: string }[];
  horizonDays?: number;
} = {}): MikeCallSlot[] {
  const now = input.now ?? new Date();
  const horizon = input.horizonDays ?? MIKE_CALL_HORIZON_DAYS;
  if (!Number.isFinite(horizon) || horizon <= 0) return [];
  const busy = busyIntervals(input.busy || []);
  const today = zonedParts(now, MIKE_CALL_TIME_ZONE);
  const slots: MikeCallSlot[] = [];
  const duration = MIKE_CALL_DURATION_MINUTES;

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset);
    if (date.weekday === 0 || date.weekday === 6) continue;
    for (const window of MIKE_CALL_WINDOWS) {
      for (let minute = window.startMinutes; minute + duration <= window.endMinutes; minute += duration) {
        const start = zonedTimeToUtc(
          date.year,
          date.month,
          date.day,
          Math.floor(minute / 60),
          minute % 60,
          MIKE_CALL_TIME_ZONE,
        );
        const end = new Date(start.getTime() + duration * 60 * 1000);
        if (start.getTime() <= now.getTime()) continue;
        if (overlaps(start.getTime(), end.getTime(), busy)) continue;
        const dateKey = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
        const time = clockLabel(minute);
        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
          date: dateKey,
          time,
          label: `${dayLabel(date.year, date.month, date.day)} · ${time}`,
          window: window.id,
        });
      }
    }
  }
  return slots;
}

/** True when the instants are a 30-minute Mon–Fri window slot in America/Chicago. */
export function isMikeCallSlot(startIso: string, endIso: string): boolean {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (endMs - startMs !== MIKE_CALL_DURATION_MINUTES * 60 * 1000) return false;
  const parts = zonedParts(new Date(startMs), MIKE_CALL_TIME_ZONE);
  if (parts.weekday === 0 || parts.weekday === 6) return false;
  if (parts.minute !== 0 && parts.minute !== 30) return false;
  const minute = parts.hour * 60 + parts.minute;
  return MIKE_CALL_WINDOWS.some((window) => (
    minute >= window.startMinutes && minute + MIKE_CALL_DURATION_MINUTES <= window.endMinutes
  ));
}

export function mikeCallSlotBookable(startIso: string, endIso: string, now = new Date()): boolean {
  if (!isMikeCallSlot(startIso, endIso)) return false;
  const startMs = Date.parse(startIso);
  if (startMs <= now.getTime()) return false;
  const horizonMs = (MIKE_CALL_HORIZON_DAYS + 1) * 24 * 60 * 60 * 1000;
  return startMs <= now.getTime() + horizonMs;
}
