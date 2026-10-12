import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceFaceFromStored } from "./invoiceFace";
import { amountStillDue } from "./paymentAccess";
import {
  checkoutAmountDue,
  computeInvoiceTotals,
  estimateBookingCharge,
  formatInvoiceAmount,
  formatInvoiceDisplayDate,
  formatInvoicePhone,
  invoiceBlankRowCount,
  presentInvoiceMoney,
  processingEnabled,
  processingFee,
  processingFeeCents,
  BOOKING_PROCESSING_LABEL,
} from "./invoiceProcessing";
import { calculateSidebarTotal } from "./bookingPricing";
import { formatProcessingImpactReport, processingImpactFixtureScan } from "./processingImpact";

describe("processingFee", () => {
  it("rounds 2.8% of the base to cents, half-up", () => {
    expect(processingFeeCents(54900)).toBe(1537);
    expect(processingFee(549)).toBe(15.37);
    expect(processingFee(100)).toBe(2.8);
    expect(processingFee(10)).toBe(0.28);
    expect(processingFee(1)).toBe(0.03);
    expect(processingFee(0)).toBe(0);
    expect(processingFee(-20)).toBe(0);
    expect(processingFee(Number.NaN)).toBe(0);
    expect(processingFeeCents(125)).toBe(4);
    expect(processingFeeCents(375)).toBe(11);
    expect(processingFeeCents(625)).toBe(18);
    expect(processingFeeCents(875)).toBe(25);
  });

  it("uses the same cents for the total and the charge on varied amounts", () => {
    const bases = [1, 10, 49, 100, 125, 199, 375, 549, 625, 763, 875, 1023, 1500];
    expect(bases.length).toBeGreaterThanOrEqual(10);
    for (const dollars of bases) {
      const totals = computeInvoiceTotals({ subtotal: dollars });
      const cents = Math.round(dollars * 100);
      const feeCents = processingFeeCents(cents);
      expect(Math.round(totals.processing * 100)).toBe(feeCents);
      expect(Math.round(totals.total * 100)).toBe(cents + feeCents);
      const stored = {
        status: "sent",
        subtotal: dollars,
        processing: totals.processing,
        total: totals.total,
        amountPaid: 0,
        amountDue: totals.amountDue,
      };
      expect(totals.total).toBe(checkoutAmountDue(stored));
      expect(presentInvoiceMoney(invoiceFaceFromStored(stored)).total).toBe(checkoutAmountDue(stored));
    }
  });
});

describe("computeInvoiceTotals", () => {
  it("makes the $549 Showcase $15.37 and $564.37", () => {
    const totals = computeInvoiceTotals({ subtotal: 549 });
    expect(totals.processingBase).toBe(549);
    expect(Math.round(totals.processing * 100)).toBe(1537);
    expect(Math.round(totals.total * 100)).toBe(56437);
    expect(totals.processingPolicy).toBe("included");
  });

  it("reduces the base by a promo and floors a full discount at zero", () => {
    const promo = computeInvoiceTotals({ subtotal: 549, promotions: 49 });
    expect(promo.processingBase).toBe(500);
    expect(promo.processing).toBe(14);
    expect(promo.total).toBe(514);
    const free = computeInvoiceTotals({ subtotal: 549, promotions: 600 });
    expect(free.processing).toBe(0);
    expect(free.total).toBe(0);
    expect(free.processingPolicy).toBe("waived");
  });

  it("adds fees to the base and leaves travel and tax outside it", () => {
    const totals = computeInvoiceTotals({ subtotal: 549, fees: 10, travel: 25, tax: 8 });
    expect(totals.processingBase).toBe(559);
    expect(totals.processing).toBe(processingFee(559));
    expect(totals.total).toBe(549 + 10 + 25 + 8 + totals.processing);
  });

  it("gives comped and zero sales no processing", () => {
    expect(computeInvoiceTotals({ subtotal: 549, comped: true })).toMatchObject({ processing: 0, total: 549 });
    expect(computeInvoiceTotals({ subtotal: 0 })).toMatchObject({ processing: 0, total: 0 });
  });

  it("keeps a stored processing amount and does not add 2.8% again", () => {
    const totals = computeInvoiceTotals({ subtotal: 100, processing: 4 });
    expect(totals.processing).toBe(4);
    expect(totals.total).toBe(104);
    expect(totals.processingPolicy).toBe("stored");
    expect(totals.processing).not.toBe(processingFee(100));
  });

  it("leaves a legacy copy alone when processing is turned off", () => {
    const totals = computeInvoiceTotals({ subtotal: 549, applyProcessing: false });
    expect(totals.processing).toBe(0);
    expect(totals.total).toBe(549);
    const legacy = { status: "sent", subtotal: 549, total: 549, amountDue: 549, amountPaid: 0 };
    expect(checkoutAmountDue(legacy)).toBe(amountStillDue(legacy));
    expect(checkoutAmountDue(legacy)).toBe(549);
  });
});

describe("processing kill switch", () => {
  it("stays on unless the server env explicitly turns it off", () => {
    expect(processingEnabled({})).toBe(true);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "" })).toBe(true);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "charge" })).toBe(true);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: " off " })).toBe(false);
    expect(processingEnabled({ INVOICE_PROCESSING_MODE: "legacy" })).toBe(false);
    expect(formatInvoiceDisplayDate("2027-01-01")).toBe("JAN. 01, 2027");
    expect(invoiceBlankRowCount(1)).toBe(5);
    expect(invoiceBlankRowCount(6)).toBe(0);
  });
});

describe("invoice amount format", () => {
  it("prints a spaced dollar sign and cents only when they are non-zero", () => {
    expect(formatInvoiceAmount(549)).toBe("$ 549");
    expect(formatInvoiceAmount(15.37)).toBe("$ 15.37");
    expect(formatInvoiceAmount(564.37)).toBe("$ 564.37");
    expect(formatInvoiceAmount(0)).toBe("$ 0");
    expect(formatInvoiceAmount(1048)).toBe("$ 1,048");
    expect(formatInvoiceAmount(-50)).toBe("-$ 50");
    expect(formatInvoicePhone("281.356.0965")).toBe("281 | 356 | 0965");
  });
});

describe("booking estimate", () => {
  it("adds processing on top of Showcase and keeps a promo from going below zero", () => {
    const showcase = estimateBookingCharge({ selectedService: "listing-showcase" });
    expect(showcase.processing).toBe(15.37);
    expect(showcase.total).toBe(564.37);
    const free = estimateBookingCharge({
      selectedService: "listing-showcase",
      promo: { code: "BIG", discount: 1000 },
    });
    expect(free.processing).toBe(0);
    expect(free.total).toBe(0);
  });

  it("adds 2.8% on top of a $75 booking and keeps travel and promo outside the wrong base", () => {
    expect(processingFee(75)).toBe(2.1);
    expect(processingFeeCents(7500)).toBe(210);
    expect(processingFeeCents(17)).toBe(0);
    expect(processingFeeCents(18)).toBe(1);
    const estimate = estimateBookingCharge({ selectedBasics: ["apprentice-25"] });
    expect(calculateSidebarTotal({ selectedBasics: ["apprentice-25"] })).toBe(75);
    expect(estimate.processingBase).toBe(75);
    expect(estimate.processing).toBe(2.1);
    expect(estimate.total).toBe(77.1);

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

    const off = estimateBookingCharge({ selectedBasics: ["apprentice-25"] }, 0, false);
    expect(off.processing).toBe(0);
    expect(off.total).toBe(75);
    expect(BOOKING_PROCESSING_LABEL).toBe("Processing (2.8%)");
  });
});

describe("processing impact fixture", () => {
  it("lists open invoices and skips paid and comped ones", () => {
    const report = processingImpactFixtureScan();
    expect(report.count).toBe(3);
    const showcase = report.rows.find((row) => row.id === "legacy-showcase");
    expect(showcase).toMatchObject({
      currentTotal: 549,
      amountDue: 549,
      storedProcessing: 0,
      proposedProcessing: 15.37,
      proposedTotal: 564.37,
      delta: 15.37,
    });
    const charged = report.rows.find((row) => row.id === "already-charged");
    expect(charged?.delta).toBe(0);
    expect(report.rows.some((row) => row.id === "paid-skip")).toBe(false);
    expect(report.rows.some((row) => row.id === "comped-skip")).toBe(false);
    const text = formatProcessingImpactReport(report, "fixture");
    expect(text).toContain("Read only");
    expect(text).toContain("Drew Feig");
    expect(text).not.toContain("set(");
  });
});

describe("invoice logo file", () => {
  it("keeps the web logo transparent, about 600px wide, and under 150KB", () => {
    const png = readFileSync(new URL("../public/media/logos/iconic-graffiti-logo.png", import.meta.url));
    const webp = statSync(new URL("../public/media/logos/iconic-graffiti-logo.webp", import.meta.url));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(600);
    expect(png.length).toBeLessThan(150_000);
    expect(webp.size).toBeLessThan(150_000);
  });
});
