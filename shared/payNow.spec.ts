import { describe, expect, it } from "vitest";
import { buildBookingInvoiceDraft } from "./bookingInvoice";
import { processingFeeCents } from "./invoiceProcessing";
import {
  PAY_NOW_DISCOUNT_CENTS,
  PAY_NOW_LINE_ID,
  PAY_NOW_OPTION_LABEL,
  PAY_NOW_SAVINGS_LABEL,
  applyPayNowSavings,
  dollarsToCents,
  payNowDiscountCents,
  payNowSquareLines,
  quotePayNow,
} from "./payNow";

describe("Pay Now savings before processing", () => {
  it("keeps the discount at 500 cents", () => {
    expect(PAY_NOW_DISCOUNT_CENTS).toBe(500);
    expect(PAY_NOW_OPTION_LABEL).toBe("Pay Now (save $5)");
    expect(PAY_NOW_SAVINGS_LABEL).toBe("Pay Now savings");
    expect(dollarsToCents(139)).toBe(13900);
  });

  it("charges processing on the subtotal after the $5 savings", () => {
    const on = quotePayNow({ packageCents: 13900, processingOn: true, processingPercent: 2.8 });
    expect(on.subtotalCents).toBe(13400);
    expect(on.processingCents).toBe(processingFeeCents(13400, 2.8));
    expect(on.processingCents).toBe(375);
    expect(on.discountCents).toBe(500);
    expect(on.totalCents).toBe(13775);

    const off = quotePayNow({ packageCents: 13900, processingOn: false, processingPercent: 2.8 });
    expect(off.processingCents).toBe(0);
    expect(off.discountCents).toBe(500);
    expect(off.subtotalCents).toBe(13400);
    expect(off.totalCents).toBe(13400);
  });

  it("prices Hollywood with Zone 2 travel as 244.00, 6.83, and 250.83", () => {
    const traveled = quotePayNow({
      packageCents: 19900,
      travelCents: 5000,
      processingOn: true,
      processingPercent: 2.8,
    });
    expect(traveled.subtotalCents).toBe(24400);
    expect(traveled.processingCents).toBe(683);
    expect(traveled.totalCents).toBe(25083);
    expect(traveled.discountCents).toBe(500);

    const home = quotePayNow({ packageCents: 19900, processingOn: true, processingPercent: 2.8 });
    expect(home.subtotalCents).toBe(19400);
    expect(home.processingCents).toBe(543);
    expect(home.totalCents).toBe(19943);
  });

  it("floors the final total at $0", () => {
    const under = quotePayNow({ packageCents: 400, processingOn: true, processingPercent: 2.8 });
    expect(under.subtotalCents).toBe(0);
    expect(under.processingCents).toBe(0);
    expect(under.discountCents).toBe(400);
    expect(under.totalCents).toBe(0);

    const bare = quotePayNow({ packageCents: 300, processingOn: false });
    expect(bare.discountCents).toBe(300);
    expect(bare.totalCents).toBe(0);
    expect(payNowDiscountCents(0)).toBe(0);
    expect(payNowDiscountCents(-100)).toBe(0);
  });

  it("stores the package, then Pay Now savings, then processing", () => {
    const draft = buildBookingInvoiceDraft({
      lineItems: [{ name: "Photos Only — 18 photos", unitPrice: 139, qty: 1, price: 139 }],
      total: 139,
      clientEmail: "ada@example.com",
      clientName: "Ada Lovelace",
      applyProcessing: true,
      processingPercent: 2.8,
    });
    const sale = applyPayNowSavings(draft);
    const names = sale.lineItems.map((item) => item.name);
    expect(names.indexOf("Photos Only — 18 photos")).toBeLessThan(names.indexOf(PAY_NOW_SAVINGS_LABEL));
    expect(names.indexOf(PAY_NOW_SAVINGS_LABEL)).toBeLessThan(names.indexOf("Processing"));
    expect(sale.lineItems.find((item) => item.id === PAY_NOW_LINE_ID)).toMatchObject({
      name: PAY_NOW_SAVINGS_LABEL,
      price: -5,
    });
    expect(sale.subtotal).toBe(134);
    expect(sale.processing).toBe(3.75);
    expect(sale.total).toBe(137.75);
    expect(payNowSquareLines(sale.lineItems)).toEqual([
      { name: "Photos Only — 18 photos", amountCents: 13900 },
      { name: PAY_NOW_SAVINGS_LABEL, amountCents: -500 },
      { name: "Processing", amountCents: 375 },
    ]);
  });

  it("keeps Zone 2 travel on its own line and inside the subtotal", () => {
    const draft = buildBookingInvoiceDraft({
      lineItems: [{ id: "hollywood", name: "Hollywood", unitPrice: 199, qty: 1, price: 199 }],
      total: 199,
      travel: { travelZone: 2, travelMiles: 22.47, travelFeeCents: 5000, travelQuoted: false },
      clientEmail: "ada@example.com",
      clientName: "Ada Lovelace",
      applyProcessing: true,
      processingPercent: 2.8,
    });
    const sale = applyPayNowSavings(draft, { processingPercent: 2.8 });
    const travel = sale.lineItems.find((item) => item.name.includes("Zone 2"));
    expect(travel?.price).toBe(50);
    expect(sale.subtotal).toBe(244);
    expect(sale.processing).toBe(6.83);
    expect(sale.total).toBe(250.83);
    expect(payNowSquareLines(sale.lineItems).reduce((sum, line) => sum + line.amountCents, 0)).toBe(25083);
  });
});
