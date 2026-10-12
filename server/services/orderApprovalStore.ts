/**
 * Writes { approval } onto the order document.
 * Tests and machines without Firebase keep the same shape in memory.
 */

import admin from "firebase-admin";
import type { OrderApproval } from "../../shared/orderApproval";

const memory = new Map<string, { approval?: OrderApproval }>();

export function resetOrderApprovalMemory() {
  memory.clear();
}

export function seedOrderForApproval(id: string) {
  memory.set(id, {});
}

export function readOrderApproval(id: string): OrderApproval | null {
  return memory.get(id)?.approval ?? null;
}

function useMemoryStore(): boolean {
  return !admin.apps.length || process.env.NODE_ENV === "test" || process.env.ORDER_APPROVAL_STORE === "memory";
}

export async function writeOrderApproval(id: string, approval: OrderApproval): Promise<OrderApproval | null> {
  if (useMemoryStore()) {
    if (!memory.has(id)) return null;
    memory.set(id, { approval });
    return approval;
  }
  const ref = admin.firestore().collection("orders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ approval });
  return approval;
}
