/**
 * Read and write the order ↔ project ↔ invoice links.
 * Creating an invoice here only writes Firestore. It does not email or text the client.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import type { BookingInvoiceDraftInput } from "@shared/bookingInvoice";
import {
  createPayToken,
  invoiceRedirectTarget,
  isDerivedInvoiceId,
  isLegacyOpenAutoId,
  legacyInvoiceDocIds,
} from "@shared/invoicePay";
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

function paymentUrl(invoiceId: string, payToken?: string): string | null {
  return clientInvoiceUrl({ id: invoiceId, status: "draft", payToken });
}

/** Read a legacy derived id if that document already exists. Does not create one. */
async function readLegacyInvoiceIds(anchor: InvoiceAnchor): Promise<string[]> {
  const ids: string[] = [];
  for (const legacyId of legacyInvoiceDocIds(anchor)) {
    const snap = await getDoc(doc(db, "invoices", legacyId));
    if (!snap.exists()) continue;
    const redirect = invoiceRedirectTarget(snap.data());
    ids.push(redirect || snap.id);
  }
  return ids;
}

function linkedPlan(plan: InvoiceLinkPlan, invoiceId: string): InvoiceLinkPlan {
  if (invoiceId === plan.createId) return plan;
  return planInvoiceLink({
    orderRequestId: plan.invoiceFields.orderRequestId,
    orderId: plan.invoiceFields.orderId,
    listingId: plan.invoiceFields.listingId,
    orderInvoiceId: invoiceId,
  });
}

/** Write foreign keys. Creates the invoice document only when `source` is set and none exists. */
async function commitPlan(
  plan: InvoiceLinkPlan,
  source: BookingInvoiceDraftInput | null,
  freshId = "",
): Promise<string> {
  const orderRequestId = nonEmptyId(plan.invoiceFields.orderRequestId);
  const orderId = nonEmptyId(plan.invoiceFields.orderId);
  const listingId = nonEmptyId(plan.invoiceFields.listingId);
  const plannedId = plan.createId || freshId;
  if (!plannedId) throw new Error("An order or project is required to link an invoice.");
  const invoiceRef = doc(db, "invoices", plannedId);
  const spareRef = freshId && freshId !== plannedId ? doc(db, "invoices", freshId) : null;
  const orderRequestRef = orderRequestId ? doc(db, "orderRequests", orderRequestId) : null;
  const orderRef = orderId ? doc(db, "orders", orderId) : null;
  const listingRef = listingId ? doc(db, "listings", listingId) : null;
  let writtenId = plannedId;

  await runTransaction(db, async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    const spareSnap = spareRef ? await tx.get(spareRef) : null;
    const orderRequestSnap = orderRequestRef ? await tx.get(orderRequestRef) : null;
    const orderSnap = orderRef ? await tx.get(orderRef) : null;
    const listingSnap = listingRef ? await tx.get(listingRef) : null;
    const now = serverTimestamp();

    const storedId = nonEmptyId(orderRequestSnap?.data()?.invoiceId)
      || nonEmptyId(listingSnap?.data()?.invoiceId)
      || nonEmptyId(orderSnap?.data()?.invoiceId);
    let targetRef = invoiceRef;
    let targetSnap = invoiceSnap;
    if (!invoiceSnap.exists() && storedId && storedId !== invoiceRef.id) {
      if (spareRef && storedId === spareRef.id && spareSnap?.exists()) {
        targetRef = spareRef;
        targetSnap = spareSnap;
      } else if (!spareRef || storedId !== spareRef.id) {
        const storedRef = doc(db, "invoices", storedId);
        const storedSnap = await tx.get(storedRef);
        if (storedSnap.exists()) {
          targetRef = storedRef;
          targetSnap = storedSnap;
        }
      }
    }
    if (!targetSnap.exists() && isDerivedInvoiceId(targetRef.id)) {
      if (!spareRef || !spareSnap) {
        throw new Error("Refusing to create an invoice at a derived id.");
      }
      targetRef = spareRef;
      targetSnap = spareSnap;
    }

    const active = linkedPlan(plan, targetRef.id);
    writtenId = targetRef.id;
    const stampInvoice = active.attached || Boolean(source);

    if (!targetSnap.exists()) {
      if (source) {
        if (isDerivedInvoiceId(targetRef.id)) {
          throw new Error("Refusing to create an invoice at a derived id.");
        }
        const draft = buildLinkedInvoiceDraft(source);
        const payToken = createPayToken();
        const payLink = paymentUrl(targetRef.id, payToken);
        tx.set(targetRef, {
          ...draft,
          ...active.invoiceFields,
          payToken,
          invoiceNumber: draftInvoiceNumber(targetRef.id),
          ...(payLink ? { paymentUrl: payLink } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      const invoiceUpdates = changedFields(targetSnap.data(), active.invoiceFields);
      const existingToken = nonEmptyId(targetSnap.data()?.payToken);
      if (!existingToken && !isLegacyOpenAutoId(targetRef.id)) {
        const payToken = createPayToken();
        invoiceUpdates.payToken = payToken;
        const payLink = paymentUrl(targetRef.id, payToken);
        if (payLink) invoiceUpdates.paymentUrl = payLink;
      }
      if (Object.keys(invoiceUpdates).length > 0) {
        tx.update(targetRef, { ...invoiceUpdates, updatedAt: now });
      }
    }

    if (!stampInvoice) return;

    const orderRequestUpdates = orderRequestSnap?.exists()
      ? changedFields(orderRequestSnap.data(), active.orderRequestFields)
      : {};
    if (orderRequestSnap?.exists() && Object.keys(orderRequestUpdates).length > 0) {
      tx.update(orderRequestRef!, { ...orderRequestUpdates, updatedAt: now });
    }
    const orderUpdates = orderSnap?.exists() ? changedFields(orderSnap.data(), active.orderFields) : {};
    if (orderSnap?.exists() && Object.keys(orderUpdates).length > 0) {
      tx.update(orderRef!, { ...orderUpdates, updatedAt: now });
    }
    const listingUpdates = listingSnap?.exists() ? changedFields(listingSnap.data(), active.listingFields) : {};
    if (listingSnap?.exists() && Object.keys(listingUpdates).length > 0) {
      tx.update(listingRef!, { ...listingUpdates, updatedAt: now });
    }
  });

  return writtenId;
}

async function planFromAnchor(anchor: InvoiceAnchor): Promise<InvoiceLinkPlan> {
  const found = await findLinkedInvoiceIds(anchor);
  const legacy = await readLegacyInvoiceIds(anchor);
  return planInvoiceLink({
    ...anchor,
    foundInvoiceIds: [...found, ...legacy, ...(anchor.foundInvoiceIds || [])],
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
  const freshId = doc(collection(db, "invoices")).id;
  const plan = await planFromAnchor({ ...anchor, createId: anchor.createId || freshId });
  if (!plan.createId) throw new Error("An order or project is required to link an invoice.");
  return commitPlan(plan, source, freshId);
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
