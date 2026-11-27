/**
 * Paid, partial, or unpaid after a Square charge.
 *
 * The charged amount includes the 2.8% processing fee. Compare what Square
 * collected with the invoice total (package + processing − discounts), not
 * with the package price alone. A senior-living 50% deposit stays partial
 * while a balance remains.
 */

export type PaymentSettlementStatus = "paid" | "partial" | "unpaid";

export type PaymentFaceLabel = "Paid" | "Partial" | "Deposit paid" | "Unpaid";

export function roundSettlementMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function settlementMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function explicitStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Money wins over a stale status string.
 * A collected amount below the total is partial, even if a field says paid.
 * A status of paid or comped with nothing still due stays paid.
 */
export function paymentSettlementStatus(
  total: number,
  amountPaid: number,
  explicit?: unknown,
): PaymentSettlementStatus {
  const paid = roundSettlementMoney(amountPaid);
  const dueBase = roundSettlementMoney(total);
  const status = explicitStatus(explicit);
  if (paid > 0 && dueBase > 0 && paid + 0.009 < dueBase) return "partial";
  if (paid > 0 && (dueBase <= 0 || paid + 0.009 >= dueBase)) return "paid";
  if (status === "partial") return "unpaid";
  if (status === "paid" || status === "paid_in_full" || status === "succeeded" || status === "comped") return "paid";
  return "unpaid";
}

/** Staff-facing word. A recorded deposit that does not clear the total is Deposit paid. */
export function paymentFaceLabel(input: {
  status?: unknown;
  paymentStatus?: unknown;
  total?: unknown;
  amountPaid?: unknown;
  depositPaid?: unknown;
}): PaymentFaceLabel {
  const total = settlementMoney(input.total);
  const amountPaid = settlementMoney(input.amountPaid);
  const depositPaid = settlementMoney(input.depositPaid);
  const collected = Math.max(amountPaid, depositPaid);
  const status = paymentSettlementStatus(total, collected, input.paymentStatus || input.status);
  if (status === "paid") return "Paid";
  if (status === "partial") return depositPaid > 0 ? "Deposit paid" : "Partial";
  return "Unpaid";
}
