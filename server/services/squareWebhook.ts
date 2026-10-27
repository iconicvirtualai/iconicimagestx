/**
 * Square webhook signature.
 * HMAC-SHA256 of the notification URL plus the raw request body, keyed with
 * SQUARE_WEBHOOK_SIGNATURE_KEY. Square sends the digest in
 * x-square-hmacsha256-signature.
 *
 * Square signs the notification URL configured on the subscription. Production
 * posts to https://iconicimagestx.vercel.app/api/payments/square-webhook.
 * APP_URL and FRONTEND_URL stay on iconicimagestx.com until the domain cutover,
 * so the check tries the explicit URL, the Vercel production host, the
 * vercel.app fallback, and those app origins.
 */

import crypto from "crypto";

const WEBHOOK_PATH = "/api/payments/square-webhook";

/** Subscription URL Square is delivering to today. */
export const SQUARE_WEBHOOK_VERCEL_URL = `https://iconicimagestx.vercel.app${WEBHOOK_PATH}`;

/** Custom domain, accepted so a later cutover does not break verification. */
export const SQUARE_WEBHOOK_CUSTOM_DOMAIN_URL = `https://iconicimagestx.com${WEBHOOK_PATH}`;

export function squareWebhookSignatureKey(env: Record<string, string | undefined> = process.env): string {
  return (env.SQUARE_WEBHOOK_SIGNATURE_KEY || "").trim();
}

export function squareWebhookNotificationUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.SQUARE_WEBHOOK_NOTIFICATION_URL || "").trim();
}

/** Origin or host → the webhook URL Square would sign. Full webhook URLs pass through. */
export function squareWebhookUrlFromOrigin(value: string | undefined): string {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) && trimmed.includes(WEBHOOK_PATH)) return trimmed;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return `${withScheme}${WEBHOOK_PATH}`;
}

/**
 * Every notification URL a real Square delivery might have signed.
 * SQUARE_WEBHOOK_NOTIFICATION_URL wins when set, and is not required.
 */
export function squareWebhookNotificationUrls(env: Record<string, string | undefined> = process.env): string[] {
  const appOrigin = (env.APP_URL || "").trim() || "https://iconicimagestx.com";
  const urls = [
    squareWebhookNotificationUrl(env),
    squareWebhookUrlFromOrigin(env.VERCEL_PROJECT_PRODUCTION_URL),
    SQUARE_WEBHOOK_VERCEL_URL,
    squareWebhookUrlFromOrigin(appOrigin),
    squareWebhookUrlFromOrigin(env.FRONTEND_URL),
    SQUARE_WEBHOOK_CUSTOM_DOMAIN_URL,
  ];
  return [...new Set(urls.filter((url) => url.length > 0))];
}

export function signSquareWebhook(rawBody: string, key: string, notificationUrl: string): string {
  return crypto.createHmac("sha256", key).update(notificationUrl + rawBody).digest("base64");
}

export function squareWebhookSignatureValid(
  rawBody: string,
  received: string | undefined,
  key: string,
  notificationUrl: string,
): boolean {
  if (!received || !key || !notificationUrl) return false;
  const expected = signSquareWebhook(rawBody, key, notificationUrl);
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/** Original bytes only. A parsed JSON object is not the signed payload. */
export function squareWebhookRawBody(body: unknown): string | null {
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  if (typeof body === "string") return body;
  return null;
}

/**
 * Raw body already stored on the request, without invoking a getter.
 * undefined: body is missing or still a getter (the caller may replay the stream).
 * null: a value is present and it is not raw bytes.
 */
export function squareWebhookOwnedRawBody(req: object): string | null | undefined {
  const desc = Object.getOwnPropertyDescriptor(req, "body");
  if (!desc || !("value" in desc)) return undefined;
  return squareWebhookRawBody(desc.value);
}

/**
 * Bytes Square signed. Express.raw stores a Buffer on the normal Vercel path.
 * If a body helper already consumed the stream and left only a getter, replay
 * the restored bytes. A parsed object is refused instead of re-serialized.
 */
export function readSquareWebhookRawBody(req: {
  body?: unknown;
  readable?: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener: (...args: any[]) => void): unknown;
}): Promise<string | null> {
  const owned = squareWebhookOwnedRawBody(req);
  if (owned !== undefined) return Promise.resolve(owned);
  if (req.readable !== false) return Promise.resolve(squareWebhookRawBody(req.body));

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      req.off?.("data", onData);
      req.off?.("end", finish);
      req.off?.("error", finish);
      if (!chunks.length) {
        resolve(squareWebhookRawBody(req.body));
        return;
      }
      const buf = Buffer.concat(chunks);
      req.body = buf;
      resolve(buf.toString("utf8"));
    };
    const onData = (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    req.on("data", onData);
    req.on("end", finish);
    req.on("error", finish);
    setImmediate(finish);
  });
}
