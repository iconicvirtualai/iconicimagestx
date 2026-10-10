import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandedInvoicePdf } from "./brandedInvoicePdf";
import { buildClientInvoice } from "./clientHome";
import { invoiceFaceFromStored } from "./invoiceFace";
import { buildPortalListingDetail } from "./portalListingDetail";
import { professionalInvoiceNumber } from "./staffInvoice";
import {
  billingListInvoiceNumber,
  brandedInvoiceNumber,
  clientBillingInvoiceNumber,
  invoiceEmailNumber,
  invoicePageInvoiceNumber,
  orderHistoryInvoiceNumber,
  presentInvoiceNumber,
  receiptEmailNumber,
} from "./orderProjectInvoice";

const when = new Date("2026-10-10T15:00:00.000Z");
const invoiceId = "m6dpeaAbCdEfGhIjKlMn";
const issuedAt = "2026-03-01T00:00:00.000Z";
const fixture = {
  id: invoiceId,
  invoiceNumber: "INV-2026-0019",
  createdAt: issuedAt,
  orderRequestId: "m6dpeaOrderRequestXXXX",
};
const order = {
  id: "m6dpeaOrderRequestXXXX",
  invoiceId,
  createdAt: issuedAt,
  invoice: { invoiceNumber: "INV-M6DPEA" },
};

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("invoice number surfaces", () => {
  it("renders one stored invoice number from the same fixture", () => {
    const expected = "INV-2026-0019";
    const numbers = [
      invoicePageInvoiceNumber(fixture, when),
      brandedInvoiceNumber(fixture, when),
      orderHistoryInvoiceNumber(fixture, when),
      clientBillingInvoiceNumber(order, [fixture], when),
      billingListInvoiceNumber(fixture, when),
      invoiceEmailNumber(fixture, when),
      receiptEmailNumber(fixture, when),
      buildClientInvoice(invoiceId, fixture, when).invoiceNumber,
      professionalInvoiceNumber(fixture.invoiceNumber, invoiceId, when),
    ];
    expect(numbers).toEqual(Array(numbers.length).fill(expected));
    expect(clientBillingInvoiceNumber(order, [fixture], when)).not.toBe("INV-M6DPEA");

    const pdf = new TextDecoder().decode(brandedInvoicePdf({
      invoiceNumber: fixture.invoiceNumber,
      invoiceId,
      issuedAt,
      clientName: "Ada",
      billToAddress: "",
      status: "sent",
      face: invoiceFaceFromStored({ total: 10, amountDue: 10, lineItems: [{ name: "Photos", price: 10 }] }),
    }));
    expect(pdf).toContain(expected);

    const portal = buildPortalListingDetail({
      listing: { id: "listing1" },
      invoices: [fixture],
    });
    expect(portal.invoices[0].invoiceNumber).toBe(expected);
    expect(portal.activity.map((event) => event.summary)).toContain(`Invoice ${expected} is draft`);
  });

  it("uses the same fallback only when no stored number exists", () => {
    const blank = { id: invoiceId, invoiceNumber: "", createdAt: issuedAt };
    const issued = new Date(issuedAt);
    const fallback = presentInvoiceNumber("", invoiceId, issued);
    expect(fallback).toBe("INV-2026-IJKLMN");
    expect(fallback).not.toBe("INV-M6DPEA");

    const numbers = [
      invoicePageInvoiceNumber(blank, when),
      brandedInvoiceNumber(blank, when),
      orderHistoryInvoiceNumber(blank, when),
      clientBillingInvoiceNumber({ ...order, invoice: {} }, [blank], when),
      billingListInvoiceNumber(blank, when),
      invoiceEmailNumber(blank, when),
      receiptEmailNumber(blank, when),
      buildClientInvoice(invoiceId, { invoiceNumber: "", createdAt: issuedAt }, when).invoiceNumber,
      professionalInvoiceNumber("", invoiceId, issued),
    ];
    expect(new Set(numbers)).toEqual(new Set([fallback]));
    expect(clientBillingInvoiceNumber({ id: "m6dpeaOrderRequestXXXX", invoice: {} }, [], when)).not.toBe("INV-M6DPEA");
  });

  it("keeps TEST-DELIVERY-QA and still replaces the NaN bug", () => {
    const qaId = "playtest-delivery-qa-invoice";
    const qa = {
      id: qaId,
      invoiceNumber: "TEST-DELIVERY-QA",
      createdAt: issuedAt,
      orderRequestId: "playtest-delivery-qa-order",
    };
    const qaOrder = {
      id: "playtest-delivery-qa-order",
      invoiceId: qaId,
      createdAt: issuedAt,
      invoice: { invoiceNumber: "INV-M6DPEA" },
    };
    const expected = "TEST-DELIVERY-QA";
    const numbers = [
      presentInvoiceNumber(qa.invoiceNumber, qaId, when),
      invoicePageInvoiceNumber(qa, when),
      brandedInvoiceNumber(qa, when),
      orderHistoryInvoiceNumber(qa, when),
      clientBillingInvoiceNumber(qaOrder, [qa], when),
      billingListInvoiceNumber(qa, when),
      invoiceEmailNumber(qa, when),
      receiptEmailNumber(qa, when),
      buildClientInvoice(qaId, qa, when).invoiceNumber,
    ];
    expect(numbers).toEqual(Array(numbers.length).fill(expected));
    expect(numbers).not.toContain("INV-2026-NVOICE");

    const pdf = new TextDecoder().decode(brandedInvoicePdf({
      invoiceNumber: qa.invoiceNumber,
      invoiceId: qaId,
      issuedAt,
      clientName: "Ada",
      billToAddress: "",
      status: "sent",
      face: invoiceFaceFromStored({ total: 10, amountDue: 10, lineItems: [{ name: "Photos", price: 10 }] }),
    }));
    expect(pdf).toContain(expected);
    expect(pdf).not.toContain("INV-2026-NVOICE");

    const portal = buildPortalListingDetail({
      listing: { id: "listing1" },
      invoices: [qa],
    });
    expect(portal.invoices[0].invoiceNumber).toBe(expected);

    const issued = new Date(issuedAt);
    const fallback = presentInvoiceNumber("INV-2026-0NaN", qaId, issued);
    expect(fallback).toBe("INV-2026-NVOICE");
    const broken = { id: qaId, invoiceNumber: "INV-2026-0NaN", createdAt: issuedAt };
    const replaced = [
      invoicePageInvoiceNumber(broken, when),
      brandedInvoiceNumber(broken, when),
      orderHistoryInvoiceNumber(broken, when),
      clientBillingInvoiceNumber({ ...qaOrder, invoice: {} }, [broken], when),
      billingListInvoiceNumber(broken, when),
      invoiceEmailNumber(broken, when),
      receiptEmailNumber(broken, when),
      buildClientInvoice(qaId, { invoiceNumber: "INV-2026-0NaN", createdAt: issuedAt }, when).invoiceNumber,
      presentInvoiceNumber("", qaId, issued),
    ];
    expect(new Set(replaced)).toEqual(new Set([fallback]));
  });

  it("points each surface at the shared formatter", () => {
    const billing = read("../client/pages/AdminClientBilling.tsx");
    expect(billing).toContain("clientBillingInvoiceNumber");
    expect(billing).not.toContain("substring(0, 6)");
    expect(read("../client/pages/ClientInvoice.tsx")).toContain("invoicePageInvoiceNumber");
    expect(read("../client/pages/AdminInvoiceEditor.tsx")).toContain("invoicePageInvoiceNumber");
    expect(read("../shared/brandedInvoicePdf.ts")).toContain("brandedInvoiceNumber");
    expect(read("../client/lib/downloadBrandedInvoice.ts")).toContain("brandedInvoiceNumber");
    expect(read("../shared/clientHome.ts")).toContain("orderHistoryInvoiceNumber");
    expect(read("../shared/portalListingDetail.ts")).toContain("orderHistoryInvoiceNumber");
    expect(read("../client/pages/AdminRevenue.tsx")).toContain("billingListInvoiceNumber");
    expect(read("../client/pages/AdminRevenue.tsx")).not.toContain("substring(0, 6)");
    expect(read("../client/pages/AdminClientAccount.tsx")).toContain("billingListInvoiceNumber");
    expect(read("../client/pages/AdminClientAccount.tsx")).toContain("clientBillingInvoiceNumber");
    const payments = read("../server/routes/payments.ts");
    expect(payments).toContain("invoicePageInvoiceNumber");
    expect(payments).toContain("invoiceEmailNumber({");
    expect(payments).toContain("receiptEmailNumber({");
  });
});
