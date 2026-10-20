/**
 * Photographer and appointment fields for an admin-created order.
 * The schedule board, the order screen, and a later project all read these
 * same fields. Calendar addresses stay on the staff record.
 */

import { zonedTimeToUtc } from "./apprenticeship.ts";
import {
  bookingScheduleFor,
  DEFAULT_BOOKING_DURATION_MINUTES,
  type TravelEvent,
} from "./bookingAvailability.ts";
import { orderScheduleTime, scheduleDateInputValue, scheduleTimeInputValue } from "./listingWrite.ts";
import { filterAssignableStaff, type QaStaffRecord } from "./qaStaff.ts";

export interface BookingPhotographerChoice {
  id: string;
  name: string;
}

export interface AssignableStaff extends QaStaffRecord {
  isActive?: unknown;
}

export interface AssignablePhotographer {
  key: string;
  name: string;
  role: string;
  bookingPhotographerId: string | null;
  staffId: string | null;
}

const ASSIGNABLE_ROLES = new Set(["photographer", "apprentice", "admin", "coordinator"]);

function staffName(person: AssignableStaff): string {
  const named = typeof person.name === "string" ? person.name.trim() : "";
  if (named) return named;
  return `${person.firstName || ""} ${person.lastName || ""}`.trim();
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Active booking photographers, plus active staff the office can assign
 * (photographers, apprentices, and the coordinators who also shoot).
 * A staff record whose name matches a booking photographer is one choice.
 */
export function assignablePhotographers(input: {
  booking?: BookingPhotographerChoice[] | null;
  staff?: AssignableStaff[] | null;
  forPlaytest?: boolean;
}): AssignablePhotographer[] {
  const booking = Array.isArray(input.booking) ? input.booking : [];
  const staff = filterAssignableStaff(
    (input.staff || []).filter((person) => person.isActive !== false),
    { forPlaytest: input.forPlaytest },
  );
  const usedStaff = new Set<string>();
  const options: AssignablePhotographer[] = [];

  for (const person of booking) {
    const id = person.id.trim();
    const name = person.name.trim();
    if (!id || !name || id === "no-preference") continue;
    const match = staff.find((member) => sameName(staffName(member), name));
    if (match?.id) usedStaff.add(String(match.id));
    options.push({
      key: id,
      name,
      role: typeof match?.role === "string" && match.role.trim() ? match.role : "photographer",
      bookingPhotographerId: id,
      staffId: match?.id ? String(match.id) : null,
    });
  }

  for (const member of staff) {
    const id = member.id ? String(member.id) : "";
    if (!id || usedStaff.has(id)) continue;
    const role = typeof member.role === "string" ? member.role.trim() : "";
    if (!ASSIGNABLE_ROLES.has(role)) continue;
    const name = staffName(member);
    if (!name) continue;
    options.push({
      key: id,
      name,
      role,
      bookingPhotographerId: null,
      staffId: id,
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

export function orderAssignmentPatch(input: {
  photographer?: AssignablePhotographer | null;
  date?: string | null;
  time?: string | null;
  durationMinutes?: number | null;
  overrideNotes?: string[] | null;
}): Record<string, unknown> {
  const photographer = input.photographer || null;
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const time = typeof input.time === "string" ? input.time.trim() : "";
  const name = photographer?.name || null;
  const staffId = photographer?.staffId || null;
  const bookingId = photographer?.bookingPhotographerId || null;
  const providerId = staffId || bookingId;
  const duration = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : null;
  const notes = (input.overrideNotes || []).map((note) => note.trim()).filter(Boolean);
  const patch: Record<string, unknown> = {
    scheduledDate: date || null,
    appointmentDate: date || null,
    scheduledTime: time || null,
    appointmentTime: time || null,
    appointmentDuration: duration,
    assignedPhotographerId: staffId,
    assignedPhotographerName: name,
    photographerName: name,
    photographerId: providerId,
    bookingPhotographerId: bookingId,
    photographerUid: staffId,
    photographerIds: staffId ? [staffId] : [],
    photographerNames: name ? [name] : [],
    assignedProviders: providerId && name
      ? [{ providerId, name, role: photographer?.role || "photographer" }]
      : [],
    photographerPreference: name,
    scheduleOverride: notes.length > 0 ? notes : null,
  };
  if (date) patch.status = "scheduled";
  return patch;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordIds(record: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = textValue(value);
    if (id) ids.add(id);
  };
  add(record.bookingPhotographerId);
  add(record.assignedPhotographerId);
  add(record.photographerId);
  add(record.photographerUid);
  if (Array.isArray(record.photographerIds)) record.photographerIds.forEach(add);
  if (Array.isArray(record.assignedProviders)) {
    for (const provider of record.assignedProviders) {
      if (provider && typeof provider === "object") {
        const row = provider as Record<string, unknown>;
        add(row.providerId);
        add(row.id);
      }
    }
  }
  return ids;
}

function recordMatchesPhotographer(record: Record<string, unknown>, photographer: AssignablePhotographer): boolean {
  const ids = recordIds(record);
  if (photographer.bookingPhotographerId && ids.has(photographer.bookingPhotographerId)) return true;
  if (photographer.staffId && ids.has(photographer.staffId)) return true;
  if (ids.has(photographer.key)) return true;
  const names = [
    record.assignedPhotographerName,
    record.photographerName,
    ...(Array.isArray(record.photographerNames) ? record.photographerNames : []),
  ];
  return names.some((name) => textValue(name).toLowerCase() === photographer.name.trim().toLowerCase());
}

/**
 * Other shoots for this photographer on this day, in the booking time zone.
 * Admin warnings measure the travel buffer against these.
 */
export function appointmentTravelEvents(input: {
  records?: Array<Record<string, unknown>> | null;
  photographer: AssignablePhotographer;
  date: string;
  excludeIds?: string[];
}): TravelEvent[] {
  const date = input.date.trim();
  if (!date) return [];
  const zone = bookingScheduleFor({}).company.timeZone;
  const excluded = new Set((input.excludeIds || []).map((id) => id.trim()).filter(Boolean));
  const events: TravelEvent[] = [];
  for (const record of input.records || []) {
    const id = textValue(record.id);
    if (id && excluded.has(id)) continue;
    if (!recordMatchesPhotographer(record, input.photographer)) continue;
    if (scheduleDateInputValue(record) !== date) continue;
    const time = scheduleTimeInputValue(orderScheduleTime(record));
    const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const clock = time.match(/^(\d{2}):(\d{2})$/);
    if (!parts || !clock) continue;
    const duration = typeof record.appointmentDuration === "number" && record.appointmentDuration > 0
      ? record.appointmentDuration
      : DEFAULT_BOOKING_DURATION_MINUTES;
    const start = zonedTimeToUtc(
      Number(parts[1]),
      Number(parts[2]),
      Number(parts[3]),
      Number(clock[1]),
      Number(clock[2]),
      zone,
    );
    const location = textValue(record.address);
    events.push({
      startMs: start.getTime(),
      endMs: start.getTime() + duration * 60 * 1000,
      location,
    });
  }
  return events;
}
