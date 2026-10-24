import { describe, expect, it } from "vitest";
import {
  apprenticeshipHoldExpired,
  apprenticeshipHoldExpiresAt,
  APPRENTICESHIP_BALANCE_LINE,
  APPRENTICESHIP_BOOKING_FEE,
  APPRENTICESHIP_BOOKING_FEE_LINE,
  APPRENTICESHIP_CALENDAR_FALLBACK,
  APPRENTICESHIP_CALENDAR_ID,
  apprenticeshipCalendarSetupNote,
  apprenticeshipDurationMinutes,
  apprenticeshipHoursFromEnv,
  apprenticeshipPackageViews,
  openApprenticeshipSlots,
  parseApprenticeshipOrder,
  quoteApprenticeship,
  zonedTimeToUtc,
} from "./apprenticeship";
import { APPRENTICESHIP_OVERAGE_LABEL, APPRENTICESHIP_RULES, publicPackageDeepLinkSelection } from "./bookingCatalog";
import { BOOKING_PROCESSING_LABEL } from "./invoiceProcessing";

describe("apprenticeship catalog copy", () => {
  it("uses the catalog prices, appointment caps, rules, and overage", () => {
    const [twentyFive, fifty] = apprenticeshipPackageViews();
    expect(twentyFive).toMatchObject({
      id: "apprentice-25",
      price: 75,
      appointmentLimit: "20 Minute Appointment ONLY",
      durationMinutes: 20,
      overage: APPRENTICESHIP_OVERAGE_LABEL,
    });
    expect(fifty).toMatchObject({
      id: "apprentice-50",
      price: 125,
      appointmentLimit: "1 Hour Appointment ONLY",
      durationMinutes: 60,
    });
    expect(twentyFive.rules).toEqual([...APPRENTICESHIP_RULES]);
    expect(fifty.rules.join(" ")).toMatch(/do not make additional trips/i);
    expect(apprenticeshipDurationMinutes("20 Minute Appointment ONLY", "apprentice-25")).toBe(20);
    expect(apprenticeshipDurationMinutes("1 Hour Appointment ONLY", "apprentice-50")).toBe(60);
  });
});

describe("apprenticeship working hours", () => {
  it("defaults to Monday through Saturday, 9am to 6pm Central", () => {
    expect(apprenticeshipHoursFromEnv({})).toMatchObject({
      timeZone: "America/Chicago",
      startMinutes: 9 * 60,
      endMinutes: 18 * 60,
      days: [1, 2, 3, 4, 5, 6],
      calendarId: APPRENTICESHIP_CALENDAR_ID,
    });
  });

  it("reads a custom window and calendar", () => {
    expect(apprenticeshipHoursFromEnv({
      APPRENTICESHIP_DAY_START: "10:30",
      APPRENTICESHIP_DAY_END: "14:00",
      APPRENTICESHIP_WORK_DAYS: "2,4,6",
      APPRENTICESHIP_CALENDAR_ID: "studio@example.com",
      APPRENTICESHIP_HORIZON_DAYS: "3",
    })).toMatchObject({
      startMinutes: 10 * 60 + 30,
      endMinutes: 14 * 60,
      days: [2, 4, 6],
      calendarId: "studio@example.com",
      horizonDays: 3,
    });
  });
});

describe("apprenticeship open slots", () => {
  const hours = apprenticeshipHoursFromEnv({});
  const now = new Date("2026-10-13T15:00:00.000Z");

  it("builds 20-minute and 1-hour slots inside the working window", () => {
    const short = openApprenticeshipSlots({ now, busy: [], durationMinutes: 20, hours });
    const long = openApprenticeshipSlots({ now, busy: [], durationMinutes: 60, hours });
    const firstDay = short.filter((slot) => slot.date === "2026-10-14");
    expect(firstDay[0]).toMatchObject({ time: "9:00 AM" });
    expect(firstDay[firstDay.length - 1]).toMatchObject({ time: "5:40 PM" });
    expect(firstDay).toHaveLength(27);
    const hourDay = long.filter((slot) => slot.date === "2026-10-14");
    expect(hourDay.map((slot) => slot.time)).toEqual([
      "9:00 AM",
      "10:00 AM",
      "11:00 AM",
      "12:00 PM",
      "1:00 PM",
      "2:00 PM",
      "3:00 PM",
      "4:00 PM",
      "5:00 PM",
    ]);
    expect(short.some((slot) => slot.date === "2026-10-18")).toBe(false);
    expect(short.some((slot) => slot.date === "2026-10-17")).toBe(true);
  });

  it("drops slots that overlap a busy range", () => {
    const nine = zonedTimeToUtc(2026, 10, 14, 9, 0, "America/Chicago");
    const slots = openApprenticeshipSlots({
      now,
      busy: [{ start: nine.toISOString(), end: new Date(nine.getTime() + 60 * 60 * 1000).toISOString() }],
      durationMinutes: 20,
      hours,
    });
    const morning = slots.filter((slot) => slot.date === "2026-10-14").map((slot) => slot.time);
    expect(morning).not.toContain("9:00 AM");
    expect(morning).not.toContain("9:40 AM");
    expect(morning).toContain("10:00 AM");
  });
});

describe("apprenticeship quote", () => {
  it("charges the catalog price, the 2.8% line, and a $25 credit toward the package", () => {
    const twentyFive = quoteApprenticeship({ packageId: "apprentice-25", address: "100 Oak St, Spring, TX 77380" });
    const fifty = quoteApprenticeship({ packageId: "apprentice-50" });
    expect(twentyFive.ok).toBe(true);
    if (!twentyFive.ok || !fifty.ok) return;
    expect(twentyFive.quote.subtotal).toBe(75);
    expect(twentyFive.quote.processing).toBe(2.1);
    expect(twentyFive.quote.processingLabel).toBe(BOOKING_PROCESSING_LABEL);
    expect(twentyFive.quote.total).toBe(77.1);
    expect(twentyFive.quote.bookingFee).toBe(APPRENTICESHIP_BOOKING_FEE);
    expect(twentyFive.quote.bookingFeeLine).toBe(APPRENTICESHIP_BOOKING_FEE_LINE);
    expect(twentyFive.quote.balanceDue).toBe(52.1);
    expect(twentyFive.quote.balanceLine).toBe(APPRENTICESHIP_BALANCE_LINE);
    expect(fifty.quote.processing).toBe(3.5);
    expect(fifty.quote.total).toBe(128.5);
    expect(fifty.quote.balanceDue).toBe(103.5);
  });
});

describe("apprenticeship order parse", () => {
  it("accepts a package booking and swallows the honeypot", () => {
    const parsed = parseApprenticeshipOrder({
      packageId: "apprentice-25",
      name: "Ada Lovelace",
      email: "Ada@Example.com",
      phone: "281-555-0199",
      address: "100 Oak St, Spring, TX 77380",
      slotStart: "2026-10-14T14:00:00.000Z",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.email).toBe("ada@example.com");
    expect(parsed.value.firstName).toBe("Ada");
    expect(parsed.value.lastName).toBe("Lovelace");
    expect(parseApprenticeshipOrder({ website: "spam", packageId: "apprentice-25" })).toMatchObject({
      ok: false,
      honeypot: true,
    });
  });
});

describe("apprenticeship calendar setup note", () => {
  it("names the share and the domain-wide delegation option", () => {
    const note = apprenticeshipCalendarSetupNote({
      calendarId: APPRENTICESHIP_CALENDAR_ID,
      serviceAccountEmail: "firebase@project.iam.gserviceaccount.com",
      missingCredentials: false,
    });
    expect(note).toContain("steven@iconicimagestx.com");
    expect(note).toContain("firebase@project.iam.gserviceaccount.com");
    expect(note).toMatch(/share/i);
    expect(note).toMatch(/domain-wide delegation/i);
    expect(APPRENTICESHIP_CALENDAR_FALLBACK.toLowerCase()).not.toContain("not configured");
    expect(note.toLowerCase()).not.toContain("not configured");
  });
});

describe("book package deep link", () => {
  it("selects apprentice packages on /book", () => {
    expect(publicPackageDeepLinkSelection("apprentice-25")).toEqual({
      selectedService: "",
      selectedBasics: ["apprentice-25"],
      showBasics: true,
      hidden: false,
    });
    expect(publicPackageDeepLinkSelection("apprentice-50").selectedBasics).toEqual(["apprentice-50"]);
    expect(publicPackageDeepLinkSelection("listing-essentials")).toMatchObject({
      selectedService: "listing-essentials",
      showBasics: false,
    });
  });
});

describe("apprentice 60-minute hold", () => {
  const now = new Date("2026-10-24T15:00:00.000Z");
  const base = { source: "apprenticeship", status: "awaiting_deposit", depositPaid: 0 };

  it("expires at holdExpiresAt", () => {
    expect(apprenticeshipHoldExpiresAt(new Date("2026-10-24T14:00:00.000Z"))).toBe("2026-10-24T15:00:00.000Z");
    expect(apprenticeshipHoldExpired({ ...base, holdExpiresAt: "2026-10-24T15:00:00.000Z" }, now)).toBe(true);
    expect(apprenticeshipHoldExpired({ ...base, holdExpiresAt: "2026-10-24T15:00:01.000Z" }, now)).toBe(false);
  });

  it("ignores paid, confirmed, and non-apprentice orders", () => {
    const old = { holdExpiresAt: "2026-10-24T13:00:00.000Z" };
    expect(apprenticeshipHoldExpired({ ...base, ...old, depositPaid: 25 }, now)).toBe(false);
    expect(apprenticeshipHoldExpired({ ...base, ...old, status: "confirmed" }, now)).toBe(false);
    expect(apprenticeshipHoldExpired({ ...base, ...old, source: "senior-living" }, now)).toBe(false);
    expect(apprenticeshipHoldExpired({ ...base }, now)).toBe(false);
  });
});
