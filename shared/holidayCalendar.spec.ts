import { describe, expect, it } from "vitest";
import { HOLIDAY_RSVP_LEAD, HOLIDAY_SEASON_LEAD } from "./holidayCheckout";
import {
  HOLIDAY_OFFICE_CALENDAR_ID,
  holidayCalendarInsertBody,
  holidayRsvpBoard,
  planHolidayCalendarEvent,
  runHolidayBackfill,
} from "./holidayCalendar";

const ADMIN = "https://iconicimagestx.vercel.app/admin/order-request/rsvp-1";

const thankful = {
  id: "rsvp-1",
  leadSource: HOLIDAY_RSVP_LEAD,
  clientName: "Ada Client",
  email: "ada@example.com",
  phone: "281-555-0100",
  orderNumber: "#181",
  status: "new",
  scheduledDate: "2026-11-07",
  requestedTimeLabel: "11:15 AM",
  selectedService: "Client Holiday Event RSVP",
  vibeNote: [
    "Headcount: 4",
    "Photos with Santa: Yes, please",
    "Menu vote: Herb turkey",
    "Notes: High chair",
  ].join("\n"),
};

describe("holiday calendar plan", () => {
  it("plans a Thankful RSVP on Nov 7 for 15 minutes with no guest invite", () => {
    const plan = planHolidayCalendarEvent(thankful, ADMIN);
    expect(plan).toMatchObject({
      date: "2026-11-07",
      time: "11:15 AM",
      start: "2026-11-07T11:15:00",
      end: "2026-11-07T11:30:00",
      summary: "Thankful RSVP — Ada Client (4)",
      movedFrom: null,
    });
    expect(plan?.description).toContain("Email: ada@example.com");
    expect(plan?.description).toContain("Phone: 281-555-0100");
    expect(plan?.description).toContain("Headcount: 4");
    expect(plan?.description).toContain("Kids/Santa: Yes, please");
    expect(plan?.description).toContain("Menu vote: Herb turkey");
    expect(plan?.description).toContain("Notes: High chair");
    expect(plan?.description).toContain("Order: #181");
    expect(plan?.description).toContain(ADMIN);
    const body = holidayCalendarInsertBody(plan!);
    expect(body).not.toHaveProperty("attendees");
    expect(body.description).toContain("ada@example.com");
    expect(HOLIDAY_OFFICE_CALENDAR_ID).toBe("photos@iconicimagestx.com");
  });

  it("plans a 'Tis shoot with the package in the title", () => {
    const plan = planHolidayCalendarEvent({
      id: "tis-1",
      leadSource: HOLIDAY_SEASON_LEAD,
      clientName: "Bea Client",
      email: "bea@example.com",
      phone: "281-555-0101",
      orderNumber: "#182",
      status: "new",
      scheduledDate: "2026-12-04",
      requestedTimeLabel: "10:00 AM",
      selectedService: "Tis the Season Package A Morning",
      vibeNote: "Families: 3\nNotes: Logo on the table",
    }, "https://iconicimagestx.vercel.app/admin/order-request/tis-1");
    expect(plan?.summary).toBe("'Tis shoot — Bea Client — Tis the Season Package A Morning");
    expect(plan?.start).toBe("2026-12-04T10:00:00");
    expect(plan?.end).toBe("2026-12-04T10:15:00");
    expect(plan?.description).toContain("Headcount: 3");
  });

  it("skips test, cancelled, and orders that already have an event", () => {
    expect(planHolidayCalendarEvent({ ...thankful, email: "ops+deliveryqa@iconicimagestx.com" }, ADMIN)).toBeNull();
    expect(planHolidayCalendarEvent({ ...thankful, clientName: "TEST ORDER Quinn" }, ADMIN)).toBeNull();
    expect(planHolidayCalendarEvent({ ...thankful, status: "cancelled" }, ADMIN)).toBeNull();
    expect(planHolidayCalendarEvent({ ...thankful, calendarEventId: "evt-existing" }, ADMIN)).toBeNull();
    expect(planHolidayCalendarEvent({ ...thankful, leadSource: "Thankful social saves" }, ADMIN)).toBeNull();
  });

  it("moves the real Nov 14 11:00 AM RSVP onto Nov 7 and leaves other times", () => {
    const moved = planHolidayCalendarEvent({
      ...thankful,
      scheduledDate: "2026-11-14",
      requestedTimeLabel: "11:00 AM",
    }, ADMIN);
    expect(moved).toMatchObject({
      date: "2026-11-07",
      time: "11:00 AM",
      start: "2026-11-07T11:00:00",
      end: "2026-11-07T11:15:00",
      movedFrom: "2026-11-14",
    });
    expect(planHolidayCalendarEvent({
      ...thankful,
      scheduledDate: "2026-11-14",
      requestedTimeLabel: "11:30 AM",
    }, ADMIN)).toBeNull();
    expect(planHolidayCalendarEvent({
      ...thankful,
      email: "ops+deliveryqa@iconicimagestx.com",
      scheduledDate: "2026-11-14",
      requestedTimeLabel: "11:00 AM",
    }, ADMIN)).toBeNull();
  });
});

describe("holiday calendar backfill", () => {
  it("creates missing events once, moves the Nov 14 RSVP, and skips test and cancelled", async () => {
    const orders = [
      { ...thankful, id: "ready" },
      {
        ...thankful,
        id: "legacy",
        clientName: "Cara Client",
        orderNumber: "#160",
        scheduledDate: "2026-11-14",
        requestedTimeLabel: "11:00 AM",
        email: "cara@example.com",
      },
      { ...thankful, id: "held", calendarEventId: "evt-held" },
      { ...thankful, id: "test", email: "ops+deliveryqa@iconicimagestx.com" },
      { ...thankful, id: "cancelled", status: "cancelled" },
      { ...thankful, id: "bad-time", scheduledDate: "2026-11-14", requestedTimeLabel: "11:30 AM" },
    ];
    const created: string[] = [];
    const first = await runHolidayBackfill({
      orders,
      adminUrl: (id) => `https://iconicimagestx.vercel.app/admin/order-request/${id}`,
      create: async (plan) => {
        created.push(plan.orderId);
        return { calendarId: HOLIDAY_OFFICE_CALENDAR_ID, eventId: `evt-${plan.orderId}`, htmlLink: "https://calendar.google.com/event" };
      },
    });
    expect(first.report.created).toBe(2);
    expect(first.report.skipped).toEqual({ test: 1, cancelled: 1, alreadyScheduled: 1, notASlot: 1 });
    expect(first.report.failed).toEqual([]);
    expect(first.report.moved).toEqual([
      expect.objectContaining({
        id: "legacy",
        name: "Cara Client",
        orderNumber: "#160",
        fromDate: "2026-11-14",
        fromTime: "11:00 AM",
        toDate: "2026-11-07",
        toTime: "11:00 AM",
        eventId: "evt-legacy",
        error: null,
      }),
    ]);
    expect(created).toEqual(["ready", "legacy"]);
    const legacyPatch = first.patches.find((item) => item.id === "legacy");
    expect(legacyPatch?.patch.scheduledDate).toBe("2026-11-07");
    expect(legacyPatch?.patch.calendarEventId).toBe("evt-legacy");
    expect(JSON.stringify(first.patches)).not.toContain("attendees");

    const stored = orders.map((order) => {
      const patch = first.patches.find((item) => item.id === order.id);
      return patch ? { ...order, ...patch.patch } : order;
    });
    const second = await runHolidayBackfill({
      orders: stored,
      adminUrl: (id) => `https://iconicimagestx.vercel.app/admin/order-request/${id}`,
      create: async () => {
        throw new Error("should not create again");
      },
    });
    expect(second.report.created).toBe(0);
    expect(second.report.skipped.alreadyScheduled).toBe(3);
    expect(second.patches).toEqual([]);
  });

  it("flags a calendar failure and does not move the date until the event exists", async () => {
    const { report, patches } = await runHolidayBackfill({
      orders: [{
        ...thankful,
        id: "legacy",
        scheduledDate: "2026-11-14",
        requestedTimeLabel: "11:00 AM",
      }],
      adminUrl: () => ADMIN,
      create: async () => {
        throw new Error("calendar down");
      },
    });
    expect(report.created).toBe(0);
    expect(report.failed[0].error).toBe("calendar down");
    expect(report.moved[0]).toMatchObject({ id: "legacy", eventId: null, error: "calendar down" });
    expect(patches[0].patch.officeFlag).toBe("calendar_hold_failed");
    expect(patches[0].patch.scheduledDate).toBeUndefined();
  });
});

describe("holiday RSVP board", () => {
  it("lists name, time, headcount, menu, and status, and totals only guests who are coming", () => {
    const board = holidayRsvpBoard([
      { ...thankful, id: "a" },
      {
        ...thankful,
        id: "b",
        clientName: "Bea Client",
        requestedTimeLabel: "1:00 PM",
        vibeNote: "Headcount: 2\nMenu vote: Ham",
        status: "cancelled",
      },
      {
        ...thankful,
        id: "c",
        clientName: "TEST Quinn",
        email: "ops+deliveryqa@iconicimagestx.com",
        vibeNote: "Headcount: 9\nMenu vote: Test",
      },
      {
        id: "other",
        leadSource: HOLIDAY_SEASON_LEAD,
        clientName: "Not an RSVP",
        vibeNote: "Families: 8",
      },
    ]);
    expect(board.rows.map((row) => row.name)).toEqual(["Ada Client", "TEST Quinn", "Bea Client"]);
    expect(board.rows[0]).toMatchObject({ time: "11:15 AM", headcount: "4", menuVote: "Herb turkey", status: "new" });
    expect(board.rows[2]).toMatchObject({ time: "1:00 PM", headcount: "2", menuVote: "Ham", status: "cancelled", countsTowardTotal: false });
    expect(board.totalHeadcount).toBe(4);
  });
});
