/**
 * Open holiday session times on the photos@ studio calendar.
 * When that calendar cannot be read, the same open times are still offered
 * and the page asks the office to confirm. The service account address
 * stays off the public page.
 */

import { google } from "googleapis";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import {
  HOLIDAY_BOOK_END,
  HOLIDAY_BOOK_START,
  HOLIDAY_DAY_END_MINUTES,
  HOLIDAY_DAY_START_MINUTES,
  openHolidaySlots,
  type HolidaySlot,
} from "../../shared/holidayPromo";
import { zonedTimeToUtc } from "../../shared/apprenticeship";
import { calendarAuthFromAccount, firebaseServiceAccount } from "./apprenticeshipCalendar";

const TIME_ZONE = "America/Chicago";
const CALENDAR_ID = BUSINESS_CONTACT.email;

export async function readHolidaySlots(input: {
  packageId: string;
  addonIds?: readonly string[];
  now?: Date;
  env?: Record<string, string | undefined>;
}): Promise<{ live: boolean; slots: HolidaySlot[] }> {
  const now = input.now ?? new Date();
  const addonIds = input.addonIds || [];
  const open = openHolidaySlots({ now, packageId: input.packageId, addonIds });
  const env = input.env ?? process.env;
  const auth = calendarAuthFromAccount(firebaseServiceAccount(env), env);
  if (!auth) return { live: false, slots: open };
  const [startYear, startMonth, startDay] = HOLIDAY_BOOK_START.split("-").map(Number);
  const [endYear, endMonth, endDay] = HOLIDAY_BOOK_END.split("-").map(Number);
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: zonedTimeToUtc(startYear, startMonth, startDay, Math.floor(HOLIDAY_DAY_START_MINUTES / 60), HOLIDAY_DAY_START_MINUTES % 60, TIME_ZONE).toISOString(),
        timeMax: zonedTimeToUtc(endYear, endMonth, endDay, Math.floor(HOLIDAY_DAY_END_MINUTES / 60), HOLIDAY_DAY_END_MINUTES % 60, TIME_ZONE).toISOString(),
        timeZone: TIME_ZONE,
        items: [{ id: CALENDAR_ID }],
      },
    });
    const entry = response.data.calendars?.[CALENDAR_ID];
    if (entry?.errors?.length) return { live: false, slots: open };
    const busy = (entry?.busy || [])
      .map((block) => ({ start: block.start || "", end: block.end || "" }))
      .filter((block) => block.start && block.end);
    return {
      live: true,
      slots: openHolidaySlots({ now, packageId: input.packageId, addonIds, busy }),
    };
  } catch (error) {
    console.error("[Holiday] Calendar read failed:", error);
    return { live: false, slots: open };
  }
}
