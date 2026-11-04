/**
 * Server-side Titus adapter.
 * PAY_AT_CLOSE_API_KEY is read from the environment and sent as x-api-key.
 * It is never logged, returned, or written to Firestore.
 *
 * Docs: https://docs.gotitus.com/guide/developer-resources/working-with-the-api
 * Checkout: POST /v1/checkouts
 * Webhook signature: HMAC-SHA256 hex of `${timestamp}.${rawBody}`
 * Headers: x-webhook-signature, x-webhook-timestamp
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PAY_AT_CLOSE_METHOD,
  PAY_AT_CLOSE_PENDING_STATUS,
  interpretPayAtCloseWebhook,
  payAtCloseBaseUrlDecision,
  payAtCloseIdempotencyKey,
  payAtClosePublicOffer,
  payAtCloseSettlement,
  payAtCloseSignatureExpected,
  payAtCloseTimestampMs,
  roundPayAtCloseMoney,
  shapePayAtCloseDraft,
  titusCheckoutBody,
  titusProjectFromAddress,
  type PayAtClosePublicOffer,
  type PayAtCloseWebhookAction,
} from "../../shared/payAtClose.ts";
import type { PricingAdjustment } from "../../shared/pricingSettings.ts";
import { squareApiBaseUrl } from "../../shared/squareInvoice.ts";

export type PayAtCloseEnv = NodeJS.ProcessEnv;

export interface TitusCheckoutResult {
  ok: true;
  checkoutId: string;
  checkoutUrl: string;
  status: string;
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function payAtCloseConfigured(env: PayAtCloseEnv): boolean {
  return Boolean(String(env.PAY_AT_CLOSE_API_KEY || "").trim());
}

export function payAtCloseOfferFromAdjustments(env: PayAtCloseEnv, adjustments: PricingAdjustment[]): PayAtClosePublicOffer {
  return payAtClosePublicOffer(env, adjustments);
}

function redact(value: string, secret: string): string {
  if (!secret) return value;
  return value.split(secret).join("[redacted]");
}

export async function createTitusCheckout(
  input: {
    invoiceId: string;
    orderId?: string | null;
    amount: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
    externalCustomerId?: string | null;
    address?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    checkoutStatus?: string | null;
  },
  deps: { env: PayAtCloseEnv; fetchImpl?: FetchLike },
): Promise<TitusCheckoutResult | { ok: false; error: string }> {
  const decision = payAtCloseBaseUrlDecision(deps.env);
  if (decision.ok === false) return { ok: false, error: decision.error };
  const apiKey = String(deps.env.PAY_AT_CLOSE_API_KEY || "").trim();
  if (!apiKey) return { ok: false, error: "Pay at Close is not configured." };
  const idempotencyKey = payAtCloseIdempotencyKey(input.invoiceId, input.checkoutStatus);
  const body = titusCheckoutBody({
    invoiceId: input.invoiceId,
    orderId: input.orderId,
    amount: input.amount,
    description: input.description,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    idempotencyKey,
    externalCustomerId: input.externalCustomerId || input.email,
    businessId: deps.env.PAY_AT_CLOSE_BUSINESS_ID,
    project: titusProjectFromAddress(input),
  });
  const fetchImpl = deps.fetchImpl || fetch;
  let response: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    response = await fetchImpl(`${decision.base}/v1/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pay at Close request failed.";
    console.error("[Pay at Close] Checkout request failed:", redact(message, apiKey));
    return { ok: false, error: "Pay at Close checkout could not be started." };
  }
  const payload = await response.json().catch(() => ({}));
  const data = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: unknown }).data
    : payload;
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const checkoutUrl = typeof record.checkoutUrl === "string" ? record.checkoutUrl : "";
  const checkoutId = typeof record.id === "string" ? record.id : "";
  const status = typeof record.status === "string" ? record.status : "";
  if (!response.ok || !checkoutUrl || !checkoutId) {
    const raw = JSON.stringify(payload).slice(0, 500);
    console.error("[Pay at Close] Checkout was declined:", response.status, redact(raw, apiKey));
    return { ok: false, error: "Pay at Close checkout could not be started." };
  }
  return { ok: true, checkoutId, checkoutUrl, status };
}

export function verifyPayAtCloseWebhook(
  rawBody: string,
  headers: { signature?: string | null; timestamp?: string | null },
  env: PayAtCloseEnv,
  now = Date.now(),
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = String(env.PAY_AT_CLOSE_WEBHOOK_SECRET || "").trim();
  if (!secret) return { ok: false, status: 401, error: "Pay at Close webhook secret is not configured." };
  const timestamp = String(headers.timestamp || "").trim();
  const signature = String(headers.signature || "").trim();
  if (!timestamp || !signature) return { ok: false, status: 401, error: "Missing Pay at Close webhook signature." };
  if (payAtCloseTimestampMs(timestamp, now) == null) {
    return { ok: false, status: 401, error: "Pay at Close webhook timestamp is outside the 5 minute window." };
  }
  const expected = payAtCloseSignatureExpected(secret, timestamp, rawBody, hmacHex);
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    return { ok: false, status: 401, error: "Invalid Pay at Close webhook signature." };
  }
  return { ok: true };
}

export interface PayAtCloseInvoiceRecord {
  id: string;
  data: Record<string, unknown>;
}

export interface PayAtCloseWebhookDeps {
  env: PayAtCloseEnv;
  now?: number;
  findInvoiceById: (id: string) => Promise<PayAtCloseInvoiceRecord | null>;
  findInvoiceByCheckoutId: (checkoutId: string) => Promise<PayAtCloseInvoiceRecord | null>;
  save: (id: string, patch: Record<string, unknown>) => Promise<void>;
  applyPayment: (input: {
    invoiceId: string;
    orderId?: string;
    clientId?: string;
    clientName?: string;
    amount: number;
    titusCheckoutId: string;
    paidAt?: string;
  }) => Promise<{ duplicate?: boolean } | undefined>;
  recordRefund: (input: {
    invoiceId: string;
    amount: number;
    refundId: string;
    checkoutId: string;
  }) => Promise<{ duplicate?: boolean } | undefined>;
  mirrorSquare: (invoice: PayAtCloseInvoiceRecord, input: { amount: number; checkoutId: string }) => Promise<void>;
}

function invoiceIdOf(action: PayAtCloseWebhookAction, invoice: PayAtCloseInvoiceRecord | null): string {
  if (action.type === "checkout" && action.invoiceId) return action.invoiceId;
  return invoice?.id || "";
}

export async function applyPayAtCloseWebhook(
  rawBody: string,
  headers: { signature?: string | null; timestamp?: string | null },
  deps: PayAtCloseWebhookDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const verified = verifyPayAtCloseWebhook(rawBody, headers, deps.env, deps.now);
  if (verified.ok === false) return { status: verified.status, body: { error: verified.error } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Pay at Close webhook body is not JSON." } };
  }
  const action = interpretPayAtCloseWebhook(parsed);
  if (action.type === "ignore") return { status: 200, body: { received: true, ignored: action.eventType || "unknown" } };

  const checkoutId = action.type === "refund" ? action.checkoutId : action.checkoutId;
  let invoice: PayAtCloseInvoiceRecord | null = null;
  if (action.type === "checkout" && action.invoiceId) invoice = await deps.findInvoiceById(action.invoiceId);
  if (!invoice && checkoutId) invoice = await deps.findInvoiceByCheckoutId(checkoutId);
  const invoiceId = invoiceIdOf(action, invoice);
  if (!invoice || !invoiceId) return { status: 200, body: { received: true, unmatched: true } };

  if (action.type === "refund") {
    if (action.refundStatus !== "completed" || action.amount <= 0 || !action.refundId) {
      await deps.save(invoice.id, {
        payAtCloseRefundStatus: action.refundStatus || "pending",
        updatedAt: new Date().toISOString(),
      });
      return { status: 200, body: { received: true, refund: action.refundStatus || "pending" } };
    }
    const result = await deps.recordRefund({
      invoiceId: invoice.id,
      amount: action.amount,
      refundId: action.refundId,
      checkoutId: action.checkoutId,
    });
    return { status: 200, body: { received: true, refund: true, ...(result || {}) } };
  }

  const amountDue = roundPayAtCloseMoney(Number(invoice.data.amountDue ?? invoice.data.total) || 0);
  const settlement = payAtCloseSettlement(action, amountDue);
  const patch: Record<string, unknown> = {
    paymentMethod: PAY_AT_CLOSE_METHOD,
    paymentProvider: PAY_AT_CLOSE_METHOD,
    titusCheckoutId: action.checkoutId || invoice.data.titusCheckoutId || null,
    titusCheckoutStatus: action.checkoutStatus,
    ...(action.application ? { payAtCloseApplication: action.application } : {}),
    ...(action.failureReason ? { payAtCloseFailure: action.failureReason } : {}),
    ...(action.paidAt ? { titusEventAt: action.paidAt } : {}),
  };

  if (settlement === "paid" || settlement === "partial") {
    const amount = action.amount ?? amountDue;
    const applied = await deps.applyPayment({
      invoiceId: invoice.id,
      orderId: typeof invoice.data.orderId === "string" ? invoice.data.orderId : undefined,
      clientId: typeof invoice.data.clientId === "string" ? invoice.data.clientId : undefined,
      clientName: typeof invoice.data.clientName === "string" ? invoice.data.clientName : undefined,
      amount,
      titusCheckoutId: action.checkoutId,
      paidAt: action.paidAt,
    });
    await deps.save(invoice.id, patch);
    if (!applied?.duplicate) {
      await deps.mirrorSquare(invoice, { amount, checkoutId: action.checkoutId });
    }
    return { status: 200, body: { received: true, settlement, ...(applied || {}) } };
  }

  if (settlement === "failed") {
    const alreadyPaid = roundPayAtCloseMoney(Number(invoice.data.amountPaid) || 0) > 0;
    await deps.save(invoice.id, {
      ...patch,
      status: alreadyPaid ? invoice.data.status || "partial" : "failed",
      paymentStatus: alreadyPaid ? "partial" : "failed",
    });
    return { status: 200, body: { received: true, settlement: "failed" } };
  }

  await deps.save(invoice.id, {
    ...patch,
    status: invoice.data.status === "paid" ? "paid" : PAY_AT_CLOSE_PENDING_STATUS,
    paymentStatus: invoice.data.status === "paid" ? "paid" : PAY_AT_CLOSE_PENDING_STATUS,
  });
  return { status: 200, body: { received: true, settlement: "pending" } };
}

/** Square CreatePayment EXTERNAL on an order that already exists. No second invoice. */
export function squareExternalPayAtCloseBody(input: {
  invoiceId: string;
  squareOrderId: string;
  locationId: string;
  amount: number;
  checkoutId: string;
}): Record<string, unknown> {
  const cents = Math.round(roundPayAtCloseMoney(input.amount) * 100);
  return {
    source_id: "EXTERNAL",
    idempotency_key: `titus-${input.checkoutId}`.slice(0, 45),
    amount_money: { amount: cents, currency: "USD" },
    order_id: input.squareOrderId,
    location_id: input.locationId,
    note: `Pay at Close ${input.checkoutId} invoiceId:${input.invoiceId}`.slice(0, 500),
    external_details: {
      type: "OTHER",
      source: "Pay at Close Partner",
      source_id: input.checkoutId.slice(0, 255),
    },
  };
}

export async function mirrorPayAtCloseOnSquareOrder(
  invoice: { id: string; data: Record<string, unknown> },
  input: { amount: number; checkoutId: string },
  deps: { env: PayAtCloseEnv; fetchImpl?: FetchLike },
): Promise<void> {
  const squareOrderId = typeof invoice.data.squareOrderId === "string" ? invoice.data.squareOrderId.trim() : "";
  const token = String(deps.env.SQUARE_ACCESS_TOKEN || "").trim();
  const locationId = String(deps.env.SQUARE_LOCATION_ID || "").trim();
  if (!squareOrderId || !token || !locationId || input.amount <= 0) return;
  const fetchImpl = deps.fetchImpl || fetch;
  const body = squareExternalPayAtCloseBody({
    invoiceId: invoice.id,
    squareOrderId,
    locationId,
    amount: input.amount,
    checkoutId: input.checkoutId,
  });
  try {
    const response = await fetchImpl(`${squareApiBaseUrl(deps.env.SQUARE_ENVIRONMENT)}/v2/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": deps.env.SQUARE_VERSION || "2026-08-20",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      console.error("[Pay at Close] Square external tender was not recorded:", response.status, JSON.stringify(payload).slice(0, 300));
    }
  } catch (err) {
    console.error("[Pay at Close] Square external tender failed:", err instanceof Error ? err.message : "request failed");
  }
}

export { shapePayAtCloseDraft };
