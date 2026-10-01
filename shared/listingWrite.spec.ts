import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  choosePortalClient,
  listingAppointmentDate,
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
