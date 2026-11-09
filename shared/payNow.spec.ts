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

describe("Pay Now $5 savings after processing", () => {
  it("keeps the discount at 500 cents", () => {
    expect(PAY_NOW_DISCOUNT_CENTS).toBe(500);
    expect(PAY_NOW_OPTION_LABEL).toBe("Pay Now (save $5)");
    expect(PAY_NOW_SAVINGS_LABEL).toBe("Pay Now savings");
    expect(dollarsToCents(139)).toBe(13900);
  });

  it("charges $139 plus processing, then subtracts $5", () => {
    const on = quotePayNow({ packageCents: 13900, processingOn: true, processingPercent: 2.8 });
    expect(on.processingCents).toBe(processingFeeCents(13900, 2.8));
    expect(on.processingCents).toBe(389);
    expect(on.totalBeforeSavingsCents).toBe(14289);
    expect(on.discountCents).toBe(500);
    expect(on.totalCents).toBe(13789);

    const off = quotePayNow({ packageCents: 13900, processingOn: false, processingPercent: 2.8 });
    expect(off.processingCents).toBe(0);
    expect(off.discountCents).toBe(500);
    expect(off.totalCents).toBe(13400);
  });

  it("floors the final total at $0", () => {
    const under = quotePayNow({ packageCents: 400, processingOn: true, processingPercent: 2.8 });
    expect(under.processingCents).toBe(processingFeeCents(400, 2.8));
    expect(under.totalBeforeSavingsCents).toBe(under.packageCents + under.processingCents);
    expect(under.discountCents).toBe(under.totalBeforeSavingsCents);
    expect(under.totalCents).toBe(0);

    const bare = quotePayNow({ packageCents: 300, processingOn: false });
    expect(bare.discountCents).toBe(300);
    expect(bare.totalCents).toBe(0);
    expect(payNowDiscountCents(0)).toBe(0);
    expect(payNowDiscountCents(-100)).toBe(0);
  });

  it("stores package, then processing, then Pay Now savings", () => {
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
    expect(names.indexOf("Photos Only — 18 photos")).toBeLessThan(names.indexOf("Processing"));
    expect(names.indexOf("Processing")).toBeLessThan(names.indexOf(PAY_NOW_SAVINGS_LABEL));
    expect(sale.lineItems.find((item) => item.id === PAY_NOW_LINE_ID)).toMatchObject({
      name: PAY_NOW_SAVINGS_LABEL,
      price: -5,
    });
    expect(sale.processing).toBe(3.89);
    expect(sale.total).toBe(137.89);
    expect(payNowSquareLines(sale.lineItems)).toEqual([
      { name: "Photos Only — 18 photos", amountCents: 13900 },
      { name: "Processing", amountCents: 389 },
      { name: PAY_NOW_SAVINGS_LABEL, amountCents: -500 },
    ]);
  });
});
