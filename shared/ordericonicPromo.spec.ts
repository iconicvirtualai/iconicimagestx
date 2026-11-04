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
    expect(form).toContain('value="October: 20% off real twilight upgrade"');
    expect(html).toContain('id="apprentice"');
    expect(html).toContain("The Essentials — $249");
  });
});
