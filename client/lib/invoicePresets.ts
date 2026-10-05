/**
 * Read and write the staff invoice preset list.
 * Selecting a preset does not charge a card and does not call Square.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  invoicePresetWrite,
  parseInvoicePreset,
  type InvoicePreset,
  type InvoicePresetDraft,
} from "@shared/invoicePresets";

const COLLECTION = "invoicePresets";

export function watchInvoicePresets(onChange: (presets: InvoicePreset[]) => void): () => void {
  return onSnapshot(collection(db, COLLECTION), (snap) => {
    const presets = snap.docs
      .map((entry) => parseInvoicePreset(entry.id, entry.data() as Record<string, unknown>))
      .filter((item): item is InvoicePreset => Boolean(item))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    onChange(presets);
  }, () => onChange([]));
}

export async function createInvoicePreset(draft: InvoicePresetDraft): Promise<void> {
  const payload = invoicePresetWrite(draft);
  if (!payload) throw new Error("Enter a name, a type, and an amount.");
  await addDoc(collection(db, COLLECTION), { ...payload, updatedAt: serverTimestamp() });
}

export async function updateInvoicePreset(id: string, draft: InvoicePresetDraft): Promise<void> {
  const payload = invoicePresetWrite(draft);
  if (!payload) throw new Error("Enter a name, a type, and an amount.");
  await updateDoc(doc(db, COLLECTION, id), { ...payload, updatedAt: serverTimestamp() });
}

export async function deleteInvoicePreset(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
