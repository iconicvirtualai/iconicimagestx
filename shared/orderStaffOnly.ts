/**
 * Migrated Aryeo orders keep lockbox codes on staffOnly.
 * The staff order screen already reads lockboxCode. Client payloads do not
 * receive staffOnly.
 */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function staffOnlyRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Top-level lockboxCode wins. Otherwise orders.staffOnly.lockboxCode. */
export function lockboxCodeFromOrder(order: Record<string, unknown> | null | undefined): string {
  if (!order) return "";
  const direct = text(order.lockboxCode) || text(order.supraCode);
  if (direct) return direct;
  const staff = staffOnlyRecord(order.staffOnly);
  if (!staff) return "";
  return text(staff.lockboxCode) || text(staff.lockbox) || text(staff.supraCode);
}

/** Staff response copy. Does not write Firestore. */
export function presentStaffOrder<T extends Record<string, unknown>>(order: T): T {
  const code = lockboxCodeFromOrder(order);
  if (!code || text(order.lockboxCode)) return order;
  return { ...order, lockboxCode: code };
}
