/**
 * Square payment link for a holiday Buy Now order.
 * Same quick-pay API as the senior-living deposit checkout.
 * Does not publish a Square invoice. Credentials stay in the environment.
 */

import { squareApiBaseUrl } from "../../shared/squareInvoice";
import {
  holidayPaymentLinkBody,
  holidayReturnPath,
  squareCheckoutMissingEnv,
} from "../../shared/holidayCheckout";
import { publicSiteUrl } from "../../shared/publicSiteUrl";

export interface HolidaySquareCheckoutInput {
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
  email?: string;
  itemName: string;
  leadSource: string;
  orderNumber: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export interface HolidaySquareCheckoutResult {
  payment: "square" | "fallback";
  checkoutUrl?: string;
  missingEnv?: string[];
  linkId?: string;
  squareOrderId?: string;
}

export async function createHolidaySquareCheckout(
  input: HolidaySquareCheckoutInput,
): Promise<HolidaySquareCheckoutResult> {
  const env = input.env ?? process.env;
  const missingEnv = squareCheckoutMissingEnv(env);
  if (missingEnv.length > 0) {
    console.error("[Holiday] Square payment link was not created.", {
      reason: "missing_env",
      missingEnv,
      invoiceId: input.invoiceId,
      orderNumber: input.orderNumber,
    });
    return { payment: "fallback", missingEnv };
  }
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("[Holiday] Square payment link was not created.", {
      reason: "invalid_amount",
      amount: input.amount,
      invoiceId: input.invoiceId,
      orderNumber: input.orderNumber,
    });
    return { payment: "fallback" };
  }

  let origin = "https://iconicimagestx.vercel.app";
  try {
    origin = publicSiteUrl({
      PUBLIC_SITE_URL: env.PUBLIC_SITE_URL,
      VITE_PUBLIC_SITE_URL: env.VITE_PUBLIC_SITE_URL,
    });
  } catch (err) {
    console.error("[Holiday] Public site URL is not https. Using the Vercel app.", err);
  }
  const redirectUrl = `${origin}${holidayReturnPath(input.leadSource, input.orderNumber)}`;

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${squareApiBaseUrl(env.SQUARE_ENVIRONMENT)}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": env.SQUARE_VERSION || "2026-08-20",
        Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(holidayPaymentLinkBody({
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
        amount,
        itemName: input.itemName || "Holiday order",
        email: input.email,
        locationId: env.SQUARE_LOCATION_ID || "",
        redirectUrl,
      })),
    });
  } catch (err) {
    console.error("[Holiday] Square payment link was not created.", {
      reason: "request_failed",
      invoiceId: input.invoiceId,
      orderNumber: input.orderNumber,
      message: err instanceof Error ? err.message : "request failed",
    });
    return { payment: "fallback" };
  }
  const result = await response.json().catch(() => ({})) as {
    payment_link?: { url?: string; id?: string; order_id?: string };
    errors?: Array<{ category?: string; code?: string; detail?: string }>;
  };
  const checkoutUrl = typeof result.payment_link?.url === "string" ? result.payment_link.url : "";
  if (!response.ok || !checkoutUrl.startsWith("https://")) {
    const errors = Array.isArray(result.errors)
      ? result.errors.slice(0, 5).map((error) => ({
        category: typeof error?.category === "string" ? error.category : undefined,
        code: typeof error?.code === "string" ? error.code : undefined,
        detail: typeof error?.detail === "string" ? error.detail.slice(0, 300) : undefined,
      }))
      : [];
    console.error("[Holiday] Square payment link was not created.", {
      reason: checkoutUrl ? "not_https" : "no_url",
      status: response.status,
      invoiceId: input.invoiceId,
      orderNumber: input.orderNumber,
      errors,
    });
    return { payment: "fallback" };
  }
  return {
    payment: "square",
    checkoutUrl,
    linkId: result.payment_link?.id,
    squareOrderId: result.payment_link?.order_id,
  };
}
