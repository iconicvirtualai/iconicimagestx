import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceFaceFromStored } from "./invoiceFace";
import { amountStillDue } from "./paymentAccess";
import {
  checkoutAmountDue,
  formatInvoiceDisplayDate,
  invoiceBlankRowCount,
  invoiceProcessingMode,
  presentInvoiceMoney,
  processingFee,
  saleSubtotal,
  squareOrderForProcessingMode,
  storedProcessingAmount,
} from "./invoiceProcessing";

const showcase = {
  lineItems: [{ name: "The Showcase", qty: 1, unitPrice: 549, price: 549 }],
  subtotal: 549,
  total: 549,
  amountPaid: 0,
  amountDue: 549,
  status: "sent",
};

describe("processingFee", () => {
  it("rounds 2.8% of the subtotal to cents", () => {
    expect(processingFee(549)).toBe(15.37);
    expect(processingFee(100)).toBe(2.8);
    expect(processingFee(10)).toBe(0.28);
    expect(processingFee(1)).toBe(0.03);
    expect(processingFee(0)).toBe(0);
    expect(processingFee(-20)).toBe(0);
    expect(processingFee(Number.NaN)).toBe(0);
  });
});

describe("invoice processing mode", () => {
  it("defaults to display and accepts only charge as the other mode", () => {
    expect(invoiceProcessingMode({})).toBe("display");
    expect(invoiceProcessingMode({ INVOICE_PROCESSING_MODE: "" })).toBe("display");
    expect(invoiceProcessingMode({ INVOICE_PROCESSING_MODE: "display" })).toBe("display");
    expect(invoiceProcessingMode({ INVOICE_PROCESSING_MODE: "nope" })).toBe("display");
    expect(invoiceProcessingMode({ INVOICE_PROCESSING_MODE: " CHARGE " })).toBe("charge");
  });

  it("formats the template date", () => {
    expect(formatInvoiceDisplayDate("2027-01-01")).toBe("JAN. 01, 2027");
    expect(formatInvoiceDisplayDate("2027-01-01T00:00:00.000Z")).toBe("JAN. 01, 2027");
    expect(formatInvoiceDisplayDate("")).toBe("");
  });

  it("pads a short line-item table without padding a long one", () => {
    expect(invoiceBlankRowCount(1)).toBe(5);
    expect(invoiceBlankRowCount(4)).toBe(2);
    expect(invoiceBlankRowCount(6)).toBe(0);
    expect(invoiceBlankRowCount(9)).toBe(0);
  });
});

describe("presented totals", () => {
  const face = invoiceFaceFromStored(showcase);

  it("shows 2.8% in display mode and keeps the total equal to checkout", () => {
    const shown = presentInvoiceMoney(face, "display");
    expect(shown.presentation).toBe("included");
    expect(shown.processing).toBe(15.37);
    expect(shown.total).toBe(549);
    expect(shown.total).toBe(face.total);
    expect(checkoutAmountDue(showcase, "display")).toBe(amountStillDue(showcase));
    expect(shown.total).toBe(checkoutAmountDue(showcase, "display"));
  });

  it("adds 2.8% in charge mode to the total and the checkout amount", () => {
    const shown = presentInvoiceMoney(face, "charge");
    expect(shown.presentation).toBe("added");
    expect(shown.processing).toBe(15.37);
    expect(shown.total).toBe(564.37);
    expect(shown.amountDue).toBe(564.37);
    expect(checkoutAmountDue(showcase, "charge")).toBe(564.37);
    expect(shown.total).toBe(checkoutAmountDue(showcase, "charge"));
  });

  it("does not add 2.8% when processing is already stored on the invoice", () => {
    const stored = {
      ...showcase,
      processing: 6,
      total: 555,
      amountDue: 555,
    };
    const faceStored = invoiceFaceFromStored(stored);
    expect(storedProcessingAmount(stored)).toBe(6);
    expect(presentInvoiceMoney(faceStored, "display").presentation).toBe("stored");
    expect(presentInvoiceMoney(faceStored, "charge")).toMatchObject({
      presentation: "stored",
      processing: 6,
      total: 555,
    });
    expect(checkoutAmountDue(stored, "charge")).toBe(amountStillDue(stored));
    expect(checkoutAmountDue(stored, "charge")).toBe(555);
  });

  it("adds the fee to the remaining balance after a partial payment", () => {
    const partial = { ...showcase, amountPaid: 100, amountDue: 449 };
    const shown = presentInvoiceMoney(invoiceFaceFromStored(partial), "charge");
    expect(shown.total).toBe(564.37);
    expect(shown.amountDue).toBe(464.37);
    expect(checkoutAmountDue(partial, "charge")).toBe(464.37);
    expect(checkoutAmountDue(partial, "display")).toBe(449);
  });

  it("leaves a paid invoice at zero in both modes", () => {
    const paid = { ...showcase, status: "paid", amountPaid: 549, amountDue: 0 };
    expect(checkoutAmountDue(paid, "display")).toBe(0);
    expect(checkoutAmountDue(paid, "charge")).toBe(0);
  });

  it("gives Square the stored total in display mode and the fee in charge mode", () => {
    const lines = showcase.lineItems;
    const displayOrder = squareOrderForProcessingMode(showcase, "display");
    expect(displayOrder.total).toBe(549);
    expect(displayOrder.added).toBe(0);
    expect(displayOrder.lineItems).toBe(lines);

    const chargeOrder = squareOrderForProcessingMode({ lineItems: lines, total: 549 }, "charge");
    expect(chargeOrder.added).toBe(processingFee(saleSubtotal({ lineItems: lines })));
    expect(chargeOrder.total).toBe(564.37);
    expect(Array.isArray(chargeOrder.lineItems)).toBe(true);
    expect(chargeOrder.lineItems).not.toBe(lines);
    expect(lines).toHaveLength(1);
  });
});

describe("invoice logo files", () => {
  it("keeps the web logo transparent, about 600px wide, and under 150KB", () => {
    const pngPath = new URL("../public/media/logos/iconic-graffiti-logo.png", import.meta.url);
    const webpPath = new URL("../public/media/logos/iconic-graffiti-logo.webp", import.meta.url);
    const png = readFileSync(pngPath);
    expect(statSync(pngPath).size).toBeLessThan(150_000);
    expect(statSync(webpPath).size).toBeLessThan(150_000);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(600);
  });
});
