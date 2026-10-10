/**
 * Owners Suite allowlist.
 * Staff and admin roles never grant access. A missing or blank OWNER_EMAILS
 * denies every login, including the address this suite is built for.
 */

/** Login the suite is built for. Set OWNER_EMAILS to this address. */
export const INTENDED_OWNER_EMAIL = "cadi@iconicimagestx.com";

export function ownerAllowlist(raw: string | undefined | null): string[] {
  if (raw == null) return [];
  const emails = raw
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
  return [...new Set(emails)];
}

export function isOwnerEmail(email: string | null | undefined, allowlist: readonly string[]): boolean {
  if (!email) return false;
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
