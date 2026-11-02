/**
 * Revenue counts only when an admin accepted the order or created it.
 * A missing countsTowardRevenue is false, so existing orders start at $0.
 * playtest and qaOnly never count, even when the flag is true.
 *
 * Pass an already-loaded order or client when you have it.
 * Do not fetch those documents just to answer this.
 */

export const PLAYTEST_LABEL = "TEST";

export interface PlaytestLinks {
  order?: unknown;
  client?: unknown;
}

export interface RevenueAcceptance {
  countsTowardRevenue: boolean;
  revenueAcceptedAt: string | null;
  revenueAcceptedBy: string | null;
}

export interface RevenueCostSettings {
  photographerPayRate: number;
  editingCostPerPhoto: number;
  avgPhotosPerOrder: number;
  platformFeePercent: number;
  platformFeeFlat: number;
}

export interface InvoiceRevenueTotals {
  projected: number;
  earned: number;
  invoiced: number;
  overdue: number;
  collected: number;
  photographerPayout: number;
  editingCost: number;
  platformFees: number;
  totalCosts: number;
  grossMargin: number;
  marginPercent: number;
  counted: number;
}

export interface BillingTotals {
  total: number;
  collected: number;
  outstanding: number;
  overdue: number;
  counted: number;
}

export interface BillingRow {
  total: number;
  paid: number;
  due: number;
  status: string;
  source?: unknown;
}

export interface RevenueDocRef {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

export interface RevenueAcceptancePatch {
  collection: string;
  id: string;
  fields: RevenueAcceptance;
}

const CLOSED_INVOICE = ["cancelled", "void", "voided", "archived"];
const EARNED_INVOICE = ["sent", "draft", "overdue", "paid", "completed"];
const REVENUE_COLLECTIONS = new Set([
  "orders",
  "invoices",
  "orderRequests",
  "appointments",
  "listings",
  "transactions",
  "galleries",
]);

/** Placed and online orders stay visible and do not count. */
export function placedRevenueFields(): RevenueAcceptance {
  return { countsTowardRevenue: false, revenueAcceptedAt: null, revenueAcceptedBy: null };
}

/** Admin Accept order, and an order the admin created. */
export function adminRevenueAcceptance(by: string, at = new Date().toISOString()): RevenueAcceptance {
  const actor = by.trim() || "admin";
  return { countsTowardRevenue: true, revenueAcceptedAt: at, revenueAcceptedBy: actor };
}

export function revenueAcceptanceForRequest(
  request: unknown,
  staffBy: string,
  at = new Date().toISOString(),
): RevenueAcceptance {
  const row = asRecord(request);
  const source = typeof row.source === "string" ? row.source : "";
  const adminSource = source === "admin" || source === "manual_invoice";
  if (row.countsTowardRevenue === true || adminSource) {
    const by = typeof row.revenueAcceptedBy === "string" && row.revenueAcceptedBy.trim()
      ? row.revenueAcceptedBy
      : staffBy;
    const acceptedAt = typeof row.revenueAcceptedAt === "string" && row.revenueAcceptedAt.trim()
      ? row.revenueAcceptedAt
      : at;
    return adminRevenueAcceptance(by, acceptedAt);
  }
  return placedRevenueFields();
}

/** Playtest must be exactly true. An id that starts with playtest- is a seed. */
export function isPlaytestRecord(record: unknown, links?: PlaytestLinks | null): boolean {
  if (playtestFlag(record)) return true;
  if (playtestId(record)) return true;
  if (playtestFlag(links?.order) || playtestFlag(links?.client)) return true;
  if (playtestId(links?.order) || playtestId(links?.client)) return true;
  const data = asRecord(record);
  return playtestFlag(data.order) || playtestFlag(data.client) || playtestFlag(data.invoice)
    || playtestId(data.order) || playtestId(data.client);
}

export function isQaOnlyRecord(record: unknown, links?: PlaytestLinks | null): boolean {
  if (qaOnlyFlag(record)) return true;
  if (qaOnlyFlag(links?.order) || qaOnlyFlag(links?.client)) return true;
  const data = asRecord(record);
  return qaOnlyFlag(data.order) || qaOnlyFlag(data.client) || qaOnlyFlag(data.invoice);
}

/** True only for an accepted, non-playtest, non-qa record. Missing flag is false. */
export function recordCountsTowardRevenue(record: unknown, links?: PlaytestLinks | null): boolean {
  if (isPlaytestRecord(record, links) || isQaOnlyRecord(record, links)) return false;
  return asRecord(record).countsTowardRevenue === true;
}

/** Copied onto a payment or refund so later totals can read the transaction alone. */
export function revenueStamp(record: unknown): { countsTowardRevenue: boolean; playtest?: true; qaOnly?: true } {
  const row = asRecord(record);
  return {
    countsTowardRevenue: recordCountsTowardRevenue(record),
    ...(row.playtest === true ? { playtest: true as const } : {}),
    ...(row.qaOnly === true ? { qaOnly: true as const } : {}),
  };
}

export function countedAppointmentRevenue(record: unknown, amount: number): number {
  if (!recordCountsTowardRevenue(record)) return 0;
  return Number.isFinite(amount) ? amount : 0;
}

export function operationsInvoiceAmount(invoice: unknown): number {
  const row = asRecord(invoice);
  return Number(row.total) || Number(row.amountDue) + Number(row.amountPaid) || 0;
}

export function sumOperationsPaidRevenue(invoices: readonly unknown[]): number {
  return invoices.reduce<number>((sum, invoice) => {
    if (!recordCountsTowardRevenue(invoice)) return sum;
    return sum + operationsInvoiceAmount(invoice);
  }, 0);
}

export function summarizeInvoiceRevenue(
  invoices: readonly unknown[],
  settings: RevenueCostSettings,
  options?: { now?: Date },
): InvoiceRevenueTotals {
  const now = options?.now ?? new Date();
  let projected = 0;
  let earned = 0;
  let invoiced = 0;
  let overdue = 0;
  let collected = 0;
  let photographerPayout = 0;
  let editingCost = 0;
  let platformFees = 0;
  let counted = 0;

  for (const invoice of invoices) {
    if (!recordCountsTowardRevenue(invoice)) continue;
    counted += 1;
    const row = asRecord(invoice);
    const total = Number(row.total) || (Number(row.amountDue) || 0) + (Number(row.amountPaid) || 0);
    const status = (typeof row.status === "string" ? row.status : "").toLowerCase();
    const paid = Number(row.amountPaid) || 0;

    if (CLOSED_INVOICE.includes(status) && paid === 0) continue;

    projected += total;
    if (EARNED_INVOICE.includes(status)) earned += total;
    if (status === "sent" || status === "draft" || total > 0) invoiced += total;

    const due = asDate(row.dueDate);
    if (status === "overdue" || (due && due < now && paid < total)) overdue += total - paid;
    if (paid > 0) collected += paid;

    photographerPayout += total * settings.photographerPayRate;
    editingCost += settings.editingCostPerPhoto * settings.avgPhotosPerOrder;
    if (total > 0) platformFees += total * settings.platformFeePercent + settings.platformFeeFlat;
  }

  const totalCosts = photographerPayout + editingCost + platformFees;
  const grossMargin = collected - totalCosts;
  const marginPercent = collected > 0 ? (grossMargin / collected) * 100 : 0;
  return {
    projected,
    earned,
    invoiced,
    overdue,
    collected,
    photographerPayout,
    editingCost,
    platformFees,
    totalCosts,
    grossMargin,
    marginPercent,
    counted,
  };
}

export function summarizeBillingTotals(rows: readonly BillingRow[]): BillingTotals {
  const billable = rows.filter((row) => recordCountsTowardRevenue(row.source ?? row));
  return {
    total: billable.reduce((sum, row) => sum + row.total, 0),
    collected: billable.reduce((sum, row) => sum + row.paid, 0),
    outstanding: billable.reduce((sum, row) => sum + row.due, 0),
    overdue: billable.filter((row) => row.status === "overdue").reduce((sum, row) => sum + row.due, 0),
    counted: billable.length,
  };
}

export function sumListingRevenue(listings: readonly unknown[]): number {
  return listings.reduce<number>((sum, listing) => {
    if (!recordCountsTowardRevenue(listing)) return sum;
    return sum + (Number(asRecord(listing).total) || 0);
  }, 0);
}

export function sumTransactionAmounts(records: readonly unknown[]): number {
  return records.reduce<number>((sum, record) => {
    if (!recordCountsTowardRevenue(record)) return sum;
    return sum + (Number(asRecord(record).amount) || 0);
  }, 0);
}

/**
 * Accept order writes the same stamp on the order and the records already
 * loaded with it: its invoice, request, listing, appointment, and payments.
 */
export function planRevenueAcceptanceUpdates(input: {
  docs: readonly RevenueDocRef[];
  id: string;
  countsTowardRevenue: boolean;
  by: string;
  at?: string;
}): { found: boolean; patches: RevenueAcceptancePatch[] } {
  const id = input.id.trim();
  const fields = input.countsTowardRevenue
    ? adminRevenueAcceptance(input.by, input.at)
    : placedRevenueFields();
  const seeds = input.docs.filter((doc) =>
    doc.id === id && (doc.collection === "orders" || doc.collection === "orderRequests"));
  if (!seeds.length) return { found: false, patches: [] };

  const orderIds = new Set<string>();
  const requestIds = new Set<string>();
  for (const doc of seeds) {
    if (doc.collection === "orders") orderIds.add(doc.id);
    if (doc.collection === "orderRequests") requestIds.add(doc.id);
    const converted = textId(doc.data.convertedToOrderId);
    const requestId = textId(doc.data.orderRequestId);
    const orderId = textId(doc.data.orderId);
    if (converted) orderIds.add(converted);
    if (requestId) requestIds.add(requestId);
    if (orderId) orderIds.add(orderId);
  }

  const patches: RevenueAcceptancePatch[] = [];
  const seen = new Set<string>();
  for (const doc of input.docs) {
    if (!REVENUE_COLLECTIONS.has(doc.collection)) continue;
    const orderId = textId(doc.data.orderId);
    const requestId = textId(doc.data.orderRequestId);
    const converted = textId(doc.data.convertedToOrderId);
    const linked = (doc.collection === "orders" && orderIds.has(doc.id))
      || (doc.collection === "orderRequests" && requestIds.has(doc.id))
      || (orderId !== "" && orderIds.has(orderId))
      || (requestId !== "" && requestIds.has(requestId))
      || (converted !== "" && orderIds.has(converted));
    if (!linked) continue;
    const key = `${doc.collection}/${doc.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patches.push({ collection: doc.collection, id: doc.id, fields });
  }
  return { found: patches.length > 0, patches };
}

/** onOrderCreated returns before templates and Gmail for playtest and qa orders. */
export function shouldRunOrderCreated(order: unknown): boolean {
  return !isPlaytestRecord(order) && !isQaOnlyRecord(order);
}

function playtestFlag(record: unknown): boolean {
  return asRecord(record).playtest === true;
}

function playtestId(record: unknown): boolean {
  return textId(asRecord(record).id).toLowerCase().startsWith("playtest-");
}

function qaOnlyFlag(record: unknown): boolean {
  return asRecord(record).qaOnly === true;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === "object" && ts && "toDate" in ts && typeof (ts as { toDate?: unknown }).toDate === "function") {
    const date = (ts as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  try {
    const date = new Date(ts as string | number);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}
