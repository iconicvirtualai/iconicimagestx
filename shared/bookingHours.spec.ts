import { describe, expect, it } from "vitest";
import { apprenticeshipHoursFromEnv } from "./apprenticeship";
import {
  assignPhotographerSlots,
  type PhotographerDay,
  type TravelEvent,
} from "./bookingAvailability";
import {
  SATURDAY_DELIVERY_NOTE,
  STEVEN_BANDA_ID,
  bookingHoursFromEnv,
  isSaturdayCalendarDate,
  saturdayDeliveryNote,
  weekForPhotographer,
} from "./bookingHours";

const now = new Date("2026-10-13T12:00:00.000Z");
const hours = apprenticeshipHoursFromEnv({});

function event(start: string, end: string, location = ""): TravelEvent {
  return { startMs: Date.parse(start), endMs: Date.parse(end), location };
}

function times(input: {
  id: string;
  date: string;
  durationMinutes: number;
  events?: TravelEvent[];
  bufferMinutes?: number;
  people?: PhotographerDay[];
  schedule?: ReturnType<typeof bookingHoursFromEnv>;
}) {
  const people = input.people ?? [{
    id: input.id,
    name: input.id,
    events: input.events ?? [],
  }];
  return assignPhotographerSlots({
    now,
    durationMinutes: input.durationMinutes,
    hours,
    schedule: input.schedule,
    bufferMinutes: input.bufferMinutes ?? 30,
    bookingAddress: "200 Oak Ave, Houston, TX",
    preferenceId: input.id,
    photographers: people,
    driveMinutes: () => null,
  }).slots.filter((slot) => slot.date === input.date);
}

describe("booking weekly hours", () => {
  it("keeps the company weekday window and applies Saturday, Sunday, and Steven in one config", () => {
    const config = bookingHoursFromEnv({
      APPRENTICESHIP_DAY_START: "10:00",
      APPRENTICESHIP_DAY_END: "19:00",
      APPRENTICESHIP_WORK_DAYS: "1,2,3,4,5",
      APPRENTICESHIP_HORIZON_DAYS: "14",
      APPRENTICESHIP_TIME_ZONE: "America/Chicago",
    });
    expect(config.company.timeZone).toBe("America/Chicago");
    expect(config.company.days[0]).toBeNull();
    expect(config.company.days[2]).toEqual({ startMinutes: 10 * 60, endMinutes: 19 * 60 });
    expect(config.company.days[6]).toEqual({
      startMinutes: 10 * 60,
      endMinutes: 19 * 60,
      latestStartMinutes: 12 * 60,
    });
    expect(Object.keys(config.photographers)).toEqual([STEVEN_BANDA_ID]);
    expect(config.photographers[STEVEN_BANDA_ID].days).toHaveLength(7);
    expect(config.photographers[STEVEN_BANDA_ID].days.every((day) => (
      day?.startMinutes === 10 * 60 && day.endMinutes === 17 * 60 && day.latestStartMinutes == null
    ))).toBe(true);
    expect(weekForPhotographer(config, "mike-luna")).toBe(config.company);
    expect(weekForPhotographer(config, STEVEN_BANDA_ID)).toBe(config.photographers[STEVEN_BANDA_ID]);
    expect(bookingHoursFromEnv({}).company.days[1]).toEqual({ startMinutes: 9 * 60, endMinutes: 18 * 60 });
  });

  it("leaves Monday–Friday on the current grid, including a 6:00 PM finish", () => {
    const tuesday = times({ id: "mike-luna", date: "2026-10-13", durationMinutes: 60 }).map((slot) => slot.time);
    expect(tuesday[0]).toBe("9:00 AM");
    expect(tuesday).toContain("5:00 PM");
    expect(tuesday).not.toContain("6:00 PM");
    const stevenTuesday = times({ id: STEVEN_BANDA_ID, date: "2026-10-13", durationMinutes: 60 }).map((slot) => slot.time);
    expect(stevenTuesday).toContain("9:00 AM");
    expect(stevenTuesday).toContain("4:00 PM");
    expect(stevenTuesday).not.toContain("5:00 PM");
  });

  it("lets company Saturday shoots start only before noon, including one that runs past noon", () => {
    const morning = times({ id: "mike-luna", date: "2026-10-17", durationMinutes: 60 }).map((slot) => slot.time);
    expect(morning).toEqual(["9:00 AM", "10:00 AM", "11:00 AM"]);
    const acrossNoon = times({ id: "cadi-torres", date: "2026-10-17", durationMinutes: 90 }).map((slot) => slot.time);
    expect(acrossNoon).toEqual(["9:00 AM", "10:30 AM"]);
    expect(acrossNoon).not.toContain("12:00 PM");
  });

  it("closes Sunday for the company and keeps Steven bookable through Sunday until 5:00 PM", () => {
    expect(times({ id: "mike-luna", date: "2026-10-18", durationMinutes: 60 })).toEqual([]);
    const sunday = times({ id: STEVEN_BANDA_ID, date: "2026-10-18", durationMinutes: 60 }).map((slot) => slot.time);
    expect(sunday).toContain("9:00 AM");
    expect(sunday).toContain("4:00 PM");
    expect(sunday).not.toContain("5:00 PM");
    const saturday = times({ id: STEVEN_BANDA_ID, date: "2026-10-17", durationMinutes: 60 }).map((slot) => slot.time);
    expect(saturday).toContain("12:00 PM");
    expect(saturday).toContain("4:00 PM");
    expect(saturday).not.toContain("5:00 PM");
    const longSaturday = times({ id: STEVEN_BANDA_ID, date: "2026-10-17", durationMinutes: 90 }).map((slot) => slot.time);
    expect(longSaturday).toContain("12:00 PM");
    expect(longSaturday).toContain("3:00 PM");
    expect(longSaturday).not.toContain("4:30 PM");
  });

  it("still drops Steven's Sunday times that hit a busy block or the travel buffer", () => {
    const busy = [event("2026-10-18T14:30:00-05:00", "2026-10-18T15:45:00-05:00", "")];
    const open = times({
      id: STEVEN_BANDA_ID,
      date: "2026-10-18",
      durationMinutes: 60,
      events: busy,
      bufferMinutes: 0,
    }).map((slot) => slot.time);
    expect(open).toContain("1:00 PM");
    expect(open).not.toContain("2:00 PM");
    expect(open).toContain("4:00 PM");
    const buffered = times({
      id: STEVEN_BANDA_ID,
      date: "2026-10-18",
      durationMinutes: 60,
      events: busy,
      bufferMinutes: 30,
    }).map((slot) => slot.time);
    expect(buffered).toContain("1:00 PM");
    expect(buffered).not.toContain("2:00 PM");
    expect(buffered).not.toContain("4:00 PM");
  });

  it("assigns Saturday afternoon and Sunday only to Steven when there is no preference", () => {
    const people: PhotographerDay[] = [
      { id: "mike-luna", name: "Mike Luna", events: [] },
      { id: STEVEN_BANDA_ID, name: "Steven Banda", events: [] },
    ];
    const slots = assignPhotographerSlots({
      now,
      durationMinutes: 60,
      hours,
      bufferMinutes: 30,
      bookingAddress: "200 Oak Ave, Houston, TX",
      preferenceId: "no-preference",
      photographers: people,
      driveMinutes: () => 0,
    }).slots;
    const saturdayMorning = slots.find((slot) => slot.date === "2026-10-17" && slot.time === "9:00 AM");
    const saturdayAfternoon = slots.find((slot) => slot.date === "2026-10-17" && slot.time === "12:00 PM");
    const sunday = slots.filter((slot) => slot.date === "2026-10-18");
    expect(saturdayMorning?.photographerId).toBe("mike-luna");
    expect(saturdayAfternoon?.photographerId).toBe(STEVEN_BANDA_ID);
    expect(sunday.length).toBeGreaterThan(0);
    expect(sunday.every((slot) => slot.photographerId === STEVEN_BANDA_ID)).toBe(true);
  });

  it("follows a later weekday start without opening Saturday afternoon or Sunday", () => {
    const schedule = bookingHoursFromEnv({
      APPRENTICESHIP_DAY_START: "10:00",
      APPRENTICESHIP_WORK_DAYS: "1",
    });
    const tuesday = times({
      id: "mike-luna",
      date: "2026-10-13",
      durationMinutes: 60,
      schedule,
    }).map((slot) => slot.time);
    const saturday = times({
      id: "mike-luna",
      date: "2026-10-17",
      durationMinutes: 60,
      schedule,
    }).map((slot) => slot.time);
    expect(tuesday[0]).toBe("10:00 AM");
    expect(tuesday).not.toContain("9:00 AM");
    expect(saturday).toEqual(["10:00 AM", "11:00 AM"]);
    expect(times({ id: "mike-luna", date: "2026-10-18", durationMinutes: 60, schedule })).toEqual([]);
  });

  it("shows the Saturday delivery line only for a Saturday calendar date", () => {
    expect(isSaturdayCalendarDate("2026-10-17")).toBe(true);
    expect(isSaturdayCalendarDate("2026-10-18")).toBe(false);
    expect(isSaturdayCalendarDate("2026-10-13")).toBe(false);
    expect(SATURDAY_DELIVERY_NOTE).toBe(
      "Saturday's media content is delivered on Monday unless Same Day Delivery is added while booking.",
    );
    expect(saturdayDeliveryNote("2026-10-17")).toBe(SATURDAY_DELIVERY_NOTE);
    expect(saturdayDeliveryNote("2026-10-13")).toBeNull();
    expect(saturdayDeliveryNote("")).toBeNull();
  });
});
