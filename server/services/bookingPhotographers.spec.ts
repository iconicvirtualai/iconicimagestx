import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOOKING_PHOTOGRAPHERS,
  NO_PREFERENCE_NAME,
  preferenceFromRequest,
  preferenceName,
  publicBookingPhotographers,
} from "./bookingPhotographers";

const PUBLIC_FILES = [
  "client/components/BookingForm.tsx",
  "client/components/BookingSlotPicker.tsx",
  "client/pages/Book.tsx",
  "client/lib/createOrder.ts",
];

describe("booking photographer list", () => {
  it("is the seven shooters, each with a calendar, and the public list is names only", () => {
    expect(BOOKING_PHOTOGRAPHERS.map((person) => person.name)).toEqual([
      "Mike Luna",
      "Armando Martinez",
      "Daniel Adaclog",
      "Steven Banda",
      "Pedro Hernandez",
      "David Gonzalez",
      "Cadi Torres",
    ]);
    expect(BOOKING_PHOTOGRAPHERS.map((person) => person.calendarId)).toEqual([
      "mike@iconicimagestx.com",
      "armando@iconicimagestx.com",
      "daniel@iconicimagestx.com",
      "steven@iconicimagestx.com",
      "phernandez1833@gmail.com",
      "david@iconicimagestx.com",
      "cadi@iconicimagestx.com",
    ]);
    const published = JSON.stringify(publicBookingPhotographers());
    expect(published).not.toContain("@");
    expect(published).toContain("Cadi Torres");
    expect(preferenceName("no-preference")).toBe(NO_PREFERENCE_NAME);
    expect(preferenceFromRequest("mike-luna", "ignore")).toBe("mike-luna");
    expect(preferenceFromRequest("", "Pedro Hernandez")).toBe("pedro-hernandez");
    expect(preferenceFromRequest("mike@iconicimagestx.com", "mike@iconicimagestx.com")).toBe("no-preference");
  });

  it("does not put calendar addresses in the public booking page", () => {
    for (const file of PUBLIC_FILES) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(source).not.toContain("@iconicimagestx.com");
      expect(source).not.toContain("phernandez1833");
      expect(source).not.toContain("Marcus Johnson");
    }
  });
});
