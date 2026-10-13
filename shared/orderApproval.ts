/**
 * Owner approval on a shoot order.
 * The note is required when the order is sent back.
 */

export const ORDER_APPROVAL_STATUSES = ["Completed", "Go for it!", "Needs Revisions"] as const;

export type OrderApprovalStatus = (typeof ORDER_APPROVAL_STATUSES)[number];

export interface OrderApproval {
  status: OrderApprovalStatus;
  note: string;
  by: string;
  at: string;
}

const NOTE_MAX = 2000;

export function isOrderApprovalStatus(value: unknown): value is OrderApprovalStatus {
  return typeof value === "string" && (ORDER_APPROVAL_STATUSES as readonly string[]).includes(value);
}

export function orderApprovalError(status: unknown, note: unknown): string | null {
  if (!isOrderApprovalStatus(status)) return "Choose Completed, Go for it!, or Needs Revisions.";
  const text = typeof note === "string" ? note.trim() : "";
  if (status === "Needs Revisions" && !text) return "Add a note for Needs Revisions.";
  if (text.length > NOTE_MAX) return "Notes are limited to 2,000 characters.";
  return null;
}

export function formatApprovalWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const stamp = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${stamp} CT`;
}
