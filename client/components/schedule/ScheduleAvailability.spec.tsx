import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ScheduleCalendarChip, ScheduleDayShoots, ScheduleDayStrip } from "./ScheduleAvailability";
import type { ShooterCue } from "@shared/scheduleBoard";

const shooters: ShooterCue[] = [
  { id: "mike", name: "Mike Luna", status: "open", shootCount: 0 },
  { id: "armando", name: "Armando", status: "twilight", shootCount: 1 },
  { id: "pedro", name: "Pedro", status: "booked", shootCount: 2 },
  { id: "steven", name: "Steven", status: "unavailable", shootCount: 0 },
];

describe("schedule availability surface", () => {
  it("shows the day summary and photographer availability labels", () => {
    const html = renderToString(
      <ScheduleDayStrip
        dayLabel="Thursday, October 8"
        summary="3 shoots · 1 twilight · 2 open"
        syncNote="Team calendars connected."
        shooters={shooters}
      />,
    );

    expect(html).toContain("Thursday, October 8");
    expect(html).toContain("3 shoots · 1 twilight · 2 open");
    expect(html).toContain("Team calendars connected.");
    expect(html).toContain("Mike Luna");
    expect(html).toContain("Open");
    expect(html).toContain("Armando");
    expect(html).toContain("Twilight");
    expect(html).toContain("Pedro");
    expect(html).toContain("Booked · 2");
    expect(html).toContain("Steven");
    expect(html).toContain("Unavailable");
  });

  it("labels a dusk shoot as Twilight in the day list and on the calendar chip", () => {
    const list = renderToString(
      <ScheduleDayShoots
        shoots={[{
          id: "shoot-1",
          time: "6:30 PM",
          clientName: "Jane Agent",
          address: "10 Oak St, Houston, TX",
          photographers: "Armando",
          twilight: true,
        }]}
        onSelect={() => undefined}
      />,
    );
    const chip = renderToString(
      <ScheduleCalendarChip
        time="6:30 PM"
        clientName="Jane Agent"
        photographer="Armando"
        twilight
        business={false}
      />,
    );

    expect(list).toContain("Jane Agent");
    expect(list).toContain("Twilight");
    expect(list).toContain("6:30 PM");
    expect(chip).toContain("Jane Agent");
    expect(chip).toContain("Twilight");
    expect(chip).toContain("Armando");
  });
});
