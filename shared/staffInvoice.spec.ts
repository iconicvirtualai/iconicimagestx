import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  billToAddressText,
  clientPaymentPath,
  orderServiceInvoicePatch,
  splitStaffInvoiceLines,
  staffInvoicePath,
  staffInvoiceSavePatch,
} from "./staffInvoice";

const orderPage = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
const projectPage = readFileSync(new URL("../client/pages/AdminListingFile.tsx", import.meta.url), "utf8");
const editorPage = readFileSync(new URL("../client/pages/AdminInvoiceEditor.tsx", import.meta.url), "utf8");
const appPage = readFileSync(new URL("../client/App.tsx", import.meta.url), "utf8");
const syncLib = readFileSync(new URL("../client/lib/staffInvoice.ts", import.meta.url), "utf8");
const orderDetail = readFileSync(new URL("../client/pages/AdminOrderDetail.tsx", import.meta.url), "utf8");

describe("staff invoice routes", () => {
  it("opens the office editor and leaves checkout on the client path", () => {
    expect(staffInvoicePath("ordreq_req1")).toBe("/admin/invoice/ordreq_req1");
    expect(clientPaymentPath("ordreq_req1")).toBe("/invoice/ordreq_req1");
    expect(staffInvoicePath(" inv_9 ")).toBe("/admin/invoice/inv_9");
  });

  it("sends order and project invoice buttons to the editor", () => {
    expect(orderPage).toContain("staffInvoicePath(invoiceId)");
    expect(projectPage).toContain("staffInvoicePath(invoiceId)");
    expect(orderPage).not.toMatch(/navigate\(`\/invoice\//);
    expect(projectPage).not.toMatch(/navigate\(`\/invoice\//);
    expect(appPage).toContain('path="/admin/invoice/:invoiceId"');
    expect(appPage).toContain('path="/invoice/:invoiceId"');
    expect(editorPage).toContain("saveStaffInvoiceEdits");
    expect(editorPage).toContain("Copy payment link");
    expect(editorPage).not.toMatch(/navigate\(`\/invoice\//);
    expect(editorPage).not.toContain("/checkout");
    expect(editorPage).not.toContain("attachSquare");
    expect(editorPage).not.toContain("window.location.href");
  });

  it("does not open the payment page after staff send, and does not notify from a save", () => {
    expect(orderDetail).not.toContain("window.open(result.paymentUrl");
    expect(orderPage).toContain("syncOrderBillingToInvoice");
    expect(syncLib).not.toContain("deliverInvoice");
    expect(syncLib).not.toContain("attachSquare");
    expect(syncLib).not.toContain("sendEmail");
    expect(syncLib).not.toContain("sendSMS");
    expect(syncLib).toContain('doc(db, "invoices", id)');
    expect(syncLib).not.toContain("addDoc");
  });
});

describe("order service save syncs the linked invoice", () => {
  it("copies edited services and keeps the same invoice math without a new id", () => {
    const patch = orderServiceInvoicePatch({
      lineItems: [
        { id: "photos", name: "Photos", price: 500 },
        { name: "Drone", price: 263 },
        { id: "promo-ICONICAI", name: "Promo Code: ICONICAI", price: -35 },
      ],
      promoCode: "ICONICAI",
      promoDiscount: 35,
      pricing: { tax: 0 },
      clientName: "Ada Lovelace",
      email: "Ada@Example.com",
      address: { street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
    }, { amountPaid: 100, tax: 8 });

    expect(patch.lineItems?.map((item) => [item.name, item.price])).toEqual([
      ["Photos", 500],
      ["Drone", 263],
      ["Promo Code: ICONICAI", -35],
    ]);
    expect(patch.subtotal).toBe(763);
    expect(patch.total).toBe(728);
    expect(patch.amountDue).toBe(628);
    expect(patch.promoCode).toBe("ICONICAI");
    expect(patch.promoDiscount).toBe(35);
    expect(patch.clientEmail).toBe("ada@example.com");
    expect(patch.billToAddress).toBe("1 Main, Austin, TX, 78701");
    expect(patch).not.toHaveProperty("id");
    expect(patch).not.toHaveProperty("invoiceId");
    expect(patch).not.toHaveProperty("orderRequestId");
    expect(patch).not.toHaveProperty("listingId");
    expect(patch).not.toHaveProperty("orderId");
    expect(patch).not.toHaveProperty("paymentUrl");
  });

  it("does not subtract a separate promo field on top of the saved rows", () => {
    const patch = orderServiceInvoicePatch({
      lineItems: [{ name: "Twilight", price: 250 }],
      promoCode: "GO",
      promoDiscount: 35,
    }, { amountPaid: 0, tax: 0 });
    expect(patch.lineItems).toHaveLength(1);
    expect(patch.total).toBe(250);
    expect(patch.promoCode).toBe("GO");
    expect(patch.promoDiscount).toBe(35);
    expect(patch.amountDue).toBe(250);
  });

  it("leaves line items alone when the order save has no service list", () => {
    const patch = orderServiceInvoicePatch({
      clientName: "Grace Hopper",
      address: "9 Navy Way",
    }, { amountPaid: 40 });
    expect(patch.clientName).toBe("Grace Hopper");
    expect(patch.billToAddress).toBe("9 Navy Way");
    expect(patch.lineItems).toBeUndefined();
    expect(patch.total).toBeUndefined();
  });
});

describe("staff editor save", () => {
  it("writes bill-to, services, prices, and one promo into the invoice", () => {
    const patch = staffInvoiceSavePatch({
      clientName: "  Ada   Lovelace ",
      clientEmail: "Ada@Example.com",
      billToAddress: "1 Main, Austin, TX",
      notes: "Gate code is on the order.",
      services: [
        { name: "Photos", price: 500 },
        { name: "", price: 0 },
        { name: "Promo Code: OLD", price: -10 },
      ],
      promoCode: "ICONICAI",
      promoDiscount: 35,
      tax: 0,
    }, { amountPaid: 200 });

    expect(patch.clientName).toBe("Ada Lovelace");
    expect(patch.clientEmail).toBe("ada@example.com");
    expect(patch.notes).toBe("Gate code is on the order.");
    expect(patch.lineItems.map((item) => item.price)).toEqual([500, -35]);
    expect(patch.subtotal).toBe(500);
    expect(patch.total).toBe(465);
    expect(patch.amountDue).toBe(265);
    expect(patch).not.toHaveProperty("orderRequestId");
    expect(patch).not.toHaveProperty("listingId");
    expect(splitStaffInvoiceLines(patch.lineItems, patch.promoCode, patch.promoDiscount).promoDiscount).toBe(35);
  });

  it("reads a formatted booking address", () => {
    expect(billToAddressText({ formatted: "100 Congress Ave, Austin, TX" })).toBe("100 Congress Ave, Austin, TX");
  });
});
