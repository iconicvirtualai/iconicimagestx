import { describe, expect, it } from "vitest";
import { createHolidaySquareCheckout } from "./holidaySquareCheckout";

describe("holiday Square payment link", () => {
  it("keeps the current fallback when Square env vars are missing", async () => {
    const result = await createHolidaySquareCheckout({
      invoiceId: "inv-1",
      amount: 99,
      itemName: "Social Saves",
      leadSource: "Thankful social saves",
      orderNumber: "#010",
      env: {},
      fetchImpl: (() => {
        throw new Error("Square should not be called");
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({
      payment: "fallback",
      missingEnv: ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"],
    });
  });

  it("returns the Square link URL and does not wrap it", async () => {
    let posted: { url: string; body: Record<string, unknown> } | null = null;
    const result = await createHolidaySquareCheckout({
      invoiceId: "inv-2",
      invoiceNumber: "INV-2026-2",
      amount: 250,
      email: "ops+deliveryqa@iconicimagestx.com",
      itemName: "The Baseline",
      leadSource: "Thankful social saves",
      orderNumber: "#011",
      env: {
        SQUARE_ACCESS_TOKEN: "sq-test",
        SQUARE_LOCATION_ID: "LOC",
        SQUARE_ENVIRONMENT: "sandbox",
      },
      fetchImpl: (async (url: string, init?: { body?: string }) => {
        posted = { url: String(url), body: JSON.parse(init?.body || "{}") };
        return {
          ok: true,
          json: async () => ({ payment_link: { id: "link-1", order_id: "order-1", url: "https://square.link/u/holiday" } }),
        };
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({
      payment: "square",
      checkoutUrl: "https://square.link/u/holiday",
      linkId: "link-1",
      squareOrderId: "order-1",
    });
    expect(posted?.url).toBe("https://connect.squareupsandbox.com/v2/online-checkout/payment-links");
    const quick = posted?.body.quick_pay as { price_money: { amount: number } };
    expect(quick.price_money.amount).toBe(25000);
    expect(String(posted?.body.payment_note)).toContain("invoiceId:inv-2");
  });
});
