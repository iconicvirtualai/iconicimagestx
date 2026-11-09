/**
 * Square quick-pay payment links for invoice checkout and deposits.
 * One retry drops pre_populated_data when Square rejects that object.
 * The retry uses a new idempotency key. Tokens and buyer PII are not logged.
 */

import { squareApiBaseUrl } from "../../shared/squareInvoice";
import {
  readSquareErrors,
  squarePaymentLinkIdempotencyKey,
  squarePrefillRejected,
  type SquareApiError,
} from "../../shared/squareCheckout";

export interface SquareQuickPayInput {
  invoiceId: string;
  purpose: "checkout" | "deposit";
  amountCents: number;
  name: string;
  redirectUrl: string;
  prefill: Record<string, unknown>;
  paymentNote: string;
  logLabel: string;
  failureMessage: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export type SquareQuickPayResult =
  | {
      ok: true;
      checkoutUrl: string;
      linkId: string | null;
      orderId: string | null;
    }
  | { ok: false; message: string; errors: SquareApiError[] };

function prefillOrNull(
  prefill: Record<string, unknown>,
): Record<string, unknown> | null {
  return prefill && Object.keys(prefill).length > 0 ? prefill : null;
}

export async function createSquareQuickPayLink(
  input: SquareQuickPayInput,
): Promise<SquareQuickPayResult> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, message: input.failureMessage, errors: [] };
  }
  const populated = prefillOrNull(input.prefill);
  const attempts: Array<Record<string, unknown> | null> = populated
    ? [populated, null]
    : [null];
  let lastErrors: SquareApiError[] = [];

  for (let attempt = 0; attempt < attempts.length; attempt += 1) {
    const prefill = attempts[attempt];
    const body: Record<string, unknown> = {
      idempotency_key: squarePaymentLinkIdempotencyKey({
        invoiceId: input.invoiceId,
        purpose: input.purpose,
        amountCents: input.amountCents,
        attempt,
      }),
      quick_pay: {
        name: input.name.slice(0, 255),
        price_money: {
          amount: input.amountCents,
          currency: "USD",
        },
        location_id: env.SQUARE_LOCATION_ID,
      },
      checkout_options: {
        redirect_url: input.redirectUrl,
      },
      payment_note: input.paymentNote,
    };
    if (prefill) body.pre_populated_data = prefill;

    const response = await fetchImpl(
      `${squareApiBaseUrl(env.SQUARE_ENVIRONMENT)}/v2/online-checkout/payment-links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Square-Version": env.SQUARE_VERSION || "2026-08-20",
          Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(body),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      const link =
        result && typeof result === "object"
          ? (
              result as {
                payment_link?: {
                  url?: unknown;
                  id?: unknown;
                  order_id?: unknown;
                };
              }
            ).payment_link
          : undefined;
      const checkoutUrl = typeof link?.url === "string" ? link.url : "";
      if (!checkoutUrl.startsWith("https://")) {
        console.error(`[Payments] ${input.logLabel}`, {
          attempt,
          status: response.status,
          errors: [
            {
              category: "",
              code: "NO_CHECKOUT_URL",
              field: "payment_link.url",
              detail: "Square did not return an https checkout url.",
            },
          ],
        });
        return { ok: false, message: input.failureMessage, errors: [] };
      }
      return {
        ok: true,
        checkoutUrl,
        linkId: typeof link?.id === "string" ? link.id : null,
        orderId: typeof link?.order_id === "string" ? link.order_id : null,
      };
    }

    lastErrors = readSquareErrors(result);
    console.error(`[Payments] ${input.logLabel}`, {
      attempt,
      status: response.status,
      errors: lastErrors,
    });
    const retryWithoutPrefill =
      attempt === 0 && prefill !== null && squarePrefillRejected(result);
    if (!retryWithoutPrefill) break;
  }

  return { ok: false, message: input.failureMessage, errors: lastErrors };
}
