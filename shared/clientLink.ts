/**
 * Join portal and admin records by the people profile id and firebaseUid.
 * A stored id for a different person does not match just because the email text matches.
 * Email is only a leftover for rows that were saved before they had an id.
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
  if (clientId || firebaseUid || profile) return false;
  const email = clean(identity.email).toLowerCase();
  if (!email) return false;
  return [record.email, record.clientEmail].some((value) => clean(value).toLowerCase() === email);
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
): boolean {
  return recordVisibleToIdentity(record, {
    ids: linkIdsFor(client),
    profileIds: clientProfileIdsFor(client),
    firebaseUid: client.firebaseUid || client.id || null,
    email: client.email,
  });
}
