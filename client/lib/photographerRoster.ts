import { staffDisplayName } from "@/lib/scheduleRecords";
import { calendarRoster, type CalendarRosterPerson } from "@shared/scheduleBoard";

export function staffAsCalendarRoster(staff: any[] = []): CalendarRosterPerson[] {
  return staff
    .map((person) => ({
      id: String(person?.googleCalendarId || person?.calendarId || person?.calendarEmail || person?.email || "").trim(),
      name: String(staffDisplayName(person) || person?.email || "").trim(),
    }))
    .filter((person) => person.id && person.name);
}

/** Server roster first, then live staff calendars. Same dedupe the board used before. */
export function mergeCalendarRoster(base: CalendarRosterPerson[] = [], staff: any[] = []): CalendarRosterPerson[] {
  return calendarRoster(base.concat(staffAsCalendarRoster(staff)));
}

export async function fetchPhotographerRoster(token: string): Promise<CalendarRosterPerson[]> {
  const response = await fetch("/api/calendar/roster", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Photographer roster unavailable.");
  const data = await response.json();
  const people = Array.isArray(data?.photographers) ? data.photographers : [];
  return people
    .map((person: { id?: unknown; name?: unknown }) => ({
      id: String(person?.id || "").trim(),
      name: String(person?.name || "").trim(),
    }))
    .filter((person: CalendarRosterPerson) => person.id && person.name);
}
