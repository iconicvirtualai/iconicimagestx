import crypto from "node:crypto";
import { normalizeEmail } from "../../shared/emailMarketing/contacts";

/** HMAC of the normalized address. The secret stays on the server. */
export function signUnsubscribeEmail(email: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}

export function unsubscribeTokenMatches(email: string, token: string, secret: string): boolean {
  const expected = signUnsubscribeEmail(email, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(token);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** One signed /unsubscribe link for this recipient. No tracking host. */
export function signedUnsubscribeUrl(origin: string, email: string, secret: string): string {
  const url = new URL("/unsubscribe", origin);
  const normalized = normalizeEmail(email);
  url.searchParams.set("email", normalized);
  if (secret) url.searchParams.set("token", signUnsubscribeEmail(normalized, secret));
  return url.toString();
}
