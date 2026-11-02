import { staffHomePath } from "./staffAccess";

export const MIN_ACCOUNT_PASSWORD_LENGTH = 8;
export const MAX_ACCOUNT_PASSWORD_LENGTH = 128;
export const CHANGE_PASSWORD_PATH = "/change-password";
export const FORGOT_PASSWORD_PATH = "/forgot-password";

/** Shown for a real send, an unknown address, and a Firebase error. */
export const FORGOT_PASSWORD_NOTICE = "If that email has an account, a reset link is on its way.";
export const ENTER_EMAIL_NOTICE = "Enter a valid email address.";

/** Hosts that must accept a password-reset continue URL. No protocol, no path. */
export const PASSWORD_RESET_HOSTS = [
  "iconicimagestx.vercel.app",
  "www.iconicimagestx.com",
  "iconicimagestx.com",
] as const;

const GENERATED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_ACCOUNT_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_ACCOUNT_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function passwordChoiceError(password: string, confirm: string): string | null {
  const policy = passwordPolicyError(password);
  if (policy) return policy;
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export function hasMustChangePassword(record: { mustChangePassword?: unknown } | null | undefined): boolean {
  return record?.mustChangePassword === true;
}

/** Where a signed-in person goes. A required change happens before either portal. */
export function nextPathAfterSignIn(input: {
  mustChangePassword: boolean;
  userType: "staff" | "client" | null;
  role?: string;
  clientDestination?: string;
}): string | null {
  if (input.mustChangePassword) return CHANGE_PASSWORD_PATH;
  if (input.userType === "staff") return staffHomePath(input.role);
  if (input.userType === "client") return input.clientDestination || "/portal/home";
  return null;
}

export function passwordResetContinueUrl(origin: string): string {
  const base = origin.trim().replace(/\/$/, "");
  return `${base}/login`;
}

export function passwordResetActionSettings(origin: string): { url: string; handleCodeInApp: false } {
  return {
    url: passwordResetContinueUrl(origin),
    handleCodeInApp: false,
  };
}

export function generateTemporaryPassword(length = 12): string {
  const size = Math.max(MIN_ACCOUNT_PASSWORD_LENGTH, length);
  const bytes = new Uint8Array(size);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Password generation is not available in this browser.");
  }
  cryptoApi.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += GENERATED_ALPHABET[bytes[i] % GENERATED_ALPHABET.length];
  }
  return out;
}
