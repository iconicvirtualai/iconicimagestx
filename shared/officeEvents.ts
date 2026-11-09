/**
 * Office events for planning. Thankful is the built-in holiday event.
 * Checklist lines are task-board records, not a second checkbox.
 * This module does not email or text anyone.
 */

import { BUSINESS_CONTACT } from "./businessContact.ts";
import { THANKFUL_EVENT_DATE, THANKFUL_EVENT_HOURS, THANKFUL_EVENT_WHEN } from "./thankfulEvent.ts";
import {
  addEventPlanTask,
  createEventPlanTask,
  type TaskBoardTask,
} from "./taskBoard.ts";

export const OFFICE_EVENTS_COLLECTION = "officeEvents";
export const EVENTS_PATH = "/admin/events";
export const THANKFUL_EVENT_ID = "thankful-2026";

export const EVENT_TYPES = ["holiday", "headshot", "spring", "popup", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  holiday: "Holiday",
  headshot: "Headshot",
  spring: "Spring",
  popup: "Pop-up",
  other: "Other",
};

export const EVENT_STATUSES = ["planning", "promoting", "live", "done"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  planning: "Planning",
  promoting: "Promoting",
  live: "Live",
  done: "Done",
};

export interface OfficeEvent {
  id: string;
  name: string;
  type: EventType;
  date: string;
  time: string;
  location: string;
  status: EventStatus;
  notes: string;
  sample: boolean;
  /** Built from the Thankful event. RSVPs stay on the existing list. */
  builtin: boolean;
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === "string" && (EVENT_STATUSES as readonly string[]).includes(value);
}

export function thankfulOfficeEvent(today: string): OfficeEvent {
  return {
    id: THANKFUL_EVENT_ID,
    name: "Thankful client holiday",
    type: "holiday",
    date: THANKFUL_EVENT_DATE,
    time: THANKFUL_EVENT_HOURS,
    location: `Studio 105, ${BUSINESS_CONTACT.streetAddress}, ${BUSINESS_CONTACT.city}, ${BUSINESS_CONTACT.state} ${BUSINESS_CONTACT.postalCode}`,
    status: today > THANKFUL_EVENT_DATE ? "done" : today === THANKFUL_EVENT_DATE ? "live" : "promoting",
    notes: `${THANKFUL_EVENT_WHEN}. RSVPs and the photos calendar stay on this event.`,
    sample: false,
    builtin: true,
  };
}

export function eventHref(id: string): string {
  return `${EVENTS_PATH}/${encodeURIComponent(id)}`;
}

export function readOfficeEvent(id: string, data: unknown): OfficeEvent | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const name = text(row.name);
  const date = dateOnly(row.date);
  if (!name || !date || !isEventType(row.type) || !isEventStatus(row.status)) return null;
  if (id === THANKFUL_EVENT_ID) return null;
  return {
    id,
    name: name.slice(0, 120),
    type: row.type,
    date,
    time: text(row.time).slice(0, 40),
    location: text(row.location).slice(0, 180),
    status: row.status,
    notes: text(row.notes).slice(0, 2000),
    sample: row.sample === true,
    builtin: false,
  };
}

export function buildOfficeEvent(input: {
  id: string;
  name: string;
  type: EventType;
  date: string;
  time: string;
  location: string;
  status: EventStatus;
  notes: string;
  sample: boolean;
}): { ok: true; event: OfficeEvent } | { ok: false; error: string } {
  const name = input.name.replace(/\s+/g, " ").trim();
  const date = dateOnly(input.date);
  if (!name) return { ok: false, error: "Add an event name." };
  if (name.length > 120) return { ok: false, error: "Keep the name under 120 characters." };
  if (!date) return { ok: false, error: "Add a date." };
  if (!isEventType(input.type) || !isEventStatus(input.status)) return { ok: false, error: "Choose a type and a status." };
  if (input.id === THANKFUL_EVENT_ID) return { ok: false, error: "Thankful already has an event." };
  return {
    ok: true,
    event: {
      id: input.id,
      name,
      type: input.type,
      date,
      time: input.time.replace(/\s+/g, " ").trim().slice(0, 40),
      location: input.location.replace(/\s+/g, " ").trim().slice(0, 180),
      status: input.status,
      notes: input.notes.trim().slice(0, 2000),
      sample: input.sample,
      builtin: false,
    },
  };
}

/** Thankful stays first. A stored copy of that id is ignored. */
export function mergeOfficeEvents(stored: OfficeEvent[], today: string): OfficeEvent[] {
  const rest = stored.filter((event) => event.id !== THANKFUL_EVENT_ID);
  return [thankfulOfficeEvent(today), ...rest];
}

export function splitOfficeEvents(events: OfficeEvent[], today: string): { upcoming: OfficeEvent[]; past: OfficeEvent[] } {
  const thankful = events.find((event) => event.id === THANKFUL_EVENT_ID) || null;
  const others = events.filter((event) => event.id !== THANKFUL_EVENT_ID);
  const upcoming = others.filter((event) => event.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const past = others.filter((event) => event.date < today).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  if (!thankful) return { upcoming, past };
  if (thankful.date >= today) return { upcoming: [thankful, ...upcoming], past };
  return { upcoming, past: [thankful, ...past] };
}

export function eventTasks(tasks: TaskBoardTask[], eventId: string): TaskBoardTask[] {
  return tasks.filter((task) => task.eventId === eventId && !task.dismissed);
}

export function addOfficeEventTask(
  tasks: TaskBoardTask[],
  event: OfficeEvent,
  title: string,
  at: string,
): { ok: true; tasks: TaskBoardTask[]; id: string } | { ok: false; error: string } {
  return addEventPlanTask(tasks, {
    eventId: event.id,
    title,
    dueOn: event.date,
    sample: event.sample,
    at,
  });
}

export function sampleOfficeEvents(today: string): OfficeEvent[] {
  const headshot = buildOfficeEvent({
    id: "sample-headshot-day",
    name: "Headshot day",
    type: "headshot",
    date: addDays(today, 21),
    time: "9:00 AM",
    location: "Studio 105",
    status: "planning",
    notes: "Sample event. Not a live booking.",
    sample: true,
  });
  const spring = buildOfficeEvent({
    id: "sample-spring-popup",
    name: "Spring pop-up",
    type: "spring",
    date: addDays(today, 90),
    time: "6:00 PM",
    location: "To be chosen",
    status: "promoting",
    notes: "Sample event for the content calendar.",
    sample: true,
  });
  const popup = buildOfficeEvent({
    id: "sample-past-popup",
    name: "Saturday pop-up",
    type: "popup",
    date: addDays(today, -30),
    time: "12:00 PM",
    location: "Studio 105",
    status: "done",
    notes: "Sample past event.",
    sample: true,
  });
  return [headshot, spring, popup].flatMap((result) => result.ok ? [result.event] : []);
}

export function sampleEventPlanTasks(today: string): TaskBoardTask[] {
  const headshot = createEventPlanTask({
    eventId: "sample-headshot-day",
    key: "backdrop",
    title: "Set the headshot backdrop",
    dueOn: addDays(today, 21),
    sample: true,
    at: `${today}T15:00:00.000Z`,
  });
  const spring = createEventPlanTask({
    eventId: "sample-spring-popup",
    key: "invite",
    title: "Draft the spring invite list",
    dueOn: addDays(today, 90),
    sample: true,
    at: `${today}T15:00:00.000Z`,
  });
  return [headshot, spring].flatMap((result) => result.ok ? [result.task] : []);
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateOnly(value: unknown): string | null {
  const clean = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}
