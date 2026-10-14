import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calendarDateKey } from "./clientHome";
import {
  choosePortalClient,
  listingAppointmentDate,
  orderScheduleTime,
  projectCarryFromOrder,
  scheduleDateInputValue,
  scheduleTimeInputValue,
  stableOrderRequestListingId,
  visibleToPortalClient,
} from "./listingWrite";

describe("listingAppointmentDate", () => {
  it("accepts a date-only string and a Firestore Timestamp", () => {
    const fromDay = listingAppointmentDate("2026-10-05");
    expect(fromDay).toBeInstanceOf(Date);
    expect(fromDay?.getHours()).toBe(12);

    const instant = new Date("2026-10-05T15:00:00Z");
    expect(listingAppointmentDate({ toDate: () => instant })?.toISOString()).toBe(instant.toISOString());
    expect(listingAppointmentDate({ seconds: Math.floor(instant.getTime() / 1000) })?.getTime())
      .toBe(instant.getTime() - (instant.getTime() % 1000));
  });

  it("does not turn a Timestamp or a long date into an Invalid Date", () => {
    const timestamp = { toDate: () => new Date("2026-10-05T15:00:00Z"), seconds: 1, nanoseconds: 0 };
    const concatenated = new Date(String(timestamp) + "T12:00:00");
    expect(Number.isNaN(concatenated.getTime())).toBe(true);

    const parsed = listingAppointmentDate(timestamp);
    expect(parsed).toBeInstanceOf(Date);
    expect(Number.isNaN(parsed?.getTime())).toBe(false);

    const longDate = "Monday, October 5, 2026";
    expect(Number.isNaN(new Date(longDate + "T12:00:00").getTime())).toBe(true);
    const fromLong = listingAppointmentDate(longDate);
    expect(fromLong == null || !Number.isNaN(fromLong.getTime())).toBe(true);
  });

  it("returns null when a pending request has no appointment", () => {
    expect(listingAppointmentDate(null)).toBeNull();
    expect(listingAppointmentDate("")).toBeNull();
    expect(listingAppointmentDate({})).toBeNull();
  });
});

describe("projectCarryFromOrder", () => {
  it("keeps a /book slot that was stored as scheduledDate, not appointmentDate", () => {
    const carry = projectCarryFromOrder({
      scheduledDate: "2026-10-20",
      scheduledTime: "11:00 AM",
      bookingPhotographerId: "steven-banda",
      assignedPhotographerName: "Steven Banda",
      vibeNote: "Gate code is on the lockbox.",
      orderNumber: "#012",
      lineItems: [{ name: "The Showcase", price: 549 }, { name: "Twilight", price: 75 }],
      lockboxCode: "1234",
      accessMethod: "Lockbox",
      packageName: "The Showcase",
      selectedAddOns: ["twilight"],
      lat: 29.76,
      lng: -95.36,
      calendarId: "photographer-calendar-id",
    });

    expect(calendarDateKey(carry.apptDate)).toBe("2026-10-20");
    expect(carry.appointmentDate).toBe("2026-10-20");
    expect(carry.scheduledDate).toBe("2026-10-20");
    expect(carry.apptTime).toBe("11:00 AM");
    expect(carry.status).toBe("scheduled");
    expect(carry.bookingPhotographerId).toBe("steven-banda");
    expect(carry.assignedPhotographerName).toBe("Steven Banda");
    expect(carry.notes).toBe("Gate code is on the lockbox.");
    expect(carry.orderNumber).toBe("#012");
    expect(carry.lineItems).toEqual([{ name: "The Showcase", price: 549 }, { name: "Twilight", price: 75 }]);
    expect(carry.services).toEqual(["The Showcase", "Twilight"]);
    expect(carry.accessInfo).toBe("Lockbox - 1234");
    expect(carry.packageName).toBe("The Showcase");
    expect(carry.selectedAddOns).toEqual(["twilight"]);
    expect(carry.lat).toBe(29.76);
    expect(carry.lng).toBe(-95.36);
    expect(JSON.stringify(carry)).not.toContain("photographer-calendar-id");
    expect(JSON.stringify(carry)).not.toMatch(/@/);
    expect(scheduleDateInputValue({ scheduledDate: "2026-10-20" })).toBe("2026-10-20");
    expect(scheduleTimeInputValue(orderScheduleTime({ scheduledTime: "11:00 AM" }))).toBe("11:00");
    expect(stableOrderRequestListingId("req-1")).toBe("bklist_req_req-1");
  });

  it("falls back to appointmentDate when that is the only day on the order", () => {
    const carry = projectCarryFromOrder({ appointmentDate: "2026-11-02", appointmentTime: "14:30" });
    expect(carry.appointmentDate).toBe("2026-11-02");
    expect(carry.apptTime).toBe("14:30");
    expect(scheduleTimeInputValue(carry.apptTime)).toBe("14:30");
  });
});

describe("project create reads the booking slot", () => {
  it("order request and bulk create both use projectCarryFromOrder", () => {
    const request = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
    const orders = readFileSync(new URL("../client/pages/AdminOrders.tsx", import.meta.url), "utf8");
    expect(request).toContain("projectCarryFromOrder");
    expect(request).toContain("scheduleDateInputValue");
    expect(request).not.toContain("listingAppointmentDate(order.appointmentDate)");
    expect(orders).toContain("projectCarryFromOrder");
    expect(orders).not.toContain("listingAppointmentDate(order.appointmentDate)");
  });
});

describe("choosePortalClient", () => {
  const portal = {
    id: "uid-marty",
    email: "marty@example.com",
    firebaseUid: "uid-marty",
    portalAccess: true,
  };
  const legacy = { id: "auto-marty", email: "Marty@example.com", portalAccess: false };

  it("attaches the portal uid when the admin picked the older client doc", () => {
    expect(choosePortalClient([legacy, portal], { clientId: "auto-marty" })?.id).toBe("uid-marty");
    expect(choosePortalClient([legacy, portal], { email: "marty@example.com" })?.id).toBe("uid-marty");
  });

  it("keeps a single existing client when there is no portal twin", () => {
    expect(choosePortalClient([legacy], { email: "marty@example.com" })?.id).toBe("auto-marty");
  });

  it("follows a typed email that no longer matches the selected client", () => {
    const other = { id: "uid-other", email: "other@example.com", firebaseUid: "uid-other", portalAccess: true };
    expect(choosePortalClient([legacy, portal, other], { clientId: "auto-marty", email: "other@example.com" })?.id)
      .toBe("uid-other");
  });
});

describe("visibleToPortalClient", () => {
  const marty = { ids: ["uid-marty", "auto-marty"], email: "marty@example.com" };

  it("shows an order linked by portal id or by email alone", () => {
    expect(visibleToPortalClient({ clientId: "uid-marty", email: "other@example.com" }, marty)).toBe(true);
    expect(visibleToPortalClient({ clientId: "auto-marty" }, marty)).toBe(true);
    expect(visibleToPortalClient({ email: "Marty@example.com" }, marty)).toBe(true);
    expect(visibleToPortalClient({ clientEmail: "marty@example.com" }, marty)).toBe(true);
    expect(visibleToPortalClient({ clientId: "someone-else", email: "other@example.com" }, marty)).toBe(false);
  });
});

describe("listings security rules", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const start = rules.indexOf("match /listings/{listingId}");
  const block = start === -1 ? "" : rules.slice(start, rules.indexOf("match /", start + 20));

  it("lets coordinators create listings and limits photographer reads to assigned jobs", () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("allow create: if isCoordinator();");
    expect(block).toContain("allow update: if isCoordinator() || isEditor();");
    expect(block).toContain("allow delete: if isAdmin();");
    expect(block).toContain("request.auth.uid in resource.data.photographerIds");
    expect(block).toContain("resource.data.clientId == request.auth.uid");
    expect(block).not.toContain("allow create: if true");
  });
});
