/**
 * Public client portal (login buttons, /login, /portal, password-setup email).
 *
 * On only when CLIENT_PORTAL_ENABLED is exactly "true".
 * Unset, empty, "TRUE", "1", or "false" stays OFF.
 * Does not read CLIENT_NOTIFY_LIVE, BOOKING_NOTIFY_LIVE, or THANKFUL_RSVP_CONFIRM_LIVE.
 *
 * While off, booking still creates the client Auth user and Firestore client
 * record. The password-setup email is not sent. Client confirmation mail
 * keeps its own notify gate and drops portal links.
 */

export const EMAIL_QUESTIONS_WITH_PORTAL =
  "Questions? Reply to this email or message us through your client portal.";
export const EMAIL_QUESTIONS_WITHOUT_PORTAL = "Questions? Reply to this email.";

/** Empty until a public media link should appear on the coming-soon page. */
export const CLIENT_PORTAL_MEDIA_HREF = "";

export function clientPortalEnabled(env?: Record<string, string | undefined>): boolean {
  return readClientPortalFlag(env) === "true";
}

function readClientPortalFlag(env?: Record<string, string | undefined>): string | undefined {
  if (env) return env.CLIENT_PORTAL_ENABLED;
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (nodeEnv && Object.prototype.hasOwnProperty.call(nodeEnv, "CLIENT_PORTAL_ENABLED")) {
    return nodeEnv.CLIENT_PORTAL_ENABLED;
  }
  return process.env.CLIENT_PORTAL_ENABLED;
}

function loginPath(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).pathname.replace(/\/$/, "") || "/";
    }
  } catch {
    return "";
  }
  const path = trimmed.split(/[?#]/)[0] || "/";
  if (!path.startsWith("/")) return path;
  return path.replace(/\/$/, "") || "/";
}

/** Header, footer, and other chrome that sends a client to login or the portal. */
export function isClientLoginChrome(href: string, label = ""): boolean {
  const path = loginPath(href);
  if (path === "/login" || path === "/portal" || path.startsWith("/portal/")) return true;
  return /^(log\s*in|login|client\s*login|sign\s*in)$/i.test(label.trim());
}

export function presentClientEmailHtml(html: string, env?: Record<string, string | undefined>): string {
  if (!html || clientPortalEnabled(env)) return html;
  return html
    .split(EMAIL_QUESTIONS_WITH_PORTAL).join(EMAIL_QUESTIONS_WITHOUT_PORTAL)
    .replace(/<p[^>]*>\s*<a\b[^>]*>\s*View Your Portal\s*<\/a>\s*<\/p>/gi, "")
    .replace(/<p[^>]*>\s*<a\b[^>]*>\s*Open the client portal\s*<\/a>\s*<\/p>/gi, "")
    .replace(/<p[^>]*>[^<]*client portal login[^<]*<\/p>/gi, "")
    .replace(/<p[^>]*>[^<]*sign in at\s*<a\b[^>]*>[\s\S]*?<\/a>\.?[^<]*<\/p>/gi, "")
    .replace(/<p[^>]*>[^<]*Sign in at the client portal[^<]*<\/p>/gi, "");
}

export function presentClientEmailText(text: string, env?: Record<string, string | undefined>): string {
  if (!text || clientPortalEnabled(env)) return text;
  return text
    .split(EMAIL_QUESTIONS_WITH_PORTAL).join(EMAIL_QUESTIONS_WITHOUT_PORTAL)
    .replace(/Sign in at the client portal when you are ready\.?\s*/gi, "");
}
