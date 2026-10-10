/**
 * Price for the admin listings grid.
 * Keeps the listing or order price the tile already shows, then the order
 * total, then a linked draft or sent invoice total. This module only reads.
 */

import { buildAdminOrderTile } from "./adminOrderTile.ts";

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

const USABLE_INVOICE_STATUS = new Set(["draft", "sent"]);

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
  const shown = priceShownToday(listing);
  if (shown) return shown;

  const order = input.order ?? nestedRecord(listing.order);
  const orderShown = order ? priceShownToday(order) : null;
  if (orderShown) return orderShown;

  const orderTotal = firstPositive([
    order?.total,
    nestedRecord(order?.pricing)?.total,
    order?.amount,
    listing.total,
    nestedRecord(listing.pricing)?.total,
    listing.amount,
  ]);
  if (orderTotal != null) return formatAdminMoney(orderTotal);

  const invoiceTotal = firstInvoiceTotal([
    input.invoice,
    listing.invoice,
    order?.invoice,
  ]);
  if (invoiceTotal != null) return formatAdminMoney(invoiceTotal);
  return LISTING_PRICE_MISSING;
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
  if (unresolved(pending, index).length === 0) return index;

  await readInvoiceIdsFromOrders(index, reader, unresolved(pending, index));
  const still = unresolved(pending, index);
  if (still.length === 0) return index;

  await readByLink(index, reader, still);
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
  await readInvoiceIdsFromOrders(index, reader, listings);
  await readByLink(index, reader, listings);
  await readEmbeddedInvoiceIds(index, reader, listings);
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
  const [orders, requests, byListing, byOrder, byRequest] = await Promise.all([
    readField(reader, "orders", "listingId", listingIds),
    readField(reader, "orderRequests", "listingId", listingIds),
    readField(reader, "invoices", "listingId", listingIds),
    readField(reader, "invoices", "orderId", orderIds),
    readField(reader, "invoices", "orderRequestId", requestIds),
  ]);
  remember(index, orders, requests, [...byListing, ...byOrder, ...byRequest]);
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
  for (const id of orderIdsOf(listing)) {
    const order = index.orders.get(id);
    if (order) return order;
  }
  for (const id of [...orderIdsOf(listing), ...requestIdsOf(listing)]) {
    const request = index.orderRequests.get(id);
    if (request) return request;
  }
  const listingId = docId(listing);
  if (!listingId) return null;
  return [...index.orders.values()].find((doc) => text(doc.listingId) === listingId)
    || [...index.orderRequests.values()].find((doc) => text(doc.listingId) === listingId)
    || null;
}

function invoiceForListing(
  listing: Record<string, unknown>,
  order: ListingPriceDoc | null,
  index: ListingPriceIndex,
): ListingPriceDoc | null {
  const preferredId = invoiceIdsOf(listing)[0] || (order ? invoiceIdsOf(order)[0] : "") || "";
  const listingId = docId(listing);
  const orderIds = new Set([
    ...orderIdsOf(listing),
    ...requestIdsOf(listing),
    order ? docId(order) : "",
    order ? text(order.orderRequestId) : "",
  ].filter(Boolean));
  const linked = [...index.invoices.values()].filter((doc) => {
    if (preferredId && doc.id === preferredId) return true;
    if (listingId && text(doc.listingId) === listingId) return true;
    if (orderIds.size > 0 && (orderIds.has(text(doc.orderId)) || orderIds.has(text(doc.orderRequestId)))) return true;
    return false;
  });
  return chooseInvoice(linked, preferredId);
}

function chooseInvoice(docs: ListingPriceDoc[], preferredId: string): ListingPriceDoc | null {
  const usable = docs.filter((doc) => invoiceTotal(doc) != null);
  if (usable.length === 0) return null;
  const preferred = usable.find((doc) => doc.id === preferredId);
  if (preferred) return preferred;
  return [...usable].sort((a, b) => a.id.localeCompare(b.id))[0];
}

function priceShownToday(record: Record<string, unknown>): string | null {
  const label = buildAdminOrderTile(record).priceLabel;
  if (!label || label === LISTING_PRICE_MISSING) return null;
  return label;
}

function invoiceTotal(value: unknown): number | null {
  const record = nestedRecord(value);
  if (!record) return null;
  const status = text(record.status).toLowerCase();
  if (!USABLE_INVOICE_STATUS.has(status)) return null;
  return positiveMoney(record.total);
}

function firstInvoiceTotal(values: unknown[]): number | null {
  for (const value of values) {
    const total = invoiceTotal(value);
    if (total != null) return total;
  }
  return null;
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
