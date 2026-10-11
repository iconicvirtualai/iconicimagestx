/**
 * Price for the admin listings grid.
 * Keeps the listing or order price the tile already shows, then stored totals
 * (including a consult line's amount, balance due, or amount due), then a
 * linked invoice total or amount due, then a catalog package price.
 * A dash is only for a record with no price anywhere. This module only reads.
 */

import { buildAdminOrderTile } from "./adminOrderTile.ts";
import { hardcodedChargePriceForText } from "./bookingCatalog.ts";
import { listingInvoiceDocId, orderInvoiceDocId } from "./orderProjectInvoice.ts";

export const LISTING_PRICE_MISSING = "—";
export const LISTING_PRICE_QUERY_CHUNK = 30;

export type ListingPriceCollection = "orders" | "orderRequests" | "invoices";

export interface ListingPriceDoc extends Record<string, unknown> {
  id: string;
}

export interface ListingPriceReader {
  byIds(collectionName: ListingPriceCollection, ids: string[]): Promise<ListingPriceDoc[]>;
  byField(collectionName: ListingPriceCollection, field: string, values: string[]): Promise<ListingPriceDoc[]>;
}

export interface ListingPriceIndex {
  orders: Map<string, ListingPriceDoc>;
  orderRequests: Map<string, ListingPriceDoc>;
  invoices: Map<string, ListingPriceDoc>;
}

const CLOSED_INVOICE_STATUS = new Set(["void", "voided", "cancelled", "canceled"]);

/**
 * Currency string used across admin (client account, invoices, order detail).
 * Catalog prices that the tile already prints stay in that tile's own format.
 */
export function formatAdminMoney(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function resolveListingPriceLabel(input: {
  listing: Record<string, unknown>;
  order?: Record<string, unknown> | null;
  invoice?: Record<string, unknown> | null;
}): string {
  const listing = input.listing;
  const order = input.order ?? nestedRecord(listing.order);
  const shown = priceShownToday(listing) || (order ? priceShownToday(order) : null);
  if (shown) return shown;

  const stored = (order ? storedMoney(order) : null) ?? storedMoney(listing);
  if (stored != null) return formatAdminMoney(stored);

  const invoiceTotal = firstInvoiceMoney([
    input.invoice,
    listing.invoice,
    order?.invoice,
  ]);
  if (invoiceTotal != null) return formatAdminMoney(invoiceTotal);

  const catalog = (order ? catalogMoney(order) : null) ?? catalogMoney(listing);
  if (catalog != null) return formatAdminMoney(catalog);
  return LISTING_PRICE_MISSING;
}

/**
 * Price for one listings grid row. The status tab is not a price source:
 * In progress and All resolve the same listing the same way.
 */
export function listingPriceForView(
  listing: Record<string, unknown>,
  index: ListingPriceIndex | null | undefined,
  _view?: string,
): string {
  return listingPriceLabel(listing, index);
}

/**
 * A dash painted before the order/invoice lookup finishes is not a result.
 * A settled lookup replaces it. A settled dash is kept only when no price exists.
 */
export function replaceProvisionalListingPrice(
  current: string | undefined,
  next: string,
  settled: boolean,
): string {
  if (settled) return next;
  if (current && current !== LISTING_PRICE_MISSING) return current;
  return next;
}

export function listingPriceLabel(
  listing: Record<string, unknown>,
  index?: ListingPriceIndex | null,
): string {
  if (!index) return resolveListingPriceLabel({ listing });
  const order = orderForListing(listing, index);
  const invoice = invoiceForListing(listing, order, index);
  return resolveListingPriceLabel({ listing, order, invoice });
}

/** Stable key for the rows that still need a linked order or invoice. */
export function listingPriceLookupKey(listings: Record<string, unknown>[]): string {
  return listings
    .filter((listing) => resolveListingPriceLabel({ listing }) === LISTING_PRICE_MISSING)
    .map((listing) => [
      docId(listing),
      ...orderIdsOf(listing),
      ...requestIdsOf(listing),
      ...invoiceIdsOf(listing),
    ].join(":"))
    .sort()
    .join("|");
}

/** Changes when any listing's order or invoice link changes, priced or not. */
export function listingBillingLookupKey(listings: Record<string, unknown>[]): string {
  return listings
    .map((listing) => [
      docId(listing),
      ...orderIdsOf(listing),
      ...requestIdsOf(listing),
      ...invoiceIdsOf(listing),
      embeddedInvoiceId(listing),
    ].join(":"))
    .sort()
    .join("|");
}

export function chunkIds<T>(values: T[], size = LISTING_PRICE_QUERY_CHUNK): T[][] {
  const chunks: T[][] = [];
  const step = size > 0 ? size : LISTING_PRICE_QUERY_CHUNK;
  for (let index = 0; index < values.length; index += step) {
    chunks.push(values.slice(index, index + step));
  }
  return chunks;
}

export function emptyListingPriceIndex(): ListingPriceIndex {
  return {
    orders: new Map(),
    orderRequests: new Map(),
    invoices: new Map(),
  };
}

/**
 * One batched read for every listing that still has no price.
 * Callers chunk Firestore `in` queries. This does not read once per row.
 */
export async function loadListingPriceIndex(
  listings: Record<string, unknown>[],
  reader: ListingPriceReader,
): Promise<ListingPriceIndex> {
  const index = emptyListingPriceIndex();
  const pending = listings.filter((listing) => resolveListingPriceLabel({ listing }) === LISTING_PRICE_MISSING);
  if (pending.length === 0) return index;

  await readKnownIds(index, reader, pending);
  await readConvertedOrders(index, reader, pending);
  await readStableInvoiceIds(index, reader, pending);
  if (unresolved(pending, index).length === 0) return index;

  await readInvoiceIdsFromOrders(index, reader, unresolved(pending, index));
  const still = unresolved(pending, index);
  if (still.length === 0) return index;

  await readByLink(index, reader, still);
  await readStableInvoiceIds(index, reader, unresolved(pending, index));
  return index;
}

/**
 * One batched read of orders, requests, and invoices for every listing.
 * The grid uses this same index for the price fallback and for paid status.
 * Rows that already show a catalog price are included, because paid status
 * still comes from the linked invoice.
 */
export async function loadListingBillingIndex(
  listings: Record<string, unknown>[],
  reader: ListingPriceReader,
): Promise<ListingPriceIndex> {
  const index = emptyListingPriceIndex();
  if (listings.length === 0) return index;
  await readKnownIds(index, reader, listings);
  await readConvertedOrders(index, reader, listings);
  await readStableInvoiceIds(index, reader, listings);
  await readInvoiceIdsFromOrders(index, reader, listings);
  await readByLink(index, reader, listings);
  await readEmbeddedInvoiceIds(index, reader, listings);
  await readStableInvoiceIds(index, reader, listings);
  return index;
}

async function readKnownIds(
  index: ListingPriceIndex,
  reader: ListingPriceReader,
  listings: Record<string, unknown>[],
) {
  const [orders, requests, invoices] = await Promise.all([
    readIds(reader, "orders", listings.flatMap(orderIdsOf)),
    readIds(reader, "orderRequests", listings.flatMap(requestIdsOf)),
    readIds(reader, "invoices", listings.flatMap(invoiceIdsOf)),
  ]);
  remember(index, orders, requests, invoices);
}

async function readConvertedOrders(
  index: ListingPriceIndex,
  reader: ListingPriceReader,
  listings: Record<string, unknown>[],
) {
  const ids = unique(listings.flatMap((listing) => {
    const requestIds = [...orderIdsOf(listing), ...requestIdsOf(listing)];
    return requestIds.flatMap((id) => {
      const request = index.orderRequests.get(id);
      if (!request) return [];
      return [text(request.convertedToOrderId), text(request.orderId)];
    });
  })).filter((id) => !index.orders.has(id));
  remember(index, await readIds(reader, "orders", ids), [], []);
}

async function readStableInvoiceIds(
  index: ListingPriceIndex,
  reader: ListingPriceReader,
  listings: Record<string, unknown>[],
) {
  const ids = unique(listings.flatMap((listing) => stableInvoiceIds(listing, index)))
    .filter((id) => !index.invoices.has(id));
  remember(index, [], [], await readIds(reader, "invoices", ids));
}

function stableInvoiceIds(listing: Record<string, unknown>, index: ListingPriceIndex): string[] {
  const ids: string[] = [];
  const pushRequest = (id: string) => {
    if (id) ids.push(orderInvoiceDocId(id));
  };
  requestIdsOf(listing).forEach(pushRequest);
  const listingId = docId(listing);
  if (listingId) ids.push(listingInvoiceDocId(listingId));
  for (const id of [...orderIdsOf(listing), ...requestIdsOf(listing)]) {
    const request = index.orderRequests.get(id);
    if (!request) continue;
    pushRequest(docId(request));
    pushRequest(text(request.orderRequestId));
  }
  const linked = orderForListing(listing, index);
  if (linked) pushRequest(text(linked.orderRequestId));
  return ids;
}

async function readInvoiceIdsFromOrders(
  index: ListingPriceIndex,
  reader: ListingPriceReader,
  listings: Record<string, unknown>[],
) {
  const ids = unique(listings.flatMap((listing) => {
    const order = orderForListing(listing, index);
    return order ? invoiceIdsOf(order) : [];
  })).filter((id) => !index.invoices.has(id));
  remember(index, [], [], await readIds(reader, "invoices", ids));
}

async function readEmbeddedInvoiceIds(
  index: ListingPriceIndex,
  reader: ListingPriceReader,
  listings: Record<string, unknown>[],
) {
  const ids = unique(listings.map(embeddedInvoiceId)).filter((id) => !index.invoices.has(id));
  remember(index, [], [], await readIds(reader, "invoices", ids));
}

async function readByLink(
  index: ListingPriceIndex,
  reader: ListingPriceReader,
  listings: Record<string, unknown>[],
) {
  const listingIds = unique(listings.map(docId));
  const orderIds = unique(listings.flatMap((listing) => {
    const linked = orderForListing(listing, index);
    return [...orderIdsOf(listing), linked ? docId(linked) : ""];
  }));
  const requestIds = unique(listings.flatMap((listing) => {
    const linked = orderForListing(listing, index);
    return [...requestIdsOf(listing), linked ? text(linked.orderRequestId) : ""];
  }));
  const [orders, requests, ordersByRequest, byListing, byOrder, byRequest] = await Promise.all([
    readField(reader, "orders", "listingId", listingIds),
    readField(reader, "orderRequests", "listingId", listingIds),
    readField(reader, "orders", "orderRequestId", requestIds),
    readField(reader, "invoices", "listingId", listingIds),
    readField(reader, "invoices", "orderId", orderIds),
    readField(reader, "invoices", "orderRequestId", requestIds),
  ]);
  remember(index, [...orders, ...ordersByRequest], requests, [...byListing, ...byOrder, ...byRequest]);
}

function unresolved(listings: Record<string, unknown>[], index: ListingPriceIndex) {
  return listings.filter((listing) => listingPriceLabel(listing, index) === LISTING_PRICE_MISSING);
}

async function readIds(
  reader: ListingPriceReader,
  collectionName: ListingPriceCollection,
  ids: string[],
): Promise<ListingPriceDoc[]> {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return [];
  return reader.byIds(collectionName, uniqueIds);
}

async function readField(
  reader: ListingPriceReader,
  collectionName: ListingPriceCollection,
  field: string,
  values: string[],
): Promise<ListingPriceDoc[]> {
  const uniqueValues = unique(values);
  if (uniqueValues.length === 0) return [];
  return reader.byField(collectionName, field, uniqueValues);
}

function remember(
  index: ListingPriceIndex,
  orders: ListingPriceDoc[],
  requests: ListingPriceDoc[],
  invoices: ListingPriceDoc[],
) {
  for (const doc of orders) index.orders.set(doc.id, doc);
  for (const doc of requests) index.orderRequests.set(doc.id, doc);
  for (const doc of invoices) index.invoices.set(doc.id, doc);
}

function orderForListing(listing: Record<string, unknown>, index: ListingPriceIndex): ListingPriceDoc | null {
  const candidates: ListingPriceDoc[] = [];
  const seen = new Set<ListingPriceDoc>();
  const add = (doc: ListingPriceDoc | null | undefined) => {
    if (!doc || seen.has(doc)) return;
    seen.add(doc);
    candidates.push(doc);
  };
  for (const id of orderIdsOf(listing)) add(index.orders.get(id));
  for (const id of requestIdsOf(listing)) {
    const request = index.orderRequests.get(id);
    add(request);
    if (request) {
      add(index.orders.get(text(request.convertedToOrderId)));
      add(index.orders.get(text(request.orderId)));
    }
  }
  const listingId = docId(listing);
  const requestIds = new Set([
    ...requestIdsOf(listing),
    ...candidates.map((doc) => docId(doc)),
  ].filter(Boolean));
  for (const doc of index.orders.values()) {
    if ((listingId && text(doc.listingId) === listingId) || requestIds.has(text(doc.orderRequestId))) add(doc);
  }
  if (listingId) {
    for (const doc of index.orderRequests.values()) {
      if (text(doc.listingId) === listingId) add(doc);
    }
  }
  return candidates.find((doc) => recordHasPrice(doc)) || candidates[0] || null;
}

function invoiceForListing(
  listing: Record<string, unknown>,
  order: ListingPriceDoc | null,
  index: ListingPriceIndex,
): ListingPriceDoc | null {
  const preferredId = invoiceIdsOf(listing)[0] || (order ? invoiceIdsOf(order)[0] : "") || "";
  const listingId = docId(listing);
  const stableIds = new Set(stableInvoiceIds(listing, index));
  const orderIds = new Set([
    ...orderIdsOf(listing),
    ...requestIdsOf(listing),
    order ? docId(order) : "",
    order ? text(order.orderRequestId) : "",
  ].filter(Boolean));
  const linked = [...index.invoices.values()].filter((doc) => {
    if (preferredId && doc.id === preferredId) return true;
    if (stableIds.has(doc.id)) return true;
    if (listingId && text(doc.listingId) === listingId) return true;
    if (orderIds.size > 0 && (orderIds.has(text(doc.orderId)) || orderIds.has(text(doc.orderRequestId)))) return true;
    return false;
  });
  return chooseInvoice(linked, preferredId);
}

function chooseInvoice(docs: ListingPriceDoc[], preferredId: string): ListingPriceDoc | null {
  const usable = docs.filter((doc) => invoiceMoney(doc) != null);
  if (usable.length === 0) return null;
  const preferred = usable.find((doc) => doc.id === preferredId);
  if (preferred) return preferred;
  return [...usable].sort((a, b) => a.id.localeCompare(b.id))[0];
}

function priceShownToday(record: Record<string, unknown>): string | null {
  const label = buildAdminOrderTile(record).priceLabel;
  if (!label || label === LISTING_PRICE_MISSING) return null;
  const amount = money(label);
  if (amount != null && amount <= 0) return null;
  return label;
}

function recordHasPrice(record: Record<string, unknown>): boolean {
  return priceShownToday(record) != null
    || storedMoney(record) != null
    || invoiceMoney(record.invoice) != null
    || catalogMoney(record) != null;
}

function storedMoney(record: Record<string, unknown>): number | null {
  const pricing = nestedRecord(record.pricing);
  return firstPositive([
    record.total,
    pricing?.total,
    pricing?.subtotal,
    record.amount,
    record.subtotal,
    record.balanceDue,
    record.amountDue,
    lineMoneySum(record),
  ]);
}

function invoiceMoney(value: unknown): number | null {
  const record = nestedRecord(value);
  if (!record) return null;
  const status = text(record.status).toLowerCase();
  if (CLOSED_INVOICE_STATUS.has(status)) return null;
  return firstPositive([
    record.total,
    record.amountDue,
    record.subtotal,
    lineMoneySum(record),
  ]);
}

function firstInvoiceMoney(values: unknown[]): number | null {
  for (const value of values) {
    const total = invoiceMoney(value);
    if (total != null) return total;
  }
  return null;
}

function lineMoneySum(record: Record<string, unknown>): number | null {
  const raw = Array.isArray(record.lineItems) && record.lineItems.length > 0
    ? record.lineItems
    : Array.isArray(record.services) ? record.services : [];
  let sum = 0;
  let found = false;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const qtyRaw = money(row.qty);
    const qty = qtyRaw != null && qtyRaw > 0 ? qtyRaw : 1;
    const unit = money(row.unitPrice);
    const extended = unit != null && unit > 0 ? Math.round(unit * qty * 100) / 100 : null;
    const amount = firstPositive([row.price, row.amount, row.total, extended]);
    if (amount == null) continue;
    sum += amount;
    found = true;
  }
  if (!found) return null;
  const rounded = Math.round(sum * 100) / 100;
  return rounded > 0 ? rounded : null;
}

function catalogMoney(record: Record<string, unknown>): number | null {
  for (const value of catalogCandidates(record)) {
    const catalog = hardcodedChargePriceForText(value);
    if (catalog != null && catalog > 0) return Math.round(catalog * 100) / 100;
    const labeled = labeledMoney(value);
    if (labeled != null && labeled > 0) return labeled;
  }
  return null;
}

function catalogCandidates(record: Record<string, unknown>): string[] {
  const values: string[] = [];
  const push = (value: unknown) => {
    const raw = text(value);
    if (raw) values.push(raw);
  };
  push(record.selectedService);
  push(record.serviceId);
  push(record.packageId);
  push(record.package);
  push(record.packageName);
  push(record.selectedPackage);
  for (const id of asStrings(record.serviceIds)) push(id);
  for (const id of asStrings(record.selectedBasics)) push(id);
  for (const id of asStrings(record.selectedAddOns)) push(id);
  const raw = Array.isArray(record.lineItems) && record.lineItems.length > 0
    ? record.lineItems
    : record.services;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        push(row.id);
        push(row.name);
      }
    }
  }
  return values;
}

function labeledMoney(raw: string): number | null {
  const match = raw.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter(Boolean);
}

function firstPositive(values: unknown[]): number | null {
  for (const value of values) {
    const amount = positiveMoney(value);
    if (amount != null) return amount;
  }
  return null;
}

function positiveMoney(value: unknown): number | null {
  const amount = money(value);
  if (amount == null || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function orderIdsOf(record: Record<string, unknown>): string[] {
  return unique([text(record.orderId), text(record.convertedToOrderId)]);
}

function requestIdsOf(record: Record<string, unknown>): string[] {
  return unique([text(record.orderRequestId)]);
}

function invoiceIdsOf(record: Record<string, unknown>): string[] {
  return unique([text(record.invoiceId)]);
}

function embeddedInvoiceId(record: Record<string, unknown>): string {
  return text(nestedRecord(record.invoice)?.id);
}

function docId(record: Record<string, unknown>): string {
  return text(record.id);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
