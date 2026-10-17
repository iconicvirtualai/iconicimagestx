import { describe, expect, it } from "vitest";
import { HOLIDAY_RSVP_LEAD, HOLIDAY_SEASON_LEAD, HOLIDAY_SOCIAL_SAVES_LEAD } from "./holidayCheckout";
import {
  HOLIDAY_SLOT_LIMIT,
  holidaySlotClaim,
  holidaySlotIsFull,
  holidayTakenFromOrders,
  thankfulSlotTimes,
} from "./holidaySlots";

const rsvp = (time: string, extra: Record<string, unknown> = {}) => ({
  leadSource: HOLIDAY_RSVP_LEAD,
  scheduledDate: "2026-11-14",
  scheduledTime: "Afternoon",
  requestedTimeLabel: time,
  email: "ada@example.com",
  clientName: "Ada Client",
  status: "new",
  ...extra,
});

describe("holiday slots", () => {
  it("keeps one real booking per 15-minute start", () => {
    expect(HOLIDAY_SLOT_LIMIT).toBe(1);
    const taken = holidayTakenFromOrders([
      rsvp("11:30 AM"),
      rsvp("1:15 PM", { email: "ops+deliveryqa@iconicimagestx.com", clientName: "TEST Quinn" }),
      rsvp("12:00 PM", { playtest: true }),
      rsvp("12:15 PM", { clientName: "TEST ORDER sample" }),
      rsvp("12:30 PM", { status: "declined" }),
      {
        leadSource: HOLIDAY_SOCIAL_SAVES_LEAD,
        scheduledDate: "2026-11-14",
        requestedTimeLabel: "1:00 PM",
        email: "buyer@example.com",
      },
    ]);
    expect(taken.thankful.taken).toEqual(["11:30 AM"]);
    expect(taken.season).toEqual({});
    expect(JSON.stringify(taken)).not.toContain("ada@example.com");
    expect(JSON.stringify(taken)).not.toContain("Ada");
    expect(JSON.stringify(taken)).not.toContain("Quinn");
  });

  it("reads an older RSVP time from the note and ignores the placeholder window", () => {
    const taken = holidayTakenFromOrders([
      {
        leadSource: HOLIDAY_RSVP_LEAD,
        scheduledDate: "2026-11-14",
        scheduledTime: "Morning",
        email: "sam@example.com",
        vibeNote: "Requested photo time: 11:00 AM",
      },
    ]);
    expect(taken.thankful.taken).toEqual(["11:00 AM"]);
  });

  it("marks a season start time taken and leaves the next day open", () => {
    const taken = holidayTakenFromOrders([
      {
        leadSource: HOLIDAY_SEASON_LEAD,
        scheduledDate: "2026-12-04",
        scheduledTime: "Morning",
        email: "sam@example.com",
        vibeNote: "Time: 10:00 AM\nParty start: 1:00 PM",
      },
      {
        leadSource: HOLIDAY_SEASON_LEAD,
        scheduledDate: "2026-11-27",
        requestedTimeLabel: "10:15 AM",
        email: "ops+deliveryqa@iconicimagestx.com",
      },
    ]);
    expect(taken.season).toEqual({ "2026-12-04": ["10:00 AM"] });
    expect(holidaySlotIsFull(
      [{ leadSource: HOLIDAY_SEASON_LEAD, scheduledDate: "2026-12-04", requestedTimeLabel: "10:00 AM", email: "sam@example.com" }],
      holidaySlotClaim(HOLIDAY_SEASON_LEAD, "2026-12-04", "10:00 AM")!,
    )).toBe(true);
    expect(holidaySlotClaim(HOLIDAY_SEASON_LEAD, "2026-12-06", "10:00 AM")).toBeNull();
  });

  it("fills a slot only after the limit", () => {
    const orders = [rsvp("2:45 PM"), rsvp("2:45 PM", { email: "bea@example.com" })];
    expect(holidayTakenFromOrders(orders, 2).thankful.taken).toEqual(["2:45 PM"]);
    expect(holidayTakenFromOrders(orders, 3).thankful.taken).toEqual([]);
    expect(thankfulSlotTimes()).toContain("11:00 AM");
    expect(thankfulSlotTimes()).toContain("2:45 PM");
    expect(thankfulSlotTimes()).not.toContain("10:45 AM");
  });
});
