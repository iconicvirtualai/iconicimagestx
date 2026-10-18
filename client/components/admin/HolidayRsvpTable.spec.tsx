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
  });
});