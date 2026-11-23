/**
 * Flash-sale orders land in the same orders collection the admin list reads.
 * Without Firebase (local tests), they stay in memory so the route can still
 * prove an order was recorded. This does not email or text anyone.
 */

import admin from "firebase-admin";

const memory: Array<Record<string, unknown> & { id: string }> = [];

export async function saveFlashSaleOrder(order: Record<string, unknown>): Promise<string> {
  if (!admin.apps.length) {
    const id = `flash-${memory.length + 1}`;
    memory.push({ id, ...order });
    return id;
  }
  const ref = await admin.firestore().collection("orders").add({
    ...order,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export function flashSaleMemoryOrders(): Array<Record<string, unknown> & { id: string }> {
  return memory;
}

export function resetFlashSaleMemory(): void {
  memory.length = 0;
}
