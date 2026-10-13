import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtinEmailHtml } from "../server/services/email";
import {
  DOT_BOOKING_CHECKBOX_LABEL,
  DOT_DELIVERY_LINE,
  DOT_OPT_IN_ACTION_LABEL,
  DOT_RECEIPT_LINE,
  DOORS_OPEN_TOUR_URL,
  doorsOpenDeliveryEmailHtml,
  doorsOpenReceiptEmailHtml,
  dotOptInPath,
  dotOptInSelected,
  linkDoorsOpenTour,
} from "./doorsOpenTour";

const bookingForm = readFileSync(new URL("../client/components/BookingForm.tsx", import.meta.url), "utf8");
const createOrder = readFileSync(new URL("../client/lib/createOrder.ts", import.meta.url), "utf8");
const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

describe("Doors Open Tour copy", () => {
  it("keeps the owner's sentences and a direct site link", () => {
    expect(DOT_BOOKING_CHECKBOX_LABEL).toBe(
      "Do you want your Open House listed on DoorsOpenTour.com by Iconic?",
    );
    expect(DOT_DELIVERY_LINE).toBe(
      "Check out our new interactive Open House Tour by zone - As an Iconic Client, you receive an automatic upgrade on DoorsOpenTour.com when it's your time to shine!",
    );
    expect(DOT_RECEIPT_LINE).toBe(
      "Payment received - Thanks for that! Let us know if you want your Open House listed on DoorsOpenTour.com and we'll upgrade your door for free!",
    );
    expect(DOT_OPT_IN_ACTION_LABEL).toBe("Yes, list my open house");
    expect(DOORS_OPEN_TOUR_URL).toBe("https://doorsopentour.com");

    const linked = linkDoorsOpenTour(DOT_DELIVERY_LINE);
    expect(linked).toContain('href="https://doorsopentour.com"');
    expect(linked).not.toContain("utm_");
    expect(linked).not.toContain("redirect");
    expect(linked).not.toMatch(/doorsopentour\.com\?/);
    expect(visibleText(linked)).toBe(DOT_DELIVERY_LINE);
  });

  it("stores an explicit boolean and builds a token-only opt-in path", () => {
    expect(dotOptInSelected(true)).toBe(true);
    expect(dotOptInSelected(false)).toBe(false);
    expect(dotOptInSelected(undefined)).toBe(false);
    expect(dotOptInSelected("true")).toBe(false);
    expect(dotOptInPath("abc")).toBe("/api/orders/dot-opt-in?t=abc");
  });

  it("puts the delivery and receipt lines in the builtin emails", () => {
    const delivery = builtinEmailHtml("gallery_delivery", {
      clientName: "Ada",
      address: "10 Oak",
      galleryUrl: "https://iconicimagestx.vercel.app/gallery/gal-1",
      expiresAt: "30 days",
    });
    expect(visibleText(delivery)).toContain(DOT_DELIVERY_LINE);
    expect(delivery).toContain('href="https://doorsopentour.com"');
    expect(doorsOpenDeliveryEmailHtml()).toContain("font-family:Inter,ui-sans-serif,system-ui,sans-serif");

    const yes = "https://iconicimagestx.vercel.app/api/orders/dot-opt-in?t=tok-1";
    const receipt = builtinEmailHtml("payment_receipt", {
      clientName: "Ada",
      amount: "$10.00",
      invoiceNumber: "INV-1",
      balance: "$0.00",
      dotOptInUrl: yes,
    });
    expect(visibleText(receipt)).toContain(DOT_RECEIPT_LINE);
    expect(visibleText(receipt)).toContain(DOT_OPT_IN_ACTION_LABEL);
    expect(receipt).toContain(`href="${yes}"`);
    expect(receipt).toContain('href="https://doorsopentour.com"');
    expect(doorsOpenReceiptEmailHtml("http://evil.example")).not.toContain("evil.example");
    expect(doorsOpenReceiptEmailHtml(yes)).toContain(DOT_OPT_IN_ACTION_LABEL);
  });

  it("keeps the booking checkbox optional and off by default", () => {
    expect(bookingForm).toContain("dotOptIn: false");
    expect(bookingForm).not.toContain("dotOptIn: true");
    expect(bookingForm).toContain("<DoorsOpenTourCheckbox");
    expect(createOrder).toMatch(/dotOptIn:\s*dotOptInSelected\(formData\.dotOptIn\)/);
    expect(bookings).toContain("dotOptIn: dotOptInSelected(req.body.dotOptIn)");
    expect(bookings).toContain("dotOptIn: dotOptInSelected(request.dotOptIn)");
    expect(bookings).toContain("dotOptInToken");
  });
});
