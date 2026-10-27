/**
 * Square card on file. The browser sends a Square nonce, never a card number.
 */

import { randomUUID } from "node:crypto";
import { cardOnFileFromSquare, sanitizeBilling, type BillingProfile, type CardOnFile } from "../../shared/clientHubSettings";
import { squareApiBaseUrl, squareConfigured } from "../../shared/squareInvoice";

type FetchImpl = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface SquareCardInput {
  sourceId: string;
  customerId?: string;
  email: string;
  name: string;
  phone: string;
  billing: ReturnType<typeof sanitizeBilling>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function saveSquareCardOnFile(
  input: SquareCardInput,
  deps: { fetchImpl?: FetchImpl; env?: Record<string, string | undefined> } = {},
): Promise<{ card: CardOnFile } | { error: string }> {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  if (!squareConfigured(env)) return { error: "Square is not configured yet." };
  const sourceId = input.sourceId.trim();
  if (!sourceId || sourceId.length > 200) return { error: "Square did not return a card token." };

  const base = squareApiBaseUrl(env.SQUARE_ENVIRONMENT);
  const headers = {
    "Content-Type": "application/json",
    "Square-Version": env.SQUARE_VERSION || "2026-08-20",
    Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let customerId = input.customerId?.trim() || "";
    if (!customerId && input.email) {
      const search = await fetchImpl(`${base}/v2/customers/search`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          query: { filter: { email_address: { exact: input.email } } },
        }),
      });
      const searchBody = record(await search.json().catch(() => ({})));
      const customers = Array.isArray(searchBody.customers) ? searchBody.customers : [];
      const found = record(customers[0]);
      if (typeof found.id === "string") customerId = found.id;
    }
    if (!customerId) {
      const created = await fetchImpl(`${base}/v2/customers`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          given_name: input.name,
          email_address: input.email || undefined,
          phone_number: input.phone || undefined,
        }),
      });
      const createdBody = record(await created.json().catch(() => ({})));
      const customer = record(createdBody.customer);
      if (!created.ok || typeof customer.id !== "string") return { error: "Square could not save the customer." };
      customerId = customer.id;
    }

    const address = input.billing.line1
      ? {
        address_line_1: input.billing.line1,
        address_line_2: input.billing.line2 || undefined,
        locality: input.billing.city || undefined,
        administrative_district_level_1: input.billing.state || undefined,
        postal_code: input.billing.postalCode || undefined,
        country: "US",
      }
      : undefined;
    const cardResponse = await fetchImpl(`${base}/v2/cards`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        source_id: sourceId,
        card: {
          customer_id: customerId,
          cardholder_name: input.name || undefined,
          billing_address: address,
        },
      }),
    });
    const cardBody = record(await cardResponse.json().catch(() => ({})));
    const card = cardOnFileFromSquare(record(cardBody.card), customerId);
    if (!cardResponse.ok || !card) return { error: "Square could not keep that card on file." };
    return { card };
  } catch (err) {
    console.error("[Client hub] Square card on file failed", err);
    return { error: "Square could not keep that card on file." };
  } finally {
    clearTimeout(timer);
  }
}

export function publicBilling(billing: BillingProfile, square: { applicationId: string; locationId: string; environment: string }) {
  return {
    email: billing.email,
    phone: billing.phone,
    line1: billing.line1,
    line2: billing.line2,
    city: billing.city,
    state: billing.state,
    postalCode: billing.postalCode,
    card: billing.card ? {
      brand: billing.card.brand,
      last4: billing.card.last4,
      expMonth: billing.card.expMonth,
      expYear: billing.card.expYear,
    } : null,
    balanceCents: billing.balanceCents,
    creditsCents: billing.creditsCents,
    credits: billing.credits,
    square,
  };
}
