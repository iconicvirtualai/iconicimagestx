/**
 * @vitest-environment happy-dom
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BookingSlotPicker, type BookingSlotChoice } from "./BookingSlotPicker";
import { SuggestedAppointmentPills, suggestedFromAvailability } from "./SuggestedAppointments";

const tuesday: BookingSlotChoice = {
  start: "2026-10-13T16:00:00.000Z",
  end: "2026-10-13T17:00:00.000Z",
  date: "2026-10-13",
  time: "11:00 AM",
  label: "Tue, Oct 13 · 11:00 AM",
  photographerId: "mike-luna",
  photographerName: "Mike Luna",
};

const later: BookingSlotChoice = {
  start: "2026-10-14T16:00:00.000Z",
  end: "2026-10-14T17:00:00.000Z",
  date: "2026-10-14",
  time: "11:00 AM",
  label: "Wed, Oct 14 · 11:00 AM",
  photographerId: "mike-luna",
  photographerName: "Mike Luna",
};

describe("suggested time pills", () => {
  it("renders up to the supplied times in Central Time and hides an empty row", () => {
    const html = renderToString(createElement(SuggestedAppointmentPills, {
      suggestions: [tuesday, later],
      selectedStart: tuesday.start,
      onSelect: () => {},
      showPhotographer: false,
    }));
    expect(html).toContain("suggested-appointments");
    expect(html).toContain("Suggested times");
    expect(html).toContain("Tue, Oct 13 2026 - 11:00am CT");
    expect(html).toContain("Wed, Oct 14 2026 - 11:00am CT");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("Mike Luna");
    expect(renderToString(createElement(SuggestedAppointmentPills, {
      suggestions: [],
      selectedStart: "",
      onSelect: () => {},
      showPhotographer: true,
    }))).toBe("");
  });

  it("keeps only suggestions that the open-time list already contains", () => {
    const extra: BookingSlotChoice = { ...later, start: "2026-10-18T16:00:00.000Z", date: "2026-10-18" };
    expect(suggestedFromAvailability({
      live: true,
      slots: [tuesday],
      suggestions: [tuesday, extra],
    }).map((slot) => slot.start)).toEqual([tuesday.start]);
    expect(suggestedFromAvailability({ live: false, slots: [tuesday], suggestions: [tuesday] })).toEqual([]);
  });

  it("selects a suggested time through the same slot picker", () => {
    const onSelect = vi.fn();
    const html = renderToString(createElement(BookingSlotPicker, {
      slots: [tuesday, later],
      suggestions: [tuesday],
      selectedStart: "",
      onSelect,
      loading: false,
      showPhotographer: true,
      emptyMessage: "No open times.",
    }));
    expect(html).toContain("suggested-appointments");
    expect(html.indexOf("Suggested times")).toBeLessThan(html.indexOf("Open times (CST)"));
    expect(html).toContain("Mike Luna");
    expect(html).toContain("Open times (CST)");
  });
});
