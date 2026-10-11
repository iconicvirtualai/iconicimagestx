import { describe, expect, it } from "vitest";
import { squarePaymentNote } from "../../shared/paymentAccess";
import { matchSquarePaymentInvoice, type SquareInvoiceHit, type SquareInvoiceLookup } from "./squarePaymentMatch";

function lookup(docs: Record<string, Record<string, unknown>>): SquareInvoiceLookup {
  const hit = (id: string): SquareInvoiceHit | null => {
    const data = docs[id];
    return data ? { id, data } : null;
  };
  return {
    async byId(id: string) {
      return hit(id);
    },
    async byField(field: string, value: string) {
      const found = Object.entries(docs).find(([, data]) => data[field] === value);
      return found ? { id: found[0], data: found[1] } : null;
    },
  };
}

const docs = {
  listing_studio1: { redirectInvoiceId: "Mig00000000000000001", clientEmail: "ada@example.com" },
  Mig00000000000000001: {
    status: "sent",
    squareOrderId: "sq-order-1",
    squarePaymentLinkId: "sq-link-1",
    squarePaymentId: "sq-pay-1",
  },
};

describe("Square invoice matching", () => {
  it("follows a tombstone from the invoiceId note, reference id, order id, and payment link id", async () => {
    const find = lookup(docs);
    const note = squarePaymentNote("listing_studio1", "INV-2026-0008");
    expect(note).toContain("invoiceId:listing_studio1");

    const fromNote = await matchSquarePaymentInvoice({ note }, find);
    const fromReference = await matchSquarePaymentInvoice({ reference_id: "listing_studio1" }, find);
    const fromOrder = await matchSquarePaymentInvoice({ order_id: "sq-order-1" }, find);
    const fromLink = await matchSquarePaymentInvoice({ payment_link_id: "sq-link-1" }, find);
    const fromPayment = await matchSquarePaymentInvoice({ id: "sq-pay-1" }, find);

    for (const hit of [fromNote, fromReference, fromOrder, fromLink, fromPayment]) {
      expect(hit?.id).toBe("Mig00000000000000001");
      expect(hit?.data).not.toHaveProperty("clientEmail");
    }
    expect(await matchSquarePaymentInvoice({ note: "invoiceId:missing" }, find)).toBeNull();
  });
});
