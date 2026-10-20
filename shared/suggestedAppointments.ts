/**
 * Up to three bookable times that sit next to shoots already on the calendar.
 * Every suggestion is a start time assignPhotographerSlots would also return.
 * Hours, Saturday cutoff, Sunday, and Steven's week stay in that check.
 */

import {
  assignPhotographerSlots,
  normalizePlace,
  type AssignedSlot,
  type PhotographerDay,
} from "./bookingAvailability.ts";
import type { BookingHoursConfig } from "./bookingHours.ts";
import type { ApprenticeshipHours } from "./apprenticeship.ts";

export const SUGGESTED_APPOINTMENT_LIMIT = 3;
/** Idle minutes past the travel gap that still count as grouped with a shoot. */
export const SUGGESTED_IDLE_LIMIT_MINUTES = 90;
const GROUPING_ANCHOR_MAX_MS = 8 * 60 * 60 * 1000;
const NEAR_DRIVE_MINUTES = 20;

/** A recognized env value forces the feature. Anything else leaves the admin setting in charge. */
export function suggestedAppointmentsEnvOverride(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): boolean | undefined {
  return explicitFlag(env.SUGGESTED_APPOINTMENTS_ENABLED) ?? explicitFlag(env.SUGGESTED_APPOINTMENTS);
}

export function suggestedAppointmentsEnabled(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
  stored?: boolean | null,
): boolean {
  const explicit = suggestedAppointmentsEnvOverride(env);
  if (explicit !== undefined) return explicit;
  if (typeof stored === "boolean") return stored;
  return true;
}

function explicitFlag(raw: string | undefined): boolean | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const value = raw.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(value)) return false;
  if (["1", "true", "on", "yes"].includes(value)) return true;
  return undefined;
}

export function suggestedAppointmentLabel(slot: { date: string; time: string; label?: string }): string {
  const year = /^\d{4}/.test(slot.date) ? slot.date.slice(0, 4) : "";
  const day = (slot.label || "").split("·")[0]?.trim();
  const head = day && year ? `${day} ${year}` : (day || slot.date);
  const clock = slot.time.trim().replace(/\s+([AP]M)$/i, (_match, suffix: string) => suffix.toLowerCase());
  return `${head} - ${clock} CT`;
}

export function photographerPreferenceForNames(
  names: string[],
  people: Array<{ id: string; name: string }>,
): string {
  const wanted = names.map((name) => name.trim().toLowerCase()).filter(Boolean);
  const hits = people.filter((person) => wanted.includes(person.name.trim().toLowerCase()));
  return hits.length === 1 ? hits[0].id : "no-preference";
}

export function suggestAppointmentTimes(input: {
  now: Date;
  durationMinutes: number;
  hours?: ApprenticeshipHours;
  schedule?: BookingHoursConfig;
  bufferMinutes: number;
  bookingAddress: string;
  preferenceId: string;
  photographers: PhotographerDay[];
  driveMinutes: (from: string, to: string, departAtMs: number) => number | null;
  /** Subset of the availability result. Times outside that result are dropped. */
  slots?: AssignedSlot[];
  limit?: number;
}): AssignedSlot[] {
  const limit = input.limit ?? SUGGESTED_APPOINTMENT_LIMIT;
  if (limit <= 0) return [];
  const assigned = assignPhotographerSlots({
    now: input.now,
    durationMinutes: input.durationMinutes,
    hours: input.hours,
    schedule: input.schedule,
    bufferMinutes: input.bufferMinutes,
    bookingAddress: input.bookingAddress,
    preferenceId: input.preferenceId,
    photographers: input.photographers,
    driveMinutes: input.driveMinutes,
  });
  if (!assigned.live) return [];
  const allowed = new Set(assigned.slots.map((slot) => slot.start));
  const poolSource = input.slots === undefined ? assigned.slots : input.slots;
  const pool = uniqueByStart(poolSource.filter((slot) => allowed.has(slot.start)));
  if (!pool.length) return [];

  const booking = normalizePlace(input.bookingAddress);
  const grouped: Array<{ slot: AssignedSlot; near: number; idle: number }> = [];
  for (const slot of pool) {
    const startMs = Date.parse(slot.start);
    const endMs = Date.parse(slot.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const person = input.photographers.find((item) => item.id === slot.photographerId);
    const events = person?.events || [];
    let best: { near: number; idle: number } | null = null;
    for (const event of events) {
      if (event.endMs - event.startMs >= GROUPING_ANCHOR_MAX_MS) continue;
      if (event.endMs <= event.startMs) continue;
      if (chicagoDate(event.startMs) !== slot.date) continue;
      const after = startMs - event.endMs;
      const before = event.startMs - endMs;
      const gap = after >= 0 ? after : before >= 0 ? before : -1;
      if (gap < 0) continue;
      const required = requiredGapMs({
        event,
        bookingAddress: input.bookingAddress,
        bufferMinutes: input.bufferMinutes,
        driveMinutes: input.driveMinutes,
        slotIsAfter: after >= 0,
        departAtMs: after >= 0 ? event.endMs : endMs,
      });
      if (gap + 1000 < required) continue;
      const idle = (gap - required) / 60000;
      if (idle > SUGGESTED_IDLE_LIMIT_MINUTES) continue;
      const near = nearRank(booking, event.location, driveToBooking(event.location, input.bookingAddress, event.endMs, input.driveMinutes));
      if (!best || near < best.near || (near === best.near && idle < best.idle)) best = { near, idle };
    }
    if (best) grouped.push({ slot, near: best.near, idle: best.idle });
  }

  if (grouped.length) {
    grouped.sort((a, b) => a.near - b.near || a.slot.start.localeCompare(b.slot.start) || a.idle - b.idle);
    return grouped.slice(0, limit).map((item) => item.slot);
  }

  return [...pool].sort((a, b) => a.start.localeCompare(b.start)).slice(0, limit);
}

function uniqueByStart(slots: AssignedSlot[]): AssignedSlot[] {
  const seen = new Set<string>();
  const unique: AssignedSlot[] = [];
  for (const slot of slots) {
    if (!slot.start || seen.has(slot.start)) continue;
    seen.add(slot.start);
    unique.push(slot);
  }
  return unique;
}

function chicagoDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function requiredGapMs(input: {
  event: { location: string };
  bookingAddress: string;
  bufferMinutes: number;
  driveMinutes: (from: string, to: string, departAtMs: number) => number | null;
  slotIsAfter: boolean;
  departAtMs: number;
}): number {
  const bufferMs = input.bufferMinutes * 60 * 1000;
  const location = input.event.location.trim();
  const address = input.bookingAddress.trim();
  if (!location || !address) return bufferMs;
  const from = input.slotIsAfter ? location : address;
  const to = input.slotIsAfter ? address : location;
  const drive = input.driveMinutes(from, to, input.departAtMs);
  if (drive == null || !Number.isFinite(drive) || drive < 0) return bufferMs;
  return drive * 60 * 1000;
}

function driveToBooking(
  location: string,
  bookingAddress: string,
  departAtMs: number,
  driveMinutes: (from: string, to: string, departAtMs: number) => number | null,
): number | null {
  if (!location.trim() || !bookingAddress.trim()) return null;
  const drive = driveMinutes(location, bookingAddress, departAtMs);
  if (drive == null || !Number.isFinite(drive) || drive < 0) return null;
  return drive;
}

function nearRank(booking: string, location: string, drive: number | null): number {
  const place = normalizePlace(location);
  if (!booking || !place) return 2;
  if (samePlace(booking, place)) return 0;
  if (drive != null && drive <= NEAR_DRIVE_MINUTES) return 1;
  if (drive != null && drive > NEAR_DRIVE_MINUTES) return 3;
  return 2;
}

function samePlace(booking: string, location: string): boolean {
  if (booking === location) return true;
  const left = booking.split(",")[0]?.trim() || "";
  const right = location.split(",")[0]?.trim() || "";
  return left.length >= 8 && left === right;
}
