/**
 * Move the shared admin unread counters.
 * Callers already saved the order, message, or chat. A counter miss is logged
 * and does not fail that save. This does not send email or texts.
 */

import admin from "firebase-admin";
import {
  ADMIN_UNREAD_CHANNELS_DOC,
  ADMIN_UNREAD_COUNTERS_COLLECTION,
  ADMIN_UNREAD_TASKS_DOC,
  type AdminUnreadChannel,
} from "../../shared/adminUnread.ts";

interface CounterDoc {
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
}

export interface AdminUnreadDb {
  collection(name: string): {
    doc(id: string): CounterDoc;
  };
}

function liveDb(): AdminUnreadDb | null {
  if (!admin.apps.length) return null;
  return admin.firestore();
}

/** Real Firestore uses an atomic increment. Partial test doubles store the number. */
function counterValue(by: number): unknown {
  const increment = admin.firestore.FieldValue?.increment;
  if (typeof increment === "function") return increment(by);
  return by;
}

export async function bumpAdminUnreadChannel(
  key: AdminUnreadChannel,
  by = 1,
  db: AdminUnreadDb | null = liveDb(),
): Promise<void> {
  if (!db || !Number.isInteger(by) || by <= 0) return;
  try {
    await db.collection(ADMIN_UNREAD_COUNTERS_COLLECTION).doc(ADMIN_UNREAD_CHANNELS_DOC).set(
      { [key]: counterValue(by) },
      { merge: true },
    );
  } catch (error) {
    console.warn("[adminUnread] Channel counter update failed.", error);
  }
}

export async function bumpAdminUnreadTasks(
  bumps: Record<string, number>,
  db: AdminUnreadDb | null = liveDb(),
): Promise<void> {
  if (!db) return;
  const payload: Record<string, unknown> = {};
  for (const [uid, by] of Object.entries(bumps)) {
    if (!uid || !Number.isInteger(by) || by <= 0) continue;
    payload[uid] = counterValue(by);
  }
  if (Object.keys(payload).length === 0) return;
  try {
    await db.collection(ADMIN_UNREAD_COUNTERS_COLLECTION).doc(ADMIN_UNREAD_TASKS_DOC).set(payload, { merge: true });
  } catch (error) {
    console.warn("[adminUnread] Task counter update failed.", error);
  }
}
