/**
 * Read-only load of the order, request, and invoice behind a project.
 * Opening a project must not write link fields or create an invoice.
 */

import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import {
  buildBillingIndex,
  invoiceLinkKeys,
  projectSurfaceForListing,
  type ProjectSurface,
} from "@shared/projectSurfaceStatus";
import { db } from "@/lib/firebase";

function textId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

async function readDoc(collectionName: string, id: string | null): Promise<Record<string, unknown> | null> {
  if (!id) return null;
  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function readWhere(collectionName: string, field: string, value: string | null): Promise<Record<string, unknown>[]> {
  if (!value) return [];
  const snap = await getDocs(query(collection(db, collectionName), where(field, "==", value), limit(5)));
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

function unique(records: Array<Record<string, unknown> | null | undefined>): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const record of records) {
    const id = textId(record?.id);
    if (!record || !id || seen.has(id)) continue;
    seen.add(id);
    out.push(record);
  }
  return out;
}

/** Same documents the projects grid indexes, scoped to one listing. */
export async function readProjectSurface(listing: Record<string, unknown>): Promise<ProjectSurface> {
  const listingId = textId(listing.id);
  const requestId = textId(listing.orderRequestId);
  const orderId = textId(listing.orderId);

  const [request, requestsByListing, order, ordersByListing, ordersByRequest] = await Promise.all([
    readDoc("orderRequests", requestId),
    readWhere("orderRequests", "listingId", listingId),
    readDoc("orders", orderId),
    readWhere("orders", "listingId", listingId),
    readWhere("orders", "orderRequestId", requestId),
  ]);

  const orderRequests = unique([request, ...requestsByListing]);
  const orders = unique([order, ...ordersByListing, ...ordersByRequest]);
  const preview = projectSurfaceForListing(listing, buildBillingIndex({ orders, orderRequests }));
  const keys = invoiceLinkKeys({
    listing,
    order: preview.order,
    orderRequest: preview.orderRequest,
  });

  const extraOrderIds = keys.orderIds.filter((id) => id !== orderId);
  const extraRequestIds = keys.orderRequestIds.filter((id) => id !== requestId);
  const [extraOrders, extraRequests, directInvoices, invoicesByListing, ...relatedInvoices] = await Promise.all([
    Promise.all(extraOrderIds.map((id) => readDoc("orders", id))),
    Promise.all(extraRequestIds.map((id) => readDoc("orderRequests", id))),
    Promise.all(keys.invoiceIds.map((id) => readDoc("invoices", id))),
    readWhere("invoices", "listingId", listingId),
    ...keys.orderIds.map((id) => readWhere("invoices", "orderId", id)),
    ...keys.orderRequestIds.map((id) => readWhere("invoices", "orderRequestId", id)),
  ]);

  const invoices = unique([
    ...directInvoices,
    ...invoicesByListing,
    ...relatedInvoices.flat(),
  ]);

  return projectSurfaceForListing(listing, buildBillingIndex({
    orders: unique([...orders, ...extraOrders]),
    orderRequests: unique([...orderRequests, ...extraRequests]),
    invoices,
  }));
}
