/**
 * Write holiday RSVP and 'Tis shoot events on the photos calendar.
 * The Firebase service account is already shared on that calendar.
 * Guests are not added as attendees and Google is not asked to email them.
 */

import { google } from "googleapis";
import { calendarAuthFromAccount, firebaseServiceAccount } from "./apprenticeshipCalendar";
import {
  HOLIDAY_OFFICE_CALENDAR_ID,
  holidayCalendarInsertBody,
  type HolidayCalendarPlan,
} from "../../shared/holidayCalendar";

export async function createHolidayCalendarEvent(
  plan: HolidayCalendarPlan,
  deps?: {
    env?: Record<string, string | undefined>;
    insert?: (input: {
      calendarId: string;
      sendUpdates: "none";
      requestBody: Record<string, unknown>;
    }) => Promise<{ id?: string | null; htmlLink?: string | null }>;
  },
): Promise<{ calendarId: string; eventId: string | null; htmlLink: string | null }> {
  const env = deps?.env ?? process.env;
  const calendarId = env.HOLIDAY_CALENDAR_ID?.trim() || HOLIDAY_OFFICE_CALENDAR_ID;
  const requestBody = holidayCalendarInsertBody(plan);
  if (deps?.insert) {
    const created = await deps.insert({ calendarId, sendUpdates: "none", requestBody });
    return { calendarId, eventId: created.id || null, htmlLink: created.htmlLink || null };
  }
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth) throw new Error("Calendar credentials are not configured.");
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody,
  });
  return {
    calendarId,
    eventId: response.data.id || null,
    htmlLink: response.data.htmlLink || null,
  };
}

export async function deleteHolidayCalendarEvent(input: {
  calendarId: string;
  eventId: string;
  env?: Record<string, string | undefined>;
  remove?: (input: { calendarId: string; eventId: string; sendUpdates: "none" }) => Promise<void>;
}): Promise<void> {
  if (!input.eventId) return;
  if (input.remove) {
    await input.remove({ calendarId: input.calendarId, eventId: input.eventId, sendUpdates: "none" });
    return;
  }
  const env = input.env ?? process.env;
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth) throw new Error("Calendar credentials are not configured.");
  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({
      calendarId: input.calendarId,
      eventId: input.eventId,
      sendUpdates: "none",
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? Number((err as { code: unknown }).code) : 0;
    const status = err && typeof err === "object" && "response" in err
      ? Number((err as { response?: { status?: unknown } }).response?.status)
      : 0;
    if (code === 404 || code === 410 || status === 404 || status === 410) return;
    throw err;
  }
}
