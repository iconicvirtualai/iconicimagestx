import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBookingInvoiceDraft } from "./bookingInvoice.ts";
import { packagesForStaffEditor } from "./bookingCatalog.ts";
import { mergePricingAdjustments } from "./pricingSettings.ts";
import {
  PAY_AT_CLOSE_FEE_LINE_ID,
  PAY_AT_CLOSE_PRICING_LINE_NAME,
  PAY_AT_CLOSE_METHOD,
  PAY_AT_CLOSE_PENDING_STATUS,
  PAY_AT_CLOSE_WEBHOOK_EVENTS,
  PAY_AT_CLOSE_WEBHOOK_URL,
  TITUS_PRODUCTION_API_BASE,
  TITUS_STAGING_API_BASE,
  interpretPayAtCloseWebhook,
  isMirroredPayAtCloseSquarePayment,
  payAtCloseApiBaseUrl,
  payAtCloseBaseUrlDecision,
  payAtCloseCustomerOffer,
  payAtCloseFeeDollars,
  payAtCloseListedPrice,
  payAtCloseLive,
  payAtClosePublicOffer,
  payAtCloseSettlement,
  payAtCloseSignatureExpected,
  payAtCloseSignaturesMatch,
  payAtCloseTimestampMs,
  premiumCatalogPackages,
  shapePayAtCloseDraft,
  titusCheckoutBody,
  titusProjectFromAddress,
} from "./payAtClose.ts";

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("Pay at Close gates and prices", () => {
  it("stays off unless PAY_AT_CLOSE_LIVE is exactly true and the office row is on", () => {
    const adjustments = mergePricingAdjustments([]);
    expect(payAtCloseLive({})).toBe(false);
    expect(payAtCloseLive({ PAY_AT_CLOSE_LIVE: "false" })).toBe(false);
    expect(payAtCloseLive({ PAY_AT_CLOSE_LIVE: " true " })).toBe(false);
    expect(payAtClosePublicOffer({}, adjustments)).toMatchObject({
      offered: false,
      enabledByOffice: true,
      feeMode: "percent",
      feeRate: 6,
    });
    expect(payAtClosePublicOffer({ PAY_AT_CLOSE_LIVE: "true" }, adjustments).offered).toBe(true);
    const customer = payAtCloseCustomerOffer(payAtClosePublicOffer({ PAY_AT_CLOSE_LIVE: "true" }, adjustments));
    expect(customer.offered).toBe(true);
    expect(customer.feeRate).toBe(0);
    expect(payAtCloseListedPrice(549, customer)).toBe(549);
    const off = mergePricingAdjustments([{ id: "pay-at-close", active: false }]);
    expect(payAtClosePublicOffer({ PAY_AT_CLOSE_LIVE: "true" }, off).offered).toBe(false);
    const flat = mergePricingAdjustments([{ id: "pay-at-close", active: true, mode: "flat", amount: 25 }]);
    expect(payAtClosePublicOffer({}, flat).offered).toBe(false);
    expect(payAtClosePublicOffer({ PAY_AT_CLOSE_LIVE: "true" }, flat)).toMatchObject({
      offered: true,
      enabledByOffice: true,
      feeMode: "flat",
      feeRate: 25,
      chargeCardProcessing: false,
    });
  });

  it("defaults the API to staging and blocks the live host while the flag is off", () => {
    expect(payAtCloseApiBaseUrl({})).toBe(TITUS_STAGING_API_BASE);
    expect(payAtCloseApiBaseUrl({ PAY_AT_CLOSE_API_BASE_URL: "https://api.gotitus.dev/" })).toBe(TITUS_STAGING_API_BASE);
    expect(payAtCloseBaseUrlDecision({ PAY_AT_CLOSE_API_BASE_URL: TITUS_PRODUCTION_API_BASE }).ok).toBe(false);
    expect(payAtCloseBaseUrlDecision({
      PAY_AT_CLOSE_API_BASE_URL: TITUS_PRODUCTION_API_BASE,
      PAY_AT_CLOSE_LIVE: "true",
    })).toEqual({ ok: true, base: TITUS_PRODUCTION_API_BASE });
  });

  it("drops the card processing fee unless that Prices row is on, and adds only the saved fee", () => {
    const draft = buildBookingInvoiceDraft({
      lineItems: [{ id: "listing-legacy", name: "The Legacy", unitPrice: 899, qty: 1, price: 899 }],
      total: 899,
      pricing: { subtotal: 899, tax: 0 },
      clientEmail: "agent@example.com",
      clientName: "Ada Agent",
      applyProcessing: true,
      processingPercent: 2.8,
    });
    expect(draft.processing).toBeGreaterThan(0);
    const shaped = shapePayAtCloseDraft(draft, {
      feeRate: 0,
      feeMode: "flat",
      chargeCardProcessing: false,
    });
    expect(shaped.lineItems.some((item) => item.id === "adjustment-processing")).toBe(false);
    expect(shaped.total).toBe(899);
    expect(shaped.status).toBe(PAY_AT_CLOSE_PENDING_STATUS);
    expect(shaped.paymentMethod).toBe(PAY_AT_CLOSE_METHOD);
    expect(shaped.payAtCloseFee).toBe(0);

    const withFee = shapePayAtCloseDraft(draft, {
      feeRate: 10,
      feeMode: "percent",
      chargeCardProcessing: false,
    });
    expect(payAtCloseFeeDollars(10, "percent", 899)).toBe(90);
    const pricingLine = withFee.lineItems.find((item) => item.id === PAY_AT_CLOSE_FEE_LINE_ID);
    expect(pricingLine).toMatchObject({ name: PAY_AT_CLOSE_PRICING_LINE_NAME, price: 90 });
    expect(withFee.total).toBe(989);
    expect(titusCheckoutBody({
      invoiceId: "inv-1",
      amount: withFee.total,
      description: "Iconic",
      successUrl: "https://www.iconicimagestx.com/invoice/inv-1",
      cancelUrl: "https://www.iconicimagestx.com/invoice/inv-1",
      idempotencyKey: "pac-inv-1",
    }).amount).toBe(withFee.total);

    const withCard = shapePayAtCloseDraft(draft, {
      feeRate: 0,
      feeMode: "flat",
      chargeCardProcessing: true,
    });
    expect(withCard.processing).toBe(draft.processing);
    expect(withCard.total).toBe(draft.total);
  });

  it("picks the top catalog prices and does not invent a number", () => {
    const top = premiumCatalogPackages(packagesForStaffEditor([]), 4);
    expect(top.map((item) => item.name)).toEqual([
      "The Local Legend",
      "The Market Leader",
      "The Content Partner",
      "The Legacy",
    ]);
    expect(top.every((item) => item.price > 0)).toBe(true);
    const changed = packagesForStaffEditor([{ id: "listing-market-leader", price: 5000, name: "The Market Leader", isActive: true }]);
    expect(premiumCatalogPackages(changed, 1)[0]).toMatchObject({ id: "listing-market-leader", price: 5000 });
  });
});

describe("Titus checkout and webhooks", () => {
  it("builds a pay-at-close-only checkout tied to our invoice id", () => {
    const body = titusCheckoutBody({
      invoiceId: "inv-1",
      orderId: "ord-1",
      amount: 899,
      description: "Iconic Images INV-1",
      successUrl: "https://www.iconicimagestx.com/invoice/inv-1?paid=1",
      cancelUrl: "https://www.iconicimagestx.com/invoice/inv-1",
      idempotencyKey: "pac-inv-1",
      externalCustomerId: "agent@example.com",
      project: titusProjectFromAddress({
        address: "100 Main St, Spring, TX 77380",
        firstName: "Ada",
        lastName: "Agent",
        email: "agent@example.com",
        phone: "(281) 555-0100",
      }),
    });
    expect(body.orderId).toBe("inv-1");
    expect(body.payNowEnabled).toBe(false);
    expect(body.prefillData).toEqual({ preferredPaymentMethod: "pay-at-close" });
    expect(body.metadata).toEqual({ invoiceId: "inv-1", orderId: "ord-1" });
    expect(body.project).toMatchObject({
      address: { addressLine1: "100 Main St", city: "Spring", state: "TX", zip: "77380" },
      contact: { phone: "2815550100", workEmail: "agent@example.com" },
    });
    expect(body).not.toHaveProperty("businessId");
  });

  it("verifies the raw-body signature and rejects a stale timestamp", () => {
    const raw = JSON.stringify({ type: "checkout.updated", payload: { id: "chk_1" } });
    const timestamp = "1700000000000";
    const secret = "whsec_test";
    const signature = payAtCloseSignatureExpected(secret, timestamp, raw, hmacHex);
    expect(payAtCloseSignaturesMatch(signature, signature)).toBe(true);
    expect(payAtCloseSignaturesMatch(signature, `${signature.slice(0, -1)}a`)).toBe(false);
    expect(payAtCloseTimestampMs(timestamp, 1700000000000)).toBe(1700000000000);
    expect(payAtCloseTimestampMs(timestamp, 1700000000000 + 6 * 60 * 1000)).toBeNull();
    expect(PAY_AT_CLOSE_WEBHOOK_URL).toBe("https://www.iconicimagestx.com/api/payments/pay-at-close-webhook");
    expect(PAY_AT_CLOSE_WEBHOOK_EVENTS).toContain("checkout.updated");
    expect(PAY_AT_CLOSE_WEBHOOK_EVENTS).toContain("checkout.payment_failed");
  });

  it("settles the same invoice from checkout status and does not treat a Square mirror as a second payment", () => {
    const succeeded = interpretPayAtCloseWebhook({
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
    expect(succeeded).toMatchObject({ type: "checkout", invoiceId: "inv-1", checkoutId: "chk_1", checkoutStatus: "succeeded", amount: 899 });
    if (succeeded.type === "checkout") expect(payAtCloseSettlement(succeeded, 899)).toBe("paid");

    const failed = interpretPayAtCloseWebhook({
      type: "checkout.payment_failed",
      payload: { id: "chk_1", orderId: "inv-1", status: "requires-payment", amount: 899, lastPaymentError: { code: "payment_failed", message: "Returned." } },
    });
    if (failed.type === "checkout") expect(payAtCloseSettlement(failed, 899)).toBe("failed");

    const denied = interpretPayAtCloseWebhook({
      type: "checkout.loan_application_denied",
      payload: { id: "chk_1", deniedAt: "2026-11-04T00:00:00.000Z" },
    });
    expect(denied).toMatchObject({ type: "checkout", application: "denied", checkoutId: "chk_1" });

    const refund = interpretPayAtCloseWebhook({
      type: "refund.updated",
      payload: { id: "ref_1", checkoutId: "chk_1", amount: 100, status: "completed" },
    });
    expect(refund).toMatchObject({ type: "refund", refundId: "ref_1", refundStatus: "completed", amount: 100 });

    expect(isMirroredPayAtCloseSquarePayment(
      { source_type: "EXTERNAL" },
      { paymentMethod: PAY_AT_CLOSE_METHOD, titusCheckoutId: "chk_1" },
    )).toBe(true);
    expect(isMirroredPayAtCloseSquarePayment({ source_type: "CARD" }, { paymentMethod: PAY_AT_CLOSE_METHOD })).toBe(false);
  });
});
