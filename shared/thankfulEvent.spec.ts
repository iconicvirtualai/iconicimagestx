import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processingFeeCents } from "./invoiceProcessing";
import { holidayPaymentLinkBody } from "./holidayCheckout";
import { THANKFUL_META_DESCRIPTION } from "./siteSeo";
import {
  SOCIAL_RATE_BY_DATE,
  THANKFUL_BUSY_WINDOW,
  THANKFUL_EVENT_DATE,
  THANKFUL_EVENT_WHEN,
  THANKFUL_RSVP_CLOSE_UTC,
  quoteSocialTerm,
  quoteThankfulSocialSave,
  socialRateForInstant,
  socialRatePreviewAllowed,
  socialRateView,
  thankfulRsvpOpen,
} from "./thankfulEvent";

describe("thankful event on Nov 7", () => {
  it("keeps the event, the busy window, and the Oct 31 cutoff", () => {
    expect(THANKFUL_EVENT_DATE).toBe("2026-11-07");
    expect(THANKFUL_EVENT_WHEN).toBe("Sat, Nov 7, 2026");
    expect(THANKFUL_BUSY_WINDOW).toEqual({
      date: "2026-11-07",
      start: "11:00",
      end: "15:00",
      timeZone: "America/Chicago",
    });
    expect(THANKFUL_RSVP_CLOSE_UTC).toBe("2026-11-01T04:59:00.000Z");
    expect(thankfulRsvpOpen(new Date("2026-11-01T04:59:00.000Z"))).toBe(true);
    expect(thankfulRsvpOpen(new Date("2026-11-01T04:59:00.001Z"))).toBe(false);
    expect(thankfulRsvpOpen(new Date("2026-10-17T21:16:00.000Z"))).toBe(true);
  });

  it("uses the stair-step table, including a half percent, through the end of Nov 7 CT", () => {
    expect(socialRateForInstant(new Date("2026-10-16T17:00:00.000Z"))).toBe(50);
    expect(socialRateForInstant(new Date("2026-10-17T21:16:00.000Z"))).toBe(49);
    expect(socialRateForInstant(new Date("2026-10-18T15:00:00.000Z"))).toBe(47);
    expect(socialRateForInstant(new Date("2026-10-26T15:00:00.000Z"))).toBe(31.5);
    expect(socialRateForInstant(new Date("2026-10-31T15:00:00.000Z"))).toBe(24);
    expect(socialRateForInstant(new Date("2026-11-01T17:00:00.000Z"))).toBe(23.5);
    expect(socialRateForInstant(new Date("2026-11-06T18:00:00.000Z"))).toBe(21);
    expect(socialRateForInstant(new Date("2026-11-08T05:59:59.000Z"))).toBe(20);
    expect(socialRateForInstant(new Date("2026-11-08T06:00:00.000Z"))).toBeNull();
    expect(socialRateForInstant(new Date("2026-10-16T04:59:00.000Z"))).toBeNull();
    expect(SOCIAL_RATE_BY_DATE["2026-10-25"]).toBe(33);
    expect(SOCIAL_RATE_BY_DATE["2026-11-07"]).toBe(20);
  });

  it("rounds a half-percent month and the 2.8% fee to the cents Square charges", () => {
    const quote = quoteSocialTerm(850, 12, 31.5);
    expect(quote).toMatchObject({
      percent: 41.5,
      monthlyCents: 49725,
      termCents: 596700,
    });
    expect(quote?.processingCents).toBe(processingFeeCents(596700));
    expect(quote?.squareCents).toBe(596700 + (quote?.processingCents ?? 0));
    const three = quoteSocialTerm(500, 3, 31.5);
    expect(three).toMatchObject({ monthlyCents: 34250, termCents: 92750 });
    expect(three?.processingCents).toBe(processingFeeCents(92750));
    const link = holidayPaymentLinkBody({
      invoiceId: "inv-social",
      amount: (three?.squareCents ?? 0) / 100,
      itemName: "Social Saves",
      locationId: "LOC",
      redirectUrl: "https://iconicimagestx.vercel.app/thankful?paid=1&order=%23043#social-saves",
    });
    expect((link.quick_pay as { price_money: { amount: number } }).price_money.amount).toBe(three?.squareCents);
  });

  it("ignores a posted price and quotes Oct 17 from the package and term", () => {
    const quoted = quoteThankfulSocialSave({
      packageName: "The Baseline",
      months: 3,
      label: "posted price 1",
      now: new Date("2026-10-17T21:16:00.000Z"),
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    expect(quoted.quote.percent).toBe(49);
    expect(quoted.termDollars).toBe(665);
    expect(quoted.squareDollars).toBe((66500 + processingFeeCents(66500)) / 100);
    expect(quoteThankfulSocialSave({
      packageName: "The Baseline",
      months: 3,
      now: new Date("2026-11-08T06:00:00.000Z"),
    }).ok).toBe(false);
  });

  it("puts Nov 7 and Oct 31 on the pages and drops the old event dates", () => {
    const thankful = readFileSync("public/thankful.html", "utf8");
    const season = readFileSync("public/tis-the-season.html", "utf8");
    expect(thankful).toContain(THANKFUL_META_DESCRIPTION);
    expect(thankful).toContain("Sat, Nov 7, 2026");
    expect(thankful).toContain("Sat, Oct 31");
    expect(thankful).toContain(THANKFUL_RSVP_CLOSE_UTC);
    expect(thankful).not.toContain("Nov 14");
    expect(thankful).not.toContain("Nov 6");
    expect(thankful).not.toContain("2026-11-14");
    expect(season).toContain("Sat, Nov 7");
    expect(season).toContain("Sat, Oct 31");
    expect(season).not.toContain("Nov 14");
    expect(season).not.toContain("Nov 6");
    expect(thankful).toContain("Math.floor((cents*28+500)/1000)");
    expect(thankful).toContain("/api/bookings/social-rate");
    expect(thankful).not.toContain("const RATES=");
  });

  it("keeps today's dial and does not publish a future social rate", () => {
    const thankful = readFileSync("public/thankful.html", "utf8");
    const season = readFileSync("public/tis-the-season.html", "utf8");
    expect(thankful).toContain("plan: save on Social Media Packages.");
    expect(thankful).toContain("Today's savings are on the dial, and they drop every single day. Lock it in now.");
    expect(thankful).toContain('<div class="p" id="pct"></div>');
    expect(thankful).toContain("Today's discount");
    expect(thankful).toContain("Price drops tomorrow... and the day after... and the day after...");
    expect(thankful).toContain("Or buy at the event");
    expect(thankful).toContain("Want to talk it through? Sit down with us on Sat, Nov 7 and lock in that day's savings, plus your term bonus. The sooner you buy, the more you save.");
    expect(thankful).toContain("+10% off");
    expect(thankful).toContain("+5% off");
    expect(thankful).toContain("$100 off");
    expect(thankful).not.toContain("50%");
    expect(thankful).not.toContain("49%");
    expect(thankful).not.toContain("20%");
    expect(thankful).not.toContain("up to 49%");
    expect(thankful).not.toContain("still save up to");
    expect(THANKFUL_META_DESCRIPTION).not.toMatch(/20%|49%|50%/);
    expect(season).toContain("50% refund");
    expect(season).not.toMatch(/20% off|49%|50% off/);
  });

  it("serves one day from the server table and keeps ?date= for admin or the QA mailbox", () => {
    const today = new Date("2026-10-18T15:00:00.000Z");
    expect(socialRateView(today, null, false)).toEqual({
      date: "2026-10-18",
      percent: 47,
      ended: false,
      dropsTomorrow: true,
      preview: false,
    });
    expect(socialRateView(today, "2026-11-07", false)).toMatchObject({
      date: "2026-10-18",
      percent: 47,
      preview: false,
    });
    expect(socialRateView(today, "2026-11-07", true)).toEqual({
      date: "2026-11-07",
      percent: 20,
      ended: false,
      dropsTomorrow: false,
      preview: true,
    });
    expect(socialRateView(today, "not-a-day", true).preview).toBe(false);
    expect(socialRateView(new Date("2026-11-08T06:00:00.000Z"), null, false).ended).toBe(true);
    expect(socialRatePreviewAllowed({ role: "admin", email: "owner@iconicimagestx.com" })).toBe(true);
    expect(socialRatePreviewAllowed({ role: null, email: "Ops QA <ops+deliveryqa@iconicimagestx.com>" })).toBe(true);
    expect(socialRatePreviewAllowed({ role: "coordinator", email: "office@iconicimagestx.com" })).toBe(false);
    expect(socialRatePreviewAllowed({ role: "photographer", email: "photo@iconicimagestx.com" })).toBe(false);
    expect(socialRatePreviewAllowed({ role: null, email: "guest@example.com" })).toBe(false);
  });
});
