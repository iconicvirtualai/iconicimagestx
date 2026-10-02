/**
 * Password-reset link helpers shared by staff and portal login.
 *
 * Firebase sends the email. The link host is the action URL in
 * Authentication → Templates, not this continue URL. The continue URL is
 * where the person returns after a new password is saved. It must be an
 * authorized domain or sendPasswordResetEmail fails with
 * auth/unauthorized-continue-uri.
 *
 * handleCodeInApp stays false: that flag is for a mobile app universal
 * link. This product completes the reset on the web.
 */

export const ADMIN_LOGIN_PATH = "/admin/login";
export const PORTAL_LOGIN_PATH = "/portal";
export const RESET_PASSWORD_PATH = "/reset-password";

/** Page that must be set as the Firebase password-reset action URL. */
export const PRODUCTION_RESET_HANDLER_URL = "https://iconicimagestx.vercel.app/reset-password";

export const PASSWORD_MIN_LENGTH = 6;

const RETURN_PATHS = new Set([ADMIN_LOGIN_PATH, PORTAL_LOGIN_PATH, "/login"]);

export type PasswordResetAudience = "admin" | "portal";

export interface PasswordResetActionCodeSettings {
  url: string;
  handleCodeInApp: false;
}

export function passwordResetContinueUrl(origin: string, audience: PasswordResetAudience): string {
  const base = origin.replace(/\/+$/, "");
  const path = audience === "portal" ? PORTAL_LOGIN_PATH : ADMIN_LOGIN_PATH;
  return `${base}${path}`;
}

export function passwordResetActionCodeSettings(
  origin: string,
  audience: PasswordResetAudience,
): PasswordResetActionCodeSettings {
  return {
    url: passwordResetContinueUrl(origin, audience),
    handleCodeInApp: false,
  };
}

export function parseAuthActionParams(search: string, hash = ""): {
  mode: string | null;
  oobCode: string | null;
  continueUrl: string | null;
} {
  const fromSearch = new URLSearchParams(stripQueryPrefix(search));
  const fromHash = new URLSearchParams(hashQuery(hash));
  const pick = (key: string) => fromSearch.get(key) || fromHash.get(key);
  return {
    mode: pick("mode"),
    oobCode: pick("oobCode"),
    continueUrl: pick("continueUrl"),
  };
}

/**
 * Only send people back to a sign-in route on the site that opened the link.
 * A tampered continueUrl must not become an open redirect.
 */
export function safePasswordResetReturnPath(
  continueUrl: string | null | undefined,
  currentOrigin: string,
  fallbackPath = ADMIN_LOGIN_PATH,
): string {
  if (!continueUrl) return fallbackPath;
  let current: URL;
  try {
    current = new URL(currentOrigin);
  } catch {
    return fallbackPath;
  }
  let parsed: URL;
  try {
    parsed = new URL(continueUrl, current.origin);
  } catch {
    return fallbackPath;
  }
  if (parsed.origin !== current.origin) return fallbackPath;
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!RETURN_PATHS.has(pathname)) return fallbackPath;
  return `${pathname}${parsed.search}`;
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export function firebaseErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export function passwordResetSendError(code: string | undefined, siteHost?: string): string {
  const host = siteHost || "this website";
  switch (code) {
    case "auth/invalid-email":
    case "auth/missing-email":
      return "Enter a valid email address.";
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
      return `Password reset is not enabled for ${host} yet. Add ${host} under Firebase Authentication → Settings → Authorized domains, then try again.`;
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/user-not-found":
      return "No account was found for that email.";
    case "auth/user-disabled":
      return "This account is disabled.";
    default:
      return "Could not send the reset email. Try again.";
  }
}

export function passwordResetConfirmError(code: string | undefined): string {
  switch (code) {
    case "auth/expired-action-code":
      return "This reset link has expired. Request a new one from the sign-in page.";
    case "auth/invalid-action-code":
      return "This reset link is invalid or has already been used. Request a new one from the sign-in page.";
    case "auth/user-disabled":
      return "This account is disabled.";
    case "auth/user-not-found":
      return "No account was found for this reset link.";
    case "auth/weak-password":
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    default:
      return "Could not reset the password. Request a new link and try again.";
  }
}

function stripQueryPrefix(value: string): string {
  if (!value) return "";
  const query = value.startsWith("?") ? value.slice(1) : value;
  return query.startsWith("?") ? query.slice(1) : query;
}

function hashQuery(hash: string): string {
  if (!hash) return "";
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const queryAt = body.indexOf("?");
  return queryAt >= 0 ? body.slice(queryAt + 1) : body;
}
