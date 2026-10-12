import { type OrderApproval, type OrderApprovalStatus } from "@shared/orderApproval";

/** Saves an owner approval on one order. */
export async function setOrderApproval(
  orderId: string,
  input: { status: OrderApprovalStatus; note: string },
  headers: Record<string, string> = {},
): Promise<OrderApproval> {
  const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/approval`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ status: input.status, note: input.note }),
  });
  const body = (await response.json().catch(() => null)) as { error?: string; approval?: OrderApproval } | null;
  if (!response.ok || !body?.approval) {
    throw new Error(body?.error || "The approval could not be saved.");
  }
  return body.approval;
}
