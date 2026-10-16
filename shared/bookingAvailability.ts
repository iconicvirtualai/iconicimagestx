/**
 * Open times for /book.
 * Weekly hours come from the booking hours config (company default, with
 * a per-photographer override). A slot survives only when the photographer
 * is free and can drive from the previous shoot to this address, then on
 * to the next shoot.
 */

import {
  apprenticeshipDurationMinutes,
  zonedTimeToUtc,
  type ApprenticeshipHours,
  type ApprenticeshipSlot,
} from "./apprenticeship.ts";
import {
  bookingHoursFromEnv,
  bookingHoursFromWindow,
  openBookingSlots,
  weekForPhotographer,
  type BookingHoursConfig,
} from "./bookingHours.ts";
import { packagesForStaffEditor, type StaffCatalogPackage } from "./bookingCatalog.ts";

export const DEFAULT_TRAVEL_BUFFER_MINUTES = 30;
export const DEFAULT_BOOKING_DURATION_MINUTES = 90;

const CONSULTATION_CATEGORIES = new Set(["branding", "business", "growth"]);

export interface CalendarBlock {
  start: string;
  end: string;
  location: string;
  allDay?: boolean;
}

export interface TravelEvent {
  startMs: number;
  endMs: number;
  location: string;
}

export interface AssignedSlot extends ApprenticeshipSlot {
  photographerId: string;
  photographerName: string;
}

export interface PhotographerDay {
  id: string;
  name: string;
  /** null means that calendar could not be read. */
  events: TravelEvent[] | null;
}

export function travelBufferMinutes(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): number {
  const value = Number(env.BOOKING_TRAVEL_BUFFER_MINUTES);
  if (!Number.isInteger(value) || value < 0 || value > 240) return DEFAULT_TRAVEL_BUFFER_MINUTES;
  return value;
}

export function explicitDurationMinutes(text: string): number[] {
  const source = text.replace(/\d+\s*-?\s*seconds?\b/gi, " ");
  const found: number[] = [];
  for (const match of source.matchAll(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*hours?\b/gi)) {
    const hours = Math.max(Number(match[1]), Number(match[2]));
    if (hours > 0 && hours <= 24) found.push(hours * 60);
  }
  const singles = source.replace(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*hours?\b/gi, " ");
  for (const match of singles.matchAll(/(\d+(?:\.\d+)?)\s*hours?\b/gi)) {
    const hours = Number(match[1]);
    if (hours > 0 && hours <= 24) found.push(Math.round(hours * 60));
  }
  for (const match of singles.matchAll(/(\d+)\s*-?\s*minutes?\b/gi)) {
    const minutes = Number(match[1]);
    if (minutes > 0 && minutes <= 24 * 60) found.push(minutes);
  }
  return found;
}

export function bookingDurationMinutes(input: {
  selectedService?: string | null;
  selectedBasics?: string[];
  catalog?: StaffCatalogPackage[];
  env?: Record<string, string | undefined>;
}): number {
  const catalog = input.catalog ?? packagesForStaffEditor([]);
  const ids = [input.selectedService, ...(input.selectedBasics || [])]
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  const found: number[] = [];
  let consultation = false;
  for (const id of ids) {
    const pkg = catalog.find((entry) => entry.id === id || entry.bookingId === id);
    if (!pkg) continue;
    if (pkg.appointmentLimit) found.push(apprenticeshipDurationMinutes(pkg.appointmentLimit, pkg.id));
    found.push(...explicitDurationMinutes([pkg.name, pkg.description, ...pkg.includedServices].join("\n")));
    if (pkg.serviceCategory && CONSULTATION_CATEGORIES.has(pkg.serviceCategory)) consultation = true;
  }
  if (found.length) return Math.max(...found);
  if (consultation) return 30;
  const env = input.env ?? (typeof process !== "undefined" ? process.env : {});
  const fallback = Number(env.DEFAULT_APPOINTMENT_DURATION_MINUTES || DEFAULT_BOOKING_DURATION_MINUTES);
  if (!Number.isInteger(fallback) || fallback < 15 || fallback > 24 * 60) return DEFAULT_BOOKING_DURATION_MINUTES;
  return fallback;
}

export function travelEventsFromBlocks(blocks: CalendarBlock[], timeZone: string): TravelEvent[] {
  const events: TravelEvent[] = [];
  for (const block of blocks) {
    const dateOnly = block.allDay || /^\d{4}-\d{2}-\d{2}$/.test(block.start);
    if (dateOnly) {
      const start = dateParts(block.start);
      const end = dateParts(block.end);
      if (!start || !end) continue;
      const startMs = zonedTimeToUtc(start.year, start.month, start.day, 0, 0, timeZone).getTime();
      const endMs = zonedTimeToUtc(end.year, end.month, end.day, 0, 0, timeZone).getTime();
      if (endMs > startMs) events.push({ startMs, endMs, location: block.location.trim() });
      continue;
    }
    const startMs = Date.parse(block.start);
    const endMs = Date.parse(block.end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      events.push({ startMs, endMs, location: block.location.trim() });
    }
  }
  events.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return events;
}

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function adjacentEvents(events: TravelEvent[], startMs: number, endMs: number): {
  previous: TravelEvent | null;
  next: TravelEvent | null;
} {
  let previous: TravelEvent | null = null;
  let next: TravelEvent | null = null;
  for (const event of events) {
    if (event.endMs <= startMs && (!previous || event.endMs > previous.endMs)) previous = event;
    if (event.startMs >= endMs && (!next || event.startMs < next.startMs)) next = event;
  }
  return { previous, next };
}

export interface DriveQuery {
  from: string;
  to: string;
  departAtMs: number;
}

export function travelQueriesForSlots(input: {
  slots: ApprenticeshipSlot[];
  events: TravelEvent[];
  bookingAddress: string;
}): DriveQuery[] {
  const address = input.bookingAddress.trim();
  if (!address) return [];
  const queries: DriveQuery[] = [];
  for (const slot of input.slots) {
    const startMs = Date.parse(slot.start);
    const endMs = Date.parse(slot.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const { previous, next } = adjacentEvents(input.events, startMs, endMs);
    if (previous?.location) queries.push({ from: previous.location, to: address, departAtMs: previous.endMs });
    if (next?.location) queries.push({ from: address, to: next.location, departAtMs: endMs });
  }
  return queries;
}

export function slotsWithTravel(input: {
  slots: ApprenticeshipSlot[];
  events: TravelEvent[];
  bookingAddress: string;
  bufferMinutes: number;
  driveMinutes: (from: string, to: string, departAtMs: number) => number | null;
}): ApprenticeshipSlot[] {
  const address = input.bookingAddress.trim();
  const bufferMs = input.bufferMinutes * 60 * 1000;
  return input.slots.filter((slot) => {
    const startMs = Date.parse(slot.start);
    const endMs = Date.parse(slot.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
    if (input.events.some((event) => startMs < event.endMs && endMs > event.startMs)) return false;
    const { previous, next } = adjacentEvents(input.events, startMs, endMs);
    if (previous && startMs - previous.endMs < gapMs(previous.location, previous.location, address, previous.endMs)) return false;
    if (next && next.startMs - endMs < gapMs(next.location, address, next.location, endMs)) return false;
    return true;
  });

  function gapMs(location: string, from: string, to: string, departAtMs: number): number {
    if (!location.trim() || !address) return bufferMs;
    const drive = input.driveMinutes(from, to, departAtMs);
    if (drive == null || !Number.isFinite(drive) || drive < 0) return bufferMs;
    return drive * 60 * 1000;
  }
}

export function bookingScheduleFor(input: {
  hours?: ApprenticeshipHours;
  schedule?: BookingHoursConfig;
  env?: Record<string, string | undefined>;
}): BookingHoursConfig {
  if (input.schedule) return input.schedule;
  if (input.hours) {
    return bookingHoursFromWindow({
      timeZone: input.hours.timeZone,
      horizonDays: input.hours.horizonDays,
      startMinutes: input.hours.startMinutes,
      endMinutes: input.hours.endMinutes,
    });
  }
  return bookingHoursFromEnv(input.env);
}

export function openSlotsForPhotographer(input: {
  now: Date;
  durationMinutes: number;
  photographerId: string;
  events: { startMs: number; endMs: number }[];
  schedule: BookingHoursConfig;
}): ApprenticeshipSlot[] {
  return openBookingSlots({
    now: input.now,
    durationMinutes: input.durationMinutes,
    busy: input.events.map((event) => ({
      start: new Date(event.startMs).toISOString(),
      end: new Date(event.endMs).toISOString(),
    })),
    week: weekForPhotographer(input.schedule, input.photographerId),
  });
}

export function assignPhotographerSlots(input: {
  now: Date;
  durationMinutes: number;
  hours?: ApprenticeshipHours;
  schedule?: BookingHoursConfig;
  bufferMinutes: number;
  bookingAddress: string;
  preferenceId: string;
  photographers: PhotographerDay[];
  driveMinutes: (from: string, to: string, departAtMs: number) => number | null;
}): { live: boolean; slots: AssignedSlot[] } {
  const schedule = bookingScheduleFor(input);
  const readable = input.photographers.filter((person) => person.events);
  if (!readable.length) return { live: false, slots: [] };

  const preferred = input.preferenceId && input.preferenceId !== "no-preference"
    ? input.photographers.find((person) => person.id === input.preferenceId) || null
    : null;
  if (preferred && !preferred.events) return { live: true, slots: [] };

  const people = preferred ? [preferred] : readable;
  const byStart = new Map<string, AssignedSlot>();
  for (const person of people) {
    const events = person.events || [];
    const open = openSlotsForPhotographer({
      now: input.now,
      durationMinutes: input.durationMinutes,
      photographerId: person.id,
      events,
      schedule,
    });
    const fitted = slotsWithTravel({
      slots: open,
      events,
      bookingAddress: input.bookingAddress,
      bufferMinutes: input.bufferMinutes,
      driveMinutes: input.driveMinutes,
    });
    for (const slot of fitted) {
      if (!byStart.has(slot.start)) {
        byStart.set(slot.start, {
          ...slot,
          photographerId: person.id,
          photographerName: person.name,
        });
      }
    }
  }
  return {
    live: true,
    slots: [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start)),
  };
}

/** Coarse windows on the temporary order page. Not calendar slot times. */
const PREFERRED_TIME_WINDOWS = new Set(["morning", "midday", "afternoon"]);

/**
 * ordericonic.html asks for Morning, Midday, or Afternoon and does not send
 * slotStart. /book sends a real slot when the calendar is live, or a clock
 * time such as "9:00 AM" when it is not. A window with no slot is a request
 * for the office to confirm, not a hold.
 */
export function isPreferredWindowBooking(body: { slotStart?: unknown; scheduledTime?: unknown }): boolean {
  const slotStart = typeof body.slotStart === "string" ? body.slotStart.trim() : "";
  if (slotStart) return false;
  const time = typeof body.scheduledTime === "string" ? body.scheduledTime.trim().toLowerCase() : "";
  return PREFERRED_TIME_WINDOWS.has(time);
}

export function resolveBookingAssignment(input: {
  live: boolean;
  slotStart: string;
  slots: AssignedSlot[];
}): { ok: true; slot: AssignedSlot | null } | { ok: false; status: 400 | 409; error: string } {
  if (!input.live) return { ok: true, slot: null };
  const slotStart = input.slotStart.trim();
  if (!slotStart) return { ok: false, status: 400, error: "Choose an open time." };
  const slot = input.slots.find((item) => item.start === slotStart) || null;
  if (!slot) return { ok: false, status: 409, error: "That time was just taken. Pick another open time." };
  return { ok: true, slot };
}

export function normalizePlace(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function departureBucket(ms: number, bucketMinutes = 30): string {
  const size = bucketMinutes * 60 * 1000;
  return new Date(Math.floor(ms / size) * size).toISOString();
}

export function driveCacheKey(from: string, to: string, departAtMs: number): string {
  return `${normalizePlace(from)}>${normalizePlace(to)}@${departureBucket(departAtMs)}`;
}

export function parseRouteDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.ceil(seconds / 60);
}

export interface RouteMatrixLeg {
  originIndex: number;
  destinationIndex: number;
  minutes: number | null;
}

export function parseRouteMatrixBody(body: string): RouteMatrixLeg[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const rows = trimmed.startsWith("[")
    ? JSON.parse(trimmed) as unknown[]
    : trimmed.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as unknown);
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const originIndex = record.originIndex == null ? 0 : Number(record.originIndex);
    const destinationIndex = record.destinationIndex == null ? 0 : Number(record.destinationIndex);
    if (!Number.isInteger(originIndex) || !Number.isInteger(destinationIndex)) return [];
    const condition = typeof record.condition === "string" ? record.condition : "ROUTE_EXISTS";
    const minutes = condition === "ROUTE_EXISTS" ? parseRouteDuration(record.duration) : null;
    return [{ originIndex, destinationIndex, minutes }];
  });
}
