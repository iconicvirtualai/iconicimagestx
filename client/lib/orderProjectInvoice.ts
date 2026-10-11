/**
 * Read and write the order ↔ project ↔ invoice links.
 * Creating an invoice here only writes Firestore. It does not email or text the client.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import type { BookingInvoiceDraftInput } from "@shared/bookingInvoice";
import {
  buildLinkedInvoiceDraft,
  draftInvoiceNumber,
  nonEmptyId,
  planInvoiceLink,
  type InvoiceAnchor,
  type InvoiceLinkPlan,
} from "@shared/orderProjectInvoice";
import { clientInvoiceUrl } from "@shared/invoicePayLink";
import { db } from "@/lib/firebase";

async function collectIds(field: "orderRequestId" | "orderId" | "listingId", value: string | null): Promise<string[]> {
  if (!value) return [];
  const snap = await getDocs(query(collection(db, "invoices"), where(field, "==", value), limit(5)));
  return snap.docs.map((entry) => entry.id);
}

export async function findLinkedInvoiceIds(anchor: InvoiceAnchor): Promise<string[]> {
  const [byRequest, byOrder, byListing] = await Promise.all([
    collectIds("orderRequestId", nonEmptyId(anchor.orderRequestId)),
    collectIds("orderId", nonEmptyId(anchor.orderId)),
    collectIds("listingId", nonEmptyId(anchor.listingId)),
  ]);
  return [...new Set([...byRequest, ...byOrder, ...byListing])];
}

function changedFields(
  current: Record<string, unknown> | undefined,
  patch: Record<string, string> | null,
): Record<string, string> {
  if (!patch) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (current?.[key] !== value) out[key] = value;
  }
  return out;
}

function paymentUrl(invoiceId: string): string | null {
  return clientInvoiceUrl({ id: invoiceId, status: "draft" });
}

/** Write foreign keys. Creates the invoice document only when `source` is set and none exists. */
async function commitPlan(plan: InvoiceLinkPlan, source: BookingInvoiceDraftInput | null): Promise<void> {
  const orderRequestId = nonEmptyId(plan.invoiceFields.orderRequestId);
  const orderId = nonEmptyId(plan.invoiceFields.orderId);
  const listingId = nonEmptyId(plan.invoiceFields.listingId);
  const invoiceRef = doc(db, "invoices", plan.createId);
  const orderRequestRef = orderRequestId ? doc(db, "orderRequests", orderRequestId) : null;
  const orderRef = orderId ? doc(db, "orders", orderId) : null;
  const listingRef = listingId ? doc(db, "listings", listingId) : null;
  const stampInvoice = plan.attached || Boolean(source);

  await runTransaction(db, async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    const orderRequestSnap = orderRequestRef ? await tx.get(orderRequestRef) : null;
    const orderSnap = orderRef ? await tx.get(orderRef) : null;
    const listingSnap = listingRef ? await tx.get(listingRef) : null;
    const now = serverTimestamp();

    if (!invoiceSnap.exists()) {
      if (source) {
        const draft = buildLinkedInvoiceDraft(source);
        const payLink = paymentUrl(plan.createId);
        tx.set(invoiceRef, {
          ...draft,
          ...plan.invoiceFields,
          invoiceNumber: draftInvoiceNumber(plan.createId),
          ...(payLink ? { paymentUrl: payLink } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      const invoiceUpdates = changedFields(invoiceSnap.data(), plan.invoiceFields);
      if (Object.keys(invoiceUpdates).length > 0) {
        tx.update(invoiceRef, { ...invoiceUpdates, updatedAt: now });
      }
    }

    if (!stampInvoice) return;

    const orderRequestUpdates = orderRequestSnap?.exists()
      ? changedFields(orderRequestSnap.data(), plan.orderRequestFields)
      : {};
    if (orderRequestSnap?.exists() && Object.keys(orderRequestUpdates).length > 0) {
      tx.update(orderRequestRef!, { ...orderRequestUpdates, updatedAt: now });
    }
    const orderUpdates = orderSnap?.exists() ? changedFields(orderSnap.data(), plan.orderFields) : {};
    if (orderSnap?.exists() && Object.keys(orderUpdates).length > 0) {
      tx.update(orderRef!, { ...orderUpdates, updatedAt: now });
    }
    const listingUpdates = listingSnap?.exists() ? changedFields(listingSnap.data(), plan.listingFields) : {};
    if (listingSnap?.exists() && Object.keys(listingUpdates).length > 0) {
      tx.update(listingRef!, { ...listingUpdates, updatedAt: now });
    }
  });
}

async function planFromAnchor(anchor: InvoiceAnchor): Promise<InvoiceLinkPlan> {
  const found = await findLinkedInvoiceIds(anchor);
  return planInvoiceLink({
    ...anchor,
    foundInvoiceIds: [...found, ...(anchor.foundInvoiceIds || [])],
  });
}

/** Return the linked invoice id and write any missing foreign keys. Does not create an invoice. */
export async function resolveLinkedInvoice(anchor: InvoiceAnchor): Promise<string | null> {
  const plan = await planFromAnchor(anchor);
  if (!plan.attached || !plan.invoiceId) return null;
  await commitPlan(plan, null);
  return plan.invoiceId;
}

/**
 * Open the invoice that already belongs to this order or project.
 * A second call reuses that same document.
 */
export async function ensureLinkedInvoice(anchor: InvoiceAnchor, source: BookingInvoiceDraftInput): Promise<string> {
  const plan = await planFromAnchor(anchor);
  await commitPlan(plan, source);
  return plan.createId;
}

/** After a project is created, point the invoice and the confirmed order back at the listing. */
export async function syncListingPair(input: {
  orderRequestId: string;
  listingId: string;
  orderId?: unknown;
  invoiceId?: unknown;
}): Promise<void> {
  const invoiceId = nonEmptyId(input.invoiceId);
  const orderId = nonEmptyId(input.orderId);
  const listingRef = doc(db, "listings", input.listingId);
  const orderRef = orderId ? doc(db, "orders", orderId) : null;

  if (invoiceId) {
    await commitPlan(planInvoiceLink({
      orderRequestId: input.orderRequestId,
      orderId,
      listingId: input.listingId,
      orderInvoiceId: invoiceId,
    }), null);
    return;
  }

  if (!orderId || !orderRef) return;

  await runTransaction(db, async (tx) => {
    const listingSnap = await tx.get(listingRef);
    const orderSnap = await tx.get(orderRef);
    const now = serverTimestamp();
    if (listingSnap.exists()) {
      const listingUpdates = changedFields(listingSnap.data(), {
        orderRequestId: input.orderRequestId,
        orderId,
      });
      if (Object.keys(listingUpdates).length > 0) {
        tx.update(listingRef, { ...listingUpdates, updatedAt: now });
      }
    }
    if (orderSnap.exists()) {
      const orderUpdates = changedFields(orderSnap.data(), {
        orderRequestId: input.orderRequestId,
        listingId: input.listingId,
      });
      if (Object.keys(orderUpdates).length > 0) {
        tx.update(orderRef, { ...orderUpdates, updatedAt: now });
      }
    }
  });
}
