/**
 * Send switch for the GMass marketing portal only.
 * CLIENT_NOTIFY_LIVE does not open or close these sends.
 */

import { publicSiteUrl } from "../publicSiteUrl";

export function marketingSendLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.MARKETING_SEND_LIVE === "true";
}

/**
 * Origin baked into marketing emails (unsubscribe and other public links).
 * MARKETING_PUBLIC_URL wins. An empty value uses publicSiteUrl().
 * APP_URL stays the Wix domain and is not a fallback.
 */
export function marketingPublicUrl(
  env: Record<string, string | undefined> = process.env,
  _requestOrigin = "",
): string {
  const configured = String(env.MARKETING_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return publicSiteUrl(env);
}
