/**
 * Load an order or request and the records that should share its revenue flag.
 * Does not send email, SMS, Square, or a client notice.
 */

import admin from "firebase-admin";
import type { RevenueDocRef } from "../../shared/revenueCount";

const db = () => admin.firestore();

const LINKED = ["invoices", "appointments", "listings", "transactions", "galleries", "orders", "orderRequests"] as const;

export async function loadRevenueDocs(id: string): Promise<RevenueDocRef[]> {
  const docs: RevenueDocRef[] = [];
  const seen = new Set<string>();
  const add = (collection: string, docId: string, data: Record<string, unknown> | undefined) => {
    if (!data) return;
    const key = `${collection}/${docId}`;
    if (seen.has(key)) return;
    seen.add(key);
    docs.push({ collection, id: docId, data });
  };

  for (const collection of ["orders", "orderRequests"] as const) {
    const snap = await db().collection(collection).doc(id).get();
    if (snap.exists) add(collection, snap.id, snap.data());
  }

  const orderIds = new Set<string>();
  const requestIds = new Set<string>();
  for (const doc of docs) {
    if (doc.collection === "orders") orderIds.add(doc.id);
    if (doc.collection === "orderRequests") requestIds.add(doc.id);
    const converted = text(doc.data.convertedToOrderId);
    const requestId = text(doc.data.orderRequestId);
    const orderId = text(doc.data.orderId);
    if (converted) orderIds.add(converted);
    if (requestId) requestIds.add(requestId);
    if (orderId) orderIds.add(orderId);
  }

  for (const orderId of orderIds) {
    if (docs.some((doc) => doc.collection === "orders" && doc.id === orderId)) continue;
    const snap = await db().collection("orders").doc(orderId).get();
    if (snap.exists) add("orders", snap.id, snap.data());
  }
  for (const requestId of requestIds) {
    if (docs.some((doc) => doc.collection === "orderRequests" && doc.id === requestId)) continue;
    const snap = await db().collection("orderRequests").doc(requestId).get();
    if (snap.exists) add("orderRequests", snap.id, snap.data());
  }

  const queries: Array<[string, string, string]> = [];
  for (const orderId of orderIds) {
    for (const collection of LINKED) queries.push([collection, "orderId", orderId]);
    queries.push(["orderRequests", "convertedToOrderId", orderId]);
  }
  for (const requestId of requestIds) {
    for (const collection of LINKED) queries.push([collection, "orderRequestId", requestId]);
  }

  for (const [collection, field, value] of queries) {
    try {
      const snap = await db().collection(collection).where(field, "==", value).get();
      snap.docs.forEach((doc) => add(collection, doc.id, doc.data()));
    } catch (err) {
      console.error(`[Revenue] Lookup ${collection}.${field} failed:`, err);
    }
  }

  return docs;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
