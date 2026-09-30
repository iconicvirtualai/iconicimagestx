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

  it("does not mention the add-on in client email or SMS templates", () => {
    expect(email).not.toContain("Life of the Listing");
    expect(sms).not.toContain("Life of the Listing");
    expect(bookings).not.toContain("Life of the Listing Care");
  });
});
