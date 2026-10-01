import { invoiceDeliveryAction } from "@shared/bookingInvoice";

export async function deliverInvoiceEmail(invoiceId: string, token: string) {
  const infoRes = await fetch(`/api/payments/invoice/${encodeURIComponent(invoiceId)}`);
  const info = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok) throw new Error(info.error || "Invoice could not be loaded.");

  const action = invoiceDeliveryAction(Boolean(info.paid));
  const path = action === "payment_receipt" ? "/api/payments/send-receipt" : "/api/payments/send-invoice";
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ invoiceId }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || "Could not send.");
  return action;
}
