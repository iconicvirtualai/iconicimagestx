/**
 * Join portal and admin records by the people profile id and firebaseUid.
 * Email still matches when a stored id is missing, stale, or unknown.
 * Email does not match when that id belongs to a different known client.
 * Callers that have not loaded the clients collection leave otherClientIds
 * unset, and a stored id still blocks the email fallback.
 */

import { profileId } from "./peopleProfiles";

export interface ClientLinkSource {
  id?: string | null;
  firebaseUid?: string | null;
  linkedClientId?: string | null;
  email?: string | null;
}

export interface ClientLinkIdentity {
  ids: string[];
  profileIds?: string[];
  firebaseUid?: string | null;
  email?: string | null;
  /**
   * Ids and client:{id} profile ids that belong to someone else.
   * An id outside this list and outside `ids` is stale or unknown.
   * Omit the list when the clients collection was not checked.
   */
  otherClientIds?: string[];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function linkIdsFor(source: ClientLinkSource): string[] {
  return [...new Set([source.id, source.firebaseUid, source.linkedClientId].map(clean).filter(Boolean))];
}

export function clientProfileIdsFor(source: ClientLinkSource): string[] {
  return [...new Set(linkIdsFor(source).map((id) => profileId("client", id)))];
}

export function clientLinkStamp(uid: string, canonicalId = uid): {
  clientId: string;
  firebaseUid: string;
  clientProfileId: string;
} {
  const clientId = canonicalId.trim() || uid.trim();
  const firebaseUid = uid.trim() || clientId;
  return {
    clientId,
    firebaseUid,
    clientProfileId: profileId("client", clientId),
  };
}

function identityIds(identity: ClientLinkIdentity): Set<string> {
  const ids = new Set(identity.ids.map((id) => id.trim()).filter(Boolean));
  const uid = clean(identity.firebaseUid);
  if (uid) ids.add(uid);
  return ids;
}

function identityProfiles(identity: ClientLinkIdentity, ids: Set<string>): Set<string> {
  const listed = (identity.profileIds || []).map((id) => id.trim()).filter(Boolean);
  return new Set(listed.length ? listed : [...ids].map((id) => profileId("client", id)));
}

export function recordVisibleToIdentity(
  record: {
    clientId?: unknown;
    firebaseUid?: unknown;
    clientProfileId?: unknown;
    email?: unknown;
    clientEmail?: unknown;
  } | null | undefined,
  identity: ClientLinkIdentity,
): boolean {
  if (!record) return false;
  const ids = identityIds(identity);
  const profiles = identityProfiles(identity, ids);
  const clientId = clean(record.clientId);
  const firebaseUid = clean(record.firebaseUid);
  const profile = clean(record.clientProfileId);
  if (clientId && ids.has(clientId)) return true;
  if (firebaseUid && ids.has(firebaseUid)) return true;
  if (profile && profiles.has(profile)) return true;
  if (!Array.isArray(identity.otherClientIds)) {
    if (clientId || firebaseUid || profile) return false;
  } else {
    const other = new Set(identity.otherClientIds.map((id) => id.trim()).filter(Boolean));
    if (clientId && !ids.has(clientId) && other.has(clientId)) return false;
    if (firebaseUid && !ids.has(firebaseUid) && other.has(firebaseUid)) return false;
    if (profile && !profiles.has(profile) && other.has(profile)) return false;
  }
  const email = clean(identity.email).toLowerCase();
  if (!email) return false;
  return [record.email, record.clientEmail].some((value) => clean(value).toLowerCase() === email);
}

/** Ids on a record that are not already this person's ids. Profile ids become the client doc id. */
export function foreignIdCandidates(
  records: Array<{ clientId?: unknown; firebaseUid?: unknown; clientProfileId?: unknown } | null | undefined>,
  identityIds: readonly string[],
): string[] {
  const mine = new Set(identityIds.map((id) => id.trim()).filter(Boolean));
  const found = new Set<string>();
  for (const record of records) {
    if (!record) continue;
    for (const value of [record.clientId, record.firebaseUid]) {
      const id = clean(value);
      if (id && !mine.has(id)) found.add(id);
    }
    const profile = clean(record.clientProfileId);
    if (profile.startsWith("client:")) {
      const id = profile.slice("client:".length).trim();
      if (id && !mine.has(id)) found.add(id);
    }
  }
  return [...found];
}

/** Turn client documents into the ids that block an email match for someone else. */
export function knownClientIds(
  docs: Array<{ id: string; firebaseUid?: unknown }>,
  except: readonly string[],
): string[] {
  const mine = new Set(except.map((id) => id.trim()).filter(Boolean));
  const other = new Set<string>();
  for (const doc of docs) {
    const id = clean(doc.id);
    if (!id || mine.has(id)) continue;
    other.add(id);
    other.add(profileId("client", id));
    const uid = clean(doc.firebaseUid);
    if (uid && !mine.has(uid)) {
      other.add(uid);
      other.add(profileId("client", uid));
    }
  }
  return [...other];
}

export function recordLinkedToClient(
  record: {
    clientId?: unknown;
    firebaseUid?: unknown;
    clientProfileId?: unknown;
    email?: unknown;
    clientEmail?: unknown;
  } | null | undefined,
  client: ClientLinkSource,
  otherClientIds?: string[],
): boolean {
  return recordVisibleToIdentity(record, {
    ids: linkIdsFor(client),
    profileIds: clientProfileIdsFor(client),
    firebaseUid: client.firebaseUid || client.id || null,
    email: client.email,
    ...(Array.isArray(otherClientIds) ? { otherClientIds } : {}),
  });
}
