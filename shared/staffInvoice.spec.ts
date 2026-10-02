import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "./bookingCatalog";
import { draftInvoiceNumber } from "./orderProjectInvoice";
import {
  billToAddressText,
  clientPaymentPath,
  findStaffCatalogPackage,
  invoiceNumberForSave,
  orderServiceInvoicePatch,
  professionalInvoiceNumber,
  splitStaffInvoiceLines,
  staffInvoicePath,
  staffInvoiceSavePatch,
  staffServiceFromPackage,
  staffServiceQty,
} from "./staffInvoice";

const orderPage = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
const projectPage = readFileSync(new URL("../client/pages/AdminListingFile.tsx", import.meta.url), "utf8");
const editorPage = readFileSync(new URL("../client/pages/AdminInvoiceEditor.tsx", import.meta.url), "utf8");
const pickerPage = readFileSync(new URL("../client/components/PackageCatalogPicker.tsx", import.meta.url), "utf8");
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
    expect(editorPage).toContain('collection(db, "packages")');
    expect(editorPage).toContain("packagesForStaffEditor");
    expect(editorPage).toContain("PackageCatalogPicker");
    expect(pickerPage).toContain("Choose a package");
    expect(pickerPage).toContain("Search packages");
    expect(editorPage).toContain("professionalInvoiceNumber");
    expect(editorPage).toContain(">Description<");
    expect(editorPage).toContain(">Quantity<");
    expect(editorPage).toContain("Discount amount");
    expect(editorPage).not.toMatch(/Firestore/);
    expect(editorPage).not.toContain("Office invoice");
    const saveFn = editorPage.slice(editorPage.indexOf("const handleSave"), editorPage.indexOf("const copyPaymentLink"));
    expect(saveFn).not.toContain("deliverInvoice");
    expect(saveFn).not.toContain("sendEmail");
    expect(saveFn).not.toContain("sendSMS");
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
    expect(patch.lineItems?.[0]).not.toHaveProperty("description");
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

  it("keeps catalog fields when the order lines already have them", () => {
    const patch = orderServiceInvoicePatch({
      lineItems: [{
        id: "photos-35",
        name: "35 Photos",
        description: "Standard photo package for most residential listings.",
        category: "photography",
        bookingKind: "basic",
        tier: "basic",
        unitPrice: 150,
        qty: 1,
        price: 150,
      }],
      pricing: { tax: 0 },
    }, { amountPaid: 0 });
    expect(patch.lineItems?.[0]).toMatchObject({
      id: "photos-35",
      description: "Standard photo package for most residential listings.",
      category: "photography",
      bookingKind: "basic",
      tier: "basic",
      qty: 1,
      price: 150,
    });
    expect(patch.total).toBe(150);
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
    expect(patch).not.toHaveProperty("invoiceNumber");
    expect(splitStaffInvoiceLines(patch.lineItems, patch.promoCode, patch.promoDiscount).promoDiscount).toBe(35);
  });

  it("keeps catalog fields on the line and assigns an invoice number only when the stored one is not usable", () => {
    const legacy = packagesForStaffEditor([]).find((item) => item.id === "listing-legacy");
    const staging = packagesForStaffEditor([]).find((item) => item.id === "virtual-staging");
    expect(legacy).toBeTruthy();
    expect(staging).toBeTruthy();
    const photo = staffServiceFromPackage(legacy!, 2);
    const credits = staffServiceQty(staffServiceFromPackage(staging!, 1), 2);
    expect(photo).toMatchObject({
      id: "listing-legacy",
      name: "The Legacy",
      category: "photography",
      bookingKind: "service",
      unitPrice: 899,
      qty: 2,
      price: 1798,
    });
    expect(photo.description).toContain("cinematic");
    expect(credits).toMatchObject({
      id: "virtual-staging",
      name: "Virtual Staging (2 credits)",
      category: "virtual_staging",
      unitPrice: 35,
      qty: 2,
      price: 70,
    });

    const docId = "kR8mN2pQ9xYzAbCdEfGh";
    const patch = staffInvoiceSavePatch({
      clientName: "Ada Lovelace",
      clientEmail: "ada@example.com",
      billToAddress: "1 Main",
      notes: "",
      services: [photo, credits],
      promoCode: "",
      promoDiscount: 0,
      tax: 0,
    }, { amountPaid: 0, id: docId, invoiceNumber: docId });

    expect(patch.lineItems.map((item) => [item.name, item.price, item.category, item.qty])).toEqual([
      ["The Legacy", 1798, "photography", 2],
      ["Virtual Staging (2 credits)", 70, "virtual_staging", 2],
    ]);
    expect(patch.subtotal).toBe(1868);
    expect(patch.total).toBe(1868);
    expect(patch.invoiceNumber).toBe(professionalInvoiceNumber(docId, docId, new Date("2026-10-01T00:00:00Z")));
    expect(patch.invoiceNumber).toBe("INV-2026-CDEFGH");
    expect(patch.invoiceNumber).not.toBe(docId);
    expect(patch).not.toHaveProperty("id");

    const kept = staffInvoiceSavePatch({
      clientName: "Ada",
      clientEmail: "ada@example.com",
      billToAddress: "",
      notes: "",
      services: [{ name: "Photos", price: 10 }],
      promoCode: "",
      promoDiscount: 0,
      tax: 0,
    }, { id: docId, invoiceNumber: "INV-2026-0004" });
    expect(kept).not.toHaveProperty("invoiceNumber");
    expect(invoiceNumberForSave("PLAY-ABC123", docId)).toBeUndefined();
    const when = new Date("2026-10-02T00:00:00Z");
    expect(professionalInvoiceNumber("INV-2026-0NaN", docId, when)).toBe(draftInvoiceNumber(docId, when));
    expect(professionalInvoiceNumber("INV-2026-0NaN", docId, when)).not.toMatch(/nan/i);
    expect(invoiceNumberForSave("INV-2026-0NaN", docId, when)).toBe(draftInvoiceNumber(docId, when));
    expect(findStaffCatalogPackage({ name: "The Legacy" }, packagesForStaffEditor([]))?.id).toBe("listing-legacy");

    const merged = packagesForStaffEditor([
      { id: "listing-legacy", price: 900, description: "Updated care.", isActive: true },
      { id: "custom-dusk", name: "Dusk Add-on", price: 40, description: "Extra dusk frame.", category: "addon", bookingKind: "addon", isActive: true },
      { id: "studio-noir", isActive: false },
    ]);
    expect(merged.find((item) => item.id === "listing-legacy")).toMatchObject({
      price: 900,
      description: "Updated care.",
      category: "photography",
      name: "The Legacy",
    });
    expect(merged.find((item) => item.id === "custom-dusk")?.name).toBe("Dusk Add-on");
    expect(merged.find((item) => item.id === "studio-noir")).toBeUndefined();
    expect(merged.find((item) => item.id === "photos-35")?.price).toBe(150);
  });

  it("reads a formatted booking address", () => {
    expect(billToAddressText({ formatted: "100 Congress Ave, Austin, TX" })).toBe("100 Congress Ave, Austin, TX");
  });
});
