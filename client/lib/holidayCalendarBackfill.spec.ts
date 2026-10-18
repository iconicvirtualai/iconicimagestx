import { describe, expect, it, vi } from "vitest";
import { requestHolidayCalendarBackfill } from "./holidayCalendarBackfill";

describe("holiday calendar backfill request", () => {
  it("posts the signed-in token and returns the report", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      created: 2,
      skipped: { test: 1, cancelled: 0, alreadyScheduled: 3, notASlot: 0 },
      failed: [],
      moved: [{
        id: "legacy",
        orderNumber: "#150",
        name: "Cara Client",
        fromDate: "2026-11-14",
        fromTime: "11:00 AM",
        toDate: "2026-11-07",
        toTime: "11:00 AM",
        eventId: "evt-legacy",
        error: null,
      }],
    }), { status: 200 }));

    const report = await requestHolidayCalendarBackfill("admin-id-token", fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledWith("/api/bookings/holiday-calendar-backfill", {
      method: "POST",
      headers: { Authorization: "Bearer admin-id-token" },
    });
    expect(report.created).toBe(2);
    expect(report.skipped.alreadyScheduled).toBe(3);
    expect(report.moved[0].name).toBe("Cara Client");
  });

  it("surfaces the server error and does not invent a count", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 }));
    await expect(requestHolidayCalendarBackfill("coord-token", fetchImpl as unknown as typeof fetch))
      .rejects.toThrow("Admin access required.");
  });
});
