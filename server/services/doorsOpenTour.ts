/**
 * Tokenized Doors Open Tour opt-in.
 * A matching token sets dotOptIn true on the order and the booking request.
 * A second click with the same token leaves it true.
 */

import admin from "firebase-admin";
import { appFirestore } from "../lib/appFirestore";
import { createPayToken } from "../../shared/invoicePay";
import { dotOptInPath, dotOptInSelected } from "../../shared/doorsOpenTour";
import { publicClientUrl } from "../../shared/publicSiteUrl";

function textId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readDoc(collection: string, id: string) {
  if (!id) return null;
  const snap = await appFirestore().collection(collection).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ref: snap.ref, data: (snap.data() || {}) as Record<string, unknown> };
}

async function markDotOptIn(collection: string, id: string): Promise<void> {
  const doc = await readDoc(collection, id);
  if (!doc) return;
  await doc.ref.update({
    dotOptIn: true,
    dotOptInAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * One-click opt-in. Unknown tokens change nothing.
 * Repeating a valid token keeps dotOptIn true.
 */
export async function applyDotOptIn(token: string): Promise<"ok" | "missing"> {
  const trimmed = token.trim();
  if (trimmed.length < 20 || trimmed.length > 200) return "missing";

  const db = appFirestore();
  const [orders, requests] = await Promise.all([
    db.collection("orders").where("dotOptInToken", "==", trimmed).limit(5).get(),
    db.collection("orderRequests").where("dotOptInToken", "==", trimmed).limit(5).get(),
  ]);
  if (orders.empty && requests.empty) return "missing";

  const seen = new Set<string>();
  const jobs: Promise<void>[] = [];
  const queue = (collection: string, id: string) => {
    const key = `${collection}/${id}`;
    if (!id || seen.has(key)) return;
    seen.add(key);
    jobs.push(markDotOptIn(collection, id));
  };

  for (const doc of orders.docs) {
    queue("orders", doc.id);
    const requestId = textId(doc.data()?.orderRequestId);
    if (requestId) queue("orderRequests", requestId);
  }
  for (const doc of requests.docs) {
    queue("orderRequests", doc.id);
    const orderId = textId(doc.data()?.convertedToOrderId);
    if (orderId) queue("orders", orderId);
  }

  await Promise.all(jobs);
  return "ok";
}

/** Read or create the one-click link stored on the order and booking request. */
export async function ensureDotOptInLink(invoice: Record<string, unknown>): Promise<{
  dotOptIn: boolean;
  url: string | null;
}> {
  try {
    const order = await readDoc("orders", textId(invoice.orderId));
    const request = await readDoc("orderRequests", textId(invoice.orderRequestId));
    const linkedOrderId = textId(request?.data.convertedToOrderId);
    const linked = linkedOrderId && linkedOrderId !== order?.id
      ? await readDoc("orders", linkedOrderId)
      : null;
    if (!order && !request && !linked) return { dotOptIn: false, url: null };

    let token = textId(order?.data.dotOptInToken)
      || textId(request?.data.dotOptInToken)
      || textId(linked?.data.dotOptInToken);
    if (!token) token = createPayToken();

    const patch = {
      dotOptInToken: token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (order && textId(order.data.dotOptInToken) !== token) await order.ref.update(patch);
    if (request && textId(request.data.dotOptInToken) !== token) await request.ref.update(patch);
    if (linked && textId(linked.data.dotOptInToken) !== token) await linked.ref.update(patch);

    const dotOptIn = dotOptInSelected(order?.data.dotOptIn)
      || dotOptInSelected(request?.data.dotOptIn)
      || dotOptInSelected(linked?.data.dotOptIn);
    return { dotOptIn, url: publicClientUrl(dotOptInPath(token)) };
  } catch (err) {
    console.error("[DoorsOpenTour] Link lookup failed:", err);
    return { dotOptIn: false, url: null };
  }
}
