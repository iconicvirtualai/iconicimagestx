import { describe, expect, it } from "vitest";
import { bookingDateLabel, calendarDateKey, chicagoNoonDate, formatChicagoDate } from "./clientHome";

describe("formatChicagoDate", () => {
  it("keeps a date-only string on that calendar day", () => {
    expect(calendarDateKey("2026-11-17")).toBe("2026-11-17");
    expect(formatChicagoDate("2026-11-17")).toBe("Nov 17, 2026");
    expect(formatChicagoDate("2026-11-17", "long")).toBe("Tuesday, November 17, 2026");
    expect(formatChicagoDate("2026-11-17", "compact")).toBe("Tue, Nov 17");
  });

  it("keeps a UTC-midnight timestamp on that calendar day", () => {
    const midnight = "2026-11-17T00:00:00.000Z";
    expect(new Date(midnight).toISOString()).toBe(midnight);
    expect(formatChicagoDate(midnight)).toBe("Nov 17, 2026");
    expect(formatChicagoDate(new Date(midnight))).toBe("Nov 17, 2026");
  });

  it("reads a time of day in America/Chicago", () => {
    expect(formatChicagoDate("2026-11-17T15:00:00.000Z")).toBe("Nov 17, 2026");
    expect(formatChicagoDate("2026-11-18T02:00:00.000Z")).toBe("Nov 17, 2026");
  });

  it("returns null when the date is missing", () => {
    expect(formatChicagoDate(undefined)).toBeNull();
    expect(formatChicagoDate(null)).toBeNull();
    expect(formatChicagoDate("")).toBeNull();
    expect(formatChicagoDate("   ")).toBeNull();
  });

  it("reads a Firestore timestamp and keeps the printed label", () => {
    const midnight = new Date("2026-11-17T00:00:00.000Z");
    expect(formatChicagoDate({ toDate: () => midnight })).toBe("Nov 17, 2026");
    expect(formatChicagoDate({ seconds: Math.floor(midnight.getTime() / 1000) })).toBe("Nov 17, 2026");
    expect(bookingDateLabel("2026-11-17")).toBe("Nov 17, 2026");
    expect(bookingDateLabel("not a date", "To be confirmed")).toBe("not a date");
    expect(bookingDateLabel(null, "To be confirmed")).toBe("To be confirmed");
  });

  it("anchors a date-only day at Central noon", () => {
    const noon = chicagoNoonDate("2026-11-17");
    expect(noon?.toISOString()).toBe("2026-11-17T18:00:00.000Z");
    expect(calendarDateKey(noon)).toBe("2026-11-17");
    expect(chicagoNoonDate("")).toBeNull();
  });
});
