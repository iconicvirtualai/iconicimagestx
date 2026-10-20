import { describe, expect, it } from "vitest";
import { apprenticeshipHoursFromEnv } from "./apprenticeship";
import {
  assignPhotographerSlots,
  type AssignedSlot,
  type PhotographerDay,
  type TravelEvent,
} from "./bookingAvailability";
import { STEVEN_BANDA_ID } from "./bookingHours";
import {
  photographerPreferenceForNames,
  suggestedAppointmentLabel,
  suggestedAppointmentsEnabled,
  suggestAppointmentTimes,
} from "./suggestedAppointments";

const now = new Date("2026-10-13T12:00:00.000Z");
const hours = apprenticeshipHoursFromEnv({});
const address = "200 Oak Ave, Houston, TX";

function event(start: string, end: string, location = ""): TravelEvent {
  return { startMs: Date.parse(start), endMs: Date.parse(end), location };
}

function person(id: string, events: TravelEvent[], name = id): PhotographerDay {
  return { id, name, events };
}

function suggest(input: {
  id?: string;
  name?: string;
  events?: TravelEvent[];
  people?: PhotographerDay[];
  bufferMinutes?: number;
  bookingAddress?: string;
  durationMinutes?: number;
  driveMinutes?: (from: string, to: string, departAtMs: number) => number | null;
  slots?: AssignedSlot[];
  limit?: number;
}) {
  const id = input.id ?? "mike-luna";
  return suggestAppointmentTimes({
    now,
    durationMinutes: input.durationMinutes ?? 60,
    hours,
    bufferMinutes: input.bufferMinutes ?? 25,
    bookingAddress: input.bookingAddress ?? address,
    preferenceId: id,
    photographers: input.people ?? [person(id, input.events ?? [], input.name ?? "Mike Luna")],
    driveMinutes: input.driveMinutes ?? (() => null),
    slots: input.slots,
    limit: input.limit,
  });
}

describe("suggested appointments", () => {
  const morning = [event("2026-10-13T09:00:00-05:00", "2026-10-13T10:00:00-05:00", address)];
  const groupedDay = [
    event("2026-10-13T09:00:00-05:00", "2026-10-13T10:00:00-05:00", address),
    event("2026-10-13T15:00:00-05:00", "2026-10-13T16:00:00-05:00", "410 Pine St, Houston, TX"),
  ];

  it("groups the next open times beside existing shoots", () => {
    const suggestions = suggest({ events: groupedDay });
    expect(suggestions.map((slot) => slot.time)).toEqual(["11:00 AM", "1:00 PM", "5:00 PM"]);
    expect(suggestions.every((slot) => slot.date === "2026-10-13")).toBe(true);
    expect(suggestions[0] && suggestedAppointmentLabel(suggestions[0])).toBe("Tue, Oct 13 2026 - 11:00am CT");
    expect(suggestions.map((slot) => slot.photographerId)).toEqual(["mike-luna", "mike-luna", "mike-luna"]);
  });

  it("keeps the travel buffer and drops a stuffed time inside that gap", () => {
    const open = suggest({ events: morning, bufferMinutes: 0 });
    expect(open.some((slot) => slot.time === "10:00 AM")).toBe(true);

    const buffered = suggest({ events: morning, bufferMinutes: 25 });
    expect(buffered.some((slot) => slot.time === "10:00 AM")).toBe(false);
    expect(buffered[0]?.time).toBe("11:00 AM");

    const real = assignPhotographerSlots({
      now,
      durationMinutes: 60,
      hours,
      bufferMinutes: 25,
      bookingAddress: address,
      preferenceId: "mike-luna",
      photographers: [person("mike-luna", morning, "Mike Luna")],
      driveMinutes: () => null,
    }).slots;
    const illegal: AssignedSlot = {
      start: "2026-10-13T15:00:00.000Z",
      end: "2026-10-13T16:00:00.000Z",
      date: "2026-10-13",
      time: "10:00 AM",
      label: "Tue, Oct 13 · 10:00 AM",
      photographerId: "mike-luna",
      photographerName: "Mike Luna",
    };
    const guarded = suggest({ events: morning, slots: [illegal, ...real] });
    expect(guarded.some((slot) => slot.time === "10:00 AM" || slot.start === illegal.start)).toBe(false);
    expect(guarded.every((slot) => real.some((item) => item.start === slot.start))).toBe(true);
  });

  it("follows the company Saturday cutoff and Sunday closure, and Steven's Sunday", () => {
    const saturdayShoot = [event("2026-10-17T09:00:00-05:00", "2026-10-17T10:00:00-05:00", address)];
    const company = suggest({ events: saturdayShoot });
    expect(company.map((slot) => `${slot.date} ${slot.time}`)).toEqual(["2026-10-17 11:00 AM"]);
    expect(company.some((slot) => slot.time === "12:00 PM" || slot.date === "2026-10-18")).toBe(false);

    const sundayShoot = [event("2026-10-18T09:00:00-05:00", "2026-10-18T10:00:00-05:00", address)];
    const steven = suggest({
      id: STEVEN_BANDA_ID,
      name: "Steven Banda",
      events: sundayShoot,
    });
    expect(steven.map((slot) => `${slot.date} ${slot.time}`)).toEqual(["2026-10-18 11:00 AM"]);
    expect(steven.every((slot) => slot.photographerId === STEVEN_BANDA_ID)).toBe(true);
  });

  it("falls back to the earliest open slots when nothing is booked nearby", () => {
    const suggestions = suggest({ events: [] });
    expect(suggestions).toHaveLength(3);
    expect(suggestions.map((slot) => slot.time)).toEqual(["9:00 AM", "10:00 AM", "11:00 AM"]);
    expect(suggestions.every((slot) => slot.date === "2026-10-13")).toBe(true);

    const allDay = [event("2026-10-20T00:00:00-05:00", "2026-10-21T00:00:00-05:00", address)];
    const ignored = suggest({ events: allDay });
    expect(ignored.map((slot) => slot.time)).toEqual(["9:00 AM", "10:00 AM", "11:00 AM"]);
    expect(ignored.every((slot) => slot.date === "2026-10-13")).toBe(true);
  });

  it("returns at most three suggestions", () => {
    const events = [13, 14, 15, 16, 19, 20].map((day) => (
      event(`2026-10-${day}T09:00:00-05:00`, `2026-10-${day}T10:00:00-05:00`, address)
    ));
    const suggestions = suggest({ events });
    expect(suggestions).toHaveLength(3);
    expect(suggestions.map((slot) => slot.time)).toEqual(["11:00 AM", "11:00 AM", "11:00 AM"]);
    expect(suggestions.map((slot) => slot.date)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
  });

  it("prefers the grouped time that is geographically closer", () => {
    const events = [
      event("2026-10-13T09:00:00-05:00", "2026-10-13T10:00:00-05:00", "900 Far St, Katy, TX"),
      event("2026-10-14T09:00:00-05:00", "2026-10-14T10:00:00-05:00", "200 Oak Ave, Houston, TX"),
    ];
    const byAddress = suggest({ events });
    expect(byAddress[0]?.date).toBe("2026-10-14");
    expect(byAddress.map((slot) => slot.date)).toEqual(["2026-10-14", "2026-10-13"]);

    const byDrive = suggest({
      bookingAddress: "150 Oak Ave, Houston, TX",
      events: [
        event("2026-10-13T09:00:00-05:00", "2026-10-13T10:00:00-05:00", "900 Far St, Katy, TX"),
        event("2026-10-14T09:00:00-05:00", "2026-10-14T10:00:00-05:00", "160 Oak Ave, Houston, TX"),
      ],
      driveMinutes: (from, to) => (`${from} ${to}`.includes("Far") ? 50 : 10),
    });
    expect(byDrive[0]?.date).toBe("2026-10-14");
    expect(byDrive[1]?.date).toBe("2026-10-13");
  });

  it("turns on unless an env flag or the stored setting says off", () => {
    expect(suggestedAppointmentsEnabled({})).toBe(true);
    expect(suggestedAppointmentsEnabled({}, null)).toBe(true);
    expect(suggestedAppointmentsEnabled({}, false)).toBe(false);
    expect(suggestedAppointmentsEnabled({}, true)).toBe(true);
    expect(suggestedAppointmentsEnabled({ SUGGESTED_APPOINTMENTS_ENABLED: "false" }, true)).toBe(false);
    expect(suggestedAppointmentsEnabled({ SUGGESTED_APPOINTMENTS_ENABLED: "off" }, true)).toBe(false);
    expect(suggestedAppointmentsEnabled({ SUGGESTED_APPOINTMENTS: "on" }, false)).toBe(true);
    expect(suggestedAppointmentsEnabled({ SUGGESTED_APPOINTMENTS_ENABLED: "maybe" }, false)).toBe(false);
    expect(photographerPreferenceForNames(["Mike Luna"], [
      { id: "mike-luna", name: "Mike Luna" },
      { id: "steven-banda", name: "Steven Banda" },
    ])).toBe("mike-luna");
    expect(photographerPreferenceForNames(["Mike Luna", "Steven Banda"], [
      { id: "mike-luna", name: "Mike Luna" },
      { id: "steven-banda", name: "Steven Banda" },
    ])).toBe("no-preference");
  });
});
