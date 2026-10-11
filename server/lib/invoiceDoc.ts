/**
 * Read an invoice and follow a tombstone redirectInvoiceId.
 * Does not create or update a document.
 */

import { invoiceRedirectTarget } from "../../shared/invoicePay";

export interface InvoiceSnap {
  exists: boolean;
  id: string;
  data: () => FirebaseFirestore.DocumentData | undefined;
}

export async function readInvoiceDoc(
  get: (id: string) => Promise<InvoiceSnap>,
  startId: string,
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const seen = new Set<string>();
  let current = startId.trim();
  for (let hop = 0; hop < 4; hop += 1) {
    if (!current || seen.has(current)) return null;
    seen.add(current);
    const snap = await get(current);
    if (!snap.exists) return null;
    const data = (snap.data() || {}) as Record<string, unknown>;
    const next = invoiceRedirectTarget(data);
    if (!next || next === snap.id) return { id: snap.id, data };
    current = next;
  }
  return null;
}
