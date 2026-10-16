/**
 * Photo times for Thankful for You Always.
 * Slots and holds use photos@iconicimagestx.com.
 * firebase-adminsdk-fbsvc@iconic-images-aicon.iam.gserviceaccount.com
 * already has access through FIREBASE_SERVICE_ACCOUNT.
 * Do not show that service-account address on the public page.
 */

import { google } from "googleapis";
import {
  THANKFUL_EVENT_SOURCE,
  THANKFUL_STUDIO_ADDRESS,
  THANKFUL_TIME_ZONE,
  thankfulBusyIntervals,
  thankfulZonedTimeToUtc,
  type ThankfulSlot,
} from "../../shared/thankfulEvent";
import { calendarAuthFromAccount, firebaseServiceAccount } from "./apprenticeshipCalendar";
import { calendarBlockFromEvent } from "./bookingAvailability";

export const THANKFUL_CALENDAR_ID = "photos@iconicimagestx.com";

export interface ThankfulBusyRead {
  ok: boolean;
  busy: { start: string; end: string }[];
}

function eventRangeIso() {
  return {
    timeMin: thankfulZonedTimeToUtc(2026, 11, 14, 10, 0).toISOString(),
    timeMax: thankfulZonedTimeToUtc(2026, 11, 14, 16, 0).toISOString(),
  };
}

export async function listThankfulBusy(
  env: Record<string, string | undefined> = process.env,
): Promise<ThankfulBusyRead> {
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth) return { ok: false, busy: [] };
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const range = eventRangeIso();
    const blocks = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const response = await calendar.events.list({
        calendarId: THANKFUL_CALENDAR_ID,
        timeMin: range.timeMin,
        timeMax: range.timeMax,
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
    return { ok: true, busy: thankfulBusyIntervals(blocks) };
  } catch (error) {
    console.error("[Thankful] Calendar read failed:", error);
    return { ok: false, busy: [] };
  }
}

export async function createThankfulCalendarHold(input: {
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  partySize: number;
  menuName: string;
  santa: boolean;
  notes: string;
  slot: ThankfulSlot;
  env?: Record<string, string | undefined>;
}): Promise<{ calendarId: string; eventId: string | null; htmlLink: string | null } | null> {
  const env = input.env ?? process.env;
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth) return null;
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.events.insert({
    calendarId: THANKFUL_CALENDAR_ID,
    sendUpdates: "none",
    requestBody: {
      summary: `Thankful for You Always: ${input.clientName}`,
      location: THANKFUL_STUDIO_ADDRESS,
      description: [
        `Order: ${input.orderNumber}`,
        "Event: Thankful for You Always",
        `Party: ${input.partySize}`,
        `Menu: ${input.menuName}`,
        `Santa: ${input.santa ? "Yes" : "No"}`,
        `Client: ${input.clientName}`,
        input.clientEmail ? `Email: ${input.clientEmail}` : "",
        input.clientPhone ? `Phone: ${input.clientPhone}` : "",
        input.notes ? `Notes: ${input.notes}` : "",
      ].filter(Boolean).join("\n"),
      start: { dateTime: input.slot.start, timeZone: THANKFUL_TIME_ZONE },
      end: { dateTime: input.slot.end, timeZone: THANKFUL_TIME_ZONE },
      extendedProperties: {
        private: {
          orderNumber: input.orderNumber,
          source: THANKFUL_EVENT_SOURCE,
        },
      },
    },
  });
  return {
    calendarId: THANKFUL_CALENDAR_ID,
    eventId: response.data.id || null,
    htmlLink: response.data.htmlLink || null,
  };
}

export async function deleteThankfulCalendarHold(input: {
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
