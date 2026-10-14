import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { SATURDAY_DELIVERY_NOTE } from "@shared/bookingHours";
import { BookingSlotPicker, type BookingSlotChoice } from "./BookingSlotPicker";

const saturday: BookingSlotChoice = {
  start: "2026-10-17T14:00:00.000Z",
  end: "2026-10-17T15:00:00.000Z",
  date: "2026-10-17",
  time: "9:00 AM",
  label: "Sat, Oct 17 · 9:00 AM",
  photographerId: "mike-luna",
  photographerName: "Mike Luna",
};

const tuesday: BookingSlotChoice = {
  start: "2026-10-13T14:00:00.000Z",
  end: "2026-10-13T15:00:00.000Z",
  date: "2026-10-13",
  time: "9:00 AM",
  label: "Tue, Oct 13 · 9:00 AM",
  photographerId: "mike-luna",
  photographerName: "Mike Luna",
};

function render(selectedStart: string) {
  return renderToString(
    <BookingSlotPicker
      slots={[tuesday, saturday]}
      selectedStart={selectedStart}
      onSelect={() => {}}
      loading={false}
      showPhotographer={false}
      emptyMessage="No open times."
    />,
  );
}

describe("Saturday delivery note", () => {
  it("shows the note only after a Saturday slot is picked", () => {
    expect(render(saturday.start)).toContain(SATURDAY_DELIVERY_NOTE);
    expect(render(saturday.start)).toContain("saturday-delivery-note");
    expect(render(tuesday.start)).not.toContain(SATURDAY_DELIVERY_NOTE);
    expect(render("")).not.toContain(SATURDAY_DELIVERY_NOTE);
  });
});
