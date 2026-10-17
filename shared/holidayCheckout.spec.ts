import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT_LINE } from "./businessContact";
import {
  HOLIDAY_RSVP_LEAD,
  HOLIDAY_SEASON_LEAD,
  HOLIDAY_SOCIAL_SAVES_LEAD,
  holidayCheckoutKind,
  holidayOrderReceivedHtml,
  holidayPaymentLinkBody,
  holidayReturnPath,
  squareCheckoutMissingEnv,
} from "./holidayCheckout";
import { squarePaymentNote } from "./paymentAccess";

describe("holiday checkout", () => {
  it("keeps the client holiday RSVP free", () => {
    expect(holidayCheckoutKind(HOLIDAY_RSVP_LEAD, 0)).toBe("free");
    expect(holidayCheckoutKind(HOLIDAY_RSVP_LEAD, 99)).toBe("free");
  });

  it("charges a Buy Now item and leaves other bookings alone", () => {
    expect(holidayCheckoutKind(HOLIDAY_SOCIAL_SAVES_LEAD, 1200)).toBe("paid");
    expect(holidayCheckoutKind(HOLIDAY_SEASON_LEAD, 99)).toBe("paid");
    expect(holidayCheckoutKind(HOLIDAY_SEASON_LEAD, 0)).toBe("free");
    expect(holidayCheckoutKind("Iconic temporary booking page", 549)).toBe("none");
  });

  it("names the Square env vars a payment link needs", () => {
    expect(squareCheckoutMissingEnv({})).toEqual(["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"]);
    expect(squareCheckoutMissingEnv({ SQUARE_ACCESS_TOKEN: "sq" })).toEqual(["SQUARE_LOCATION_ID"]);
    expect(squareCheckoutMissingEnv({ SQUARE_ACCESS_TOKEN: "sq", SQUARE_LOCATION_ID: "LOC" })).toEqual([]);
  });

  it("builds a direct Square payment link for the saved total", () => {
    const body = holidayPaymentLinkBody({
      invoiceId: "inv-1",
      invoiceNumber: "INV-2026-9",
      amount: 101.77,
      itemName: "Tis the Season Package A Single Session",
      email: "ops+deliveryqa@iconicimagestx.com",
      locationId: "LOC",
      redirectUrl: "https://iconicimagestx.vercel.app/tis-the-season?paid=1&order=%23042#book",
    });
    expect(body.quick_pay).toMatchObject({
      price_money: { amount: 10177, currency: "USD" },
      location_id: "LOC",
    });
    expect(body.payment_note).toBe(squarePaymentNote("inv-1", "INV-2026-9"));
    expect(body.checkout_options).toEqual({
      redirect_url: "https://iconicimagestx.vercel.app/tis-the-season?paid=1&order=%23042#book",
    });
    expect(JSON.stringify(body)).not.toMatch(/bit\.ly|utm_|track/i);
    expect(holidayReturnPath(HOLIDAY_SEASON_LEAD, "#042")).toBe("/tis-the-season?paid=1&order=%23042#book");
    expect(holidayReturnPath(HOLIDAY_SOCIAL_SAVES_LEAD, "#043")).toBe("/thankful?paid=1&order=%23043#social-saves");
  });

  it("sends a holiday confirmation with the exact time, not the real-estate shell", () => {
    const html = holidayOrderReceivedHtml({
      clientName: "Ada <Client>",
      serviceName: "Client Holiday Event RSVP",
      whenDate: "Sat, Nov 14",
      whenTime: "12:00 PM",
      total: "$0.00",
      requestId: "req-1",
      pagePath: "/thankful",
      complimentary: true,
    });
    expect(html).toContain("12:00 PM");
    expect(html).toContain("Sat, Nov 14");
    expect(html).toContain("complimentary");
    expect(html).toContain(BUSINESS_CONTACT_LINE.split("|")[0].trim());
    expect(html).toContain("https://iconicimagestx.vercel.app/thankful");
    expect(html).not.toContain("REAL ESTATE MEDIA");
    expect(html).not.toContain("Property Status");
    expect(html).not.toContain("Furnishing");
    expect(html).not.toContain("https://iconicimagestx.com");
    expect(html).not.toContain("utm_");
    expect(html).toContain("Ada &lt;Client&gt;");
    const paid = holidayOrderReceivedHtml({
      clientName: "Ada",
      serviceName: "Tis the Season Package A",
      whenDate: "Fri, Dec 4",
      whenTime: "10:00 AM",
      total: "$101.77",
      requestId: "req-2",
      pagePath: "/tis-the-season",
      complimentary: false,
    });
    expect(paid).toContain("10:00 AM");
    expect(paid).toContain("$101.77");
    expect(paid).toContain("https://iconicimagestx.vercel.app/tis-the-season");
    expect(paid).not.toContain("REAL ESTATE MEDIA");
  });
});
