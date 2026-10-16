import { describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "./bookingCatalog";
import { apprenticeshipHoursFromEnv } from "./apprenticeship";
import {
  assignPhotographerSlots,
  bookingDurationMinutes,
  explicitDurationMinutes,
  parseRouteDuration,
  parseRouteMatrixBody,
  isPreferredWindowBooking,
  resolveBookingAssignment,
  travelBufferMinutes,
  travelEventsFromBlocks,
  type PhotographerDay,
  type TravelEvent,
} from "./bookingAvailability";

const now = new Date("2026-10-13T12:00:00.000Z");
const hours = apprenticeshipHoursFromEnv({});
const catalog = packagesForStaffEditor([]);

function event(start: string, end: string, location = ""): TravelEvent {
  return { startMs: Date.parse(start), endMs: Date.parse(end), location };
}

describe("booking appointment duration", () => {
  it("uses apprenticeship caps, stated session lengths, and the 90 minute shoot default", () => {
    expect(bookingDurationMinutes({ selectedBasics: ["apprentice-25"], catalog })).toBe(20);
    expect(bookingDurationMinutes({ selectedBasics: ["apprentice-50"], catalog })).toBe(60);
    expect(bookingDurationMinutes({ selectedBasics: ["photos-35"], catalog })).toBe(90);
    expect(bookingDurationMinutes({ selectedService: "listing-essentials", catalog })).toBe(90);
    expect(bookingDurationMinutes({ selectedService: "branding-refresh", catalog })).toBe(60);
    expect(bookingDurationMinutes({ selectedService: "branding-content-partner", catalog })).toBe(120);
    expect(bookingDurationMinutes({ selectedService: "branding-local-legend", catalog })).toBe(480);
    expect(bookingDurationMinutes({ selectedService: "business-baseline", catalog })).toBe(30);
    expect(bookingDurationMinutes({
      selectedService: "listing-essentials",
      catalog,
      env: { DEFAULT_APPOINTMENT_DURATION_MINUTES: "45" },
    })).toBe(45);
  });

  it("ignores second counts and reads an hour range as the longer end", () => {
    expect(explicitDurationMinutes("15-Second Vertical Video")).toEqual([]);
    expect(explicitDurationMinutes("6-8 Hour Signature Production Day")).toEqual([480]);
    expect(travelBufferMinutes({})).toBe(30);
    expect(travelBufferMinutes({ BOOKING_TRAVEL_BUFFER_MINUTES: "15" })).toBe(15);
    expect(travelBufferMinutes({ BOOKING_TRAVEL_BUFFER_MINUTES: "nope" })).toBe(30);
  });
});

describe("drive time between shoots", () => {
  const previous = event("2026-10-13T08:00:00-05:00", "2026-10-13T09:00:00-05:00", "100 Main St, Houston, TX");
  const next = event("2026-10-13T12:00:00-05:00", "2026-10-13T13:00:00-05:00", "900 Far St, Houston, TX");

  function open(drive: (from: string, to: string) => number | null) {
    const people: PhotographerDay[] = [{
      id: "mike-luna",
      name: "Mike Luna",
      events: [previous, next],
    }];
    return assignPhotographerSlots({
      now,
      durationMinutes: 60,
      hours,
      bufferMinutes: 30,
      bookingAddress: "200 Oak Ave, Houston, TX",
      preferenceId: "mike-luna",
      photographers: people,
      driveMinutes: (from, to) => drive(from, to),
    }).slots.filter((slot) => slot.date === "2026-10-13").map((slot) => slot.time);
  }

  it("keeps a slot only when both drives fit", () => {
    const times = open((from, to) => {
      if (from.includes("Main") && to.includes("Oak")) return 45;
      if (from.includes("Oak") && to.includes("Far")) return 20;
      return 5;
    });
    expect(times).not.toContain("9:00 AM");
    expect(times).toContain("10:00 AM");
    expect(times).not.toContain("11:00 AM");
  });

  it("uses the buffer when a shoot has no location", () => {
    const day = assignPhotographerSlots({
      now,
      durationMinutes: 60,
      hours,
      bufferMinutes: 30,
      bookingAddress: "200 Oak Ave, Houston, TX",
      preferenceId: "mike-luna",
      photographers: [{
        id: "mike-luna",
        name: "Mike Luna",
        events: [event("2026-10-13T08:00:00-05:00", "2026-10-13T09:00:00-05:00", "")],
      }],
      driveMinutes: () => 5,
    }).slots.filter((slot) => slot.date === "2026-10-13").map((slot) => slot.time);
    expect(day).not.toContain("9:00 AM");
    expect(day).toContain("10:00 AM");
    expect(day).toContain("11:00 AM");
  });

  it("uses the buffer when drive time cannot be calculated", () => {
    const times = open(() => null);
    expect(times).not.toContain("9:00 AM");
    expect(times).toContain("10:00 AM");
    expect(times).not.toContain("11:00 AM");
  });

  it("blocks a whole day for an all-day event", () => {
    const events = travelEventsFromBlocks([{
      start: "2026-10-14",
      end: "2026-10-15",
      location: "",
      allDay: true,
    }], hours.timeZone);
    const result = assignPhotographerSlots({
      now,
      durationMinutes: 60,
      hours,
      bufferMinutes: 30,
      bookingAddress: "200 Oak Ave, Houston, TX",
      preferenceId: "mike-luna",
      photographers: [{ id: "mike-luna", name: "Mike Luna", events }],
      driveMinutes: () => null,
    });
    expect(result.slots.some((slot) => slot.date === "2026-10-14")).toBe(false);
    expect(result.slots.some((slot) => slot.date === "2026-10-15")).toBe(true);
    expect(result.slots.some((slot) => slot.date === "2026-10-18")).toBe(false);
  });
});

describe("photographer choice", () => {
  const far = event("2026-10-13T08:00:00-05:00", "2026-10-13T09:00:00-05:00", "100 Main St");
  const people: PhotographerDay[] = [
    { id: "mike-luna", name: "Mike Luna", events: [far] },
    { id: "armando-martinez", name: "Armando Martinez", events: [] },
    { id: "steven-banda", name: "Steven Banda", events: null },
  ];

  function assign(preferenceId: string) {
    return assignPhotographerSlots({
      now,
      durationMinutes: 60,
      hours,
      bufferMinutes: 30,
      bookingAddress: "200 Oak Ave",
      preferenceId,
      photographers: people,
      driveMinutes: () => 45,
    });
  }

  it("assigns the first photographer who can make a no-preference slot", () => {
    const result = assign("no-preference");
    const nine = result.slots.find((slot) => slot.date === "2026-10-13" && slot.time === "9:00 AM");
    const ten = result.slots.find((slot) => slot.date === "2026-10-13" && slot.time === "10:00 AM");
    expect(nine?.photographerName).toBe("Armando Martinez");
    expect(ten?.photographerName).toBe("Mike Luna");
    expect(result.slots.some((slot) => slot.photographerId === "steven-banda")).toBe(false);
  });

  it("limits a preferred photographer to their own open times", () => {
    const mike = assign("mike-luna");
    expect(mike.live).toBe(true);
    expect(mike.slots.every((slot) => slot.photographerName === "Mike Luna")).toBe(true);
    expect(mike.slots.find((slot) => slot.date === "2026-10-13" && slot.time === "9:00 AM")).toBeUndefined();
    expect(assign("steven-banda")).toEqual({ live: true, slots: [] });
  });

  it("keeps the standard time list only when every calendar is unreadable", () => {
    expect(assignPhotographerSlots({
      now,
      durationMinutes: 60,
      hours,
      bufferMinutes: 30,
      bookingAddress: "200 Oak Ave",
      preferenceId: "no-preference",
      photographers: people.map((person) => ({ ...person, events: null })),
      driveMinutes: () => 10,
    }).live).toBe(false);
  });

  it("rejects a taken time and accepts the assigned slot", () => {
    const result = assign("no-preference");
    const slot = result.slots[0];
    expect(resolveBookingAssignment({ live: true, slotStart: "", slots: result.slots })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(resolveBookingAssignment({ live: true, slotStart: "nope", slots: result.slots })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(resolveBookingAssignment({ live: true, slotStart: slot.start, slots: result.slots })).toEqual({
      ok: true,
      slot,
    });
    expect(resolveBookingAssignment({ live: false, slotStart: "", slots: [] })).toEqual({ ok: true, slot: null });
  });

  it("treats Morning, Midday, and Afternoon with no slot as a preferred window", () => {
    expect(isPreferredWindowBooking({ scheduledTime: "Morning" })).toBe(true);
    expect(isPreferredWindowBooking({ scheduledTime: " Midday " })).toBe(true);
    expect(isPreferredWindowBooking({ scheduledTime: "Afternoon", slotStart: null })).toBe(true);
    expect(isPreferredWindowBooking({ scheduledTime: "9:00 AM" })).toBe(false);
    expect(isPreferredWindowBooking({ scheduledTime: "Morning", slotStart: "2026-10-14T14:00:00.000Z" })).toBe(false);
    expect(isPreferredWindowBooking({})).toBe(false);
  });
});

describe("route matrix durations", () => {
  it("reads traffic-aware durations and treats a missing route as no drive time", () => {
    expect(parseRouteDuration("125s")).toBe(3);
    expect(parseRouteDuration("60s")).toBe(1);
    const legs = parseRouteMatrixBody([
      JSON.stringify({ originIndex: 0, destinationIndex: 1, duration: "600s", condition: "ROUTE_EXISTS" }),
      JSON.stringify({ destinationIndex: 0, duration: "10s", condition: "ROUTE_NOT_FOUND" }),
    ].join("\n"));
    expect(legs).toEqual([
      { originIndex: 0, destinationIndex: 1, minutes: 10 },
      { originIndex: 0, destinationIndex: 0, minutes: null },
    ]);
  });
});
