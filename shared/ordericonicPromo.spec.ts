import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOCIAL_PRICING_ENDED } from "./thankfulEvent";

const html = readFileSync(new URL("../public/ordericonic.html", import.meta.url), "utf8");

describe("ordericonic November promo", () => {
  it("points the Thankful RSVP at the exact vercel URL", () => {
    expect(html).toContain('href="https://iconicimagestx.vercel.app/thankful#rsvp"');
    expect(html).toContain("Sat, Nov 7, 2026");
    expect(html).toContain("11 AM – 3 PM");
    expect(html).toContain("Studio 105");
    expect(html).toContain("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
  });

  it("shops 2027 social packages on the Thankful page and reads the shared rate", () => {
    expect(html).toContain('href="https://iconicimagestx.vercel.app/thankful#social-saves"');
    expect(html).toContain("/api/bookings/social-rate");
    expect(html).toContain("data.nextDropAt");
    expect(html).toContain(SOCIAL_PRICING_ENDED);
    expect(html).not.toContain("SOCIAL_RATE_BY_DATE");
    expect(html).not.toContain("2026-10-17");
    expect(html).not.toContain("2026-11-04");
    expect(html).not.toContain("const RATES");
  });

  it("shouts the live social percent and introduces Pay Later without a fee or a financing name", () => {
    expect(html).toContain('id="social-blast"');
    expect(html).toContain('id="social-blast-pct"');
    expect(html).toContain("SOCIAL PACKAGES");
    expect(html).toContain("this November");
    expect(html).toContain("The Countdown is On!");
    expect(html).toContain("data.schedule");
    expect(html).toContain("data.nextPercent");
    expect(html).toContain("blastPct.textContent=pctLabel(percent)");
    expect(html).toContain('id="cd-d"');
    expect(html).not.toMatch(/>\d+(?:\.\d+)?% OFF</);
    expect(html).toContain('href="https://iconicimagestx.vercel.app/pay-at-close"');
    expect(html).toContain("Pay Later at Closing →");
    expect(html).toContain("Splurge Alert!!");
    expect(html).toContain("Give every listing the budget it deserves, and pay at closing.");
    expect(html).toContain("The sale covers it when it closes.");
    expect(html).toContain("/media/photos/luxury-exterior.jpg");
    expect(html).not.toContain("luxury-mtz02998.jpg");
    const visible = html.slice(html.indexOf("<body"));
    expect(visible).not.toMatch(/(^|[^0-9.])6%/);
    expect(html.toLowerCase()).not.toContain("titus");
    expect(html.toLowerCase()).not.toContain("gotitus");
    expect(html.toLowerCase()).not.toContain("card fee");
    const promo = html.slice(html.indexOf('aria-label="November promos"'), html.indexOf("</header>"));
    expect(promo).not.toContain("Processing (2.8%)");
    expect(promo).not.toMatch(/Square/);
  });

  it("drops the October twilight ads and keeps bright photos", () => {
    expect(html).not.toContain("October glow-up");
    expect(html).not.toContain("From Day to Night");
    expect(html).not.toContain("madden-hunter");
    expect(html).not.toContain("jenny-bluelake");
    expect(html).not.toContain("marias-pool");
    expect(html).not.toContain("front-dusk");
    expect(html).toContain("/holiday-2026/feature-family-portraits.jpg");
    expect(html).toContain("/holiday-2026/feature-content-day.jpg");
    expect(html).toContain("/media/photos/luxury-exterior.jpg");
  });

  it("leaves the booking form, apprentice flow, and catalog ids in place", () => {
    const form = html.slice(html.indexOf('<section class="form" id="booking">'));
    expect(form).toContain('id="order"');
    expect(form).toContain('id="package"');
    expect(form).toContain('data-apprentice="apprentice-25"');
    expect(form).toContain('data-apprentice="apprentice-50"');
    expect(form).toContain('id="appr-slot"');
    expect(form).toContain("/api/apprenticeship/order");
    expect(form).toContain("/deposit-checkout");
    expect(form).toContain("leadSource:'Iconic temporary booking page'");
    expect(form).not.toContain("October:");
    expect(form).not.toContain("Referral: $25");
    expect(html).toContain('id="apprentice"');
    expect(html).toContain('value="listing-essentials"');
    expect(html).toContain("/api/bookings/catalog");
  });
});
