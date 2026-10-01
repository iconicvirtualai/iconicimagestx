/**
 * Persist a Square invoice on an existing Firestore invoice.
 * Failures are logged and swallowed by the booking route. This never
 * writes invoice total, line items, or amount due.
 */

import admin from "firebase-admin";
import { syncSquareInvoice, type SquareSyncResult } from "../../shared/squareInvoice";

const db = () => admin.firestore();

function squareInvoiceSynced(
  result: SquareSyncResult,
): result is Extract<SquareSyncResult, { ok: true; skipped: false }> {
  return result.ok === true && result.skipped === false;
}

export async function attachSquareInvoiceAfterBooking(invoiceId: string): Promise<SquareSyncResult> {
  const ref = db().collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("[Square] Invoice sync skipped: invoice missing", invoiceId);
    return { ok: false, error: "Invoice missing" };
  }

  const data = snap.data() || {};
  const result = await syncSquareInvoice(
    {
      id: invoiceId,
      clientEmail: data.clientEmail,
      clientName: data.clientName,
      invoiceNumber: data.invoiceNumber,
      lineItems: data.lineItems,
      total: data.total,
      paymentProvider: data.paymentProvider,
      squareInvoiceId: data.squareInvoiceId,
    },
    { fetchImpl: fetch, env: process.env },
  );

  if (squareInvoiceSynced(result)) {
    await ref.update({
      squareInvoiceId: result.squareInvoiceId,
      squareInvoiceUrl: result.squareInvoiceUrl,
      squareOrderId: result.squareOrderId,
      squareCustomerId: result.squareCustomerId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return result;
  }

  if ("error" in result) {
    console.error("[Square] Invoice sync failed:", result.error);
  } else if (result.reason === "total-mismatch" || result.reason === "missing-email") {
    console.error("[Square] Invoice sync skipped:", result.reason, invoiceId);
  }
  return result;
}
