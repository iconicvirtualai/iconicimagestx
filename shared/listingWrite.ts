/**
 * Pure helpers for admin listing creates.
 * Client pages write listings directly; these keep dates and client ids valid.
 */

import { normalizeEmail } from "./listingAccess";

export interface ClientCandidate {
  id: string;
  email?: string | null;
  firebaseUid?: string | null;
  portalAccess?: boolean | null;
}

export interface PortalIdentity {
  ids: string[];
  email?: string | null;
}

/** A Firestore Timestamp, a date-only string, or a Date. Never an Invalid Date. */
export function listingAppointmentDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : null;
    if (seconds != null) {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Date-only values need a local noon time. Anything else must be parsed as-is:
    // appending "T12:00:00" turns a Timestamp string or a long date into Invalid Date,
    // and Firestore rejects that write.
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Prefer the portal login document (id === firebaseUid) over a second clients
 * doc that only shares the email. Orders and projects then use the Auth uid
 * the client signs in with.
 */
export function choosePortalClient(
  clients: ClientCandidate[],
  hint: { clientId?: string | null; email?: string | null } = {},
): ClientCandidate | null {
  const email = normalizeEmail(hint.email);
  const hinted = hint.clientId ? clients.find((client) => client.id === hint.clientId) : undefined;
  const hintedEmail = normalizeEmail(hinted?.email);
  // A typed email wins when it no longer matches the client that was selected.
  const targetEmail = email && hintedEmail && email !== hintedEmail ? email : hintedEmail || email;
  const pool = targetEmail
    ? clients.filter((client) => normalizeEmail(client.email) === targetEmail)
    : hinted
      ? [hinted]
      : [];
  if (hinted && (!targetEmail || hintedEmail === targetEmail) && !pool.some((client) => client.id === hinted.id)) {
    pool.unshift(hinted);
  }
  if (pool.length === 0) return null;

  return pool.find((client) => client.firebaseUid && client.id === client.firebaseUid)
    || pool.find((client) => client.portalAccess === true && client.firebaseUid)
    || pool.find((client) => Boolean(client.firebaseUid))
    || pool.find((client) => client.portalAccess === true)
    || hinted
    || pool[0];
}

/** Order requests and listings the signed-in client should see. */
export function visibleToPortalClient(
  record: { clientId?: string | null; email?: string | null; clientEmail?: string | null } | null | undefined,
  identity: PortalIdentity,
): boolean {
  if (!record) return false;
  if (record.clientId && identity.ids.includes(String(record.clientId))) return true;
  const email = normalizeEmail(identity.email);
  if (!email) return false;
  return [record.email, record.clientEmail].some((value) => normalizeEmail(value) === email);
}
