/**
 * Status and payment for the projects grid card and the project page.
 *
 * Project status, including cancelled, is the listing's status.
 * Paid is the linked invoice document. Copied listing fields
 * (invoiceStatus, paymentStatus, paidAt, amountPaid, galleryStatus, deliveredAt)
 * do not mark a project paid and do not hide cancelled.
 */

export type ProjectPayment = "paid" | "partial" | "unpaid" | "no_invoice" | "pending";

export interface ProjectSurfaceChip {
  slot: "status" | "payment";
  label: string;
}

export interface ProjectSurface {
  projectStatus: string;
  projectStatusLabel: string;
  cancelled: boolean;
  payment: ProjectPayment;
  paymentLabel: string;
  /** Gallery or listing delivery flag. Never replaces a cancelled status chip. */
  delivered: boolean;
  invoiceId: string | null;
  invoice: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  orderRequest: Record<string, unknown> | null;
  chips: ProjectSurfaceChip[];
}

export interface ProjectSurfaceInput {
  listing?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  orderRequest?: Record<string, unknown> | null;
  invoices?: Array<Record<string, unknown> | null | undefined>;
  galleries?: Array<Record<string, unknown> | null | undefined>;
  /** Related billing documents are still loading. Do not conclude "no invoice". */
  pending?: boolean;
}

export interface BillingPool {
  orders?: Array<Record<string, unknown>>;
  orderRequests?: Array<Record<string, unknown>>;
  invoices?: Array<Record<string, unknown>>;
  galleries?: Array<Record<string, unknown>>;
}

const STATUS_LABELS: Record<string, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  consult_scheduled: "Consult scheduled",
  appt_scheduled: "Appt scheduled",
  in_progress: "In progress",
  pending: "In progress",
  confirmed: "Scheduled",
  delivered: "Delivered",
  delivered_paid: "Delivered",
  delivered_unpaid: "Delivered",
  paid: "Paid",
  archived: "Archived",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  declined: "Cancelled",
};

const PAYMENT_LABEL: Record<ProjectPayment, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  no_invoice: "No invoice",
  pending: "Checking…",
};

export function projectStatusLabel(status: unknown): string {
  const key = normalize(status);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  if (!key) return "Unscheduled";
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function projectSurfaceStatus(input: ProjectSurfaceInput): ProjectSurface {
  const listing = record(input.listing);
  const order = record(input.order);
  const orderRequest = record(input.orderRequest);
  const projectStatus = normalize(listing?.status) || "unscheduled";
  const cancelled = projectStatus === "cancelled" || projectStatus === "canceled" || projectStatus === "declined";
  const canonical = cancelled ? "cancelled" : projectStatus;
  const linked = chooseLinkedInvoice({ ...input, listing, order, orderRequest });
  const payment: ProjectPayment = input.pending ? "pending" : paymentFromInvoice(linked.invoice, linked.id);
  const statusLabel = projectStatusLabel(canonical);
  const paymentLabel = PAYMENT_LABEL[payment];
  return {
    projectStatus: canonical,
    projectStatusLabel: statusLabel,
    cancelled,
    payment,
    paymentLabel,
    delivered: isDelivered(listing, input.galleries),
    invoiceId: input.pending ? null : linked.id,
    invoice: input.pending ? null : linked.invoice,
    order,
    orderRequest,
    chips: [
      { slot: "status", label: statusLabel },
      { slot: "payment", label: paymentLabel },
    ],
  };
}

/**
 * Invoice document ids and query keys for this listing.
 * Order invoice id wins over the listing's, matching planInvoiceLink.
 * Also follows listing.invoice.id, which the card used to read as a nested
 * invoice while the project page only loaded listing.invoiceId.
 */
export function invoiceLinkKeys(input: ProjectSurfaceInput): {
  invoiceIds: string[];
  orderIds: string[];
  orderRequestIds: string[];
  listingId: string | null;
} {
  const listing = record(input.listing);
  const order = record(input.order);
  const orderRequest = record(input.orderRequest);
  const invoiceIds = uniqueIds([
    textId(order?.invoiceId),
    textId(orderRequest?.invoiceId),
    textId(listing?.invoiceId),
    embeddedInvoiceId(listing),
  ]);
  const orderIds = uniqueIds([
    textId(order?.id),
    textId(listing?.orderId),
    textId(orderRequest?.orderId),
    textId(orderRequest?.convertedToOrderId),
  ]);
  const orderRequestIds = uniqueIds([
    textId(orderRequest?.id),
    textId(listing?.orderRequestId),
    textId(order?.orderRequestId),
  ]);
  return {
    invoiceIds,
    orderIds,
    orderRequestIds,
    listingId: textId(listing?.id),
  };
}

export interface BillingIndex {
  ordersById: Map<string, Record<string, unknown>>;
  requestsById: Map<string, Record<string, unknown>>;
  ordersByListing: Map<string, Record<string, unknown>>;
  requestsByListing: Map<string, Record<string, unknown>>;
  ordersByRequest: Map<string, Record<string, unknown>>;
  invoicesById: Map<string, Record<string, unknown>>;
  invoicesByOrder: Map<string, Record<string, unknown>[]>;
  invoicesByRequest: Map<string, Record<string, unknown>[]>;
  invoicesByListing: Map<string, Record<string, unknown>[]>;
  galleriesById: Map<string, Record<string, unknown>>;
  galleriesByListing: Map<string, Record<string, unknown>[]>;
  galleriesByOrder: Map<string, Record<string, unknown>[]>;
}

/** Orders and invoices already loaded for the listings price, reused for status. */
export function billingPoolFromPriceIndex(index: {
  orders: { values(): Iterable<Record<string, unknown>> };
  orderRequests: { values(): Iterable<Record<string, unknown>> };
  invoices: { values(): Iterable<Record<string, unknown>> };
} | null | undefined): BillingPool {
  if (!index) return {};
  return {
    orders: [...index.orders.values()],
    orderRequests: [...index.orderRequests.values()],
    invoices: [...index.invoices.values()],
  };
}

export function buildBillingIndex(pool: BillingPool): BillingIndex {
  const index: BillingIndex = {
    ordersById: new Map(),
    requestsById: new Map(),
    ordersByListing: new Map(),
    requestsByListing: new Map(),
    ordersByRequest: new Map(),
    invoicesById: new Map(),
    invoicesByOrder: new Map(),
    invoicesByRequest: new Map(),
    invoicesByListing: new Map(),
    galleriesById: new Map(),
    galleriesByListing: new Map(),
    galleriesByOrder: new Map(),
  };
  for (const order of pool.orders || []) {
    const id = textId(order.id);
    if (id) index.ordersById.set(id, order);
    const listingId = textId(order.listingId);
    if (listingId) preferLinked(index.ordersByListing, listingId, order);
    const requestId = textId(order.orderRequestId);
    if (requestId) preferLinked(index.ordersByRequest, requestId, order);
  }
  for (const request of pool.orderRequests || []) {
    const id = textId(request.id);
    if (id) index.requestsById.set(id, request);
    const listingId = textId(request.listingId);
    if (listingId) preferLinked(index.requestsByListing, listingId, request);
  }
  for (const invoice of pool.invoices || []) {
    const id = textId(invoice.id);
    if (id) index.invoicesById.set(id, invoice);
    pushMap(index.invoicesByOrder, textId(invoice.orderId), invoice);
    pushMap(index.invoicesByRequest, textId(invoice.orderRequestId), invoice);
    pushMap(index.invoicesByListing, textId(invoice.listingId), invoice);
  }
  for (const gallery of pool.galleries || []) {
    const id = textId(gallery.id);
    if (id) index.galleriesById.set(id, gallery);
    pushMap(index.galleriesByListing, textId(gallery.listingId), gallery);
    pushMap(index.galleriesByOrder, textId(gallery.orderId), gallery);
  }
  return index;
}

export function projectSurfaceForListing(
  listing: Record<string, unknown>,
  index: BillingIndex,
  options?: { pending?: boolean },
): ProjectSurface {
  const listingId = textId(listing.id);
  const orderRequest = index.requestsById.get(textId(listing.orderRequestId) || "")
    || (listingId ? index.requestsByListing.get(listingId) : undefined)
    || null;
  const requestId = textId(orderRequest?.id) || textId(listing.orderRequestId);
  const order = index.ordersById.get(textId(listing.orderId) || "")
    || index.ordersById.get(textId(orderRequest?.convertedToOrderId) || "")
    || index.ordersById.get(textId(orderRequest?.orderId) || "")
    || (requestId ? index.ordersByRequest.get(requestId) : undefined)
    || (listingId ? index.ordersByListing.get(listingId) : undefined)
    || null;

  const galleries: Record<string, unknown>[] = [];
  const seenGalleries = new Set<string>();
  const addGallery = (gallery: Record<string, unknown> | undefined) => {
    const id = textId(gallery?.id) || textId(gallery?.invoiceId);
    if (!gallery || !id || seenGalleries.has(id)) return;
    seenGalleries.add(id);
    galleries.push(gallery);
  };
  if (listingId) (index.galleriesByListing.get(listingId) || []).forEach(addGallery);
  const hintedGallery = textId(listing.galleryId);
  if (hintedGallery) addGallery(index.galleriesById.get(hintedGallery));

  const invoices: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const add = (invoice: Record<string, unknown> | undefined) => {
    const id = textId(invoice?.id);
    if (!invoice || !id || seen.has(id)) return;
    seen.add(id);
    invoices.push(invoice);
  };
  const keys = invoiceLinkKeys({ listing, order, orderRequest });
  for (const id of keys.orderIds) (index.galleriesByOrder.get(id) || []).forEach(addGallery);
  for (const id of keys.invoiceIds) add(index.invoicesById.get(id));
  for (const id of keys.orderIds) (index.invoicesByOrder.get(id) || []).forEach(add);
  for (const id of keys.orderRequestIds) (index.invoicesByRequest.get(id) || []).forEach(add);
  if (keys.listingId) (index.invoicesByListing.get(keys.listingId) || []).forEach(add);

  return projectSurfaceStatus({
    listing,
    order,
    orderRequest,
    invoices,
    galleries,
    pending: options?.pending,
  });
}

function chooseLinkedInvoice(input: ProjectSurfaceInput): { id: string | null; invoice: Record<string, unknown> | null } {
  const keys = invoiceLinkKeys(input);
  const invoices = (input.invoices || []).filter((row): row is Record<string, unknown> => Boolean(record(row)));
  const byId = new Map<string, Record<string, unknown>>();
  for (const invoice of invoices) {
    const id = textId(invoice.id);
    if (id) byId.set(id, invoice);
  }

  const preferredId = keys.invoiceIds[0] || null;
  if (preferredId) return { id: preferredId, invoice: byId.get(preferredId) || null };

  const orderIds = new Set(keys.orderIds);
  const requestIds = new Set(keys.orderRequestIds);
  const byOrder = invoices.find((invoice) => {
    const orderId = textId(invoice.orderId);
    const requestId = textId(invoice.orderRequestId);
    return Boolean((orderId && orderIds.has(orderId)) || (requestId && requestIds.has(requestId)));
  });
  if (byOrder) return { id: textId(byOrder.id), invoice: byOrder };

  const byListing = keys.listingId
    ? invoices.find((invoice) => textId(invoice.listingId) === keys.listingId)
    : undefined;
  if (byListing) return { id: textId(byListing.id), invoice: byListing };

  return { id: null, invoice: null };
}

function paymentFromInvoice(invoice: Record<string, unknown> | null, invoiceId: string | null): ProjectPayment {
  if (!invoice) return invoiceId ? "unpaid" : "no_invoice";
  const status = normalize(invoice.status);
  const paymentStatus = normalize(invoice.paymentStatus);
  if (status === "void" || status === "voided" || status === "cancelled" || status === "canceled") return "unpaid";
  if (status === "partial" || paymentStatus === "partial") return "partial";
  const total = money(invoice.total ?? invoice.amount);
  const paid = money(invoice.amountPaid);
  if (paid > 0 && total > 0 && paid + 0.009 < total) return "partial";
  if (
    status === "paid"
    || paymentStatus === "paid"
    || status === "comped"
    || paymentStatus === "comped"
    || (paid > 0 && (total === 0 || paid >= total))
  ) return "paid";
  return "unpaid";
}

function isDelivered(
  listing: Record<string, unknown> | null,
  galleries: ProjectSurfaceInput["galleries"],
): boolean {
  const status = normalize(listing?.status);
  const delivery = normalize(listing?.deliveryStatus || listing?.galleryStatus);
  if (listing?.deliveredAt) return true;
  if (status.includes("delivered")) return true;
  if (delivery === "delivered" || delivery === "approved") return true;
  return (galleries || []).some((gallery) => {
    const row = record(gallery);
    if (!row) return false;
    const galleryStatus = normalize(row.status || row.galleryStatus);
    return Boolean(row.deliveredAt) || galleryStatus === "delivered" || galleryStatus === "approved";
  });
}

function preferLinked(map: Map<string, Record<string, unknown>>, key: string, next: Record<string, unknown>) {
  const current = map.get(key);
  if (!current || (!textId(current.invoiceId) && textId(next.invoiceId))) map.set(key, next);
}

function pushMap(map: Map<string, Record<string, unknown>[]>, key: string | null, value: Record<string, unknown>) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function embeddedInvoiceId(listing: Record<string, unknown> | null): string | null {
  const invoice = record(listing?.invoice);
  return textId(invoice?.id);
}

function uniqueIds(ids: Array<string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
