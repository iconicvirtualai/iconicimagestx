import { isValidEmail, normalizeEmail } from "./contacts";
import type { SendingAccount } from "./types";

export const PHOTOS_SENDING_ACCOUNT = "photos@iconicimagestx.com";

export function normalizeSendingAccounts(raw: unknown): SendingAccount[] {
  const list: SendingAccount[] = [];
  const seen = new Set<string>();
  const add = (email: unknown, label: unknown) => {
    const normalized = normalizeEmail(String(email || ""));
    if (!isValidEmail(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    const name = String(label || "").trim();
    list.push({ email: normalized, label: name || normalized });
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as { email?: unknown; label?: unknown };
      add(row.email, row.label);
    }
  }
  if (!list.length) add(PHOTOS_SENDING_ACCOUNT, "Photos");
  return list;
}

/** Returns the address when it is a saved sending account. */
export function matchSendingAccount(email: string, accounts: SendingAccount[]): string {
  const normalized = normalizeEmail(email);
  return accounts.some((account) => account.email === normalized) ? normalized : "";
}
