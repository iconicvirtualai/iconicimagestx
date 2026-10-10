import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPhotographerRoster, mergeCalendarRoster } from "./photographerRoster";

describe("photographer roster loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the roster for a signed-in staff token and drops blank rows", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        photographers: [
          { id: "mike@example.com", name: "Mike Luna" },
          { id: "", name: "Skip" },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPhotographerRoster("staff-token")).resolves.toEqual([
      { id: "mike@example.com", name: "Mike Luna" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/calendar/roster", {
      headers: { Authorization: "Bearer staff-token" },
    });
  });

  it("keeps the server calendar id when a staff record repeats that address", () => {
    expect(mergeCalendarRoster(
      [{ id: "armando@example.com", name: "Armando" }],
      [{
        id: "staff-uid",
        email: "armando@example.com",
        firstName: "Armando",
        lastName: "Reyes",
        role: "photographer",
      }],
    )).toEqual([{ id: "armando@example.com", name: "Armando" }]);
  });

  it("adds a staff calendar that is not on the server roster", () => {
    expect(mergeCalendarRoster(
      [{ id: "pedro@example.com", name: "Pedro" }],
      [{
        id: "staff-uid",
        email: "new.shooter@example.com",
        googleCalendarId: "new.shooter@example.com",
        name: "New Shooter",
        role: "photographer",
      }],
    )).toEqual([
      { id: "pedro@example.com", name: "Pedro" },
      { id: "new.shooter@example.com", name: "New Shooter" },
    ]);
  });
});
