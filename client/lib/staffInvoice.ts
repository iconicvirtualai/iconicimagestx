/**
 * Write staff invoice edits to Firestore.
 * Does not email, text, or call Square. The invoice document id is never replaced.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  orderServiceInvoicePatch,
  staffInvoiceSavePatch,
  type StaffInvoiceForm,
} from "@shared/staffInvoice";

/** Push order service rows onto the invoice that is already linked. Missing invoices are left alone. */
export async function syncOrderBillingToInvoice(invoiceId: string, order: {
  lineItems?: unknown;
  pricing?: { tax?: unknown } | null;
  promoCode?: unknown;
  promoDiscount?: unknown;
  clientName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  clientEmail?: unknown;
  address?: unknown;
}): Promise<boolean> {
  const id = invoiceId.trim();
  if (!id) return false;
  const ref = doc(db, "invoices", id);
  let wrote = false;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const patch = orderServiceInvoicePatch(order, snap.data() || {});
    if (Object.keys(patch).length === 0) return;
    tx.update(ref, { ...patch, updatedAt: serverTimestamp() });
    wrote = true;
  });
  return wrote;
}

/** Save the office editor. Foreign keys on the invoice stay as they are. */
export async function saveStaffInvoiceEdits(invoiceId: string, form: StaffInvoiceForm): Promise<void> {
  const id = invoiceId.trim();
  if (!id) throw new Error("Invoice id is required.");
  const ref = doc(db, "invoices", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Invoice not found.");
    const patch = staffInvoiceSavePatch(form, snap.data() || {});
    tx.update(ref, { ...patch, updatedAt: serverTimestamp() });
  });
}
