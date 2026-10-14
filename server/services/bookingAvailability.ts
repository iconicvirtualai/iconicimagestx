/**
 * /book open times.
 * Reads each photographer's calendar with the Firebase service account
 * (the same iconic-images-aicon account apprenticeship uses) and keeps a
 * slot only when drive time fits on both sides. A missing Maps key, or a
 * calendar that is not shared yet, never takes the booking form down.
 */

import { google } from "googleapis";
import { addressText } from "../../shared/addressText";
import {
  assignPhotographerSlots,
  bookingDurationMinutes,
  driveCacheKey,
  parseRouteMatrixBody,
  travelBufferMinutes,
  travelEventsFromBlocks,
  travelQueriesForSlots,
  type AssignedSlot,
  type CalendarBlock,
  type DriveQuery,
  type PhotographerDay,
} from "../../shared/bookingAvailability";
import { apprenticeshipHoursFromEnv, openApprenticeshipSlots } from "../../shared/apprenticeship";
import type { StaffCatalogPackage } from "../../shared/bookingCatalog";
import { calendarAuthFromAccount, firebaseServiceAccount } from "./apprenticeshipCalendar";
import {
  BOOKING_PHOTOGRAPHERS,
  bookingPhotographerById,
  type BookingPhotographer,
} from "./bookingPhotographers";

const ROUTES_ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const DRIVE_CACHE_TTL_MS = 15 * 60 * 1000;
const loggedUnreadable = new Set<string>();

export interface BookingAvailabilityResult {
  live: boolean;
  slots: AssignedSlot[];
  durationMinutes: number;
  bufferMinutes: number;
  /** routes when a Maps key is set; buffer when drive time cannot be asked. */
  driveMode: "routes" | "buffer";
}

export interface DriveTimeCache {
  get(key: string, now: number): number | undefined;
  set(key: string, minutes: number, now: number): void;
}

export function createDriveTimeCache(ttlMs = DRIVE_CACHE_TTL_MS): DriveTimeCache {
  const store = new Map<string, { minutes: number; storedAt: number }>();
  return {
    get(key, now) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (now - hit.storedAt > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.minutes;
    },
    set(key, minutes, now) {
      if (store.size > 500) {
        const oldest = store.keys().next().value;
        if (oldest) store.delete(oldest);
      }
      store.set(key, { minutes, storedAt: now });
    },
  };
}

const driveCache = createDriveTimeCache();

type CalendarEvent = {
  status?: string | null;
  transparency?: string | null;
  eventType?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
};

export function calendarBlockFromEvent(event: CalendarEvent): CalendarBlock | null {
  if (event.status === "cancelled") return null;
  if (event.transparency === "transparent") return null;
  if (event.eventType === "workingLocation" || event.eventType === "birthday") return null;
  const start = event.start?.dateTime || event.start?.date || "";
  const end = event.end?.dateTime || event.end?.date || "";
  if (!start || !end) return null;
  return {
    start,
    end,
    location: (event.location || "").trim(),
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
  };
}

async function listCalendarBlocks(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  env: Record<string, string | undefined>,
): Promise<CalendarBlock[]> {
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth) throw new Error("Calendar credentials are missing.");
  const calendar = google.calendar({ version: "v3", auth });
  const blocks: CalendarBlock[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page += 1) {
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });
    for (const event of response.data.items || []) {
      const block = calendarBlockFromEvent(event);
      if (block) blocks.push(block);
    }
    pageToken = response.data.nextPageToken || undefined;
    if (!pageToken) break;
  }
  return blocks;
}

function logUnreadable(person: BookingPhotographer, error: unknown) {
  if (loggedUnreadable.has(person.id)) return;
  loggedUnreadable.add(person.id);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Booking] ${person.name}'s calendar is not available for online slots (${person.calendarId}). ${message}`);
}

export async function resolveDriveMinutes(input: {
  queries: DriveQuery[];
  apiKey: string;
  cache?: DriveTimeCache;
  now?: number;
  fetchImpl?: typeof fetch;
}): Promise<Map<string, number | null>> {
  const now = input.now ?? Date.now();
  const cache = input.cache ?? driveCache;
  const fetchImpl = input.fetchImpl ?? fetch;
  const resolved = new Map<string, number | null>();
  const pending: DriveQuery[] = [];
  for (const query of input.queries) {
    const key = driveCacheKey(query.from, query.to, query.departAtMs);
    if (resolved.has(key)) continue;
    const cached = cache.get(key, now);
    if (cached !== undefined) {
      resolved.set(key, cached);
      continue;
    }
    pending.push(query);
    resolved.set(key, null);
  }
  if (!input.apiKey.trim() || !pending.length) return resolved;

  const buckets = new Map<string, DriveQuery[]>();
  for (const query of pending) {
    const key = driveCacheKey(query.from, query.to, query.departAtMs);
    const bucket = key.slice(key.lastIndexOf("@") + 1);
    const group = buckets.get(bucket) || [];
    group.push(query);
    buckets.set(bucket, group);
  }

  await Promise.all([...buckets.entries()].map(async ([bucket, queries]) => {
    const origins = uniquePlaces(queries.map((query) => query.from));
    const destinations = uniquePlaces(queries.map((query) => query.to));
    try {
      const legs = await computeRouteMatrix({
        origins,
        destinations,
        departureTime: bucket,
        apiKey: input.apiKey,
        fetchImpl,
      });
      const byIndex = new Map<string, number | null>();
      for (const leg of legs) byIndex.set(`${leg.originIndex}:${leg.destinationIndex}`, leg.minutes);
      for (const query of queries) {
        const key = driveCacheKey(query.from, query.to, query.departAtMs);
        const minutes = byIndex.get(`${origins.indexOf(normalizeKey(query.from))}:${destinations.indexOf(normalizeKey(query.to))}`);
        if (minutes == null) continue;
        resolved.set(key, minutes);
        cache.set(key, minutes, now);
      }
    } catch (error) {
      console.error("[Booking] Drive time lookup failed. Using the travel buffer.", error);
    }
  }));

  return resolved;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniquePlaces(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = normalizeKey(value);
    if (key && !seen.has(key)) seen.set(key, key);
  }
  return [...seen.keys()];
}

async function computeRouteMatrix(input: {
  origins: string[];
  destinations: string[];
  departureTime: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}) {
  const legs = [];
  const originChunks = chunk(input.origins, 25);
  const destinationChunks = chunk(input.destinations, 25);
  for (const originChunk of originChunks) {
    for (const destinationChunk of destinationChunks) {
      if (!originChunk.length || !destinationChunk.length) continue;
      const requestedDeparture = Date.parse(input.departureTime);
      const departureTime = Number.isFinite(requestedDeparture) && requestedDeparture > Date.now() + 30_000
        ? new Date(requestedDeparture).toISOString()
        : new Date(Date.now() + 60_000).toISOString();
      const response = await input.fetchImpl(ROUTES_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": input.apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,status,condition",
        },
        body: JSON.stringify({
          origins: originChunk.map((address) => ({ waypoint: { address } })),
          destinations: destinationChunk.map((address) => ({ waypoint: { address } })),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          departureTime,
        }),
      });
      if (!response.ok) {
        throw new Error(`Routes computeRouteMatrix responded ${response.status}.`);
      }
      const parsed = parseRouteMatrixBody(await response.text());
      const originOffset = input.origins.indexOf(originChunk[0] || "");
      const destinationOffset = input.destinations.indexOf(destinationChunk[0] || "");
      // uniquePlaces returns normalized keys, and chunks are slices of that list,
      // so offsets are the chunk start indexes.
      for (const leg of parsed) {
        legs.push({
          ...leg,
          originIndex: originOffset + leg.originIndex,
          destinationIndex: destinationOffset + leg.destinationIndex,
        });
      }
    }
  }
  return legs;
}

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups.length ? groups : [[]];
}

export async function readBookingAvailability(input: {
  address?: unknown;
  preferenceId?: string;
  selectedService?: string | null;
  selectedBasics?: string[];
  catalog?: StaffCatalogPackage[];
  now?: Date;
  env?: Record<string, string | undefined>;
  listEvents?: (person: BookingPhotographer, timeMin: string, timeMax: string) => Promise<CalendarBlock[]>;
  fetchImpl?: typeof fetch;
  cache?: DriveTimeCache;
}): Promise<BookingAvailabilityResult> {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const hours = apprenticeshipHoursFromEnv(env);
  const bufferMinutes = travelBufferMinutes(env);
  const durationMinutes = bookingDurationMinutes({
    selectedService: input.selectedService,
    selectedBasics: input.selectedBasics,
    catalog: input.catalog,
    env,
  });
  const apiKey = (env.GOOGLE_MAPS_API_KEY || "").trim();
  const address = addressText(input.address);
  const preferenceId = (input.preferenceId || "no-preference").trim() || "no-preference";
  const account = firebaseServiceAccount(env);
  const auth = calendarAuthFromAccount(account, env);
  if (!auth || !account) {
    return { live: false, slots: [], durationMinutes, bufferMinutes, driveMode: apiKey ? "routes" : "buffer" };
  }

  const timeMin = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + (hours.horizonDays + 1) * 24 * 60 * 60 * 1000).toISOString();
  const listEvents = input.listEvents ?? ((person, min, max) => listCalendarBlocks(person.calendarId, min, max, env));
  const days: PhotographerDay[] = await Promise.all(BOOKING_PHOTOGRAPHERS.map(async (person) => {
    try {
      const blocks = await listEvents(person, timeMin, timeMax);
      return { id: person.id, name: person.name, events: travelEventsFromBlocks(blocks, hours.timeZone) };
    } catch (error) {
      logUnreadable(person, error);
      return { id: person.id, name: person.name, events: null };
    }
  }));

  const readable = days.filter((person) => person.events);
  if (!readable.length) {
    return { live: false, slots: [], durationMinutes, bufferMinutes, driveMode: apiKey ? "routes" : "buffer" };
  }

  const preferred = preferenceId !== "no-preference"
    ? days.find((person) => person.id === preferenceId) || null
    : null;
  const considered = preferred ? (preferred.events ? [preferred] : []) : readable;
  const queries = considered.flatMap((person) => {
    const events = person.events || [];
    const open = openApprenticeshipSlots({
      now,
      busy: events.map((event) => ({
        start: new Date(event.startMs).toISOString(),
        end: new Date(event.endMs).toISOString(),
      })),
      durationMinutes,
      hours,
    });
    return travelQueriesForSlots({ slots: open, events, bookingAddress: address });
  });
  const driveMap = await resolveDriveMinutes({
    queries,
    apiKey,
    cache: input.cache,
    now: now.getTime(),
    fetchImpl: input.fetchImpl,
  });
  const assigned = assignPhotographerSlots({
    now,
    durationMinutes,
    hours,
    bufferMinutes,
    bookingAddress: address,
    preferenceId,
    photographers: days,
    driveMinutes: (from, to, departAtMs) => {
      const value = driveMap.get(driveCacheKey(from, to, departAtMs));
      return value === undefined ? null : value;
    },
  });
  return {
    live: assigned.live,
    slots: assigned.slots,
    durationMinutes,
    bufferMinutes,
    driveMode: apiKey ? "routes" : "buffer",
  };
}

export async function createBookingCalendarHold(input: {
  photographerId: string;
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  serviceSummary: string;
  slot: { start: string; end: string };
  notes?: string;
  env?: Record<string, string | undefined>;
  insert?: (calendarId: string, body: Record<string, unknown>) => Promise<{ id: string | null; htmlLink: string | null }>;
}): Promise<{ calendarId: string; eventId: string | null; htmlLink: string | null } | null> {
  const person = bookingPhotographerById(input.photographerId);
  if (!person) return null;
  const env = input.env ?? process.env;
  const hours = apprenticeshipHoursFromEnv(env);
  const body = {
    summary: `Iconic Images: ${input.clientName}`,
    location: input.address,
    description: [
      `Order: ${input.orderNumber}`,
      `Photographer: ${person.name}`,
      input.serviceSummary ? `Services: ${input.serviceSummary}` : "",
      `Client: ${input.clientName}`,
      input.clientEmail ? `Email: ${input.clientEmail}` : "",
      input.clientPhone ? `Phone: ${input.clientPhone}` : "",
      input.notes ? `Notes: ${input.notes}` : "",
    ].filter(Boolean).join("\n"),
    start: { dateTime: input.slot.start, timeZone: hours.timeZone },
    end: { dateTime: input.slot.end, timeZone: hours.timeZone },
    extendedProperties: {
      private: {
        orderNumber: input.orderNumber,
        source: "booking_form",
        photographerId: person.id,
      },
    },
  };
  if (input.insert) {
    const created = await input.insert(person.calendarId, body);
    return { calendarId: person.calendarId, eventId: created.id, htmlLink: created.htmlLink };
  }
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth) return null;
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.events.insert({
    calendarId: person.calendarId,
    sendUpdates: "none",
    requestBody: body,
  });
  return {
    calendarId: person.calendarId,
    eventId: response.data.id || null,
    htmlLink: response.data.htmlLink || null,
  };
}

export async function deleteBookingCalendarHold(input: {
  calendarId: string;
  eventId: string;
  env?: Record<string, string | undefined>;
}): Promise<void> {
  const env = input.env ?? process.env;
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth || !input.eventId) return;
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({
    calendarId: input.calendarId,
    eventId: input.eventId,
    sendUpdates: "none",
  });
}
