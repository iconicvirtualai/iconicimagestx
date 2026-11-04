import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { applyPayAtCloseWebhook, createTitusCheckout, verifyPayAtCloseWebhook } from "./payAtClose.ts";

describe("Titus adapter", () => {
  it("sends the API key only as x-api-key and does not echo it", async () => {
    const key = "sk_test_do_not_log";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let headers: Record<string, string> = {};
    let body = "";
    const result = await createTitusCheckout({
      invoiceId: "inv-1",
      amount: 899,
      description: "Iconic Images inv-1",
      successUrl: "https://www.iconicimagestx.com/invoice/inv-1?paid=1",
      cancelUrl: "https://www.iconicimagestx.com/invoice/inv-1",
    }, {
      env: { PAY_AT_CLOSE_API_KEY: key, PAY_AT_CLOSE_API_BASE_URL: "https://api.gotitus.dev" },
      fetchImpl: async (url, init) => {
        headers = init?.headers || {};
        body = init?.body || "";
        expect(url).toBe("https://api.gotitus.dev/v1/checkouts");
        return { ok: false, status: 401, json: async () => ({ message: `bad ${key}` }) };
      },
    });
    expect(headers["x-api-key"]).toBe(key);
    expect(headers["idempotency-key"]).toBe("pac-inv-1");
    expect(JSON.parse(body).orderId).toBe("inv-1");
    expect(JSON.parse(body).payNowEnabled).toBe(false);
    expect(result).toEqual({ ok: false, error: "Pay at Close checkout could not be started." });
    expect(JSON.stringify(result)).not.toContain(key);
    expect(error.mock.calls.map((call) => call.join(" ")).join("\n")).not.toContain(key);
    error.mockRestore();
  });

  it("refuses the live Titus host while PAY_AT_CLOSE_LIVE is off", async () => {
    const result = await createTitusCheckout({
      invoiceId: "inv-1",
      amount: 10,
      description: "nope",
      successUrl: "https://www.iconicimagestx.com/invoice/inv-1",
      cancelUrl: "https://www.iconicimagestx.com/invoice/inv-1",
    }, {
      env: { PAY_AT_CLOSE_API_KEY: "sk_live_secret", PAY_AT_CLOSE_API_BASE_URL: "https://api.gotitus.com" },
      fetchImpl: async () => {
        throw new Error("live Titus was called");
      },
    });
    expect(result.ok).toBe(false);
  });

  it("updates the same invoice from a signed checkout.updated and ignores a duplicate", async () => {
    const secret = "whsec_test";
    const raw = JSON.stringify({
      type: "checkout.updated",
      createdAt: "2026-11-04T00:00:00.000Z",
      payload: {
        id: "chk_1",
        orderId: "inv-1",
        status: "succeeded",
        amount: 899,
        updatedAt: "2026-11-04T00:05:00.000Z",
      },
    });
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
    const saved: Record<string, unknown>[] = [];
    const payments: unknown[] = [];
    let mirrors = 0;
    const deps = {
      env: { PAY_AT_CLOSE_WEBHOOK_SECRET: secret },
      now: Number(timestamp),
      findInvoiceById: async (id: string) => ({ id, data: { total: 899, amountDue: 899, amountPaid: 0, orderId: "ord-1", clientName: "Ada" } }),
      findInvoiceByCheckoutId: async () => null,
      save: async (_id: string, patch: Record<string, unknown>) => {
        saved.push(patch);
      },
      applyPayment: async (input: unknown) => {
        payments.push(input);
        return { duplicate: payments.length > 1 };
      },
      recordRefund: async () => ({ duplicate: false }),
      mirrorSquare: async () => {
        mirrors += 1;
      },
    };
    const first = await applyPayAtCloseWebhook(raw, { signature, timestamp }, deps);
    expect(first.status).toBe(200);
    expect(first.body.settlement).toBe("paid");
    expect(payments).toEqual([expect.objectContaining({ invoiceId: "inv-1", amount: 899, titusCheckoutId: "chk_1" })]);
    expect(mirrors).toBe(1);

    const again = await applyPayAtCloseWebhook(raw, { signature, timestamp }, {
      ...deps,
      applyPayment: async () => ({ duplicate: true }),
    });
    expect(again.body.duplicate).toBe(true);
    expect(mirrors).toBe(1);

    const bad = verifyPayAtCloseWebhook(raw, { signature: "nope", timestamp }, deps.env, Number(timestamp));
    expect(bad.ok).toBe(false);
  });
});
