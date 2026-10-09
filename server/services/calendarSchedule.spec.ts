import { describe, expect, it } from "vitest";
import { bookingEventTimes, toCalendarScheduleEvent } from "./calendar";

describe("calendar schedule events", () => {
  it("keeps all-day, transparency, type, and status for availability", () => {
    const event = toCalendarScheduleEvent({
      id: "evt-1",
      summary: "Out of office",
      description: "PTO",
      start: { date: "2026-10-08" },
      end: { date: "2026-10-10" },
      transparency: "opaque",
      eventType: "outOfOffice",
      status: "confirmed",
    }, { id: "armando@iconicimagestx.com", name: "Armando" });

    expect(event).toMatchObject({
      id: "evt-1",
      calendarId: "armando@iconicimagestx.com",
      photographerName: "Armando",
      summary: "Out of office",
      allDay: true,
      start: "2026-10-08",
      end: "2026-10-10",
      transparency: "opaque",
      eventType: "outOfOffice",
      status: "confirmed",
    });
  });

  it("treats a timed event as not all-day", () => {
    const event = toCalendarScheduleEvent({
      summary: "Iconic Images: Jane Agent",
      location: "10 Oak St",
      start: { dateTime: "2026-10-08T18:30:00-05:00" },
      end: { dateTime: "2026-10-08T20:00:00-05:00" },
    }, { id: "pedro@iconicimagestx.com", name: "Pedro" });

    expect(event.allDay).toBe(false);
    expect(event.start).toBe("2026-10-08T18:30:00-05:00");
    expect(event.location).toBe("10 Oak St");
    expect(event.transparency).toBeNull();
  });
});

describe("booking calendar times", () => {
  it("keeps a UTC-midnight shoot and a late Chicago evening on November 17", () => {
    expect(bookingEventTimes(new Date("2026-11-17T00:00:00.000Z"), "9:00 AM")).toMatchObject({
      start: "2026-11-17T09:00:00",
      end: "2026-11-17T10:30:00",
    });
    expect(bookingEventTimes(new Date("2026-11-18T03:00:00.000Z"), "9:00 PM")?.start).toBe("2026-11-17T21:00:00");
    expect(bookingEventTimes(null, "9:00 AM")).toBeNull();
  });
});
