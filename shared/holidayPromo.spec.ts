import { describe, expect, it } from "vitest";
import {
  HOLIDAY_BOOK_END,
  HOLIDAY_BOOK_START,
  HOLIDAY_PROMO_CODE,
  HOLIDAY_PROMO_NAME,
  holidayEarliestDate,
  holidayMinimumQuote,
  openHolidaySlots,
  parseHolidayBooking,
  quoteHolidayPackage,
} from "./holidayPromo";
import { PUBLIC_PROCESSING_NOTE } from "./publicRequests";

const contact = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "281-555-0100",
  preferredDate: "2026-12-01",
  preferredTime: "10:00",
  notes: "Two sets, please.",
  website: "",
};

describe("holiday package math", () => {
  it("keeps Single Shoots at $99 with processing on top", () => {
    const quote = holidayMinimumQuote("single");
    expect(quote.headline).toBe("$99");
    expect(quote.subtotal).toBe(99);
    expect(quote.processing).toBe(2.77);
    expect(quote.total).toBe(101.77);
    expect(quote.lines.map((line) => line.label)).toContain("Processing (2.8%)");
  });

  it("prices a 4-family Studio Party at $416, above the $400 headline", () => {
    const quote = holidayMinimumQuote("party");
    expect(quote.familySubtotal).toBe(356);
    expect(quote.rentalHours).toBe(1);
    expect(quote.rentalTotal).toBe(60);
    expect(quote.subtotal).toBe(416);
    expect(quote.subtotal).toBeGreaterThanOrEqual(400);
    expect(quote.headline).toBe("$400+");
    const extra = quoteHolidayPackage("party", 5);
    expect(extra?.familySubtotal).toBe(445);
    expect(extra?.rentalTotal).toBe(60);
    expect(extra?.subtotal).toBe(505);
  });

  it("prices a 6-family Studio Celebration at $694, above the $650 headline", () => {
    const quote = holidayMinimumQuote("celebration");
    expect(quote.familySubtotal).toBe(474);
    expect(quote.rentalHours).toBe(4);
    expect(quote.rentalRate).toBe(55);
    expect(quote.rentalTotal).toBe(220);
    expect(quote.subtotal).toBe(694);
    expect(quote.subtotal).toBeGreaterThanOrEqual(650);
    expect(quote.rate).toBe(79);
    expect(quote.headline).toBe("$650+");
  });
});

describe("holiday session slots", () => {
  const now = new Date("2026-10-16T15:00:00.000Z");

  it("offers a calendar of studio times and drops a busy hour", () => {
    const single = openHolidaySlots({ now, packageId: "single", today: "2026-11-01" });
    expect(single.some((slot) => slot.date === "2026-11-27" && slot.clock === "10:00" && slot.time === "10:00 AM")).toBe(true);
    expect(single.some((slot) => slot.date < "2026-11-27" || slot.date > "2026-12-14")).toBe(false);
    const blocked = openHolidaySlots({
      now,
      packageId: "single",
      today: "2026-11-01",
      busy: [{ start: single.find((slot) => slot.clock === "10:00")!.start, end: single.find((slot) => slot.clock === "10:00")!.end }],
    });
    expect(blocked.some((slot) => slot.date === "2026-11-27" && slot.clock === "10:00")).toBe(false);

    const party = openHolidaySlots({ now, packageId: "party", today: "2026-12-01" });
    expect(party.some((slot) => slot.date === "2026-12-05")).toBe(false);
    expect(party.some((slot) => slot.date === "2026-12-08" && slot.clock === "10:00")).toBe(true);

    const celebration = openHolidaySlots({ now, packageId: "celebration", today: "2026-11-01" });
    const firstDay = celebration.filter((slot) => slot.date === "2026-11-27").map((slot) => slot.clock);
    expect(firstDay).toEqual(["10:00", "13:00"]);
  });
});

describe("holiday booking validation", () => {
  it("rejects a date outside the book window and a short party", () => {
    expect(parseHolidayBooking({ ...contact, packageId: "single", preferredDate: "2026-12-15" })).toMatchObject({
      ok: false,
      error: "Choose a date between November 27 and December 14, 2026.",
    });
    expect(parseHolidayBooking({ ...contact, packageId: "party", families: 3 }, { today: "2026-11-01" })).toMatchObject({
      ok: false,
      error: "Studio Party needs at least 4 families.",
    });
    expect(parseHolidayBooking({ ...contact, packageId: "celebration", families: 5 }, { today: "2026-11-01" })).toMatchObject({
      ok: false,
      error: "Studio Celebration needs at least 6 families.",
    });
    expect(HOLIDAY_BOOK_START).toBe("2026-11-27");
    expect(HOLIDAY_BOOK_END).toBe("2026-12-14");
  });

  it("requires 7 days for Package B, Package C, and Chef menus", () => {
    const today = "2026-12-01";
    expect(holidayEarliestDate({ packageId: "single", addonIds: [], today })).toBe("2026-12-01");
    expect(holidayEarliestDate({ packageId: "party", addonIds: [], today })).toBe("2026-12-08");
    expect(holidayEarliestDate({ packageId: "single", addonIds: ["chef-half"], today })).toBe("2026-12-08");
    expect(holidayEarliestDate({ packageId: "single", addonIds: ["branding"], today })).toBe("2026-12-01");

    const party = { ...contact, packageId: "party", families: 4, preferredDate: "2026-12-05" };
    expect(parseHolidayBooking(party, { today })).toMatchObject({
      ok: false,
      error: "Choose a session at least 7 days ahead.",
    });
    expect(parseHolidayBooking({ ...party, preferredDate: "2026-12-08" }, { today }).ok).toBe(true);
    expect(parseHolidayBooking({ ...contact, packageId: "single", preferredTime: "03:00" }, { today: "2026-11-01" })).toMatchObject({
      ok: false,
      error: "Choose a session time.",
    });

    const withChef = { ...contact, packageId: "single", preferredDate: "2026-12-04", addons: ["chef-dessert"] };
    expect(parseHolidayBooking(withChef, { today })).toMatchObject({
      ok: false,
      error: "Choose a session at least 7 days ahead.",
    });
    expect(parseHolidayBooking({ ...withChef, addons: ["branding"] }, { today }).ok).toBe(true);
    expect(parseHolidayBooking({ ...party, preferredDate: "2026-12-01", today: "2026-12-10" }).ok).toBe(true);
  });

  it("builds an office-flagged request and does not publish a private mailbox", () => {
    const parsed = parseHolidayBooking({ ...contact, packageId: "party", families: 4, addons: ["chef-full"] }, { today: "2026-11-01" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.officeFlag).toBe(true);
    expect(parsed.record.needsOfficeReview).toBe(true);
    expect(parsed.record.clientEmailSent).toBe(false);
    expect(parsed.record.subtotal).toBe(416);
    expect(parsed.record.promoCode).toBe(HOLIDAY_PROMO_CODE);
    expect(parsed.record.addonIds).toEqual(["chef-full"]);
    expect(parsed.record.leadDaysRequired).toBe(true);
    expect(parsed.record.scheduledDate).toBe("2026-12-01");
    expect(parsed.record.scheduledTime).toBe("10:00 AM");
    expect(parsed.record.slotStart).toContain("2026-12-01");
    expect(parsed.record.source).toBe("tis-the-season");
    expect(HOLIDAY_PROMO_NAME).toContain("Show Off a Little!");
    expect(PUBLIC_PROCESSING_NOTE).toContain("2.8%");
    expect(JSON.stringify(parsed.record)).not.toContain("cadi@");
    expect(JSON.stringify(parsed.record)).not.toContain("vercel.app");
  });

  it("treats a filled honeypot as received and does not build a record", () => {
    expect(parseHolidayBooking({ ...contact, packageId: "single", website: "https://spam.example" })).toEqual({
      ok: false,
      error: "Request received.",
      honeypot: true,
    });
  });
});
