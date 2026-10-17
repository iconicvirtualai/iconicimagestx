/**
 * Holiday photo slots. One booking fills a 15-minute start time.
 * The public list is times only.
 */

import { HOLIDAY_RSVP_LEAD, HOLIDAY_SEASON_LEAD } from "./holidayCheckout.ts";

/** How many real bookings one 15-minute start time can hold. */
export const HOLIDAY_SLOT_LIMIT = 1;

export const THANKFUL_SLOT_DATE = "2026-11-14";
export const SEASON_SLOT_START = "2026-11-27";
export const SEASON_SLOT_END = "2026-12-14";

export const HOLIDAY_SLOT_TAKEN_MESSAGE = "That time was just taken. Pick another.";

const CLOSED_STATUSES = new Set(["declined", "cancelled", "canceled"]);
const CLOCK = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

export interface HolidaySlotClaim {
  kind: "thankful" | "season";
  date: string;
  time: string;
}

export interface HolidayTaken {
  limit: number;
  thankful: { date: string; taken: string[] };
  season: Record<string, string[]>;
}

function clockLabel(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, "0");
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function thankfulSlotTimes(): string[] {
  const times: string[] = [];
  for (let minutes = 11 * 60; minutes < 15 * 60; minutes += 15) times.push(clockLabel(minutes));
  return times;
}

/** Weekdays 10:00 AM–2:45 PM. Saturdays 10:00 AM–11:45 AM. Sundays closed. */
export function seasonSlotTimes(date: string): string[] {
  if (!isSeasonDate(date)) return [];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (day === 0) return [];
  const end = day === 6 ? 12 * 60 : 15 * 60;
  const times: string[] = [];
  for (let minutes = 10 * 60; minutes < end; minutes += 15) times.push(clockLabel(minutes));
  return times;
}

export function isSeasonDate(date: string): boolean {
  return date >= SEASON_SLOT_START && date <= SEASON_SLOT_END;
}

export function canonicalSlotTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour < 1 || hour > 12) return null;
  return `${hour}:${match[2]} ${match[3].toUpperCase()}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Delivery QA mail and orders explicitly marked test do not hold a slot. */
export function isHolidayTestBooking(order: Record<string, unknown>): boolean {
  const email = `${text(order.email)} ${text(order.clientEmail)}`.toLowerCase();
  if (email.includes("ops+deliveryqa@")) return true;
  if (order.playtest === true || order.test === true || order.isTest === true) return true;
  const name = text(order.clientName) || `${text(order.firstName)} ${text(order.lastName)}`.trim();
  const notes = text(order.vibeNote) || text(order.notes);
  return `${name}\n${notes}`.toUpperCase().includes("TEST ORDER");
}

function orderDate(order: Record<string, unknown>): string | null {
  const scheduled = order.scheduledDate;
  if (typeof scheduled === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(scheduled.trim());
    if (match) return match[1];
  }
  if (scheduled && typeof scheduled === "object" && "toDate" in scheduled && typeof scheduled.toDate === "function") {
    const date = scheduled.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    }
  }
  const fromNote = /^Date:\s*(\d{4}-\d{2}-\d{2})/im.exec(text(order.vibeNote));
  if (fromNote) return fromNote[1];
  if (text(order.leadSource).trim() === HOLIDAY_RSVP_LEAD) return THANKFUL_SLOT_DATE;
  return null;
}

function orderTime(order: Record<string, unknown>): string | null {
  const labeled = canonicalSlotTime(order.requestedTimeLabel);
  if (labeled) return labeled;
  const note = text(order.vibeNote);
  const requested = /Requested photo time:\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(note);
  if (requested) return canonicalSlotTime(requested[1]);
  const line = /^Time:\s*(\d{1,2}:\d{2}\s*[AP]M)/im.exec(note);
  if (line) return canonicalSlotTime(line[1]);
  return canonicalSlotTime(order.scheduledTime);
}

export function holidaySlotClaim(leadSource: unknown, date: unknown, time: unknown): HolidaySlotClaim | null {
  const clock = canonicalSlotTime(time);
  if (!clock) return null;
  const lead = text(leadSource).trim();
  const day = text(date).trim().slice(0, 10);
  if (lead === HOLIDAY_RSVP_LEAD) {
    const thankfulDay = day || THANKFUL_SLOT_DATE;
    if (thankfulDay !== THANKFUL_SLOT_DATE || !thankfulSlotTimes().includes(clock)) return null;
    return { kind: "thankful", date: thankfulDay, time: clock };
  }
  if (lead === HOLIDAY_SEASON_LEAD) {
    if (!seasonSlotTimes(day).includes(clock)) return null;
    return { kind: "season", date: day, time: clock };
  }
  return null;
}

function timeSort(a: string, b: string): number {
  const rank = (value: string) => {
    const match = CLOCK.exec(value);
    if (!match) return 0;
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(match[2]);
  };
  return rank(a) - rank(b);
}

export function holidayTakenFromOrders(
  orders: readonly Record<string, unknown>[],
  limit: number = HOLIDAY_SLOT_LIMIT,
): HolidayTaken {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (isHolidayTestBooking(order)) continue;
    const status = text(order.status).trim().toLowerCase();
    if (CLOSED_STATUSES.has(status)) continue;
    const claim = holidaySlotClaim(order.leadSource, orderDate(order), orderTime(order));
    if (!claim) continue;
    const key = `${claim.kind}|${claim.date}|${claim.time}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const thankful: string[] = [];
  const season: Record<string, string[]> = {};
  for (const [key, count] of counts) {
    if (count < limit) continue;
    const [kind, date, time] = key.split("|");
    if (kind === "thankful") thankful.push(time);
    else (season[date] ||= []).push(time);
  }
  thankful.sort(timeSort);
  for (const date of Object.keys(season)) season[date].sort(timeSort);
  return {
    limit,
    thankful: { date: THANKFUL_SLOT_DATE, taken: thankful },
    season,
  };
}

export function holidaySlotIsFull(
  orders: readonly Record<string, unknown>[],
  claim: HolidaySlotClaim,
  limit: number = HOLIDAY_SLOT_LIMIT,
): boolean {
  const taken = holidayTakenFromOrders(orders, limit);
  if (claim.kind === "thankful") return taken.thankful.taken.includes(claim.time);
  return (taken.season[claim.date] || []).includes(claim.time);
}
