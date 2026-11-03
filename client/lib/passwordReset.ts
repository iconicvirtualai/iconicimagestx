import { sendPasswordResetEmail } from "firebase/auth";
import {
  ENTER_EMAIL_NOTICE,
  FORGOT_PASSWORD_NOTICE,
  passwordResetActionSettings,
} from "@shared/passwordAccount";
import { auth } from "./firebase";

function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Firebase sends the reset. This does not check CLIENT_NOTIFY_LIVE.
 * Success, an unknown address, and a send error all return the same notice.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<string> {
  const trimmed = email.trim();
  if (!looksLikeEmail(trimmed)) return ENTER_EMAIL_NOTICE;
  try {
    await sendPasswordResetEmail(auth, trimmed, passwordResetActionSettings(origin));
  } catch (err: unknown) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "unknown";
    console.error("[password-reset]", code);
  }
  return FORGOT_PASSWORD_NOTICE;
}
