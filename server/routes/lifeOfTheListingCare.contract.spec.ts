import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bookings = readFileSync(new URL("./bookings.ts", import.meta.url), "utf8");
const email = readFileSync(new URL("../services/email.ts", import.meta.url), "utf8");
const sms = readFileSync(new URL("../services/sms.ts", import.meta.url), "utf8");
const createOrder = readFileSync(new URL("../../client/lib/createOrder.ts", import.meta.url), "utf8");
const bookingForm = readFileSync(new URL("../../client/components/BookingForm.tsx", import.meta.url), "utf8");

describe("Life of the Listing Care stays off priced lines and client notices", () => {
  it("persists a boolean on the order request and the confirmed order", () => {
    expect(bookings).toContain(
      "lifeOfTheListingCare: lifeOfTheListingCareSelected(lifeOfTheListingCare)",
    );
    expect(bookings).toContain(
      "lifeOfTheListingCare: lifeOfTheListingCareSelected(request.lifeOfTheListingCare)",
    );
  });

  it("sends the flag from the public form without a dollar amount", () => {
    expect(createOrder).toMatch(
      /lifeOfTheListingCare:\s*lifeOfTheListingCareSelected\(formData\.lifeOfTheListingCare\)/,
    );
    expect(bookingForm).toContain("LIFE_OF_THE_LISTING_CARE_CHECKBOX_LABEL");
    expect(bookingForm).toContain("LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL");
    expect(bookingForm).toContain("LIFE_OF_THE_LISTING_CARE_PRICE_LABEL");
    expect(bookingForm).not.toContain("lifeOfTheListingCarePrice");
  });

  it("places the checkbox after marketing permission, not on the package step", () => {
    const checkboxAt = bookingForm.lastIndexOf("LIFE_OF_THE_LISTING_CARE_CHECKBOX_LABEL");
    const marketingAt = bookingForm.indexOf("Marketing Permission");
    const teaserAt = bookingForm.lastIndexOf("teaserSocialConsult");
    const addOnsAt = bookingForm.indexOf("The Strategic Add-ons");
    expect(checkboxAt).toBeGreaterThan(marketingAt);
    expect(checkboxAt).toBeGreaterThan(teaserAt);
    expect(checkboxAt).toBeGreaterThan(addOnsAt);
    expect(bookingForm.slice(addOnsAt, marketingAt)).not.toContain("lifeOfTheListingCare");
  });

  it("does not mention the add-on in client email or SMS templates", () => {
    expect(email).not.toContain("Life of the Listing");
    expect(sms).not.toContain("Life of the Listing");
    expect(bookings).not.toContain("Life of the Listing Care");
  });
});

describe("booking form light fields keep dark text", () => {
  it("sets readable text on hassle-free inputs and sibling steps", () => {
    expect(bookingForm).toContain(
      'const lightControlText = "text-neutral-950 placeholder:text-neutral-500 caret-neutral-950"',
    );
    expect(bookingForm).toMatch(/123 Luxury Lane, Houston, TX"[\s\S]{0,220}\$\{lightControlText\}/);
    expect(bookingForm).toMatch(/placeholder="2500"[\s\S]{0,220}\$\{lightControlText\}/);
    expect(bookingForm).toMatch(/placeholder="John"[\s\S]{0,180}\$\{lightControlText\}/);
    expect(bookingForm).toContain("border-black bg-gray-50 text-neutral-950");
    expect(bookingForm).toContain("border-black bg-gray-50 text-neutral-950' : 'border-gray-50 bg-white text-neutral-800");
  });

  it("keeps intentional light text on dark surfaces", () => {
    expect(bookingForm).toContain("bg-black rounded-[2rem] p-8 text-white");
    expect(bookingForm).toContain("border-black bg-black text-white");
    expect(bookingForm).toContain('className="mt-6 p-6 bg-black rounded-[2rem] text-white space-y-4"');
  });
});
