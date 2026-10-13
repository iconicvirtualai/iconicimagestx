import admin from "firebase-admin";
import { formatOrderNumber } from "../../shared/orderNumber";

/**
 * Atomically issue the next order number. The counter lives at
 * counters/orderNumbers {last}. If it does not exist yet it is seeded from the
 * current orderRequests count, so the first number issued never collides with
 * an existing order. Existing orders keep their stored codes.
 */
export async function nextOrderNumber(): Promise<string> {
  const db = admin.firestore();
  const ref = db.collection("counters").doc("orderNumbers");
  let seed = 0;
  const snap = await ref.get();
  if (!snap.exists) {
    const agg = await db.collection("orderRequests").count().get();
    seed = agg.data().count;
  }
  const n = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const last = cur.exists ? Number(cur.data()?.last) || 0 : seed;
    const next = last + 1;
    tx.set(ref, { last: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return formatOrderNumber(n);
}
