import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HolidayRsvpTable } from "./HolidayRsvpTable";
import { holidayRsvpBoard } from "@shared/holidayCalendar";
import { HOLIDAY_RSVP_LEAD } from "@shared/holidayCheckout";

describe("holiday RSVP table", () => {
  it("shows name, time, headcount, menu vote, status, and the total", () => {
    const board = holidayRsvpBoard([
      {
        id: "rsvp-1",
        leadSource: HOLIDAY_RSVP_LEAD,
        clientName: "Ada Client",
        orderNumber: "#181",
        status: "new",
        scheduledDate: "2026-11-07",
        requestedTimeLabel: "11:15 AM",
        vibeNote: "Headcount: 4\nMenu vote: Herb turkey",
      },
    ]);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <HolidayRsvpTable rows={board.rows} totalHeadcount={board.totalHeadcount} />
      </MemoryRouter>,
    );
    expect(html).toContain("Ada Client");
    expect(html).toContain("11:15 AM");
    expect(html).toContain(">4<");
    expect(html).toContain("Herb turkey");
    expect(html).toContain("new");
    expect(html).toContain("#181");
    expect(html).toContain('href="/admin/order-request/rsvp-1"');
    expect(html).toContain('data-total-headcount="4"');
    expect(html).toContain("Total headcount");
    expect(html).toContain('data-calendar-status="none"');
    expect(html).toContain("none");
  });

  it("shows the add button and the created, skipped, failed, and moved counts", () => {
    const board = holidayRsvpBoard([
      {
        id: "rsvp-1",
        leadSource: HOLIDAY_RSVP_LEAD,
        clientName: "Ada Client",
        status: "new",
        scheduledDate: "2026-11-07",
        requestedTimeLabel: "11:00 AM",
        calendarEventId: "evt-1",
        calendarHold: "held",
        vibeNote: "Headcount: 2\nMenu vote: Ham",
      },
    ]);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <HolidayRsvpTable
          rows={board.rows}
          totalHeadcount={board.totalHeadcount}
          onAddMissing={() => undefined}
          report={{
            created: 1,
            skipped: { test: 1, cancelled: 2, alreadyScheduled: 3, notASlot: 4 },
            failed: [{ id: "bad", name: "Bea Client", orderNumber: "#151", error: "calendar down" }],
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
          }}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Add missing to calendar");
    expect(html).toContain('data-calendar-status="on calendar"');
    expect(html).toContain('data-created="1"');
    expect(html).toContain("1 test, 2 cancelled, 3 already on calendar, 4 not a slot");
    expect(html).toContain('data-failed="1"');
    expect(html).toContain("Bea Client (#151): calendar down");
    expect(html).toContain('data-moved="1"');
    expect(html).toContain("Cara Client (#150): 2026-11-14 11:00 AM → 2026-11-07 11:00 AM");
    expect(html).toContain("Orders already on the calendar are left alone.");
  });
});