/**
 * Flash-sale checkouts land in orderRequests, the collection the orders desk,
 * the dashboard activity list, and the client portal read.
 * A linked orders copy uses the same id when that collection is still read
 * by payment history. Without Firebase (local tests), both stay in memory.
 * This does not email or text anyone.
 */

import admin from "firebase-admin";

const ORDER_REQUESTS = "orderRequests";
const ORDERS = "orders";

const memory: Array<Record<string, unknown> & { id: string; collection: string }> = [];
const twins: Array<Record<string, unknown> & { id: string; collection: string }> = [];

function flashSaleOrderFields(order: Record<string, unknown>): Record<string, unknown> {
  const email = typeof order.clientEmail === "string" && order.clientEmail
    ? order.clientEmail
    : typeof order.email === "string" ? order.email : "";
  const phone = typeof order.clientPhone === "string" && order.clientPhone
    ? order.clientPhone
    : typeof order.phone === "string" ? order.phone : "";
  const link = typeof order.squareLinkId === "string" ? order.squareLinkId : "";
  return {
    ...order,
    email: typeof order.email === "string" && order.email ? order.email : email,
    phone: typeof order.phone === "string" && order.phone ? order.phone : phone,
    address: typeof order.address === "string" ? order.address : "",
    ...(link && !order.squarePaymentLinkId ? { squarePaymentLinkId: link } : {}),
  };
}

export async function saveFlashSaleOrder(order: Record<string, unknown>): Promise<string> {
  const fields = flashSaleOrderFields(order);
  if (!admin.apps.length) {
    const id = `flash-${memory.length + 1}`;
    const linked = { ...fields, orderId: id, orderRequestId: id };
    memory.push({ id, collection: ORDER_REQUESTS, ...linked });
    twins.push({ id, collection: ORDERS, ...linked });
    return id;
  }
  const db = admin.firestore();
  const ref = db.collection(ORDER_REQUESTS).doc();
  const linked = {
    ...fields,
    orderId: ref.id,
    orderRequestId: ref.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(linked);
  await db.collection(ORDERS).doc(ref.id).set(linked);
  return ref.id;
}

export function flashSaleMemoryOrders(): Array<Record<string, unknown> & { id: string }> {
  return memory;
}

export function flashSaleMemoryOrderTwins(): Array<Record<string, unknown> & { id: string }> {
  return twins;
}

export function resetFlashSaleMemory(): void {
  memory.length = 0;
  twins.length = 0;
}
