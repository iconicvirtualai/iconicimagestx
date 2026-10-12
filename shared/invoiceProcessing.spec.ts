import { describe, expect, it } from "vitest";
import { calculateSidebarTotal } from "./bookingPricing.ts";
import {
  BOOKING_PROCESSING_LABEL,
  estimateBookingCharge,
  processingEnabled,
  processingFee,
  processingFeeCents,
} from "./invoiceProcessing.ts";

describe("processing cents", () => {
  it("adds 2.8% on top of $75 and rounds half-up to $2.10", () => {
    expect(processingFee(75)).toBe(2.1);
    expect(processingFeeCents(7500)).toBe(210);
    const estimate = estimateBookingCharge({ selectedBasics: ["apprentice-25"] });
    expect(calculateSidebarTotal({ selectedBasics: ["apprentice-25"] })).toBe(75);
    expect(estimate.processingBase).toBe(75);
    expect(estimate.processing).toBe(2.1);
    expect(estimate.total).toBe(77.1);
    expect(estimate.processing + estimate.processingBase).toBeCloseTo(77.1, 2);
  });

  it("matches the Showcase example of $549 + $15.37", () => {
    const estimate = estimateBookingCharge({ selectedService: "listing-showcase" });
    expect(estimate.processingBase).toBe(549);
    expect(estimate.processing).toBe(15.37);
    expect(estimate.total).toBe(564.37);
  });

  it("rounds a half cent up and a fraction under a half cent down", () => {
    // 125 cents * 0.028 = 3.5 cents → 4
    expect(processingFeeCents(125)).toBe(4);
    expect(processingFee(1.25)).toBe(0.04);
    // 17 cents * 0.028 = 0.476 cents → 0; 18 cents * 0.028 = 0.504 → 1
    expect(processingFeeCents(17)).toBe(0);
    expect(processingFeeCents(18)).toBe(1);
    expect(processingFeeCents(0)).toBe(0);
    expect(processingFeeCents(-100)).toBe(0);
    expect(processingFee(0)).toBe(0);
  });

  it("keeps travel outside the 2.8% base and applies promo before the fee", () => {
    const traveled = estimateBookingCharge({ selectedBasics: ["apprentice-25"] }, 50);
    expect(traveled.processing).toBe(2.1);
    expect(traveled.travel).toBe(50);
    expect(traveled.total).toBe(127.1);

    const discounted = estimateBookingCharge({
      selectedBasics: ["apprentice-25"],
      promo: { code: "NEWYEAR", discount: 50 },
    });
    expect(discounted.processingBase).toBe(25);
    expect(discounted.processing).toBe(0.7);
    expect(discounted.total).toBe(25.7);
  });

  it("skips the fee when processing is off", () => {
    const estimate = estimateBookingCharge({ selectedBasics: ["apprentice-25"] }, 0, false);
    expect(estimate.processing).toBe(0);
    expect(estimate.total).toBe(75);
    expect(BOOKING_PROCESSING_LABEL).toBe("Processing (2.8%)");
  });

  it("treats the server kill switch as off only for the known values", () => {
    expect(processingEnabled({})).toBe(true);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "off" })).toBe(false);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "disabled" })).toBe(false);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "legacy" })).toBe(false);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "0" })).toBe(false);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "on" })).toBe(true);
  });
});
