/**
 * Square invoice sync for a Firestore invoice that already exists.
 * Display mode copies charge cents from the invoice total and does not
 * change that total. Charge mode (INVOICE_PROCESSING_MODE=charge) adds
 * the 2.8% processing fee only when the invoice does not already have one.
 * This module does not write the invoice total. Invoices use
 * delivery_method SHARE_MANUALLY so Square does not email the buyer.
 * Publish still notifies the seller, so booking and confirm must not call
 * this. Call it only after the shoot.
 */

import { normalizeBookingLineItems } from "./bookingPricing.ts";
import { invoiceProcessingMode, squareOrderForProcessingMode } from "./invoiceProcessing.ts";
import { squarePaymentNote } from "./paymentAccess.ts";

export interface SquareClientDeps {
  fetchImpl: (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  env: Record<string, string | undefined>;
  now?: () => Date;
  timeoutMs?: number;
}

export interface SquareInvoiceSource {
  id: string;
  clientEmail?: unknown;
  clientName?: unknown;
  invoiceNumber?: unknown;
  lineItems?: unknown;
  total?: unknown;
  subtotal?: unknown;
  processing?: unknown;
  paymentProvider?: unknown;
  squareInvoiceId?: unknown;
}

export interface SquareOrderLine {
  uid: string;
  name: string;
  quantity: string;
  note?: string;
  base_price_money: { amount: number; currency: "USD" };
}

export interface SquareOrderDiscount {
  uid: string;
  name: string;
  type: "FIXED_AMOUNT";
  scope: "ORDER";
  amount_money: { amount: number; currency: "USD" };
}

export interface SquareOrderPricing {
  lineItems: SquareOrderLine[];
  discounts: SquareOrderDiscount[];
  amountCents: number;
}

export type SquareSyncResult =
  | {
      ok: true;
      skipped: true;
      reason:
        | "already-synced"
        | "not-configured"
        | "nothing-due"
        | "stripe"
        | "missing-email"
        | "total-mismatch"
        | "before-shoot";
    }
  | {
      ok: true;
      skipped: false;
      squareInvoiceId: string;
      squareInvoiceUrl: string;
      squareOrderId: string;
      squareCustomerId: string;
    }
  | { ok: false; error: string };

const SQUARE_VERSION_FALLBACK = "2026-08-20";
const SYNC_BUDGET_MS = 8000;

export function squareApiBaseUrl(environment: string | undefined): string {
  return environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

export function squareConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}

/** Book and schedule, then shoot, then bill. Square customer, order, invoice, and publish wait. */
export type SquareInvoiceSyncPhase = "booking" | "confirm" | "post-shoot";

export function squareInvoiceSyncAllowed(phase: SquareInvoiceSyncPhase): boolean {
  return phase === "post-shoot";
}

export function squareInvoiceAlreadySynced(invoice: { squareInvoiceId?: unknown }): boolean {
  return typeof invoice.squareInvoiceId === "string" && invoice.squareInvoiceId.trim().length > 0;
}

/** https Square public invoice URLs only. Anything else falls back to payment links. */
export function preferredSquareCheckoutUrl(invoice: { squareInvoiceUrl?: unknown }): string | null {
  if (typeof invoice.squareInvoiceUrl !== "string") return null;
  const url = invoice.squareInvoiceUrl.trim();
  if (!url.startsWith("https://")) return null;
  return url;
}

/** Fresh RetrieveInvoice URL wins. The stored public URL is next. */
export function resolveSquareCheckoutUrl(input: { freshUrl?: string | null; storedUrl?: unknown }): string | null {
  const fresh = preferredSquareCheckoutUrl({ squareInvoiceUrl: input.freshUrl });
  if (fresh) return fresh;
  return preferredSquareCheckoutUrl({ squareInvoiceUrl: input.storedUrl });
}

export function squareInvoiceDueDate(now: Date): string {
  const due = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}

function toCents(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

/**
 * Positive lines stay line items. Negative lines (promo) become order-level
 * fixed discounts because Square rejects negative prices. The result is
 * discarded unless its cents equal the invoice total.
 */
export function buildSquareOrderPricing(lineItems: unknown, total: unknown, paymentNote?: string): SquareOrderPricing | null {
  const normalized = normalizeBookingLineItems(lineItems);
  const lines: SquareOrderLine[] = [];
  const discounts: SquareOrderDiscount[] = [];

  normalized.forEach((item, index) => {
    const extendedCents = toCents(item.price);
    if (extendedCents < 0) {
      const name = item.name.trim() || "Discount";
      discounts.push({
        uid: `discount-${index}`,
        name: name.slice(0, 255),
        type: "FIXED_AMOUNT",
        scope: "ORDER",
        amount_money: { amount: Math.abs(extendedCents), currency: "USD" },
      });
      return;
    }
    if (extendedCents === 0) return;

    const qty = Number.isInteger(item.qty) && item.qty > 0 ? item.qty : 1;
    const unitCents = toCents(item.unitPrice);
    const pricedAsQty = unitCents > 0 && unitCents * qty === extendedCents;
    const line: SquareOrderLine = {
      uid: `line-${index}`,
      name: (item.name.trim() || "Service").slice(0, 512),
      quantity: pricedAsQty ? String(qty) : "1",
      base_price_money: {
        amount: pricedAsQty ? unitCents : extendedCents,
        currency: "USD",
      },
    };
    if (index === 0 && paymentNote) line.note = paymentNote.slice(0, 500);
    lines.push(line);
  });

  if (lines.length === 0) return null;

  const lineSum = lines.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0);
  const discountSum = discounts.reduce((sum, discount) => sum + discount.amount_money.amount, 0);
  const amountCents = lineSum - discountSum;
  if (amountCents <= 0) return null;
  if (amountCents !== toCents(Number(total) || 0)) return null;
  return { lineItems: lines, discounts, amountCents };
}

function stableKey(prefix: string, value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h1 = Math.imul(h1 ^ value.charCodeAt(i), 0x01000193);
    h2 = Math.imul(h2 ^ value.charCodeAt(value.length - 1 - i), 0x01000193);
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  return `${prefix}${hex}`.slice(0, 45);
}

function idempotencyKey(prefix: string, invoiceId: string): string {
  const key = `${prefix}${invoiceId}`;
  return key.length <= 45 ? key : stableKey(prefix, invoiceId);
}

function splitName(name: string): { given_name?: string; family_name?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { given_name: parts[0].slice(0, 300) };
  return {
    given_name: parts[0].slice(0, 300),
    family_name: parts.slice(1).join(" ").slice(0, 300),
  };
}

function squareError(body: unknown, fallback: string): string {
  const errors = body && typeof body === "object" && "errors" in body ? (body as { errors?: unknown }).errors : null;
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object" && "detail" in errors[0]) {
    const detail = (errors[0] as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail) return detail;
  }
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
  }
  return fallback;
}

async function squareRequest(
  deps: SquareClientDeps,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  deadline: number,
): Promise<{ ok: boolean; status: number; body: any }> {
  const token = deps.env.SQUARE_ACCESS_TOKEN;
  if (!token) return { ok: false, status: 0, body: { error: "Square is not configured" } };
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { ok: false, status: 0, body: { error: "Square invoice sync timed out" } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await deps.fetchImpl(`${squareApiBaseUrl(deps.env.SQUARE_ENVIRONMENT)}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        "Square-Version": deps.env.SQUARE_VERSION || SQUARE_VERSION_FALLBACK,
        Authorization: `Bearer ${token}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      ok: false,
      status: 0,
      body: { error: aborted ? "Square invoice sync timed out" : err instanceof Error ? err.message : "Square request failed" },
    };
  } finally {
    clearTimeout(timer);
  }
}

function publicUrlOf(body: any): string | null {
  return preferredSquareCheckoutUrl({ squareInvoiceUrl: body?.invoice?.public_url });
}

export async function fetchPublishedSquareInvoiceUrl(
  squareInvoiceId: string,
  deps: SquareClientDeps,
): Promise<string | null> {
  const id = squareInvoiceId.trim();
  if (!id || !squareConfigured(deps.env)) return null;
  const result = await squareRequest(
    deps,
    `/v2/invoices/${encodeURIComponent(id)}`,
    { method: "GET" },
    Date.now() + (deps.timeoutMs ?? 5000),
  );
  if (!result.ok) return null;
  return publicUrlOf(result.body);
}

export async function syncSquareInvoice(invoice: SquareInvoiceSource, deps: SquareClientDeps): Promise<SquareSyncResult> {
  try {
    if (squareInvoiceAlreadySynced(invoice)) return { ok: true, skipped: true, reason: "already-synced" };
    if (String(invoice.paymentProvider || "").toLowerCase() === "stripe") {
      return { ok: true, skipped: true, reason: "stripe" };
    }
    const priced = squareOrderForProcessingMode(invoice, invoiceProcessingMode(deps.env));
    const total = priced.total;
    if (total <= 0) return { ok: true, skipped: true, reason: "nothing-due" };
    if (!squareConfigured(deps.env)) return { ok: true, skipped: true, reason: "not-configured" };

    const email = typeof invoice.clientEmail === "string" ? invoice.clientEmail.trim().toLowerCase() : "";
    if (!email) return { ok: true, skipped: true, reason: "missing-email" };

    const invoiceNumber = typeof invoice.invoiceNumber === "string" ? invoice.invoiceNumber.trim() : "";
    const paymentNote = squarePaymentNote(invoice.id, invoiceNumber || undefined);
    const pricing = buildSquareOrderPricing(priced.lineItems, total, paymentNote);
    if (!pricing) return { ok: true, skipped: true, reason: "total-mismatch" };

    const deadline = Date.now() + (deps.timeoutMs ?? SYNC_BUDGET_MS);
    const locationId = deps.env.SQUARE_LOCATION_ID || "";
    const clientName = typeof invoice.clientName === "string" ? invoice.clientName : "";

    const search = await squareRequest(
      deps,
      "/v2/customers/search",
      {
        method: "POST",
        body: {
          query: { filter: { email_address: { exact: email } } },
          limit: 1,
        },
      },
      deadline,
    );
    if (!search.ok && search.body?.error === "Square invoice sync timed out") {
      return { ok: false, error: "Square invoice sync timed out" };
    }

    let customerId = search.ok && Array.isArray(search.body?.customers) ? search.body.customers[0]?.id : "";
    if (!customerId) {
      const createdCustomer = await squareRequest(
        deps,
        "/v2/customers",
        {
          method: "POST",
          body: {
            idempotency_key: stableKey("ii-cus-", email),
            email_address: email,
            ...splitName(clientName),
          },
        },
        deadline,
      );
      if (!createdCustomer.ok) {
        return { ok: false, error: squareError(createdCustomer.body, "Square customer create failed") };
      }
      customerId = createdCustomer.body?.customer?.id || "";
    }
    if (!customerId) return { ok: false, error: "Square customer create failed" };

    const order = await squareRequest(
      deps,
      "/v2/orders",
      {
        method: "POST",
        body: {
          idempotency_key: idempotencyKey("ii-ord-", invoice.id),
          order: {
            location_id: locationId,
            customer_id: customerId,
            reference_id: invoice.id.slice(0, 40),
            line_items: pricing.lineItems,
            ...(pricing.discounts.length ? { discounts: pricing.discounts } : {}),
          },
        },
      },
      deadline,
    );
    const orderId = order.ok ? order.body?.order?.id : "";
    if (!orderId) return { ok: false, error: squareError(order.body, "Square order create failed") };

    const invoiceBody: Record<string, unknown> = {
      location_id: locationId,
      order_id: orderId,
      primary_recipient: { customer_id: customerId },
      payment_requests: [
        {
          request_type: "BALANCE",
          due_date: squareInvoiceDueDate(deps.now ? deps.now() : new Date()),
        },
      ],
      delivery_method: "SHARE_MANUALLY",
      accepted_payment_methods: { card: true },
      title: `Iconic Images Invoice ${invoiceNumber || invoice.id}`.slice(0, 255),
      description: paymentNote,
    };
    if (/^[A-Za-z0-9-]{1,40}$/.test(invoiceNumber)) invoiceBody.invoice_number = invoiceNumber;

    const createdInvoice = await squareRequest(
      deps,
      "/v2/invoices",
      {
        method: "POST",
        body: {
          idempotency_key: idempotencyKey("ii-inv-", invoice.id),
          invoice: invoiceBody,
        },
      },
      deadline,
    );
    const squareInvoice = createdInvoice.ok ? createdInvoice.body?.invoice : null;
    const squareInvoiceId = typeof squareInvoice?.id === "string" ? squareInvoice.id : "";
    if (!squareInvoiceId) {
      return { ok: false, error: squareError(createdInvoice.body, "Square invoice create failed") };
    }

    let url = publicUrlOf(createdInvoice.body);
    const status = typeof squareInvoice?.status === "string" ? squareInvoice.status : "DRAFT";
    if (!url || status === "DRAFT") {
      const published = await squareRequest(
        deps,
        `/v2/invoices/${encodeURIComponent(squareInvoiceId)}/publish`,
        {
          method: "POST",
          body: {
            version: Number(squareInvoice?.version) || 0,
            idempotency_key: idempotencyKey("ii-pub-", invoice.id),
          },
        },
        deadline,
      );
      url = publicUrlOf(published.body) || url;
      if (!url) {
        const retrieved = await squareRequest(
          deps,
          `/v2/invoices/${encodeURIComponent(squareInvoiceId)}`,
          { method: "GET" },
          deadline,
        );
        url = publicUrlOf(retrieved.body);
      }
    }

    if (!url) {
      return { ok: false, error: "Square invoice published without a public URL" };
    }

    return {
      ok: true,
      skipped: false,
      squareInvoiceId,
      squareInvoiceUrl: url,
      squareOrderId: typeof squareInvoice?.order_id === "string" && squareInvoice.order_id ? squareInvoice.order_id : orderId,
      squareCustomerId: customerId,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Square invoice sync failed" };
  }
}
