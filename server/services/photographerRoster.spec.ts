import { describe, expect, it } from "vitest";
import { PHOTOGRAPHER_CALENDAR_ROSTER, photographerCalendarRoster } from "./photographerRoster";

describe("photographer calendar roster", () => {
  it("keeps the shooter names and calendar ids the schedule board already uses", () => {
    expect(photographerCalendarRoster()).toEqual([
      { id: "mike@iconicimagestx.com", name: "Mike Luna" },
      { id: "armando@iconicimagestx.com", name: "Armando" },
      { id: "pedro@iconicimagestx.com", name: "Pedro" },
      { id: "steven@iconicimagestx.com", name: "Steven" },
      { id: "cadi@iconicimagestx.com", name: "Cadi" },
      { id: "daniel@iconicimagestx.com", name: "Daniel" },
    ]);
  });

  it("returns a copy so callers cannot edit the server list", () => {
    const roster = photographerCalendarRoster();
    roster[0].name = "Changed";
    expect(PHOTOGRAPHER_CALENDAR_ROSTER[0].name).toBe("Mike Luna");
  });
});
