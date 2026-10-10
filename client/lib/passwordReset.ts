/**
 * Client login "Forgot password?" uses Firebase Auth's own mailer
 * (`sendPasswordResetEmail`), not our SMTP templates. It must not consult
 * CLIENT_NOTIFY_LIVE / CLIENT_COMMS_ZONE. That gate is for our mailer
 * (including booking account_password_setup). Blocking recovery here locks
 * a client out without sending anything.
 *
 * Callers pass the Firebase function in. This module does not import the SDK,
 * so tests can mock the send and never touch mail.
 */

/** Shown for a sent link, an unknown address, and a Firebase invalid-email. */
export const PASSWORD_RESET_NOTICE =
  "If an account exists for that email, we'll send a reset link. Check your inbox.";

/** Client-side format check only. Does not say whether an account exists. */
export const PASSWORD_RESET_FORMAT_MESSAGE = "Enter a valid email address.";

const CONTINUE_URI_CODES = new Set([
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  "auth/missing-continue-uri",
]);

/**
 * These Firebase results must not get their own toast. A distinct message
 * would tell the person whether that address has an account.
 * auth/user-disabled is included because "this account is disabled" confirms one exists.
 */
const NEUTRAL_RESULT_CODES = new Set([
  "auth/invalid-email",
  "auth/user-not-found",
  "auth/user-disabled",
]);

/** Blank or not shaped like an email. Firebase is not called. */
export function passwordResetFormatError(email: string): string | null {
  const address = email.trim();
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return PASSWORD_RESET_FORMAT_MESSAGE;
  }
  return null;
}

export function passwordResetErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : null;
}

/** Staff console only. Never return this string to the client. */
export function passwordResetLogLine(err: unknown): string {
  const code = passwordResetErrorCode(err) ?? "unknown";
  if (CONTINUE_URI_CODES.has(code)) {
    return `[Auth] Password reset failed: ${code}. Check Firebase Auth authorized domains and the password-reset template action URL.`;
  }
  return `[Auth] Password reset failed: ${code}`;
}

/** Client-facing copy. Does not include Firebase error codes or account existence. */
export function passwordResetFailureMessage(err: unknown): string {
  const code = passwordResetErrorCode(err);
  if (code && NEUTRAL_RESULT_CODES.has(code)) return PASSWORD_RESET_NOTICE;
  switch (code) {
    case "auth/too-many-requests":
      return "Too many reset attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "We couldn't reach the sign-in service. Check your connection and try again.";
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
    case "auth/missing-continue-uri":
      return "We couldn't send the reset email because this site's reset link is not authorized yet. Contact the office and we'll help you sign in.";
    default:
      return "We couldn't send the reset email. Try again in a few minutes, or contact the office.";
  }
}

export async function requestPasswordReset(
  email: string,
  send: (email: string) => Promise<void>,
  log: (line: string) => void = (line) => {
    console.error(line);
  },
): Promise<void> {
  const formatError = passwordResetFormatError(email);
  if (formatError) {
    throw new Error(formatError);
  }
  const address = email.trim();
  try {
    await send(address);
  } catch (err) {
    log(passwordResetLogLine(err));
    const code = passwordResetErrorCode(err);
    if (code && NEUTRAL_RESULT_CODES.has(code)) return;
    throw new Error(passwordResetFailureMessage(err));
  }
}
