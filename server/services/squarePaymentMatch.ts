/**
 * Match a Square payment to an invoice.
 * Order: invoiceId: note, reference_id, Square order id, payment link id, payment id.
 * A tombstone redirectInvoiceId is followed so a renamed invoice still settles.
 */

import { invoiceRedirectTarget } from "../../shared/invoicePay";
import { invoiceIdFromSquareNote } from "../../shared/paymentAccess";

export interface SquareInvoiceHit {
  id: string;
  data: Record<string, unknown>;
}

export interface SquareInvoiceLookup {
  byId: (id: string) => Promise<SquareInvoiceHit | null>;
  byField: (field: string, value: string) => Promise<SquareInvoiceHit | null>;
}

export async function matchSquarePaymentInvoice(
  payment: Record<string, unknown>,
  lookup: SquareInvoiceLookup,
): Promise<SquareInvoiceHit | null> {
  const steps: Array<() => Promise<SquareInvoiceHit | null>> = [];
  const noteId = invoiceIdFromSquareNote(payment.note || payment.payment_note);
  if (noteId) steps.push(() => lookup.byId(noteId));

  const referenceId = typeof payment.reference_id === "string" ? payment.reference_id.trim() : "";
  if (referenceId) steps.push(() => lookup.byId(referenceId));

  const orderId = typeof payment.order_id === "string" ? payment.order_id.trim() : "";
  if (orderId) steps.push(() => lookup.byField("squareOrderId", orderId));

  const linkRaw = payment.payment_link_id || payment.paymentLinkId;
  const linkId = typeof linkRaw === "string" ? linkRaw.trim() : "";
  if (linkId) steps.push(() => lookup.byField("squarePaymentLinkId", linkId));

  const paymentId = typeof payment.id === "string" ? payment.id.trim() : "";
  if (paymentId) steps.push(() => lookup.byField("squarePaymentId", paymentId));

  for (const step of steps) {
    const hit = await step();
    if (hit) return followInvoiceRedirect(hit, lookup.byId);
  }
  return null;
}

async function followInvoiceRedirect(
  hit: SquareInvoiceHit,
  byId: SquareInvoiceLookup["byId"],
): Promise<SquareInvoiceHit> {
  let current = hit;
  const seen = new Set<string>();
  for (let hop = 0; hop < 4; hop += 1) {
    if (seen.has(current.id)) return current;
    seen.add(current.id);
    const next = invoiceRedirectTarget(current.data);
    if (!next || next === current.id) return current;
    const followed = await byId(next);
    if (!followed) return current;
    current = followed;
  }
  return current;
}
