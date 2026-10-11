/**
 * Square webhook signature.
 * HMAC-SHA256 of the notification URL plus the raw request body, keyed with
 * SQUARE_WEBHOOK_SIGNATURE_KEY. Square sends the digest in
 * x-square-hmacsha256-signature. The URL is only SQUARE_WEBHOOK_NOTIFICATION_URL.
 */

import crypto from "crypto";

export function squareWebhookSignatureKey(env: Record<string, string | undefined> = process.env): string {
  return (env.SQUARE_WEBHOOK_SIGNATURE_KEY || "").trim();
}

export function squareWebhookNotificationUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.SQUARE_WEBHOOK_NOTIFICATION_URL || "").trim();
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
  if (typeof body === "string") return body;
  return null;
}
