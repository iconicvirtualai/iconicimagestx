/**
 * Playtest / TEST records stay visible to staff, but they are not revenue.
 * playtest must be exactly true. false and a missing flag stay in the totals.
 *
 * Pass an already-loaded order or client when you have it. Do not fetch
 * those documents just to answer this.
 */

export const PLAYTEST_LABEL = "TEST";

export interface PlaytestLinks {
  order?: unknown;
  client?: unknown;
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
}

export interface BillingTotals {
  total: number;
  collected: number;
  outstanding: number;
  overdue: number;
}

export interface BillingRow {
  total: number;
  paid: number;
  due: number;
  status: string;
  source?: unknown;
}

const CLOSED_INVOICE = ["cancelled", "void", "voided", "archived"];
const EARNED_INVOICE = ["sent", "draft", "overdue", "paid", "completed"];

export function isPlaytestRecord(record: unknown, links?: PlaytestLinks | null): boolean {
  if (playtestFlag(record)) return true;
  if (playtestFlag(links?.order) || playtestFlag(links?.client)) return true;
  const data = asRecord(record);
  return playtestFlag(data.order) || playtestFlag(data.client) || playtestFlag(data.invoice);
}

/** Order ids and client ids already known from loaded playtest records. */
export function playtestOrderAndClientIds(records: readonly unknown[]): {
  orderIds: Set<string>;
  clientIds: Set<string>;
} {
  const orderIds = new Set<string>();
  const clientIds = new Set<string>();
  for (const record of records) {
    if (!isPlaytestRecord(record)) continue;
    const row = asRecord(record);
    const orderId = textId(row.orderId);
    const converted = textId(row.convertedToOrderId);
    const clientId = textId(row.clientId);
    if (orderId) orderIds.add(orderId);
    if (converted) orderIds.add(converted);
    if (clientId) clientIds.add(clientId);
  }
  return { orderIds, clientIds };
}

/** Turns a known playtest order or client id into a link the predicate can read. */
export function linksForPlaytestIds(
  record: unknown,
  index: { orderIds: ReadonlySet<string>; clientIds: ReadonlySet<string> },
): PlaytestLinks {
  const row = asRecord(record);
  const orderId = textId(row.orderId);
  const clientId = textId(row.clientId);
  return {
    order: orderId && index.orderIds.has(orderId) ? { playtest: true } : undefined,
    client: clientId && index.clientIds.has(clientId) ? { playtest: true } : undefined,
  };
}

export function countedAppointmentRevenue(record: unknown, amount: number): number {
  if (isPlaytestRecord(record)) return 0;
  return Number.isFinite(amount) ? amount : 0;
}

/** Same face value the operations revenue tile already sums. */
export function operationsInvoiceAmount(invoice: unknown): number {
  const row = asRecord(invoice);
  return Number(row.total) || Number(row.amountDue) + Number(row.amountPaid) || 0;
}

export function sumOperationsPaidRevenue(
  invoices: readonly unknown[],
  linksFor?: (invoice: unknown) => PlaytestLinks | undefined,
): number {
  return invoices.reduce<number>((sum, invoice) => {
    if (isPlaytestRecord(invoice, linksFor?.(invoice))) return sum;
    return sum + operationsInvoiceAmount(invoice);
  }, 0);
}

export function summarizeInvoiceRevenue(
  invoices: readonly unknown[],
  settings: RevenueCostSettings,
  options?: {
    now?: Date;
    linksFor?: (invoice: unknown) => PlaytestLinks | undefined;
  },
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

  for (const invoice of invoices) {
    if (isPlaytestRecord(invoice, options?.linksFor?.(invoice))) continue;
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
  };
}

export function summarizeBillingTotals(rows: readonly BillingRow[]): BillingTotals {
  const billable = rows.filter((row) => !isPlaytestRecord(row.source ?? row));
  return {
    total: billable.reduce((sum, row) => sum + row.total, 0),
    collected: billable.reduce((sum, row) => sum + row.paid, 0),
    outstanding: billable.reduce((sum, row) => sum + row.due, 0),
    overdue: billable.filter((row) => row.status === "overdue").reduce((sum, row) => sum + row.due, 0),
  };
}

export function sumListingRevenue(listings: readonly unknown[]): number {
  return listings.reduce<number>((sum, listing) => {
    if (isPlaytestRecord(listing)) return sum;
    return sum + (Number(asRecord(listing).total) || 0);
  }, 0);
}

export function sumTransactionAmounts(records: readonly unknown[]): number {
  return records.reduce<number>((sum, record) => {
    if (isPlaytestRecord(record)) return sum;
    return sum + (Number(asRecord(record).amount) || 0);
  }, 0);
}

function playtestFlag(record: unknown): boolean {
  return asRecord(record).playtest === true;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

function asDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === "object" && "toDate" in ts && typeof (ts as { toDate?: unknown }).toDate === "function") {
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
