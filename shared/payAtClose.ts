/**
 * Pay at Close, provided by Titus, on the existing Iconic invoice.
 *
 * Titus docs: https://docs.gotitus.com/guide/get-started/what-is-titus
 * Direct business checkout: POST {base}/v1/checkouts with header x-api-key.
 * Staging base is https://api.gotitus.dev. Production is https://api.gotitus.com.
 * This module does not read the API key. The server adapter does.
 *
 * One Firestore invoice is the invoice of record. Titus orderId is that invoice id.
 * Card processing stays off unless the Prices row "Card processing on Pay at Close" is on.
 * The Pay at Close fee is the "Pay at Close" Prices row. 0 is a real fee of zero.
 */

import type { BookingLineItem } from "./bookingPricing.ts";
import { sumLineItemPrices } from "./bookingPricing.ts";
import type { BookingInvoiceDraft } from "./bookingInvoice.ts";
import { adjustmentKind } from "./invoiceFace.ts";
import type { PricingAdjustment } from "./pricingSettings.ts";
import type { StaffCatalogPackage } from "./bookingCatalog.ts";

export const PAY_AT_CLOSE_METHOD = "pay_at_close" as const;
export const PAY_AT_CLOSE_PENDING_STATUS = "pending - pay at close";
export const PAY_AT_CLOSE_OFFER_ID = "pay-at-close";
export const PAY_AT_CLOSE_CARD_PROCESSING_ID = "pay-at-close-card-processing";
export const PAY_AT_CLOSE_FEE_LINE_ID = "pay-at-close-fee";
export const PAY_AT_CLOSE_WEBHOOK_PATH = "/api/payments/pay-at-close-webhook";
/** Register this HTTPS URL in the Titus dashboard. Do not point it at a vercel.app redirect. */
export const PAY_AT_CLOSE_WEBHOOK_URL = `https://www.iconicimagestx.com${PAY_AT_CLOSE_WEBHOOK_PATH}`;

export const TITUS_STAGING_API_BASE = "https://api.gotitus.dev";
export const TITUS_PRODUCTION_API_BASE = "https://api.gotitus.com";

/** Events to subscribe on the Titus webhook endpoint. */
export const PAY_AT_CLOSE_WEBHOOK_EVENTS = [
  "checkout.created",
  "checkout.updated",
  "checkout.payment_failed",
  "checkout.loan_application_denied",
  "checkout.loan_application_under_review",
  "checkout.loan_application_approved",
  "refund.created",
  "refund.updated",
] as const;

export const PAY_AT_CLOSE_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export interface PayAtClosePublicOffer {
  /** PAY_AT_CLOSE_LIVE is exactly "true". */
  live: boolean;
  /** Prices row "Pay at Close" is active. */
  enabledByOffice: boolean;
  /** Both gates. Checkout hides the option unless this is true. */
  offered: boolean;
  feeMode: "flat" | "percent";
  /** Dollars, or percent points, from the Prices row. Inactive is 0. */
  feeRate: number;
  /** True only when the card-processing Prices row is active. */
  chargeCardProcessing: boolean;
}

export interface PayAtCloseStamp {
  status: string;
  paymentMethod: typeof PAY_AT_CLOSE_METHOD;
  paymentProvider: typeof PAY_AT_CLOSE_METHOD;
  paymentStatus: string;
  payAtCloseFee: number;
}

export function payAtCloseLive(env?: NodeJS.ProcessEnv): boolean {
  return env?.PAY_AT_CLOSE_LIVE === "true";
}

/**
 * Unset uses staging so a missing base URL cannot create a live charge.
 * Production is used only when PAY_AT_CLOSE_API_BASE_URL is that host.
 */
export function payAtCloseApiBaseUrl(env?: NodeJS.ProcessEnv): string {
  const raw = String(env?.PAY_AT_CLOSE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return raw || TITUS_STAGING_API_BASE;
}

export function payAtCloseBaseUrlDecision(
  env?: NodeJS.ProcessEnv,
): { ok: true; base: string } | { ok: false; error: string } {
  const base = payAtCloseApiBaseUrl(env);
  let host = "";
  try {
    host = new URL(base).host;
  } catch {
    return { ok: false, error: "Pay at Close base URL is not a valid URL." };
  }
  if (host === "api.gotitus.com" && !payAtCloseLive(env)) {
    return { ok: false, error: "Pay at Close live API stays off until PAY_AT_CLOSE_LIVE is true." };
  }
  return { ok: true, base };
}

export function payAtClosePublicOffer(
  env: NodeJS.ProcessEnv | undefined,
  adjustments: PricingAdjustment[],
): PayAtClosePublicOffer {
  const offer = adjustments.find((item) => item.id === PAY_AT_CLOSE_OFFER_ID && !item.removed);
  const card = adjustments.find((item) => item.id === PAY_AT_CLOSE_CARD_PROCESSING_ID && !item.removed);
  const enabledByOffice = Boolean(offer?.active);
  const live = payAtCloseLive(env);
  return {
    live,
    enabledByOffice,
    offered: live && enabledByOffice,
    feeMode: offer?.mode === "percent" ? "percent" : "flat",
    feeRate: enabledByOffice ? Math.max(0, Number(offer?.amount) || 0) : 0,
    chargeCardProcessing: Boolean(card?.active),
  };
}

export function roundPayAtCloseMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Fee from the Prices row. A rate of 0 adds nothing. */
export function payAtCloseFeeDollars(rate: number, mode: "flat" | "percent", base: number): number {
  const safeRate = Number(rate);
  const safeBase = Math.max(0, Number(base) || 0);
  if (!Number.isFinite(safeRate) || safeRate <= 0) return 0;
  if (mode === "percent") return roundPayAtCloseMoney(safeBase * safeRate / 100);
  return roundPayAtCloseMoney(safeRate);
}

function serviceBase(lineItems: BookingLineItem[]): number {
  const base = lineItems
    .filter((item) => item.id !== PAY_AT_CLOSE_FEE_LINE_ID && adjustmentKind(item) !== "processing" && !String(item.id || "").startsWith("promo-") && !String(item.name || "").startsWith("Promo Code:"))
    .filter((item) => adjustmentKind(item) !== "travel")
    .reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  return roundPayAtCloseMoney(Math.max(0, base));
}

export function shapePayAtCloseDraft<T extends BookingInvoiceDraft>(
  draft: T,
  offer: Pick<PayAtClosePublicOffer, "feeRate" | "feeMode" | "chargeCardProcessing">,
): Omit<T, "status" | "paymentProvider"> & PayAtCloseStamp {
  const kept = draft.lineItems.filter((item) => (
    item.id !== PAY_AT_CLOSE_FEE_LINE_ID
    && (offer.chargeCardProcessing || adjustmentKind(item) !== "processing")
  ));
  const fee = payAtCloseFeeDollars(offer.feeRate, offer.feeMode, serviceBase(kept));
  const lineItems = fee > 0
    ? [...kept, {
      id: PAY_AT_CLOSE_FEE_LINE_ID,
      name: "Pay at Close",
      unitPrice: fee,
      qty: 1,
      price: fee,
    }]
    : kept;
  const total = roundPayAtCloseMoney(sumLineItemPrices(lineItems));
  const amountPaid = roundPayAtCloseMoney(Math.max(0, Number(draft.amountPaid) || 0));
  return {
    ...draft,
    lineItems,
    total,
    amountDue: roundPayAtCloseMoney(Math.max(0, total - amountPaid)),
    amountPaid,
    subtotal: serviceBase(lineItems),
    processing: offer.chargeCardProcessing ? (draft.processing ?? 0) : 0,
    processingPolicy: offer.chargeCardProcessing ? (draft.processingPolicy ?? "included") : "waived",
    status: PAY_AT_CLOSE_PENDING_STATUS,
    paymentMethod: PAY_AT_CLOSE_METHOD,
    paymentProvider: PAY_AT_CLOSE_METHOD,
    paymentStatus: PAY_AT_CLOSE_PENDING_STATUS,
    payAtCloseFee: fee,
  };
}

/** Highest-priced active packages. Add-ons and $0 rows stay off this page. */
export function premiumCatalogPackages(catalog: StaffCatalogPackage[], limit = 4): StaffCatalogPackage[] {
  const priced = catalog.filter((item) => (
    item.isActive
    && item.price > 0
    && item.bookingKind !== "addon"
    && item.bookingKind !== "upgrade"
  ));
  const preferred = priced.filter((item) => item.bookingKind === "service" || item.tier === "premium" || item.tier === "campaign");
  const pool = preferred.length >= 3 ? preferred : priced;
  return [...pool].sort((a, b) => b.price - a.price || a.name.localeCompare(b.name)).slice(0, Math.max(1, limit));
}

export interface TitusCheckoutBodyInput {
  invoiceId: string;
  orderId?: string | null;
  amount: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  externalCustomerId?: string | null;
  businessId?: string | null;
  project?: TitusProject | null;
}

export interface TitusProject {
  address?: {
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    workEmail?: string | null;
    phone?: string | null;
  };
}

/** Request JSON for POST /v1/checkouts. payNowEnabled false keeps cards on Square. */
export function titusCheckoutBody(input: TitusCheckoutBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    orderId: input.invoiceId,
    amount: roundPayAtCloseMoney(input.amount),
    description: input.description,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    payNowEnabled: false,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      invoiceId: input.invoiceId,
      ...(input.orderId ? { orderId: input.orderId } : {}),
    },
    prefillData: { preferredPaymentMethod: "pay-at-close" },
  };
  const customer = String(input.externalCustomerId || "").trim();
  if (customer) body.externalCustomerId = customer;
  const businessId = String(input.businessId || "").trim();
  if (businessId) body.businessId = businessId;
  if (input.project && (input.project.address || input.project.contact)) body.project = input.project;
  return body;
}

export function payAtCloseIdempotencyKey(invoiceId: string, checkoutStatus?: string | null): string {
  const id = invoiceId.trim() || "invoice";
  if (checkoutStatus === "canceled") return `pac-${id}-retry`;
  return `pac-${id}`;
}

/** "123 Main St, Spring, TX 77380" → Titus project address. Anything else is omitted. */
export function titusProjectFromAddress(input: {
  address?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}): TitusProject | null {
  const raw = String(input.address || "").trim();
  const match = raw.match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/);
  const phone = String(input.phone || "").replace(/\D/g, "");
  const contact = {
    ...(String(input.firstName || "").trim() ? { firstName: String(input.firstName).trim() } : {}),
    ...(String(input.lastName || "").trim() ? { lastName: String(input.lastName).trim() } : {}),
    ...(String(input.email || "").includes("@") ? { workEmail: String(input.email).trim() } : {}),
    ...(phone.length >= 10 ? { phone: phone.slice(-10) } : {}),
  };
  if (!match) return Object.keys(contact).length ? { contact } : null;
  return {
    address: {
      addressLine1: match[1].trim(),
      city: match[2].trim(),
      state: match[3].toUpperCase(),
      zip: match[4],
    },
    ...(Object.keys(contact).length ? { contact } : {}),
  };
}

export interface PayAtCloseWebhookHeaders {
  signature?: string | null;
  timestamp?: string | null;
}

export function payAtCloseTimestampMs(raw: string, now = Date.now()): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const ms = value < 1e12 ? value * 1000 : value;
  if (Math.abs(now - ms) > PAY_AT_CLOSE_REPLAY_WINDOW_MS) return null;
  return ms;
}

/**
 * HMAC-SHA256 hex of `${timestamp}.${rawBody}`.
 * The digest function is injected so this file stays free of Node crypto and the API key.
 */
export function payAtCloseSignatureExpected(
  secret: string,
  timestamp: string,
  rawBody: string,
  hmacHex: (secret: string, payload: string) => string,
): string {
  return hmacHex(secret, `${timestamp}.${rawBody}`);
}

export function payAtCloseSignaturesMatch(expectedHex: string, receivedHex: string): boolean {
  const expected = expectedHex.trim().toLowerCase();
  const received = receivedHex.trim().toLowerCase();
  if (!expected || !received || expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

export type PayAtCloseWebhookAction =
  | { type: "ignore"; eventType: string }
  | {
    type: "checkout";
    eventType: string;
    checkoutId: string;
    invoiceId: string;
    checkoutStatus: string;
    application?: "under_review" | "approved" | "denied";
    amount?: number;
    paidAt?: string;
    failureReason?: string;
  }
  | {
    type: "refund";
    eventType: string;
    refundId: string;
    checkoutId: string;
    amount: number;
    refundStatus: string;
  };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Map a verified Titus webhook body onto the one Iconic invoice. */
export function interpretPayAtCloseWebhook(body: unknown): PayAtCloseWebhookAction {
  const event = asRecord(body);
  const eventType = text(event?.type);
  const payload = asRecord(event?.payload) || {};
  if (eventType === "refund.created" || eventType === "refund.updated") {
    return {
      type: "refund",
      eventType,
      refundId: text(payload.id),
      checkoutId: text(payload.checkoutId),
      amount: roundPayAtCloseMoney(Number(payload.amount) || 0),
      refundStatus: text(payload.status),
    };
  }
  if (eventType === "checkout.loan_application_denied" || eventType === "authorization.loan_application_denied") {
    return {
      type: "checkout",
      eventType,
      checkoutId: text(payload.id),
      invoiceId: "",
      checkoutStatus: "requires-payment",
      application: "denied",
      failureReason: "Pay at Close application was declined.",
    };
  }
  if (eventType === "checkout.loan_application_under_review") {
    return {
      type: "checkout",
      eventType,
      checkoutId: text(payload.id),
      invoiceId: "",
      checkoutStatus: "requires-payment",
      application: "under_review",
    };
  }
  if (eventType === "checkout.loan_application_approved") {
    return {
      type: "checkout",
      eventType,
      checkoutId: text(payload.id),
      invoiceId: "",
      checkoutStatus: "requires-payment",
      application: "approved",
    };
  }
  if (!eventType.startsWith("checkout.")) return { type: "ignore", eventType };
  const metadata = asRecord(payload.metadata);
  const invoiceId = text(payload.orderId) || text(metadata?.invoiceId);
  const checkoutStatus = text(payload.status);
  const error = asRecord(payload.lastPaymentError);
  const amount = roundPayAtCloseMoney((Number(payload.amount) || 0) + (Number(payload.tipAmount) || 0));
  const paidAt = text(payload.updatedAt) || text(event?.createdAt);
  return {
    type: "checkout",
    eventType,
    checkoutId: text(payload.id),
    invoiceId,
    checkoutStatus,
    amount,
    ...(paidAt ? { paidAt } : {}),
    ...(eventType === "checkout.payment_failed"
      ? { failureReason: text(error?.message) || text(error?.code) || "Payment failed." }
      : {}),
  };
}

export function payAtCloseSettlement(action: Extract<PayAtCloseWebhookAction, { type: "checkout" }>, amountDue: number): "paid" | "partial" | "failed" | "pending" {
  if (action.application === "denied" || action.failureReason) return "failed";
  if (action.checkoutStatus === "succeeded") {
    if (amountDue <= 0) return "paid";
    const amount = action.amount ?? 0;
    if (amount <= 0) return "pending";
    return amount + 0.009 >= amountDue ? "paid" : "partial";
  }
  if (action.checkoutStatus === "canceled") return "failed";
  return "pending";
}

/** Square payment.updated for the external tender we wrote. Do not apply it again. */
export function isMirroredPayAtCloseSquarePayment(
  payment: { source_type?: unknown } | null | undefined,
  invoice: { paymentMethod?: unknown; paymentProvider?: unknown; titusCheckoutId?: unknown } | null | undefined,
): boolean {
  if (String(payment?.source_type || "").toUpperCase() !== "EXTERNAL") return false;
  return invoice?.paymentMethod === PAY_AT_CLOSE_METHOD
    || invoice?.paymentProvider === PAY_AT_CLOSE_METHOD
    || Boolean(text(invoice?.titusCheckoutId));
}
