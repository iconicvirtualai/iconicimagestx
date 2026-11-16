/**
 * Per-person inbox flags. The document lives under that person's uid.
 * Archive, star, and unread never rewrite another participant's copy.
 * This module does not send email or texts.
 */

import admin from "firebase-admin";
import {
  flagDocId,
  mergeFlag,
  parseFlagPatch,
  type FlagPatch,
  type PortalThreadFlag,
} from "../../shared/portalInbox.ts";

const memory = new Map<string, Map<string, PortalThreadFlag>>();

export function resetPortalFlagsForTests(): void {
  memory.clear();
}

function firestoreOn(): boolean {
  return admin.apps.length > 0 && process.env.NODE_ENV !== "test";
}

function bucket(uid: string): Map<string, PortalThreadFlag> {
  const found = memory.get(uid);
  if (found) return found;
  const created = new Map<string, PortalThreadFlag>();
  memory.set(uid, created);
  return created;
}

export async function listFlags(uid: string): Promise<PortalThreadFlag[]> {
  if (!uid) return [];
  if (!firestoreOn()) return [...bucket(uid).values()];
  const snap = await admin
    .firestore()
    .collection("portalInboxFlags")
    .doc(uid)
    .collection("threads")
    .limit(200)
    .get();
  return snap.docs
    .map((doc) =>
      normalizeStored(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((flag): flag is PortalThreadFlag => Boolean(flag));
}

export async function saveFlags(
  uid: string,
  patches: FlagPatch[],
  now = new Date().toISOString(),
): Promise<PortalThreadFlag[]> {
  if (!uid) return [];
  const existing = new Map(
    (await listFlags(uid)).map((flag) => [flag.threadKey, flag]),
  );
  const saved: PortalThreadFlag[] = [];
  for (const patch of patches) {
    const next = mergeFlag(existing.get(patch.threadKey), patch, now);
    saved.push(next);
    existing.set(next.threadKey, next);
    if (firestoreOn()) {
      await admin
        .firestore()
        .collection("portalInboxFlags")
        .doc(uid)
        .collection("threads")
        .doc(flagDocId(next.threadKey))
        .set(next);
    } else {
      bucket(uid).set(next.threadKey, next);
    }
  }
  return saved;
}

export function patchesFromBody(body: unknown): FlagPatch[] | null {
  const rows = Array.isArray(body)
    ? body
    : body &&
        typeof body === "object" &&
        Array.isArray((body as { updates?: unknown }).updates)
      ? (body as { updates: unknown[] }).updates
      : body && typeof body === "object"
        ? [body]
        : null;
  if (!rows || rows.length === 0 || rows.length > 40) return null;
  const patches: FlagPatch[] = [];
  for (const row of rows) {
    const patch = parseFlagPatch(row);
    if (!patch) return null;
    patches.push(patch);
  }
  return patches;
}

function normalizeStored(
  id: string,
  data: Record<string, unknown>,
): PortalThreadFlag | null {
  const threadKey = typeof data.threadKey === "string" ? data.threadKey : id;
  const patch = parseFlagPatch({
    threadKey,
    folder: data.folder ?? null,
    starred: data.starred === true,
    readAt: typeof data.readAt === "string" ? data.readAt : null,
    forceUnread: data.forceUnread === true,
  });
  if (!patch) return null;
  return mergeFlag(
    undefined,
    patch,
    typeof data.updatedAt === "string" ? data.updatedAt : "",
  );
}
