import { describe, expect, it } from "vitest";
import { metaPlan } from "./siteSeo";
import {
  THANKFUL_BUFFER_MINUTES,
  THANKFUL_MENUS,
  THANKFUL_SLOT_MINUTES,
  THANKFUL_STEP_MINUTES,
  openThankfulSlots,
  parseThankfulRsvp,
  thankfulBusyIntervals,
  thankfulZonedTimeToUtc,
} from "./thankfulEvent";

const NOW = new Date("2026-10-15T15:00:00.000Z");

function at(hour: number, minute: number) {
  return thankfulZonedTimeToUtc(2026, 11, 14, hour, minute).toISOString();
}

describe("thankful photo slots", () => {
  it("offers 15-minute steps from 11:00 AM through 2:45 PM when the calendar is open", () => {
    const slots = openThankfulSlots({ now: NOW, busy: [] });
    expect(THANKFUL_SLOT_MINUTES).toBe(15);
    expect(THANKFUL_BUFFER_MINUTES).toBe(5);
    expect(THANKFUL_STEP_MINUTES).toBe(15);
    expect(slots).toHaveLength(16);
    const last = slots[slots.length - 1];
    expect(slots[0]?.time).toBe("11:00 AM");
    expect(slots[0]?.start).toBe(at(11, 0));
    expect(last?.time).toBe("2:45 PM");
    expect(last?.end).toBe(at(15, 0));
    for (const slot of slots) {
      expect(Date.parse(slot.end) - Date.parse(slot.start)).toBe(15 * 60 * 1000);
      expect(slot.date).toBe("2026-11-14");
    }
    for (let index = 1; index < slots.length; index += 1) {
      const gap = Date.parse(slots[index].start) - Date.parse(slots[index - 1].start);
      expect(gap).toBe(15 * 60 * 1000);
    }
  });

  it("keeps a 5-minute buffer around an existing photos calendar event", () => {
    const slots = openThankfulSlots({
      now: NOW,
      busy: [{ start: at(12, 0), end: at(12, 15) }],
    });
    const times = slots.map((slot) => slot.time);
    expect(times).not.toContain("11:45 AM");
    expect(times).not.toContain("12:00 PM");
    expect(times).not.toContain("12:15 PM");
    expect(times).toContain("11:30 AM");
    expect(times).toContain("12:30 PM");
  });

  it("blocks the day when an all-day event covers November 14", () => {
    const busy = thankfulBusyIntervals([
      { start: "2026-11-14", end: "2026-11-15", allDay: true },
    ]);
    expect(openThankfulSlots({ now: NOW, busy })).toEqual([]);
    expect(openThankfulSlots({
      now: NOW,
      busy: [{ start: "2026-11-15", end: "2026-11-16", allDay: true }],
    })).toHaveLength(16);
  });
});

describe("thankful RSVP parse", () => {
  const body = {
    name: "Ada Lovelace",
    email: "Ada@Example.com",
    phone: "(281) 555-0199",
    partySize: 4,
    menuVote: "menu-2",
    santa: true,
    notes: "One dog",
    slotStart: at(11, 0),
  };

  it("keeps party size, one menu, and Santa", () => {
    const parsed = parseThankfulRsvp(body);
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(parsed.value.partySize).toBe(4);
    expect(parsed.value.menuVote).toBe("menu-2");
    expect(parsed.value.menuDishes).toEqual([...THANKFUL_MENUS[1].dishes]);
    expect(parsed.value.santa).toBe(true);
    expect(parsed.value.email).toBe("ada@example.com");
  });

  it("rejects a missing menu and a party under 1", () => {
    expect(parseThankfulRsvp({ ...body, menuVote: "" }).ok).toBe(false);
    expect(parseThankfulRsvp({ ...body, partySize: 0 }).ok).toBe(false);
    expect(parseThankfulRsvp({ ...body, santa: "maybe" }).ok).toBe(false);
  });
});

describe("thankful public meta", () => {
  it("does not publish a vercel.app or cadi address", () => {
    const plan = metaPlan("/thankful");
    expect(plan.kind).toBe("public");
    if (plan.kind !== "public") return;
    const visible = `${plan.title} ${plan.description} ${plan.canonical} ${plan.image}`;
    expect(plan.canonical).toBe("https://iconicimagestx.com/thankful");
    expect(visible).not.toContain("vercel.app");
    expect(visible.toLowerCase()).not.toContain("cadi@");
    expect(plan.title).toContain("Thankful for You Always");
  });
});
