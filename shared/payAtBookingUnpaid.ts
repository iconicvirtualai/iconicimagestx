/**
 * Read-only classification for Pay at Booking orders.
 * A row is "paid in Square but unpaid here" only when Square collected money
 * and the local payment status is still unpaid. This module does not write.
 */

import { PAY_NOW_METHOD } from "./payNow.ts";
import { paymentSettlementStatus, settlementMoney } from "./paymentSettlement.ts";

export interface PayAtBookingRow {
  paymentMethod?: unknown;
  paymentStatus?: unknown;
  status?: unknown;
  total?: unknown;
  amountPaid?: unknown;
  depositPaid?: unknown;
  /** Square order state from a read-only lookup. Empty when Square was not checked. */
  squareState?: unknown;
  /** Cents Square tendered. Null when Square was not checked. */
  squarePaidCents?: number | null;
}

export interface PayAtBookingUnpaidReport {
  payAtBooking: number;
  unpaidLocal: number;
  paidInSquareUnpaidLocal: number;
  squareUnchecked: number;
}

export function isPayAtBooking(row: PayAtBookingRow): boolean {
  return String(row.paymentMethod || "") === PAY_NOW_METHOD;
}

export function payAtBookingShowsUnpaid(row: PayAtBookingRow): boolean {
  if (!isPayAtBooking(row)) return false;
  const total = settlementMoney(row.total);
  const paid = Math.max(settlementMoney(row.amountPaid), settlementMoney(row.depositPaid));
  return paymentSettlementStatus(total, paid, row.paymentStatus || row.status) === "unpaid";
}

/** Square collected money for a Pay at Booking order that still shows unpaid. */
export function paidInSquareButUnpaid(row: PayAtBookingRow): boolean {
  if (!payAtBookingShowsUnpaid(row)) return false;
  if (row.squarePaidCents == null && !String(row.squareState || "").trim()) return false;
  const squarePaid = row.squarePaidCents ?? 0;
  return squarePaid > 0;
}

export function payAtBookingUnpaidReport(rows: PayAtBookingRow[]): PayAtBookingUnpaidReport {
  const booking = rows.filter(isPayAtBooking);
  const unpaid = booking.filter(payAtBookingShowsUnpaid);
  return {
    payAtBooking: booking.length,
    unpaidLocal: unpaid.length,
    paidInSquareUnpaidLocal: unpaid.filter(paidInSquareButUnpaid).length,
    squareUnchecked: unpaid.filter((row) => row.squarePaidCents == null && !String(row.squareState || "").trim()).length,
  };
}

export function formatPayAtBookingUnpaidReport(report: PayAtBookingUnpaidReport, source: string): string {
  return [
    `Pay at Booking unpaid scan (${source})`,
    `Pay at Booking orders: ${report.payAtBooking}`,
    `Showing unpaid locally: ${report.unpaidLocal}`,
    `Paid in Square but showing unpaid: ${report.paidInSquareUnpaidLocal}`,
    `Unpaid locally and not checked in Square: ${report.squareUnchecked}`,
    "Read only. No orders were updated.",
    "",
  ].join("\n");
}
