/**
 * Day-one schedule board for /admin/schedule.
 * Classifies team-calendar events and labels twilight shoots in Iconic terms.
 * Availability is derived from bookings plus calendar blocks already returned
 * by POST /api/calendar/schedule.
 */

export interface CalendarRosterPerson {
  id: string;
  name: string;
}

export const ICONIC_CALENDAR_ROSTER: CalendarRosterPerson[] = [
  { id: "mike@iconicimagestx.com", name: "Mike Luna" },
  { id: "armando@iconicimagestx.com", name: "Armando" },
  { id: "pedro@iconicimagestx.com", name: "Pedro" },
  { id: "steven@iconicimagestx.com", name: "Steven" },
  { id: "cadi@iconicimagestx.com", name: "Cadi" },
  { id: "daniel@iconicimagestx.com", name: "Daniel" },
];

export type CalendarBlockKind = "shoot" | "hold" | "unavailable" | "free";

export type ShooterDayStatus = "open" | "booked" | "twilight" | "hold" | "unavailable";

export interface CalendarEventShape {
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  transparency?: string | null;
  eventType?: string | null;
  allDay?: boolean;
  status?: string | null;
  start?: string | null;
  end?: string | null;
}

export interface ScheduleBlockInput {
  photographerName: string;
  kind: "hold" | "unavailable";
}

export interface ScheduleShootInput {
  photographerNames: string[];
  twilight: boolean;
}

export interface ShooterCue {
  id: string;
  name: string;
  status: ShooterDayStatus;
  shootCount: number;
}

const TWILIGHT_PATTERN = /\b(?:twilights?|dusk)\b/i;
const UNAVAILABLE_PATTERN = /\b(?:out of office|ooo|unavailable|pto|vacation|day off|do not book|blocked off|personal day)\b/i;

export function textHasTwilight(value: unknown): boolean {
  return TWILIGHT_PATTERN.test(String(value ?? ""));
}

export function recordHasTwilight(services: unknown[] = [], extra: unknown[] = []): boolean {
  const chunks = services.map(serviceLabel).concat(extra.map((value) => String(value ?? "")));
  return chunks.some((text) => textHasTwilight(text));
}

export function classifyCalendarEvent(event: CalendarEventShape): CalendarBlockKind {
  const status = String(event.status || "").toLowerCase();
  if (status === "cancelled") return "free";

  const transparency = String(event.transparency || "").toLowerCase();
  if (transparency === "transparent") return "free";

  const eventType = String(event.eventType || "").toLowerCase();
  if (eventType === "workinglocation") return "free";
  if (eventType === "outofoffice" || eventType === "focustime") return "unavailable";

  const summary = String(event.summary || "").trim();
  const blob = `${summary} ${event.description || ""}`;
  if (UNAVAILABLE_PATTERN.test(blob) || /^busy$/i.test(summary)) return "unavailable";
  if (/^iconic images:/i.test(summary)) return "shoot";
  if (String(event.location || "").trim()) return "shoot";
  if (textHasTwilight(summary) || textHasTwilight(event.description)) return "shoot";
  if (summary.split(/\s+[—-]\s+/).filter(Boolean).length >= 2) return "shoot";
  if (event.allDay) return "unavailable";
  if (!summary) return "free";
  return "hold";
}

export function chicagoDateKeyFromDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function chicagoDateKeyFromValue(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return chicagoDateKeyFromDate(parsed);
}

/** All-day Google events use an exclusive end date. Timed events stay on the start day. */
export function scheduleBlockDateKeys(start: string | null | undefined, end: string | null | undefined, allDay: boolean): string[] {
  const startKey = chicagoDateKeyFromValue(start);
  if (!startKey) return [];
  if (!allDay) return [startKey];

  const endKey = chicagoDateKeyFromValue(end) || startKey;
  const cursor = chicagoNoon(startKey);
  const limit = chicagoNoon(endKey);
  const stop = limit.getTime() > cursor.getTime() ? limit : new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  const keys: string[] = [];

  let guard = 0;
  while (cursor < stop && guard < 40) {
    keys.push(chicagoDateKeyFromDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }

  return keys.length > 0 ? keys : [startKey];
}

export function calendarRoster(people: Array<{ id?: string | null; name?: string | null }>): CalendarRosterPerson[] {
  const map = new Map<string, CalendarRosterPerson>();
  people.forEach((person) => {
    const id = String(person.id || "").trim();
    const name = String(person.name || "").trim();
    if (!id || !name) return;
    const key = id.toLowerCase();
    if (!map.has(key)) map.set(key, { id, name });
  });
  return Array.from(map.values());
}

export function matchShooter(name: string, roster: CalendarRosterPerson[]): CalendarRosterPerson | null {
  const target = normalizeShooter(name);
  if (!target) return null;

  const exact = roster.filter((person) => {
    return normalizeShooter(person.name) === target || normalizeShooter(person.id) === target;
  });
  if (exact.length > 0) return exact[0];

  const fuzzy = roster.filter((person) => tokenPrefix(normalizeShooter(person.name), target));
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

export function shooterCuesForDay(input: {
  roster: CalendarRosterPerson[];
  shoots: ScheduleShootInput[];
  blocks: ScheduleBlockInput[];
}): ShooterCue[] {
  return input.roster.map((person) => {
    const shoots = input.shoots.filter((shoot) => shoot.photographerNames.some((name) => matchesPerson(name, person)));
    const unavailable = input.blocks.some((block) => block.kind === "unavailable" && matchesPerson(block.photographerName, person));
    const hold = input.blocks.some((block) => block.kind === "hold" && matchesPerson(block.photographerName, person));
    const twilight = shoots.some((shoot) => shoot.twilight);

    let status: ShooterDayStatus = "open";
    if (twilight) status = "twilight";
    else if (shoots.length > 0) status = "booked";
    else if (unavailable) status = "unavailable";
    else if (hold) status = "hold";

    return {
      id: person.id,
      name: person.name,
      status,
      shootCount: shoots.length,
    };
  });
}

export function shooterStatusLabel(cue: Pick<ShooterCue, "status" | "shootCount">): string {
  if (cue.status === "booked") return cue.shootCount > 1 ? `Booked · ${cue.shootCount}` : "Booked";
  if (cue.status === "twilight") return cue.shootCount > 1 ? `Twilight · ${cue.shootCount}` : "Twilight";
  if (cue.status === "hold") return "Hold";
  if (cue.status === "unavailable") return "Unavailable";
  return "Open";
}

export function countUnassignedShoots(shoots: ScheduleShootInput[], roster: CalendarRosterPerson[]): number {
  return shoots.filter((shoot) => !shoot.photographerNames.some((name) => matchShooter(name, roster))).length;
}

export function dayOpsSummary(input: {
  shootCount: number;
  twilightCount: number;
  openCount: number;
  unassignedCount: number;
}): string {
  const parts = [`${input.shootCount} shoot${input.shootCount === 1 ? "" : "s"}`];
  if (input.twilightCount > 0) parts.push(`${input.twilightCount} twilight`);
  parts.push(`${input.openCount} open`);
  if (input.unassignedCount > 0) parts.push(`${input.unassignedCount} unassigned`);
  return parts.join(" · ");
}

export function dayLoadCue(input: {
  cues: Array<Pick<ShooterCue, "status">>;
  twilightShootCount: number;
}): string | null {
  if (input.twilightShootCount === 1) return "Twilight";
  if (input.twilightShootCount > 1) return `${input.twilightShootCount} twilight`;

  const open = input.cues.filter((cue) => cue.status === "open").length;
  const booked = input.cues.some((cue) => cue.status === "booked");
  const holds = input.cues.some((cue) => cue.status === "hold");
  const unavailable = input.cues.filter((cue) => cue.status === "unavailable").length;

  if (input.cues.length > 0 && open === 0 && booked) return "Full";
  if (!booked && holds && open === 0 && unavailable === 0) return "Hold";
  if (unavailable > 0 && open > 0) return unavailable === 1 ? "1 off" : `${unavailable} off`;
  if (unavailable > 0 && open === 0 && !booked) return "Off";
  return null;
}

function serviceLabel(service: unknown): string {
  if (typeof service === "string") return service;
  if (service && typeof service === "object" && "name" in service) return String((service as { name?: unknown }).name || "");
  return "";
}

function chicagoNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00-06:00`);
}

function normalizeShooter(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenPrefix(left: string, right: string): boolean {
  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;
  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;
  if (shorter[0].length < 3) return false;
  return shorter.every((token, index) => longer[index] === token);
}

function matchesPerson(name: string, person: CalendarRosterPerson): boolean {
  const match = matchShooter(name, [person]);
  return Boolean(match);
}
