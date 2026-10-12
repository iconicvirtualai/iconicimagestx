/**
 * Read-only look at what 2.8% processing would do to invoices already stored.
 * Nothing here writes. Legacy invoices keep charging amountStillDue.
 */

import { invoiceFaceFromStored } from "./invoiceFace.ts";
import { computeInvoiceTotals } from "./invoiceProcessing.ts";
import { amountStillDue, type InvoiceLike } from "./paymentAccess.ts";

const CLOSED = new Set(["paid", "comped", "void", "voided", "cancelled", "canceled"]);

export interface ProcessingImpactInvoice extends InvoiceLike {
  id?: string;
  invoiceNumber?: unknown;
  clientName?: unknown;
  status?: unknown;
}

export interface ProcessingImpactRow {
  id: string;
  invoiceNumber: string;
  client: string;
  currentTotal: number;
  amountDue: number;
  storedProcessing: number;
  proposedProcessing: number;
  proposedTotal: number;
  proposedDue: number;
  delta: number;
}

export interface ProcessingImpactReport {
  rows: ProcessingImpactRow[];
  count: number;
  totalDelta: number;
}

export function isOpenForProcessingImpact(invoice: InvoiceLike): boolean {
  if (!invoice) return false;
  const status = String(invoice.status || "").toLowerCase();
  if (CLOSED.has(status)) return false;
  return amountStillDue(invoice) > 0;
}

/** Hypothetical recompute. Does not change the stored invoice. */
export function processingImpactRow(invoice: ProcessingImpactInvoice): ProcessingImpactRow | null {
  if (!isOpenForProcessingImpact(invoice)) return null;
  const face = invoiceFaceFromStored(invoice as Record<string, unknown>);
  const proposed = computeInvoiceTotals({
    subtotal: face.subtotal,
    promotions: face.promotions,
    fees: face.fees,
    travel: face.travel,
    tax: face.tax,
    amountPaid: face.amountPaid,
    applyProcessing: true,
  });
  const currentTotal = round(face.total);
  const delta = round(proposed.total - currentTotal);
  return {
    id: String(invoice.id || ""),
    invoiceNumber: String(invoice.invoiceNumber || invoice.id || ""),
    client: String(invoice.clientName || ""),
    currentTotal,
    amountDue: round(amountStillDue(invoice)),
    storedProcessing: face.processing != null ? round(face.processing) : 0,
    proposedProcessing: proposed.processing,
    proposedTotal: proposed.total,
    proposedDue: proposed.amountDue,
    delta,
  };
}

export function processingImpactReport(invoices: ProcessingImpactInvoice[]): ProcessingImpactReport {
  const rows = invoices
    .map((invoice) => processingImpactRow(invoice))
    .filter((row): row is ProcessingImpactRow => row != null)
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
  const totalDelta = round(rows.reduce((sum, row) => sum + row.delta, 0));
  return { rows, count: rows.length, totalDelta };
}

export function formatProcessingImpactReport(report: ProcessingImpactReport, source: string): string {
  const lines = [
    `Processing impact (${source})`,
    "Read only. These invoices are not updated. Checkout still charges the stored amount due.",
    `Open invoices: ${report.count}`,
    `Total delta if recomputed: ${money(report.totalDelta)}`,
    "",
    [
      "id",
      "number",
      "client",
      "current total",
      "amount due",
      "stored processing",
      "new processing",
      "new total",
      "new due",
      "delta",
    ].join("\t"),
  ];
  for (const row of report.rows) {
    lines.push([
      row.id,
      row.invoiceNumber,
      row.client,
      money(row.currentTotal),
      money(row.amountDue),
      money(row.storedProcessing),
      money(row.proposedProcessing),
      money(row.proposedTotal),
      money(row.proposedDue),
      money(row.delta),
    ].join("\t"));
  }
  lines.push("");
  return lines.join("\n");
}

export function processingImpactFixtureScan(): ProcessingImpactReport {
  return processingImpactReport([
    {
      id: "legacy-showcase",
      invoiceNumber: "INV-2026-0001",
      clientName: "Drew Feig",
      status: "sent",
      lineItems: [{ name: "The Showcase", qty: 1, price: 549 }],
      subtotal: 549,
      total: 549,
      amountPaid: 0,
      amountDue: 549,
    },
    {
      id: "legacy-partial",
      invoiceNumber: "INV-2026-0002",
      clientName: "Jordan Hale",
      status: "partial",
      lineItems: [{ name: "The Showcase", qty: 1, price: 400 }],
      subtotal: 400,
      promoDiscount: 20,
      fees: 10,
      total: 390,
      amountPaid: 100,
      amountDue: 290,
    },
    {
      id: "already-charged",
      invoiceNumber: "INV-2026-0003",
      clientName: "New Client",
      status: "draft",
      processingPolicy: "included",
      lineItems: [{ name: "The Showcase", qty: 1, price: 549 }],
      subtotal: 549,
      processing: 15.37,
      total: 564.37,
      amountPaid: 0,
      amountDue: 564.37,
    },
    {
      id: "paid-skip",
      invoiceNumber: "INV-2026-0004",
      clientName: "Paid Client",
      status: "paid",
      subtotal: 549,
      total: 549,
      amountPaid: 549,
      amountDue: 0,
    },
    {
      id: "comped-skip",
      invoiceNumber: "INV-2026-0005",
      clientName: "Comp Client",
      status: "comped",
      subtotal: 549,
      total: 549,
      amountDue: 549,
    },
  ]);
}

function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
