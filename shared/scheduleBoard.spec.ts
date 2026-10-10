import { describe, expect, it } from "vitest";
import {
  calendarRoster,
  classifyCalendarEvent,
  countUnassignedShoots,
  dayLoadCue,
  dayOpsSummary,
  matchShooter,
  recordHasTwilight,
  scheduleBlockDateKeys,
  shooterCuesForDay,
  shooterStatusLabel,
} from "./scheduleBoard";

const roster = [
  { id: "mike@example.com", name: "Mike Luna" },
  { id: "armando@example.com", name: "Armando" },
  { id: "pedro@example.com", name: "Pedro" },
  { id: "steven@example.com", name: "Steven" },
  { id: "owner-calendar@example.com", name: "Cadi" },
  { id: "daniel@example.com", name: "Daniel" },
];

describe("twilight labels", () => {
  it("reads twilight and dusk services as twilight", () => {
    expect(recordHasTwilight(["2 Twilight Images (Front/Back)"])).toBe(true);
    expect(recordHasTwilight(["1 Iconic Twilight Render"])).toBe(true);
    expect(recordHasTwilight(["Dusk Add-on"])).toBe(true);
    expect(recordHasTwilight(["30 Photos", "Aerial Drone Stills"])).toBe(false);
  });

  it("reads a twilight note and ignores a sunset mention", () => {
    expect(recordHasTwilight([], ["Please shoot twilight on the rear."])).toBe(true);
    expect(recordHasTwilight([], ["Gate code: 1234. Please capture the sunset view."])).toBe(false);
  });
});

describe("calendar event classification", () => {
  it("keeps Iconic bookings and located events as shoots", () => {
    expect(classifyCalendarEvent({
      summary: "Iconic Images: Jane Agent",
      location: "10 Oak St, Houston, TX",
    })).toBe("shoot");
    expect(classifyCalendarEvent({
      summary: "Jane Agent — 10 Oak St — Twilight",
      location: "10 Oak St",
    })).toBe("shoot");
  });

  it("treats out-of-office, busy, and all-day blocks as unavailable", () => {
    expect(classifyCalendarEvent({ summary: "Out of office", allDay: true })).toBe("unavailable");
    expect(classifyCalendarEvent({ summary: "Busy" })).toBe("unavailable");
    expect(classifyCalendarEvent({ eventType: "outOfOffice", summary: "OOO" })).toBe("unavailable");
    expect(classifyCalendarEvent({ summary: "Vacation", allDay: true })).toBe("unavailable");
    expect(classifyCalendarEvent({ summary: "Company holiday", allDay: true })).toBe("unavailable");
  });

  it("does not block a free or working-location event", () => {
    expect(classifyCalendarEvent({ summary: "Home", transparency: "transparent" })).toBe("free");
    expect(classifyCalendarEvent({ summary: "Office", eventType: "workingLocation" })).toBe("free");
    expect(classifyCalendarEvent({ summary: "Cancelled shoot", status: "cancelled", location: "10 Oak" })).toBe("free");
  });

  it("holds a timed personal event and keeps a titled booking as a shoot", () => {
    expect(classifyCalendarEvent({ summary: "Dentist", allDay: false })).toBe("hold");
    expect(classifyCalendarEvent({ summary: "Jane Agent — 10 Oak St — 30 Photos" })).toBe("shoot");
  });

  it("expands an all-day block across the exclusive end date", () => {
    expect(scheduleBlockDateKeys("2026-10-08", "2026-10-11", true)).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
    ]);
    expect(scheduleBlockDateKeys("2026-10-08T19:00:00-05:00", "2026-10-08T20:30:00-05:00", false)).toEqual([
      "2026-10-08",
    ]);
  });
});

describe("shooter availability", () => {
  it("marks open, booked, twilight, hold, and unavailable", () => {
    const cues = shooterCuesForDay({
      roster,
      shoots: [
        { photographerNames: ["Armando"], twilight: true },
        { photographerNames: ["Pedro"], twilight: false },
        { photographerNames: ["Pedro"], twilight: false },
      ],
      blocks: [
        { photographerName: "Steven", kind: "unavailable" },
        { photographerName: "Cadi", kind: "hold" },
      ],
    });

    expect(cues.find((cue) => cue.name === "Mike Luna")).toMatchObject({ status: "open", shootCount: 0 });
    expect(cues.find((cue) => cue.name === "Armando")).toMatchObject({ status: "twilight", shootCount: 1 });
    expect(cues.find((cue) => cue.name === "Pedro")).toMatchObject({ status: "booked", shootCount: 2 });
    expect(cues.find((cue) => cue.name === "Steven")).toMatchObject({ status: "unavailable" });
    expect(cues.find((cue) => cue.name === "Cadi")).toMatchObject({ status: "hold" });
    expect(shooterStatusLabel(cues.find((cue) => cue.name === "Pedro")!)).toBe("Booked · 2");
    expect(shooterStatusLabel(cues.find((cue) => cue.name === "Armando")!)).toBe("Twilight");
    expect(shooterStatusLabel(cues.find((cue) => cue.name === "Mike Luna")!)).toBe("Open");
  });

  it("lets a real shoot override an out-of-office block", () => {
    const cues = shooterCuesForDay({
      roster,
      shoots: [{ photographerNames: ["Mike Luna"], twilight: false }],
      blocks: [{ photographerName: "Mike", kind: "unavailable" }],
    });
    expect(cues.find((cue) => cue.name === "Mike Luna")?.status).toBe("booked");
  });

  it("does not fuzzy-match a shared first name", () => {
    const people = calendarRoster([
      { id: "mike@example.com", name: "Mike Luna" },
      { id: "mike.s@example.com", name: "Mike Smith" },
      { id: "armando@example.com", name: "Armando" },
    ]);
    expect(matchShooter("Mike", people)).toBeNull();
    expect(matchShooter("Mike Luna", people)?.id).toBe("mike@example.com");
    expect(matchShooter("Armando Reyes", people)?.name).toBe("Armando");
  });

  it("counts a shoot with no roster match as unassigned", () => {
    expect(countUnassignedShoots([
      { photographerNames: [], twilight: false },
      { photographerNames: ["Armando"], twilight: true },
      { photographerNames: ["Someone Else"], twilight: false },
    ], roster)).toBe(2);
  });
});

describe("day cues", () => {
  it("summarizes shoots, twilight, open photographers, and unassigned work", () => {
    expect(dayOpsSummary({
      shootCount: 4,
      twilightCount: 1,
      openCount: 2,
      unassignedCount: 1,
    })).toBe("4 shoots · 1 twilight · 2 open · 1 unassigned");
    expect(dayOpsSummary({
      shootCount: 1,
      twilightCount: 0,
      openCount: 5,
      unassignedCount: 0,
    })).toBe("1 shoot · 5 open");
  });

  it("prefers a twilight mark, then full, hold, or off", () => {
    expect(dayLoadCue({
      twilightShootCount: 1,
      cues: [{ status: "twilight" }, { status: "open" }],
    })).toBe("Twilight");
    expect(dayLoadCue({
      twilightShootCount: 2,
      cues: [{ status: "twilight" }],
    })).toBe("2 twilight");
    expect(dayLoadCue({
      twilightShootCount: 0,
      cues: [{ status: "booked" }, { status: "booked" }],
    })).toBe("Full");
    expect(dayLoadCue({
      twilightShootCount: 0,
      cues: [{ status: "hold" }, { status: "open" }],
    })).toBeNull();
    expect(dayLoadCue({
      twilightShootCount: 0,
      cues: [{ status: "hold" }, { status: "hold" }],
    })).toBe("Hold");
    expect(dayLoadCue({
      twilightShootCount: 0,
      cues: [{ status: "unavailable" }, { status: "open" }],
    })).toBe("1 off");
    expect(dayLoadCue({
      twilightShootCount: 0,
      cues: [{ status: "open" }, { status: "open" }],
    })).toBeNull();
  });
});
