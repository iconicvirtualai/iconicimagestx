import { describe, expect, it } from "vitest";
import { processingFeeCents } from "./invoiceProcessing";
import {
  RE75_OUTSIDE_MESSAGE,
  RE75_PACKAGE_NAME,
  RE75_SUBTOTAL,
  classifyRealEstate75Area,
  isRealEstate75Holiday,
  openRealEstate75Slots,
  realEstate75Quote,
  realEstate75Week,
} from "./realestate75";

const fridayMorning = new Date("2026-10-16T12:00:00.000Z");

function timesOn(date: string, busy: { start: string; end: string }[] = []) {
  return openRealEstate75Slots({ now: fridayMorning, busy })
    .filter((slot) => slot.date === date)
    .map((slot) => slot.time);
}

describe("real estate $75 service area", () => {
  it("accepts the listed Woodlands, Spring, Conroe, Willis, and Cypress ZIPs", () => {
    expect(classifyRealEstate75Area("12 Oak Dr, The Woodlands, TX 77380")).toMatchObject({
      status: "inside",
      zip: "77380",
      city: "The Woodlands",
      travelFee: "standard",
    });
    expect(classifyRealEstate75Area("77381")).toMatchObject({ city: "The Woodlands", zip: "77381" });
    expect(classifyRealEstate75Area("77382-1234")).toMatchObject({ city: "The Woodlands", zip: "77382" });
    expect(classifyRealEstate75Area("Spring TX 77373")).toMatchObject({ city: "Spring", travelFee: "standard" });
    expect(classifyRealEstate75Area("77379")).toMatchObject({ city: "Spring" });
    expect(classifyRealEstate75Area("77386")).toMatchObject({ city: "Spring" });
    expect(classifyRealEstate75Area("77388")).toMatchObject({ city: "Spring" });
    expect(classifyRealEstate75Area("77389")).toMatchObject({ city: "Spring" });
    expect(classifyRealEstate75Area("Conroe, TX 77301")).toMatchObject({ city: "Conroe", travelFee: "standard" });
    expect(classifyRealEstate75Area("77302")).toMatchObject({ city: "Conroe" });
    expect(classifyRealEstate75Area("77303")).toMatchObject({ city: "Conroe" });
    expect(classifyRealEstate75Area("77304")).toMatchObject({ city: "Conroe" });
    expect(classifyRealEstate75Area("77306")).toMatchObject({ city: "Conroe" });
    expect(classifyRealEstate75Area("Willis, TX 77318")).toMatchObject({ city: "Willis", travelFee: "tbd" });
    expect(classifyRealEstate75Area("77378")).toMatchObject({ city: "Willis", travelFee: "tbd" });
    expect(classifyRealEstate75Area("Cypress 77410")).toMatchObject({ city: "Cypress", travelFee: "tbd" });
    expect(classifyRealEstate75Area("77429")).toMatchObject({ city: "Cypress", travelFee: "tbd" });
    expect(classifyRealEstate75Area("77433")).toMatchObject({ city: "Cypress", travelFee: "tbd" });
    expect(classifyRealEstate75Area("77384")).toMatchObject({ city: "The Woodlands" });
    expect(classifyRealEstate75Area("77385")).toMatchObject({ city: "The Woodlands" });
  });

  it("accepts a known city when the ZIP is missing", () => {
    expect(classifyRealEstate75Area("The Woodlands, TX")).toMatchObject({
      status: "inside",
      zip: null,
      city: "The Woodlands",
    });
    expect(classifyRealEstate75Area("spring")).toMatchObject({ city: "Spring", travelFee: "standard" });
    expect(classifyRealEstate75Area("Willis")).toMatchObject({ city: "Willis", travelFee: "tbd" });
  });

  it("sends anything outside the list to the call-us message", () => {
    for (const address of ["77002", "Houston, TX 77002", "Springfield, IL", "77356", "", "Spring, TX 77002"]) {
      expect(classifyRealEstate75Area(address), address).toEqual({
        status: "outside",
        message: RE75_OUTSIDE_MESSAGE,
      });
    }
    expect(RE75_OUTSIDE_MESSAGE).toBe("Call us 281.356.0965");
  });
});

describe("real estate $75 fee", () => {
  it("prices Apprentice 25 at $75 plus 2.8% ($77.10)", () => {
    expect(processingFeeCents(RE75_SUBTOTAL * 100)).toBe(210);
    const quote = realEstate75Quote(true);
    expect(quote.packageName).toBe(RE75_PACKAGE_NAME);
    expect(quote.subtotal).toBe(75);
    expect(quote.processing).toBe(2.1);
    expect(quote.total).toBe(77.1);
    expect(quote.priceLine).toBe("$75 + 2.8% processing fee ($77.10 total by card).");
  });

  it("drops the processing line when the server kill switch is off", () => {
    const quote = realEstate75Quote(false);
    expect(quote.processing).toBe(0);
    expect(quote.total).toBe(75);
    expect(quote.priceLine).toBe("$75.00");
  });
});

describe("real estate $75 slots", () => {
  it("uses an 8-to-5 weekday, a Saturday noon cutoff, and a closed Sunday", () => {
    const week = realEstate75Week();
    expect(week.timeZone).toBe("America/Chicago");
    expect(week.days[0]).toBeNull();
    expect(week.days[1]).toEqual({ startMinutes: 8 * 60, endMinutes: 17 * 60 });
    expect(week.days[6]).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
      latestStartMinutes: 12 * 60,
    });
  });

  it("starts weekdays at 8:00 and stops at 4:40", () => {
    const monday = timesOn("2026-10-19");
    expect(monday[0]).toBe("8:00 AM");
    expect(monday).toContain("4:40 PM");
    expect(monday).not.toContain("5:00 PM");
    expect(monday[monday.length - 1]).toBe("4:40 PM");
  });

  it("keeps Saturday between 9:00 and 11:40 and offers nothing after noon", () => {
    const saturday = timesOn("2026-10-17");
    expect(saturday[0]).toBe("9:00 AM");
    expect(saturday).toContain("11:40 AM");
    expect(saturday).not.toContain("8:00 AM");
    expect(saturday).not.toContain("12:00 PM");
    expect(saturday[saturday.length - 1]).toBe("11:40 AM");
    expect(saturday).toHaveLength(9);
  });

  it("closes Sunday", () => {
    expect(timesOn("2026-10-18")).toEqual([]);
  });

  it("drops a Saturday start that overlaps a busy block", () => {
    const open = timesOn("2026-10-17", [
      { start: "2026-10-17T09:00:00-05:00", end: "2026-10-17T09:20:00-05:00" },
    ]);
    expect(open).not.toContain("9:00 AM");
    expect(open[0]).toBe("9:20 AM");
    expect(open).toContain("11:40 AM");
  });

  it("blocks holidays, including Thanksgiving and an observed Christmas", () => {
    expect(isRealEstate75Holiday("2026-11-26")).toBe(true);
    expect(isRealEstate75Holiday("2026-11-27")).toBe(true);
    expect(isRealEstate75Holiday("2026-10-19")).toBe(false);
    const aroundThanksgiving = openRealEstate75Slots({
      now: new Date("2026-11-20T15:00:00.000Z"),
      horizonDays: 14,
    }).filter((slot) => slot.date === "2026-11-26" || slot.date === "2026-11-27");
    expect(aroundThanksgiving).toEqual([]);

    expect(isRealEstate75Holiday("2027-12-25")).toBe(true);
    expect(isRealEstate75Holiday("2027-12-24")).toBe(true);
    const christmas = openRealEstate75Slots({
      now: new Date("2027-12-20T15:00:00.000Z"),
      horizonDays: 10,
    }).filter((slot) => slot.date === "2027-12-24" || slot.date === "2027-12-25");
    expect(christmas).toEqual([]);
  });
});
