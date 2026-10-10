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

const CONTINUE_URI_CODES = new Set([
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  "auth/missing-continue-uri",
]);

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

/** Client-facing copy. Does not include Firebase error codes. */
export function passwordResetFailureMessage(err: unknown): string {
  switch (passwordResetErrorCode(err)) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-not-found":
      return "No portal account uses that email. Check the spelling, or create an account.";
    case "auth/user-disabled":
      return "This account is disabled. Contact the office and we'll help you sign in.";
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
  const address = email.trim();
  if (!address) {
    throw new Error("Enter the email on the account.");
  }
  try {
    await send(address);
  } catch (err) {
    log(passwordResetLogLine(err));
    throw new Error(passwordResetFailureMessage(err));
  }
}
