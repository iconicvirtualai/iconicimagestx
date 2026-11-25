/**
 * Read-only Square order and payment lookups.
 * Used to match a payment link back to an invoice and to confirm a return-page payment.
 * Tokens stay in the environment and are not logged.
 */

import { squareApiBaseUrl } from "../../shared/squareInvoice";

export interface SquareOrderSnapshot {
  referenceId: string;
  state: string;
  paidCents: number;
  paymentIds: string[];
}

type Env = Record<string, string | undefined>;

function squareHeaders(env: Env): Record<string, string> | null {
  const token = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    "Square-Version": env.SQUARE_VERSION || "2026-08-20",
  };
}

export async function fetchSquareOrderSnapshot(
  orderId: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SquareOrderSnapshot | null> {
  const headers = squareHeaders(env);
  const id = orderId.trim();
  if (!headers || !id) return null;
  let response: Response;
  try {
    response = await fetchImpl(`${squareApiBaseUrl(env.SQUARE_ENVIRONMENT)}/v2/orders/${encodeURIComponent(id)}`, {
      headers,
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as { order?: Record<string, unknown> } | null;
  const order = body?.order;
  if (!order || typeof order !== "object") return null;
  const tenders = Array.isArray(order.tenders) ? order.tenders : [];
  let paidCents = 0;
  const paymentIds: string[] = [];
  for (const tender of tenders) {
    if (!tender || typeof tender !== "object") continue;
    const row = tender as { amount_money?: { amount?: unknown }; payment_id?: unknown };
    const amount = Number(row.amount_money?.amount);
    if (Number.isFinite(amount) && amount > 0) paidCents += amount;
    const paymentId = typeof row.payment_id === "string" ? row.payment_id.trim() : "";
    if (paymentId) paymentIds.push(paymentId);
  }
  return {
    referenceId: typeof order.reference_id === "string" ? order.reference_id.trim() : "",
    state: typeof order.state === "string" ? order.state : "",
    paidCents,
    paymentIds,
  };
}

export async function fetchSquarePayment(
  paymentId: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  const headers = squareHeaders(env);
  const id = paymentId.trim();
  if (!headers || !id) return null;
  let response: Response;
  try {
    response = await fetchImpl(`${squareApiBaseUrl(env.SQUARE_ENVIRONMENT)}/v2/payments/${encodeURIComponent(id)}`, {
      headers,
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as { payment?: Record<string, unknown> } | null;
  const payment = body?.payment;
  return payment && typeof payment === "object" ? payment : null;
}
