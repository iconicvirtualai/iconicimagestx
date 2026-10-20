import { describe, expect, it } from "vitest";
import { adjustmentKind } from "./invoiceFace";
import {
  editorLinesFromOrder,
  managedOrderEditorPatch,
  managedOrderWrite,
  priceManagedOrder,
} from "./managedOrderPricing";

const showcase = { id: "listing-showcase", name: "The Showcase", qty: 1, unitPrice: 549, price: 549 };

describe("managed order pricing", () => {
  it("turns the $549 Showcase into a $15.37 fee and a $564.37 total", () => {
    const price = priceManagedOrder({
      lineItems: [showcase],
      processingPolicy: "included",
      applyProcessing: true,
    });
    expect(price.subtotal).toBe(549);
    expect(price.processing).toBe(15.37);
    expect(price.total).toBe(564.37);
    expect(price.amountDue).toBe(564.37);
    expect(price.balanceDue).toBe(564.37);
    expect(price.invoiceLines.some((item) => item.id === "adjustment-processing" && item.price === 15.37)).toBe(true);
    expect(price.orderLines.some((item) => adjustmentKind(item) === "processing")).toBe(false);
    expect(managedOrderWrite(price)).not.toHaveProperty("invoiceId");
  });

  it("keeps travel outside the 2.8% base", () => {
    const price = priceManagedOrder({
      lineItems: [
        showcase,
        { id: "travel-fee", name: "Travel fee — Zone 2", price: 50 },
      ],
      processingPolicy: "included",
      applyProcessing: true,
    });
    expect(price.processing).toBe(15.37);
    expect(price.travel).toBe(50);
    expect(price.total).toBe(614.37);
  });

  it("subtracts a promo once before the fee", () => {
    const price = priceManagedOrder({
      lineItems: [
        showcase,
        { id: "promo-SAVE", name: "Promo Code: SAVE", price: -49 },
      ],
      promoCode: "SAVE",
      promoDiscount: 49,
      processingPolicy: "included",
      applyProcessing: true,
    });
    expect(price.promotions).toBe(49);
    expect(price.processing).toBe(14);
    expect(price.total).toBe(514);
  });

  it("drops the total when a service is removed", () => {
    const withBoth = priceManagedOrder({
      lineItems: [showcase, { name: "Twilight", price: 75 }],
      processingPolicy: "included",
      applyProcessing: true,
    });
    const showcaseOnly = priceManagedOrder({
      lineItems: [showcase],
      processingPolicy: "included",
      applyProcessing: true,
    });
    expect(withBoth.total).toBeGreaterThan(showcaseOnly.total);
    expect(showcaseOnly.total).toBe(564.37);
  });

  it("takes a 50% senior living deposit from the charged total", () => {
    const price = priceManagedOrder({
      lineItems: [showcase],
      source: "senior-living",
      processingPolicy: "included",
      applyProcessing: true,
    });
    expect(price.depositRequired).toBe(true);
    expect(price.depositPercent).toBe(50);
    expect(price.depositAmount).toBe(282.19);
    expect(price.balanceAfterDeposit).toBe(282.18);
    expect(price.balanceDue).toBe(564.37);
  });

  it("ignores a blank row and does not charge processing twice", () => {
    const price = priceManagedOrder({
      lineItems: [
        showcase,
        { name: "", price: 0 },
        { id: "adjustment-processing", name: "Processing", category: "adjustment-processing", price: 15.37 },
      ],
      processingPolicy: "included",
      applyProcessing: true,
    });
    expect(price.subtotal).toBe(549);
    expect(price.processing).toBe(15.37);
    expect(price.total).toBe(564.37);
  });

  it("leaves a legacy order alone until a service row changes", () => {
    const order = {
      lineItems: [showcase],
      total: 549,
      processing: 0,
    };
    expect(managedOrderEditorPatch(order, [showcase]).reprice).toBe(false);
    const next = managedOrderEditorPatch(order, [showcase, { name: "Twilight", price: 75 }]);
    expect(next.reprice).toBe(true);
    expect(next.price?.processing).toBe(17.47);
    expect(next.price?.total).toBe(641.47);
  });

  it("keeps a waived fee at zero when services change", () => {
    const price = managedOrderEditorPatch({
      lineItems: [showcase],
      processingPolicy: "waived",
      processing: 0,
    }, [showcase, { name: "Twilight", price: 75 }]).price;
    expect(price?.processing).toBe(0);
    expect(price?.processingPolicy).toBe("waived");
    expect(price?.total).toBe(624);
  });

  it("turns a stored travel fee into a removable row", () => {
    const lines = editorLinesFromOrder({
      lineItems: [showcase],
      travel: 50,
    });
    expect(lines.map((item) => item.name)).toContain("Travel");
    const removed = lines.filter((item) => item.name !== "Travel");
    const price = managedOrderEditorPatch({
      lineItems: [showcase],
      travel: 50,
    }, removed, lines).price;
    expect(price?.travel).toBe(0);
    expect(price?.total).toBe(564.37);
  });
});
