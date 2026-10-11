/**
 * HMAC grant for a locked owner's display images.
 * The public listing route 404s when Lock Studio is on, so the owner and
 * gallery payloads cannot point at /api/media/display/:listingId/:index.
 * This token names the listing or gallery and an expiry. It does not carry
 * a source URL. The display route rebuilds that view's image set and serves
 * only the requested index.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { isHostedDeployment, type EnvLike } from "./tempAdmin";

export const OWNER_DISPLAY_TTL_MS = 4 * 60 * 60 * 1000;

export type OwnerDisplayScope = "listing" | "gallery";

export interface OwnerDisplayClaims {
  scope: OwnerDisplayScope;
  id: string;
  exp: number;
}

type SecretEnv = EnvLike & {
  OWNER_SESSION_SECRET?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  OWNER_SHEETS_SA_KEY?: string;
};

const DEV_SECRET = "iconic-owner-display-dev-v1";
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function ownerDisplaySecret(env: SecretEnv = process.env): string | null {
  const explicit = env.OWNER_SESSION_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount && serviceAccount.length >= 32) {
    return createHmac("sha256", "iconic-owner-display-v1").update(serviceAccount).digest("hex");
  }
  const sheetsKey = env.OWNER_SHEETS_SA_KEY;
  if (sheetsKey && sheetsKey.length >= 32) {
    return createHmac("sha256", "iconic-owner-display-v1").update(sheetsKey).digest("hex");
  }
  if (!isHostedDeployment(env)) return DEV_SECRET;
  return null;
}

export function signOwnerDisplayToken(
  claims: { scope: OwnerDisplayScope; id: string },
  now = Date.now(),
  env: SecretEnv = process.env,
): string | null {
  const secret = ownerDisplaySecret(env);
  if (!secret || !ID_PATTERN.test(claims.id)) return null;
  if (claims.scope !== "listing" && claims.scope !== "gallery") return null;
  const body = Buffer.from(JSON.stringify({
    s: claims.scope,
    id: claims.id,
    exp: now + OWNER_DISPLAY_TTL_MS,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readOwnerDisplayToken(
  token: string,
  now = Date.now(),
  env: SecretEnv = process.env,
): OwnerDisplayClaims | null {
  if (!token || token.length > 512) return null;
  const secret = ownerDisplaySecret(env);
  if (!secret) return null;
  const splitAt = token.indexOf(".");
  if (splitAt <= 0 || splitAt !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, splitAt);
  const sig = token.slice(splitAt + 1);
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      s?: unknown;
      id?: unknown;
      exp?: unknown;
    };
    if (parsed.s !== "listing" && parsed.s !== "gallery") return null;
    if (typeof parsed.id !== "string" || !ID_PATTERN.test(parsed.id)) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp) || parsed.exp < now) return null;
    return { scope: parsed.s, id: parsed.id, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function ownerDisplayPath(token: string, index: number): string {
  return `/api/media/display/o/${encodeURIComponent(token)}/${index}`;
}
