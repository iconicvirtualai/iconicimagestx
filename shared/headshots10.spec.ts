import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT } from "./businessContact";
import { processingFee } from "./invoiceProcessing";
import {
  HEADSHOT_PAY_FAQ,
  HEADSHOTS_FACTS,
  HEADSHOTS_FOOTER_ADDRESS,
  HEADSHOTS_H1,
  HEADSHOTS_HOLD_MINUTES,
  HEADSHOTS_MAPS_QUERY,
  HEADSHOTS_ORDER_SOURCE,
  HEADSHOTS_SEO_DESCRIPTION,
  HEADSHOTS_STUDIO_ADDRESS,
  HEADSHOTS_STUDIO_LINE,
  HEADSHOT_PHOTOS,
  headshotHeroGroup,
  headshotPhotoStrip,
  headshotCalendarIcs,
  headshotClientMailEnabled,
  headshotConfirmationEmailHtml,
  headshotPlaceJsonLd,
  headshotConversionValue,
  headshotHoldExpired,
  headshotHoldExpiresAt,
  headshotSlotsNeeded,
  isHeadshotHoliday,
  openHeadshotSlots,
  publishHeadshotSlots,
  quoteHeadshots,
  shouldRecordHeadshotConversion,
  upcomingHeadshotTuesdays,
} from "./headshots10";

const routeSource = readFileSync(new URL("../server/routes/headshots10.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../client/pages/Headshots10.tsx", import.meta.url), "utf8");

describe("$10 Tuesday headshot quote", () => {
  it("charges $10.28 today and hides the balance when one headshot pays the order", () => {
    const quote = quoteHeadshots(1);
    expect(quote.total).toBe(10.28);
    expect(quote.dueToday).toBe(10.28);
    expect(quote.dueTodayLine).toBe("Due today: $10.28");
    expect(quote.balanceSubtotal).toBe(0);
    expect(quote.balanceTotal).toBe(0);
    expect(quote.balanceLine).toBeNull();
    expect(quote.processing).toBe(processingFee(10));
  });

  it("splits larger orders into the booking fee and a delivery balance, each with 2.8%", () => {
    const two = quoteHeadshots(2);
    expect(two.total).toBe(20.56);
    expect(two.dueToday).toBe(10.28);
    expect(two.balanceSubtotal).toBe(10);
    expect(two.balanceTotal).toBe(10.28);
    expect(two.balanceLine).toBe("Balance on delivery: $10.00 + 2.8%");

    const three = quoteHeadshots(3);
    expect(three.total).toBe(30.84);
    expect(three.dueToday).toBe(10.28);
    expect(three.dueTodayLine).toBe("Due today: $10.28");
    expect(three.balanceSubtotal).toBe(20);
    expect(three.balanceProcessing).toBe(0.56);
    expect(three.balanceTotal).toBe(20.56);
    expect(three.balanceLine).toBe("Balance on delivery: $20.00 + 2.8%");

    const five = quoteHeadshots(5);
    expect(five.total).toBe(51.4);
    expect(five.dueToday).toBe(10.28);
    expect(five.balanceSubtotal).toBe(40);
    expect(five.balanceTotal).toBe(41.12);
    expect(five.balanceLine).toBe("Balance on delivery: $40.00 + 2.8%");

    const ten = quoteHeadshots(10);
    expect(ten.total).toBe(102.8);
    expect(ten.dueToday).toBe(10.28);
    expect(ten.balanceSubtotal).toBe(90);
    expect(ten.balanceTotal).toBe(92.52);
    expect(ten.balanceLine).toBe("Balance on delivery: $90.00 + 2.8%");
    expect(ten.processing).toBeCloseTo(processingFee(10) + processingFee(90), 2);
  });

  it("keeps the pay-at-event answer out of the confirm list", () => {
    expect(HEADSHOT_PAY_FAQ).toContain("$10.28");
    expect(HEADSHOT_PAY_FAQ).toContain("balance is due on delivery");
    expect(HEADSHOT_PAY_FAQ).not.toContain("[CONFIRM");
    expect(HEADSHOT_PAY_FAQ).not.toMatch(/processing fee/i);
    expect(HEADSHOTS_H1).toBe("$10 Tuesdays! Headshots for $10/Ea.");
    expect(HEADSHOTS_SEO_DESCRIPTION).not.toMatch(/processing fee/i);
    expect(HEADSHOTS_FACTS.join(" ")).not.toMatch(/2\.8%|processing fee/i);
    expect(pageSource).not.toMatch(/processing fee/i);
    expect(pageSource).not.toMatch(/\[CONFIRM|\[parking/);
    expect(readFileSync(new URL("./headshots10.ts", import.meta.url), "utf8")).not.toMatch(/\[CONFIRM|\[parking/);
    expect(pageSource).toContain("HEADSHOTS_H1");
  });
});

describe("Tuesday headshot slots", () => {
  const beforeTuesday = new Date("2026-10-26T15:00:00.000Z");

  it("lists 24 Tuesday times from 10:00 AM through 1:50 PM", () => {
    const times = openHeadshotSlots({ now: beforeTuesday })
      .filter((slot) => slot.date === "2026-10-27")
      .map((slot) => slot.time);
    expect(times).toHaveLength(24);
    expect(times[0]).toBe("10:00 AM");
    expect(times[times.length - 1]).toBe("1:50 PM");
    expect(times).not.toContain("2:00 PM");
    const dates = new Set(openHeadshotSlots({ now: beforeTuesday }).map((slot) => slot.date));
    for (const date of dates) {
      expect(new Date(`${date}T12:00:00.000Z`).getUTCDay()).toBe(2);
    }
  });

  it("includes this Tuesday before 1:50 PM and rolls to next week after the last start", () => {
    expect(upcomingHeadshotTuesdays(new Date("2026-10-27T15:00:00.000Z"))[0]).toBe("2026-10-27");
    expect(upcomingHeadshotTuesdays(new Date("2026-10-27T19:00:00.000Z"))[0]).toBe("2026-11-03");
  });

  it("blocks the July 4 2028 holiday", () => {
    expect(isHeadshotHoliday("2028-07-04")).toBe(true);
    const slots = openHeadshotSlots({ now: new Date("2028-07-03T15:00:00.000Z") });
    expect(slots.some((slot) => slot.date === "2028-07-04")).toBe(false);
  });

  it("holds one slot through five headshots and two consecutive slots from six", () => {
    expect(headshotSlotsNeeded(5)).toBe(1);
    expect(headshotSlotsNeeded(6)).toBe(2);
    const published = publishHeadshotSlots([
      { start: "2026-10-27T15:00:00.000Z", end: "2026-10-27T15:10:00.000Z", photographerId: "ada" },
      { start: "2026-10-27T15:10:00.000Z", end: "2026-10-27T15:20:00.000Z", photographerId: "ada" },
      { start: "2026-10-27T15:00:00.000Z", end: "2026-10-27T15:10:00.000Z", photographerId: "bea" },
    ], 6);
    expect(published).toEqual([
      { start: "2026-10-27T15:00:00.000Z", end: "2026-10-27T15:20:00.000Z", photographerId: "ada" },
    ]);
  });
});

describe("headshot location", () => {
  it("says The Woodlands and keeps the street, suite, and ZIP", () => {
    expect(HEADSHOTS_STUDIO_ADDRESS).toBe("26410 Oakridge Dr. Ste 105, The Woodlands, TX 77380");
    expect(HEADSHOTS_FOOTER_ADDRESS).toBe("26410 Oakridge Dr. Ste 105 - 108, The Woodlands, TX 77380");
    expect(HEADSHOTS_MAPS_QUERY).toBe("26410 Oakridge Dr Ste 105, The Woodlands, TX 77380");
    expect(HEADSHOTS_SEO_DESCRIPTION).toContain("in The Woodlands");
    expect(HEADSHOTS_FACTS).toContain("The Woodlands, TX");
    expect(BUSINESS_CONTACT.city).toBe("Spring");
    expect(BUSINESS_CONTACT.address).toContain("Spring, TX 77380");
    const ics = headshotCalendarIcs({
      start: "2026-10-27T15:00:00.000Z",
      end: "2026-10-27T15:10:00.000Z",
      orderNumber: "#044",
      quantity: 1,
    });
    expect(ics).toContain("The Woodlands\\, TX 77380");
    expect(ics).not.toMatch(/Spring/);
    expect(headshotPlaceJsonLd().address).toMatchObject({
      streetAddress: "26410 Oakridge Dr. Ste 105",
      addressLocality: "The Woodlands",
      addressRegion: "TX",
      postalCode: "77380",
    });
    expect(pageSource).not.toMatch(/Spring/);
    expect(pageSource).toContain("HEADSHOTS_FOOTER_ADDRESS");
  });
});

describe("headshot photos", () => {
  const photos = [
    { src: "/media/headshots/one.jpg", alt: "Tuesday headshot one" },
    { src: "/media/headshots/two.jpg", alt: "Tuesday headshot two" },
    { src: "  ", alt: "Missing file" },
    { src: "/media/headshots/three.jpg", alt: "Tuesday headshot three" },
    { src: "/media/headshots/four.jpg", alt: "Tuesday headshot four" },
    { src: "/media/headshots/five.jpg", alt: "Tuesday headshot five" },
    { src: "/media/headshots/six.jpg", alt: "Tuesday headshot six" },
  ];

  it("hides the hero and the strip until three photos are available", () => {
    expect(headshotHeroGroup([])).toEqual([]);
    expect(headshotPhotoStrip([])).toEqual([]);
    expect(headshotHeroGroup(photos.slice(0, 2))).toEqual([]);
    expect(headshotPhotoStrip(photos.slice(0, 2))).toEqual([]);
  });

  it("builds a three-person hero and a strip of up to five", () => {
    expect(headshotHeroGroup(photos).map((photo) => photo.src)).toEqual([
      "/media/headshots/one.jpg",
      "/media/headshots/two.jpg",
      "/media/headshots/three.jpg",
    ]);
    const strip = headshotPhotoStrip(photos);
    expect(strip.map((photo) => photo.src)).toEqual([
      "/media/headshots/one.jpg",
      "/media/headshots/two.jpg",
      "/media/headshots/three.jpg",
      "/media/headshots/four.jpg",
      "/media/headshots/five.jpg",
    ]);
    expect(strip.some((photo) => photo.alt === "Missing file")).toBe(false);
  });

  it("uses the five approved studio headshots and cutouts", () => {
    expect(HEADSHOT_PHOTOS.map((photo) => photo.src)).toEqual([
      "/images/headshots-10/headshot-3.jpg",
      "/images/headshots-10/headshot-7.jpg",
      "/images/headshots-10/headshot-2.jpg",
      "/images/headshots-10/headshot-12.jpg",
      "/images/headshots-10/headshot-10.jpg",
    ]);
    expect(headshotHeroGroup().map((photo) => photo.cutout)).toEqual([
      "/images/headshots-10/headshot-10.webp",
      "/images/headshots-10/headshot-12.webp",
      "/images/headshots-10/headshot-7.webp",
    ]);
    expect(headshotPhotoStrip()).toHaveLength(5);
    expect(HEADSHOT_PHOTOS.every((photo) => photo.alt === "Studio headshot by Iconic Images")).toBe(true);
    expect(HEADSHOT_PHOTOS.every((photo) => photo.objectPosition === "top")).toBe(true);
    expect(HEADSHOT_PHOTOS.map((photo) => photo.src).join(" ")).not.toMatch(/headshot-[1456]\.jpg/);
    expect(pageSource).toContain('data-testid="headshots-hero-photo"');
    expect(pageSource).toContain("rounded-full");
    expect(pageSource).not.toContain("aspect-[5/4]");
    expect(pageSource).not.toMatch(/headshot-[1456]\.jpg/);
  });
});

describe("headshot booking conversion and mail", () => {
  it("values the conversion at quantity times 10 and only after a paid booking", () => {
    expect(headshotConversionValue(3)).toBe(30);
    expect(headshotConversionValue(1)).toBe(10);
    expect(shouldRecordHeadshotConversion({ paid: true, transactionId: "#044", alreadySeen: false })).toBe(true);
    expect(shouldRecordHeadshotConversion({ paid: false, transactionId: "#044", alreadySeen: false })).toBe(false);
    expect(shouldRecordHeadshotConversion({ paid: true, transactionId: "#044", alreadySeen: true })).toBe(false);
  });

  it("releases an unpaid hold after 60 minutes", () => {
    const created = new Date("2026-10-27T15:00:00.000Z");
    const order = {
      source: HEADSHOTS_ORDER_SOURCE,
      status: "awaiting_deposit",
      depositPaid: 0,
      holdExpiresAt: headshotHoldExpiresAt(created),
    };
    expect(HEADSHOTS_HOLD_MINUTES).toBe(60);
    expect(headshotHoldExpired(order, new Date(created.getTime() + 59 * 60 * 1000))).toBe(false);
    expect(headshotHoldExpired(order, new Date(created.getTime() + 60 * 60 * 1000))).toBe(true);
  });

  it("keeps confirmation email off unless client notifications are live", () => {
    expect(headshotClientMailEnabled({})).toBe(false);
    expect(headshotClientMailEnabled({ CLIENT_NOTIFY_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe(false);
    const html = headshotConfirmationEmailHtml({
      clientName: "Ada Lovelace",
      whenDate: "Tue, Oct 27",
      whenTime: "10:00 AM",
      quantity: 3,
      quote: quoteHeadshots(3),
      orderNumber: "#044",
      pageUrl: "https://iconicimagestx.vercel.app/headshots-10",
      wearUrl: "https://iconicimagestx.vercel.app/headshots-10/how-it-works",
    });
    expect(html).toContain("Due today: $10.28");
    expect(html).toContain("Balance on delivery: $20.00 + 2.8%");
    expect(html).toContain(HEADSHOTS_STUDIO_LINE);
    expect(html).toContain("The Woodlands, TX 77380");
    expect(html).not.toMatch(/Spring/);
    expect(html).toContain(HEADSHOTS_H1);
    expect(html).not.toMatch(/\[CONFIRM|\[parking/);
    expect(html).not.toMatch(/processing fee/i);
    expect(html.toLowerCase()).not.toContain(["cadi", "@"].join(""));
    expect(html).not.toContain("Iconic Credits");
  });

  it("sends no SMS and gates confirmation mail behind the client notify switch", () => {
    expect(routeSource).not.toMatch(/sendSMS\(/);
    expect(routeSource).not.toMatch(/booking_received/);
    expect(routeSource).not.toMatch(/notifyOfficeOfOrder/);
    expect(routeSource).not.toMatch(/process\.env\.BOOKING_NOTIFY_LIVE/);
    const sendAt = routeSource.indexOf("sendEmail(");
    const gateAt = routeSource.lastIndexOf("if (headshotClientMailEnabled())", sendAt);
    expect(sendAt).toBeGreaterThan(gateAt);
    expect(gateAt).toBeGreaterThan(-1);
  });
});
