/**
 * Preferred photographers for the public /book page.
 * This is the only list that maps those names to calendars.
 * The schedule board keeps its own roster.
 * Calendar addresses stay on the server. The public page receives names only.
 */

export const NO_PREFERENCE_ID = "no-preference";
export const NO_PREFERENCE_NAME = "No preference";

export interface BookingPhotographer {
  id: string;
  name: string;
  calendarId: string;
}

export const BOOKING_PHOTOGRAPHERS: readonly BookingPhotographer[] = [
  { id: "mike-luna", name: "Mike Luna", calendarId: "mike@iconicimagestx.com" },
  { id: "armando-martinez", name: "Armando Martinez", calendarId: "armando@iconicimagestx.com" },
  { id: "daniel-adaclog", name: "Daniel Adaclog", calendarId: "daniel@iconicimagestx.com" },
  { id: "steven-banda", name: "Steven Banda", calendarId: "steven@iconicimagestx.com" },
  { id: "pedro-hernandez", name: "Pedro Hernandez", calendarId: "phernandez1833@gmail.com" },
  { id: "david-gonzalez", name: "David Gonzalez", calendarId: "david@iconicimagestx.com" },
  { id: "cadi-torres", name: "Cadi Torres", calendarId: "cadi@iconicimagestx.com" },
];

export function publicBookingPhotographers(): Array<{ id: string; name: string }> {
  return BOOKING_PHOTOGRAPHERS.map((person) => ({ id: person.id, name: person.name }));
}

export function bookingPhotographerById(id: string): BookingPhotographer | null {
  const key = id.trim();
  return BOOKING_PHOTOGRAPHERS.find((person) => person.id === key) || null;
}

/** A public choice is a known id or an exact name. Anything else is no preference. */
export function preferenceFromRequest(id: unknown, name: unknown): string {
  const rawId = typeof id === "string" ? id.trim() : "";
  if (rawId === NO_PREFERENCE_ID) return NO_PREFERENCE_ID;
  if (bookingPhotographerById(rawId)) return rawId;
  const rawName = typeof name === "string" ? name.trim().toLowerCase() : "";
  const byName = BOOKING_PHOTOGRAPHERS.find((person) => person.name.toLowerCase() === rawName);
  return byName?.id || NO_PREFERENCE_ID;
}

export function preferenceName(id: string): string {
  if (id === NO_PREFERENCE_ID) return NO_PREFERENCE_NAME;
  return bookingPhotographerById(id)?.name || NO_PREFERENCE_NAME;
}
