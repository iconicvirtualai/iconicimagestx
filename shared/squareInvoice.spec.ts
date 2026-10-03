import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMO_DISCOUNTS } from "./bookingCatalog";
import {
  buildSubmittedLineItems,
  orderTotalLabel,
  sumLineItemPrices,
  type BookingPriceInput,
} from "./bookingPricing";
import { squarePaymentNote } from "./paymentAccess";
import {
  buildSquareOrderPricing,
  preferredSquareCheckoutUrl,
  resolveSquareCheckoutUrl,
  squareInvoiceSyncAllowed,
  syncSquareInvoice,
  type SquareClientDeps,
  type SquareInvoiceSource,
} from "./squareInvoice";

const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
const payments = readFileSync(new URL("../server/routes/payments.ts", import.meta.url), "utf8");
const squareService = readFileSync(new URL("../server/services/squareInvoices.ts", import.meta.url), "utf8");
const apiBundle = readFileSync(new URL("../api/index.mjs", import.meta.url), "utf8");

const selection: BookingPriceInput = {
  selectedService: "listing-showcase",
  selectedBasics: ["photos-35"],
  selectedAddOns: ["aerial-drone"],
  promo: { code: "ICONICAI", discount: PROMO_DISCOUNTS.ICONICAI },
  lifeOfTheListingCare: true,
};

const readyEnv = {
  SQUARE_ACCESS_TOKEN: "test-token",
  SQUARE_LOCATION_ID: "LOC",
  SQUARE_ENVIRONMENT: "sandbox",
};

function invoiceFromSelection(overrides: Partial<SquareInvoiceSource> = {}): SquareInvoiceSource {
  const lineItems = buildSubmittedLineItems(selection);
  const total = sumLineItemPrices(lineItems);
  return {
    id: "inv_booking_1",
    clientEmail: "agent@example.com",
    clientName: "Ada Lovelace",
    invoiceNumber: "INV-2026-0001",
    lineItems,
    total,
    paymentProvider: "square",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  };
}

describe("Square order pricing matches the emailed total", () => {
  it("turns promo lines into discounts and keeps the charge cents", () => {
    const lineItems = buildSubmittedLineItems(selection);
    const total = sumLineItemPrices(lineItems);
    const emailed = orderTotalLabel(total);
    const pricing = buildSquareOrderPricing(lineItems, total, squarePaymentNote("inv_booking_1", "INV-2026-0001"));

    expect(total).toBe(763);
    expect(emailed).toBe("$763.00");
    expect(pricing).not.toBeNull();
    expect(pricing?.amountCents).toBe(76300);
    expect(orderTotalLabel(pricing!.amountCents / 100)).toBe(emailed);
    expect(pricing?.lineItems.some((line) => line.base_price_money.amount < 0)).toBe(false);
    expect(pricing?.discounts.map((discount) => discount.amount_money.amount)).toEqual([3500]);
    expect(pricing?.lineItems.some((line) => /life of the listing/i.test(line.name))).toBe(false);
  });

  it("refuses a Square charge that would differ from the invoice total", () => {
    const lineItems = buildSubmittedLineItems(selection);
    expect(buildSquareOrderPricing(lineItems, 10)).toBeNull();
  });
});

describe("Square invoice sync", () => {
  it("does not throw when Square fails and does not change the total", async () => {
    const source = invoiceFromSelection();
    const emailed = orderTotalLabel(source.total);
    const deps: SquareClientDeps = {
      env: readyEnv,
      timeoutMs: 1000,
      fetchImpl: async () => jsonResponse({ errors: [{ detail: "upstream down" }] }, 500),
    };

    const result = await syncSquareInvoice(source, deps);

    expect(result).toEqual({ ok: false, error: "upstream down" });
    expect(orderTotalLabel(source.total)).toBe(emailed);
    expect(emailed).toBe("$763.00");
  });

  it("skips Square when squareInvoiceId is already set", async () => {
    let called = false;
    const deps: SquareClientDeps = {
      env: readyEnv,
      fetchImpl: async () => {
        called = true;
        throw new Error("should not be called");
      },
    };

    const result = await syncSquareInvoice(invoiceFromSelection({ squareInvoiceId: "sq_inv_existing" }), deps);

    expect(result).toEqual({ ok: true, skipped: true, reason: "already-synced" });
    expect(called).toBe(false);
  });

  it("publishes a SHARE_MANUALLY invoice and returns the public URL", async () => {
    const source = invoiceFromSelection();
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const deps: SquareClientDeps = {
      env: readyEnv,
      now: () => new Date("2026-10-01T00:00:00.000Z"),
      fetchImpl: async (url, init) => {
        const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        calls.push({ url, body });
        if (url.endsWith("/v2/customers/search")) return jsonResponse({ customers: [] });
        if (url.endsWith("/v2/customers")) return jsonResponse({ customer: { id: "CUS" } });
        if (url.endsWith("/v2/orders")) return jsonResponse({ order: { id: "ORD" } });
        if (url.endsWith("/v2/invoices")) {
          return jsonResponse({ invoice: { id: "SQINV", version: 0, status: "DRAFT", order_id: "ORD" } });
        }
        if (url.endsWith("/publish")) {
          return jsonResponse({
            invoice: {
              id: "SQINV",
              order_id: "ORD",
              status: "UNPAID",
              public_url: "https://squareup.com/pay-invoice/SQINV",
            },
          });
        }
        return jsonResponse({ errors: [{ detail: "unexpected" }] }, 404);
      },
    };

    const result = await syncSquareInvoice(source, deps);

    expect(result).toEqual({
      ok: true,
      skipped: false,
      squareInvoiceId: "SQINV",
      squareInvoiceUrl: "https://squareup.com/pay-invoice/SQINV",
      squareOrderId: "ORD",
      squareCustomerId: "CUS",
    });
    expect(calls[0].url).toContain("connect.squareupsandbox.com");
    const orderCall = calls.find((call) => call.url.endsWith("/v2/orders"));
    const invoiceCall = calls.find((call) => call.url.endsWith("/v2/invoices"));
    const order = orderCall?.body.order as {
      reference_id: string;
      line_items: Array<{ base_price_money: { amount: number }; quantity: string }>;
      discounts: Array<{ amount_money: { amount: number } }>;
    };
    expect(order.reference_id).toBe(source.id);
    const cents =
      order.line_items.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0) -
      order.discounts.reduce((sum, discount) => sum + discount.amount_money.amount, 0);
    expect(cents).toBe(Math.round(Number(source.total) * 100));
    const invoice = invoiceCall?.body.invoice as { delivery_method: string; description: string };
    expect(invoice.delivery_method).toBe("SHARE_MANUALLY");
    expect(invoice.description).toBe(squarePaymentNote(source.id, source.invoiceNumber));
    expect(calls.filter((call) => call.url.endsWith("/v2/orders")).map((call) => call.body.idempotency_key)).toEqual([
      "ii-ord-inv_booking_1",
    ]);
  });

  it("stops waiting when Square does not respond", async () => {
    const deps: SquareClientDeps = {
      env: readyEnv,
      timeoutMs: 40,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    };

    const started = Date.now();
    const result = await syncSquareInvoice(invoiceFromSelection(), deps);
    expect(result).toEqual({ ok: false, error: "Square invoice sync timed out" });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("checkout prefers the Square invoice URL", () => {
  it("uses a fresh https URL, then the stored URL", () => {
    expect(
      resolveSquareCheckoutUrl({
        freshUrl: "https://squareup.com/pay-invoice/fresh",
        storedUrl: "https://squareup.com/pay-invoice/stored",
      }),
    ).toBe("https://squareup.com/pay-invoice/fresh");
    expect(resolveSquareCheckoutUrl({ freshUrl: null, storedUrl: "https://squareup.com/pay-invoice/stored" })).toBe(
      "https://squareup.com/pay-invoice/stored",
    );
    expect(preferredSquareCheckoutUrl({ squareInvoiceUrl: "http://squareup.com/pay-invoice/nope" })).toBeNull();
    expect(resolveSquareCheckoutUrl({ freshUrl: "", storedUrl: "" })).toBeNull();
  });

  it("keeps the payment-link fallback and its payment note", () => {
    const checkoutStart = payments.indexOf('router.post("/invoice/:id/checkout"');
    const checkoutEnd = payments.indexOf('router.post("/webhook"');
    const checkout = payments.slice(checkoutStart, checkoutEnd);

    expect(checkout.indexOf("resolveSquareCheckoutUrl")).toBeGreaterThan(-1);
    expect(checkout.indexOf("resolveSquareCheckoutUrl")).toBeLessThan(checkout.indexOf("quick_pay"));
    expect(checkout).toContain("payment_note: squarePaymentNote");
    const updateStart = squareService.indexOf("await ref.update({");
    const update = squareService.slice(updateStart, squareService.indexOf("});", updateStart));
    expect(update).toContain("squareInvoiceId: result.squareInvoiceId");
    expect(update).toContain("squareInvoiceUrl: result.squareInvoiceUrl");
    expect(update).toContain("squareOrderId: result.squareOrderId");
    expect(update).not.toContain("total");
    expect(update).not.toContain("amountDue");
    expect(update).not.toContain("lineItems");
  });
});

describe("Square stays off until after the shoot", () => {
  it("allows a Square customer, order, invoice, and publish only after the shoot", () => {
    expect(squareInvoiceSyncAllowed("booking")).toBe(false);
    expect(squareInvoiceSyncAllowed("confirm")).toBe(false);
    expect(squareInvoiceSyncAllowed("post-shoot")).toBe(true);
  });

  it("keeps public booking and staff confirm off Square while the draft and confirmations stay", () => {
    const postStart = bookings.indexOf('router.post("/",');
    const postEnd = bookings.indexOf('router.get("/",');
    const post = bookings.slice(postStart, postEnd);
    const confirmStart = bookings.indexOf('router.patch("/:id/confirm"');
    const confirmEnd = bookings.indexOf('router.patch("/:id/decline"');
    const confirm = bookings.slice(confirmStart, confirmEnd);

    for (const handler of [post, confirm]) {
      expect(handler).not.toContain("attachSquareInvoiceAfterBooking");
      expect(handler).not.toContain("syncSquareInvoice");
      expect(handler).not.toContain("/v2/customers");
      expect(handler).not.toContain("/v2/orders");
      expect(handler).not.toContain("/v2/invoices");
      expect(handler).not.toContain("/publish");
    }

    expect(post).toContain("createBookingInvoiceDraft");
    expect(post).toContain('template: "booking_received"');
    expect(post).toContain('kind: "booking_confirmation"');
    expect(post).toContain("total: money(total)");
    expect(post).toContain("return res.status(201)");
    expect(post).not.toContain("connect.squareup.com");
    expect(post).not.toContain("SQUARE_ACCESS_TOKEN");
    expect(confirm).toContain('template: "order_confirmed"');

    const gateAt = squareService.indexOf("squareInvoiceSyncAllowed");
    const syncAt = squareService.indexOf("syncSquareInvoice(");
    expect(gateAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(gateAt);
    expect(squareService).toContain('reason: "before-shoot"');
    expect(squareService).toContain('phase: SquareInvoiceSyncPhase = "booking"');

    expect(apiBundle).not.toContain("attachSquareInvoiceAfterBooking");
    expect(apiBundle).not.toContain("SHARE_MANUALLY");
    expect(apiBundle).not.toContain("/v2/customers");
    expect(apiBundle).not.toContain("/publish");
    expect(apiBundle).toContain("createBookingInvoiceDraft");
    expect(apiBundle).toContain('template: "booking_received"');
    expect(apiBundle).toContain('kind: "booking_confirmation"');
  });
});
