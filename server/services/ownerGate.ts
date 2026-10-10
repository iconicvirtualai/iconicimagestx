/**
 * Server-side owner gate.
 * A Firebase ID token or a session cookie minted from one is the only way in.
 * Admin, coordinator, and the local temp-admin token do not qualify.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { IncomingHttpHeaders } from "http";
import admin from "firebase-admin";
import { isOwnerEmail, ownerAllowlist } from "../../shared/ownerAccess";
import { isHostedDeployment, type EnvLike } from "../../shared/tempAdmin";

export const OWNER_FIXTURE_BEARER = "owner-fixture";
export const OWNER_SESSION_COOKIE = "owners_session";
const SESSION_MS = 12 * 60 * 60 * 1000;
const BLOCKED_BEARERS = new Set(["temp-admin-token", OWNER_FIXTURE_BEARER]);

export interface OwnerIdentity {
  email: string;
  uid: string;
}

type TokenVerifier = (token: string) => Promise<{ email?: string; uid: string } | null>;

let tokenVerifier: TokenVerifier = defaultVerifyIdToken;

export function ownerRuntimeEnv(env: NodeJS.ProcessEnv = process.env): EnvLike {
  return {
    OWNER_EMAILS: env.OWNER_EMAILS,
    OWNER_SUITE_FIXTURES: env.OWNER_SUITE_FIXTURES,
    OWNER_SESSION_SECRET: env.OWNER_SESSION_SECRET,
    OWNER_SHEETS_SA_EMAIL: env.OWNER_SHEETS_SA_EMAIL,
    OWNER_SHEETS_SA_KEY: env.OWNER_SHEETS_SA_KEY,
    FIREBASE_SERVICE_ACCOUNT: env.FIREBASE_SERVICE_ACCOUNT,
    VERCEL: env.VERCEL,
    VERCEL_ENV: env.VERCEL_ENV,
    NODE_ENV: env["NODE_ENV"],
  };
}

export function ownerFixturesEnabled(env: EnvLike = ownerRuntimeEnv()): boolean {
  if (env.OWNER_SUITE_FIXTURES !== "true") return false;
  return !isHostedDeployment(env);
}

export function ownerSessionSecret(env: EnvLike = ownerRuntimeEnv()): string | null {
  const explicit = env.OWNER_SESSION_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount && serviceAccount.length >= 32) {
    return createHmac("sha256", "iconic-owners-suite-v1").update(serviceAccount).digest("hex");
  }
  const sheetsKey = env.OWNER_SHEETS_SA_KEY;
  if (sheetsKey && sheetsKey.length >= 32) {
    return createHmac("sha256", "iconic-owners-suite-v1").update(sheetsKey).digest("hex");
  }
  return null;
}

export function signOwnerSession(identity: OwnerIdentity, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({
    email: identity.email.trim().toLowerCase(),
    uid: identity.uid,
    exp: now + SESSION_MS,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readOwnerSession(token: string, secret: string, now = Date.now()): OwnerIdentity | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      email?: string;
      uid?: string;
      exp?: number;
    };
    if (!parsed.email || !parsed.uid || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return { email: parsed.email.trim().toLowerCase(), uid: parsed.uid };
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string, env: EnvLike = ownerRuntimeEnv(), maxAge = SESSION_MS / 1000): string {
  const secure = isHostedDeployment(env);
  const parts = [
    `${OWNER_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function resolveOwnerIdentity(
  headers: IncomingHttpHeaders,
  env: EnvLike = ownerRuntimeEnv(),
): Promise<OwnerIdentity | null> {
  const allow = ownerAllowlist(env.OWNER_EMAILS);
  if (allow.length === 0) return null;

  const authorization = headerString(headers.authorization);
  if (ownerFixturesEnabled(env) && authorization === `Bearer ${OWNER_FIXTURE_BEARER}`) {
    return { email: allow[0], uid: "owner-fixture" };
  }

  const secret = ownerSessionSecret(env);
  const cookie = readCookie(headerString(headers.cookie), OWNER_SESSION_COOKIE);
  if (cookie && secret) {
    const session = readOwnerSession(cookie, secret);
    if (session && isOwnerEmail(session.email, allow)) return session;
  }

  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token || BLOCKED_BEARERS.has(token)) return null;
  const verified = await tokenVerifier(token);
  const email = verified?.email?.trim().toLowerCase();
  if (!email || !verified?.uid || !isOwnerEmail(email, allow)) return null;
  return { email, uid: verified.uid };
}

export function __setOwnerIdTokenVerifierForTests(verifier: TokenVerifier | null) {
  tokenVerifier = verifier ?? defaultVerifyIdToken;
}

async function defaultVerifyIdToken(token: string): Promise<{ email?: string; uid: string } | null> {
  if (!admin.apps.length) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { email: decoded.email, uid: decoded.uid };
  } catch {
    return null;
  }
}

function headerString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return rest.join("=") || null;
  }
  return null;
}
