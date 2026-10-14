import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOOKING_PHOTOGRAPHER_STAFF_UIDS,
  listingPhotographerAssignment,
  missingBookingPhotographerStaffUids,
  resolveBookingPhotographerStaff,
} from "./bookingPhotographerStaff";

describe("booking photographer staff uids", () => {
  it("matches a staff doc by calendar email and never stores the public id", () => {
    const resolved = resolveBookingPhotographerStaff({
      publicId: "steven-banda",
      calendarId: "steven@iconicimagestx.com",
      name: "Steven Banda",
      staff: [
        { id: "steven-banda", email: "someone-else@example.com", name: "Wrong" },
        { id: "staff-uid-steven", email: "Steven@iconicimagestx.com", name: "Steven Banda" },
      ],
    });
    const patch = listingPhotographerAssignment(resolved);
    expect(patch?.photographerUid).toBe("staff-uid-steven");
    expect(patch?.photographerIds).toEqual(["staff-uid-steven"]);
    expect(patch?.photographerNames).toEqual(["Steven Banda"]);
    expect(patch?.bookingPhotographerId).toBe("steven-banda");
    expect(JSON.stringify(patch)).not.toContain("@");
    expect(patch?.photographerIds).not.toContain("steven-banda");
  });

  it("matches googleCalendarId and ignores an empty config uid", () => {
    expect(BOOKING_PHOTOGRAPHER_STAFF_UIDS["mike-luna"]).toBe("");
    const resolved = resolveBookingPhotographerStaff({
      publicId: "mike-luna",
      calendarId: "mike@iconicimagestx.com",
      name: "Mike Luna",
      staff: [{ id: "staff-uid-mike", googleCalendarId: "mike@iconicimagestx.com" }],
    });
    expect(listingPhotographerAssignment(resolved)?.photographerIds).toEqual(["staff-uid-mike"]);
    expect(missingBookingPhotographerStaffUids()).toEqual([
      "mike-luna",
      "armando-martinez",
      "daniel-adaclog",
      "steven-banda",
      "pedro-hernandez",
      "david-gonzalez",
      "cadi-torres",
    ]);
  });

  it("does not invent a uid when no staff doc matches", () => {
    const resolved = resolveBookingPhotographerStaff({
      publicId: "pedro-hernandez",
      calendarId: "phernandez1833@gmail.com",
      name: "Pedro Hernandez",
      staff: [],
    });
    expect(resolved.uid).toBeNull();
    expect(listingPhotographerAssignment(resolved)).toBeNull();
  });

  it("assigns from accept and from the project link, and the portal still matches a uid", () => {
    const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
    const listings = readFileSync(new URL("../server/routes/listings.ts", import.meta.url), "utf8");
    const request = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
    const orders = readFileSync(new URL("../client/pages/AdminOrders.tsx", import.meta.url), "utf8");
    expect(bookings).toContain("assignBookingPhotographerToListing");
    expect(bookings).toContain('router.post("/:id/assign-photographer"');
    expect(request).toContain("assignBookingPhotographer");
    expect(orders).toContain("assignBookingPhotographer");
    expect(listings).toContain('where("photographerIds", "array-contains", uid)');
    expect(listings).not.toContain("mike-luna");
  });
});
