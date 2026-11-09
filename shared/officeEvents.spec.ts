import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contentCalendar } from "./contentPlan";
import {
  THANKFUL_EVENT_ID,
  addOfficeEventTask,
  buildOfficeEvent,
  mergeOfficeEvents,
  sampleOfficeEvents,
  splitOfficeEvents,
  thankfulOfficeEvent,
} from "./officeEvents";
import { withToggled } from "./taskBoard";

const TODAY = "2026-11-09";

describe("office events", () => {
  it("keeps Thankful first and does not mark it as sample", () => {
    const events = mergeOfficeEvents(sampleOfficeEvents(TODAY), TODAY);
    expect(events[0].id).toBe(THANKFUL_EVENT_ID);
    expect(events[0].sample).toBe(false);
    expect(events[0].type).toBe("holiday");
    expect(events[0].date).toBe("2026-11-07");
    expect(events[0].status).toBe("done");
    expect(events.filter((event) => event.sample).length).toBe(3);
    const { upcoming, past } = splitOfficeEvents(events, TODAY);
    expect(past[0].id).toBe(THANKFUL_EVENT_ID);
    expect(upcoming.map((event) => event.type)).toEqual(["headshot", "spring"]);
  });

  it("adds one planning task and checks it off without a second row", () => {
    const event = thankfulOfficeEvent(TODAY);
    const first = addOfficeEventTask([], event, "Confirm the menu cards", "2026-11-09T15:00:00.000Z");
    expect(first.ok).toBe(true);
    if (first.ok === false) return;
    const again = addOfficeEventTask(first.tasks, event, "Confirm the menu cards", "2026-11-09T16:00:00.000Z");
    expect(again.ok).toBe(true);
    if (again.ok === false) return;
    expect(again.tasks).toHaveLength(1);
    expect(again.id).toBe(first.id);
    const done = withToggled(again.tasks, again.id, "2026-11-09T17:00:00.000Z");
    expect(done).toHaveLength(1);
    expect(done[0].status).toBe("done");
    expect(done[0].eventId).toBe(THANKFUL_EVENT_ID);
    expect(done[0].primaryHref).toBe(`/admin/events/${THANKFUL_EVENT_ID}`);
  });

  it("puts the event date on the content calendar", () => {
    const event = buildOfficeEvent({
      id: "spring-1",
      name: "Spring brunch",
      type: "spring",
      date: "2026-11-20",
      time: "6:00 PM",
      location: "Studio 105",
      status: "planning",
      notes: "",
      sample: true,
    });
    expect(event.ok).toBe(true);
    if (event.ok === false) return;
    const marks = contentCalendar([], [], "2026-11", [event.event]);
    expect(marks).toEqual([expect.objectContaining({
      kind: "event",
      date: "2026-11-20",
      title: "Spring brunch",
      href: "/admin/events/spring-1",
      sample: true,
    })]);
  });

  it("leaves the public Thankful confirm switch alone", () => {
    const confirm = readFileSync("shared/thankfulRsvpConfirm.ts", "utf8");
    const page = readFileSync("client/pages/AdminEvents.tsx", "utf8");
    const app = readFileSync("client/App.tsx", "utf8");
    expect(confirm).toContain('THANKFUL_RSVP_CONFIRM_LIVE');
    expect(confirm).toContain('=== "true"');
    expect(page).not.toMatch(/sendMail|nodemailer|twilio|THANKFUL_RSVP_CONFIRM_LIVE/);
    expect(app).toContain('path="/admin/holiday-rsvps"');
    expect(app).toContain("HolidayRsvpsRedirect");
    expect(readFileSync("public/thankful.html", "utf8").length).toBeGreaterThan(100);
  });
});
