import type { CalendarRosterPerson } from "../../shared/scheduleBoard";

/**
 * Shooter calendars for the schedule board and operations metrics.
 * Kept on the server so these addresses never ship in the public JS bundle.
 * Signed-in staff load them from GET /api/calendar/roster.
 * ids stay the calendar addresses the board already matches.
 */
export const PHOTOGRAPHER_CALENDAR_ROSTER: CalendarRosterPerson[] = [
  { id: "mike@iconicimagestx.com", name: "Mike Luna" },
  { id: "armando@iconicimagestx.com", name: "Armando" },
  { id: "pedro@iconicimagestx.com", name: "Pedro" },
  { id: "steven@iconicimagestx.com", name: "Steven" },
  { id: "cadi@iconicimagestx.com", name: "Cadi" },
  { id: "daniel@iconicimagestx.com", name: "Daniel" },
];

export function photographerCalendarRoster(): CalendarRosterPerson[] {
  return PHOTOGRAPHER_CALENDAR_ROSTER.map((person) => ({ ...person }));
}
