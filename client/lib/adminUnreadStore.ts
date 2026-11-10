/**
 * Writes for the staff unread counters. Reads stay on the two counter
 * documents plus the signed-in user's seen document. Does not email or text.
 */

import { doc, increment, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import {
  ADMIN_UNREAD_CHANNELS_DOC,
  ADMIN_UNREAD_COUNTERS_COLLECTION,
  ADMIN_UNREAD_KEYS,
  ADMIN_UNREAD_TASKS_DOC,
  STAFF_UNREAD_COLLECTION,
  assignmentBumps,
  type AdminUnreadChannel,
  type AdminUnreadKey,
} from "@shared/adminUnread";
import { db } from "@/lib/firebase";

export async function bumpStaffChannel(key: AdminUnreadChannel, by = 1): Promise<void> {
  if (!Number.isInteger(by) || by <= 0) return;
  try {
    await setDoc(
      doc(db, ADMIN_UNREAD_COUNTERS_COLLECTION, ADMIN_UNREAD_CHANNELS_DOC),
      { [key]: increment(by) },
      { merge: true },
    );
  } catch (error) {
    console.warn("[adminUnread] Channel counter update failed.", error);
  }
}

export async function bumpTaskAssignments(ids: readonly string[]): Promise<void> {
  const bumps = assignmentBumps(ids);
  const payload: Record<string, ReturnType<typeof increment>> = {};
  for (const [uid, by] of Object.entries(bumps)) payload[uid] = increment(by);
  if (Object.keys(payload).length === 0) return;
  try {
    await setDoc(doc(db, ADMIN_UNREAD_COUNTERS_COLLECTION, ADMIN_UNREAD_TASKS_DOC), payload, { merge: true });
  } catch (error) {
    console.warn("[adminUnread] Task counter update failed.", error);
  }
}

export async function markStaffUnreadSeen(
  uid: string,
  key: AdminUnreadKey,
  total: number,
): Promise<void> {
  const seenTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const ref = doc(db, STAFF_UNREAD_COLLECTION, uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? snap.data().seen : null;
      const seen: Partial<Record<AdminUnreadKey, number>> = {};
      if (current && typeof current === "object") {
        for (const item of ADMIN_UNREAD_KEYS) {
          const value = (current as Record<string, unknown>)[item];
          if (typeof value === "number" && Number.isFinite(value) && value > 0) seen[item] = Math.floor(value);
        }
      }
      const previous = seen[key] || 0;
      if (previous >= seenTotal) return;
      seen[key] = seenTotal;
      tx.set(ref, { seen, updatedAt: serverTimestamp() }, { merge: true });
    });
  } catch (error) {
    console.warn("[adminUnread] Could not save the seen cursor.", error);
  }
}
