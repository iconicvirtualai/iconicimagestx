/**
 * Send switch for the GMass marketing portal only.
 * CLIENT_NOTIFY_LIVE does not open or close these sends.
 */
export function marketingSendLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.MARKETING_SEND_LIVE === "true";
}

/**
 * Origin baked into marketing emails (unsubscribe and other public links).
 * MARKETING_PUBLIC_URL wins. APP_URL is the fallback and stays the Wix domain
 * for the rest of the site. The request host is only used when both are empty.
 */
export function marketingPublicUrl(
  env: Record<string, string | undefined> = process.env,
  requestOrigin = "",
): string {
  const configured = String(env.MARKETING_PUBLIC_URL || env.APP_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return requestOrigin.replace(/\/$/, "");
}
