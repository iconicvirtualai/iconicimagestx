import { describe, expect, it } from "vitest";
import {
  MIKE_CALL_TIME_ZONE,
  MIKE_CALL_WINDOW_LABEL,
  isMikeCallSlot,
  mikeCallSlots,
} from "./mikeCallSlots";

/** Monday Nov 30, 2026, 8:00 AM CT. */
const MONDAY_MORNING = new Date("2026-11-30T14:00:00.000Z");

function timesOn(slots: ReturnType<typeof mikeCallSlots>, date: string): string[] {
  return slots.filter((slot) => slot.date === date).map((slot) => slot.time);
}

describe("Mike call slots", () => {
  it("uses America/Chicago and the published weekday windows", () => {
    expect(MIKE_CALL_TIME_ZONE).toBe("America/Chicago");
    expect(MIKE_CALL_WINDOW_LABEL).toBe("Monday–Friday, 9:00 AM–12:00 PM or 2:00 PM–4:00 PM CT");
  });

  it("offers 30-minute Mon–Fri slots in the morning and afternoon only", () => {
    const slots = mikeCallSlots({ now: MONDAY_MORNING });
    const monday = timesOn(slots, "2026-11-30");
    expect(monday).toEqual([
      "9:00 AM",
      "9:30 AM",
      "10:00 AM",
      "10:30 AM",
      "11:00 AM",
      "11:30 AM",
      "2:00 PM",
      "2:30 PM",
      "3:00 PM",
      "3:30 PM",
    ]);
    expect(monday).not.toContain("12:00 PM");
    expect(monday).not.toContain("12:30 PM");
    expect(monday).not.toContain("1:00 PM");
    expect(monday).not.toContain("1:30 PM");
    expect(monday).not.toContain("4:00 PM");

    for (const slot of slots) {
      const weekday = new Date(`${slot.date}T00:00:00.000Z`).getUTCDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
      expect(isMikeCallSlot(slot.start, slot.end)).toBe(true);
      expect(slot.label).toContain(slot.time);
    }
    expect(slots.some((slot) => slot.date === "2026-12-05")).toBe(false);
    expect(slots.some((slot) => slot.date === "2026-12-06")).toBe(false);
  });

  it("drops past times and busy times", () => {
    const atTen = new Date("2026-11-30T16:00:00.000Z");
    const open = timesOn(mikeCallSlots({ now: atTen }), "2026-11-30");
    expect(open[0]).toBe("10:30 AM");
    expect(open).not.toContain("9:00 AM");
    expect(open).not.toContain("10:00 AM");

    const busy = mikeCallSlots({
      now: MONDAY_MORNING,
      busy: [{ start: "2026-11-30T15:00:00.000Z", end: "2026-11-30T15:30:00.000Z" }],
    });
    expect(timesOn(busy, "2026-11-30")).not.toContain("9:00 AM");
    expect(timesOn(busy, "2026-11-30")).toContain("9:30 AM");
  });

  it("closes Friday once the afternoon window has ended and skips the weekend", () => {
    const afterHours = new Date("2026-11-27T22:00:00.000Z");
    const slots = mikeCallSlots({ now: afterHours });
    expect(slots.some((slot) => slot.date === "2026-11-27")).toBe(false);
    expect(slots.some((slot) => slot.date === "2026-11-28")).toBe(false);
    expect(slots.some((slot) => slot.date === "2026-11-29")).toBe(false);
    expect(timesOn(slots, "2026-11-30")[0]).toBe("9:00 AM");
  });

  it("rejects Saturday, midday, and a 4:00 PM start", () => {
    expect(isMikeCallSlot("2026-12-05T15:00:00.000Z", "2026-12-05T15:30:00.000Z")).toBe(false);
    expect(isMikeCallSlot("2026-11-30T18:30:00.000Z", "2026-11-30T19:00:00.000Z")).toBe(false);
    expect(isMikeCallSlot("2026-11-30T22:00:00.000Z", "2026-11-30T22:30:00.000Z")).toBe(false);
    const monday = mikeCallSlots({ now: MONDAY_MORNING }).find((slot) => slot.date === "2026-11-30" && slot.time === "2:00 PM");
    expect(monday && isMikeCallSlot(monday.start, monday.end)).toBe(true);
  });
});
