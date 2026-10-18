import type { HolidayBackfillReport } from "@shared/holidayCalendar";

/** Ask the server to create photos-calendar events that are still missing. */
export async function requestHolidayCalendarBackfill(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HolidayBackfillReport> {
  const response = await fetchImpl("/api/bookings/holiday-calendar-backfill", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "Could not add the missing calendar events.";
    throw new Error(error);
  }
  return body as HolidayBackfillReport;
}
