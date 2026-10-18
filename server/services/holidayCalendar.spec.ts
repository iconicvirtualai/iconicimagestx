import { describe, expect, it } from "vitest";
import { planHolidayCalendarEvent } from "../../shared/holidayCalendar";
import { HOLIDAY_RSVP_LEAD } from "../../shared/holidayCheckout";
import { createHolidayCalendarEvent, deleteHolidayCalendarEvent } from "./holidayCalendar";

describe("holiday calendar insert", () => {
  it("writes the photos calendar with no attendees and does not email the guest", async () => {
    const plan = planHolidayCalendarEvent({
      id: "rsvp-1",
      leadSource: HOLIDAY_RSVP_LEAD,
      clientName: "Ada Client",
      email: "ada@example.com",
      phone: "281-555-0100",
      orderNumber: "#181",
      status: "new",
      scheduledDate: "2026-11-07",
      requestedTimeLabel: "11:00 AM",
      vibeNote: "Headcount: 4\nPhotos with Santa: Yes, please\nMenu vote: Turkey\nNotes: None",
    }, "https://iconicimagestx.vercel.app/admin/order-request/rsvp-1");
    const seen: Array<{ calendarId: string; sendUpdates: string; requestBody: Record<string, unknown> }> = [];
    const created = await createHolidayCalendarEvent(plan!, {
      insert: async (input) => {
        seen.push(input);
        return { id: "evt-1", htmlLink: "https://calendar.google.com/event?eid=evt-1" };
      },
    });
    expect(created).toEqual({
      calendarId: "photos@iconicimagestx.com",
      eventId: "evt-1",
      htmlLink: "https://calendar.google.com/event?eid=evt-1",
    });
    expect(seen[0].sendUpdates).toBe("none");
    expect(seen[0].requestBody).not.toHaveProperty("attendees");
    expect(seen[0].requestBody.summary).toBe("Thankful RSVP — Ada Client (4)");
    expect(String(seen[0].requestBody.description)).toContain("Email: ada@example.com");
    expect(JSON.stringify(seen[0].requestBody)).not.toContain("\"attendees\"");
  });

  it("deletes with sendUpdates none", async () => {
    const seen: Array<{ calendarId: string; eventId: string; sendUpdates: string }> = [];
    await deleteHolidayCalendarEvent({
      calendarId: "photos@iconicimagestx.com",
      eventId: "evt-1",
      remove: async (input) => {
        seen.push(input);
      },
    });
    expect(seen).toEqual([{ calendarId: "photos@iconicimagestx.com", eventId: "evt-1", sendUpdates: "none" }]);
  });
});
