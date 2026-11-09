import { describe, expect, it } from "vitest";
import { buildBookingInvoiceDraft } from "./bookingInvoice";
import { processingFeeCents } from "./invoiceProcessing";
import {
  PAY_NOW_DISCOUNT_CENTS,
  PAY_NOW_LINE_ID,
  PAY_NOW_OPTION_LABEL,
  dollarsToCents,
  payNowDiscountCents,
  payNowDiscountLine,
  quotePayNow,
} from "./payNow";

describe("Pay Now $5 discount", () => {
  it("keeps the discount at 500 cents", () => {
    expect(PAY_NOW_DISCOUNT_CENTS).toBe(500);
    expect(PAY_NOW_OPTION_LABEL).toBe("Pay Now (save $5)");
    expect(dollarsToCents(139)).toBe(13900);
  });

  it("turns a $139 package into a $134 subtotal before processing", () => {
    const on = quotePayNow({ packageCents: 13900, processingOn: true, processingPercent: 2.8 });
    expect(on.discountCents).toBe(500);
    expect(on.subtotalBeforeProcessingCents).toBe(13400);
    expect(on.processingCents).toBe(processingFeeCents(13400, 2.8));
    expect(on.processingCents).toBe(375);
    expect(on.totalCents).toBe(13775);

    const off = quotePayNow({ packageCents: 13900, processingOn: false, processingPercent: 2.8 });
    expect(off.subtotalBeforeProcessingCents).toBe(13400);
    expect(off.processingCents).toBe(0);
    expect(off.totalCents).toBe(13400);
  });

  it("floors a package under $5 at $0", () => {
    const under = quotePayNow({ packageCents: 400, processingOn: true, processingPercent: 2.8 });
    expect(under.discountCents).toBe(400);
    expect(under.subtotalBeforeProcessingCents).toBe(0);
    expect(under.processingCents).toBe(0);
    expect(under.totalCents).toBe(0);

    expect(payNowDiscountCents(0)).toBe(0);
    expect(payNowDiscountCents(-100)).toBe(0);
    expect(quotePayNow({ packageCents: 0, processingOn: true }).totalCents).toBe(0);
    expect(payNowDiscountLine(0)).toBeNull();
    expect(payNowDiscountLine(4)?.price).toBe(-4);
    expect(payNowDiscountLine(139)?.price).toBe(-5);
  });

  it("stores the discount as its own line and computes processing on $134", () => {
    const line = payNowDiscountLine(139);
    expect(line).toMatchObject({ id: PAY_NOW_LINE_ID, name: PAY_NOW_OPTION_LABEL, price: -5 });
    const draft = buildBookingInvoiceDraft({
      lineItems: [
        { name: "Photos Only — 18 photos", unitPrice: 139, qty: 1, price: 139 },
        line,
      ],
      total: 134,
      clientEmail: "ada@example.com",
      clientName: "Ada Lovelace",
      applyProcessing: true,
      processingPercent: 2.8,
    });
    expect(draft.lineItems.find((item) => item.id === PAY_NOW_LINE_ID)?.price).toBe(-5);
    expect(draft.processing).toBe(3.75);
    expect(draft.total).toBe(137.75);
  });
});
