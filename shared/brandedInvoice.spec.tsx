import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandedInvoiceShell, InvoiceFaceSummary } from "@/components/invoice/BrandedInvoice";
import { brandedInvoicePdf } from "./brandedInvoicePdf";
import { invoiceFaceFromStored, invoiceFaceRows } from "./invoiceFace";
import { parseInvoicePreset, presetFilledAmount, presetOptionLabel } from "./invoicePresets";

const clientInvoice = readFileSync(new URL("../client/pages/ClientInvoice.tsx", import.meta.url), "utf8");
const orderHistory = readFileSync(new URL("../client/components/client-home/ClientHomeDashboard.tsx", import.meta.url), "utf8");
const brandedInvoice = readFileSync(new URL("../client/components/invoice/BrandedInvoice.tsx", import.meta.url), "utf8");
const payments = readFileSync(new URL("../server/routes/payments.ts", import.meta.url), "utf8");
const presetsPage = readFileSync(new URL("../client/pages/AdminInvoicePresets.tsx", import.meta.url), "utf8");
const presetsLib = readFileSync(new URL("../client/lib/invoicePresets.ts", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

describe("invoice face", () => {
  it("shows promotions, fees, and tax, and skips processing when the invoice has none", () => {
    const face = invoiceFaceFromStored({
      lineItems: [{ name: "Photos", price: 200, qty: 1 }],
      subtotal: 200,
      promoDiscount: 0,
      tax: 0,
      total: 200,
      amountPaid: 0,
      amountDue: 200,
    });
    const labels = invoiceFaceRows(face).map((row) => row.id);
    expect(labels).toEqual(["subtotal", "promotions", "fees", "tax"]);
    expect(labels).not.toContain("processing");
    expect(face.processing).toBeNull();
    expect(face.total).toBe(200);
  });

  it("shows processing only from an amount already stored on the invoice", () => {
    const fromField = invoiceFaceFromStored({
      lineItems: [
        { name: "Photos", price: 200 },
        { id: "adjustment-processing", name: "Processing", price: 6, category: "adjustment-processing" },
      ],
      processing: 6,
      subtotal: 200,
      total: 206,
    });
    expect(invoiceFaceRows(fromField).map((row) => row.id)).toContain("processing");
    expect(fromField.services.map((line) => line.name)).toEqual(["Photos"]);
    expect(fromField.processing).toBe(6);

    const cleared = invoiceFaceFromStored({ processing: 0, lineItems: [{ name: "Photos", price: 50 }], total: 50 });
    expect(cleared.processing).toBeNull();
    expect(invoiceFaceRows(cleared).some((row) => row.id === "processing")).toBe(false);
  });

  it("shows travel only when a travel amount is stored", () => {
    const face = invoiceFaceFromStored({ travel: 40, subtotal: 100, total: 140, lineItems: [{ name: "Photos", price: 100 }] });
    expect(invoiceFaceRows(face).find((row) => row.id === "travel")?.amount).toBe(40);
    const none = invoiceFaceFromStored({ subtotal: 100, total: 100, lineItems: [{ name: "Photos", price: 100 }] });
    expect(invoiceFaceRows(none).some((row) => row.id === "travel")).toBe(false);
  });
});

describe("invoice presets", () => {
  it("fills a flat amount or a percent of the subtotal and does not invent a catalog amount", () => {
    expect(presetFilledAmount({ mode: "flat", amount: 12.5 }, 200)).toBe(12.5);
    expect(presetFilledAmount({ mode: "percent", amount: 10 }, 80)).toBe(8);
    expect(presetFilledAmount({ mode: "percent", amount: 0 }, 80)).toBe(0);
    expect(parseInvoicePreset("p1", { kind: "fees", name: "Trip", mode: "flat", amount: 18 })).toMatchObject({
      id: "p1",
      kind: "fees",
      amount: 18,
      active: true,
    });
    expect(parseInvoicePreset("bad", { kind: "square", name: "Card", mode: "percent", amount: 2.9 })).toBeNull();
    expect(parseInvoicePreset("blank", { kind: "tax", name: "", mode: "flat", amount: 8.25 })).toBeNull();
    expect(presetOptionLabel({
      id: "p1",
      kind: "fees",
      name: "Trip",
      mode: "flat",
      amount: 18,
      active: true,
      sortOrder: 1,
    })).toBe("Trip · $18.00");
  });
});

describe("branded invoice pdf", () => {
  it("draws the branded sections and omits processing when it is not on the invoice", () => {
    const face = invoiceFaceFromStored({
      clientName: "Ada Agent",
      lineItems: [{ name: "Photos", price: 200, qty: 1 }],
      subtotal: 200,
      promoCode: "SPRING",
      promoDiscount: 20,
      fees: 10,
      tax: 0,
      total: 190,
      amountPaid: 0,
      amountDue: 190,
    });
    const pdf = new TextDecoder().decode(brandedInvoicePdf({
      invoiceNumber: "INV-2026-9",
      clientName: "Ada Agent",
      billToAddress: "1 Main",
      status: "Payment due",
      face,
    }));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("ICONIC IMAGES");
    expect(pdf).toContain("LINE ITEMS");
    expect(pdf).toContain("Photos");
    expect(pdf).toContain("Subtotal");
    expect(pdf).toContain("Promotions");
    expect(pdf).toContain("Fees");
    expect(pdf).toContain("TOTAL");
    expect(pdf).toContain("PAYMENT");
    expect(pdf).toContain("AMOUNT DUE");
    expect(pdf).toContain("Iconic Images Photography, LLC");
    expect(pdf).toContain("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
    expect(pdf).toContain("photos@iconicimagestx.com");
    expect(pdf).not.toContain("cadi" + "@");
    expect(pdf).toContain("281.356.0965");
    expect(pdf).toContain("iconicimagestx.com");
    expect(pdf).not.toContain("Processing");
    expect(pdf).not.toContain("checkout");
    expect(pdf).not.toContain("Pay Securely");
    expect(pdf).not.toContain("http");
  });

  it("includes processing when the invoice already has that amount", () => {
    const face = invoiceFaceFromStored({
      lineItems: [{ name: "Photos", price: 100 }],
      processing: 4,
      subtotal: 100,
      total: 104,
      amountDue: 104,
    });
    const pdf = new TextDecoder().decode(brandedInvoicePdf({
      invoiceNumber: "INV-2026-4",
      clientName: "Ada",
      billToAddress: "",
      status: "sent",
      face,
    }));
    expect(pdf).toContain("Processing");
    expect(pdf).toContain("$4.00");
  });
});

describe("client invoice page", () => {
  it("restyles /invoice/:id, adds Download PDF, and leaves checkout in place", () => {
    expect(clientInvoice).toContain("Download PDF");
    expect(clientInvoice).toContain("BrandedInvoiceShell");
    expect(brandedInvoice).toContain("logo-white-large.png");
    expect(brandedInvoice).toContain("data-testid=\"invoice-total-box\"");
    expect(clientInvoice).toContain("presentInvoiceNumber(invoice.invoiceNumber, invoiceId)");
    expect(clientInvoice).toContain('fetch(`/api/payments/invoice/${invoiceId}/checkout`');
    expect(clientInvoice).toContain("Pay Securely");
    expect(clientInvoice).toContain("ICONIC_DOWNLOAD_LOCK.message");
    expect(orderHistory).toContain("downloadBrandedInvoice(clientInvoicePdfInput(invoice))");
    expect(orderHistory).not.toContain('to="/invoice/');
    expect(clientInvoice).toContain('href="/"');
    expect(clientInvoice).toContain("Back to Home");
    const checkout = payments.slice(payments.indexOf('router.post("/invoice/:id/checkout"'));
    expect(checkout).toContain("quick_pay:");
    expect(payments).toContain("processing: invoice.processing ?? null");
    expect(presetsLib).toContain('const COLLECTION = "invoicePresets"');
    expect(presetsPage).toContain("createInvoicePreset");
    expect(rules).toContain("match /invoicePresets/{presetId}");
  });
});

describe("invoice business footer", () => {
  it("prints the business identity already on file under the payment block", () => {
    const html = renderToStaticMarkup(
      <BrandedInvoiceShell invoiceNumber="INV-2026-1" amountPaid={0} amountDue={10}>
        <p>Body</p>
      </BrandedInvoiceShell>,
    );
    expect(html).toContain('data-testid="invoice-business-footer"');
    expect(html).toContain("Iconic Images Photography, LLC");
    expect(html).toContain("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
    expect(html).toContain("281.356.0965");
    expect(html).toContain("photos@iconicimagestx.com");
    expect(html).not.toContain("cadi" + "@");
    expect(html).toContain("iconicimagestx.com");
  });
});

describe("invoice summary markup", () => {
  it("omits the processing row until the invoice has a processing amount", () => {
    const hidden = renderToStaticMarkup(
      <InvoiceFaceSummary face={invoiceFaceFromStored({ subtotal: 80, total: 80, lineItems: [{ name: "Photos", price: 80 }] })} />,
    );
    expect(hidden).toContain("Subtotal");
    expect(hidden).toContain("Promotions");
    expect(hidden).toContain("Fees");
    expect(hidden).toContain('data-testid="invoice-total-box"');
    expect(hidden).toContain('data-slot="money"');
    expect(hidden).toContain("whitespace-nowrap");
    expect(hidden).not.toContain('data-invoice-row="processing"');

    const shown = renderToStaticMarkup(
      <InvoiceFaceSummary face={invoiceFaceFromStored({ subtotal: 80, processing: 5, total: 85, lineItems: [{ name: "Photos", price: 80 }] })} />,
    );
    expect(shown).toContain('data-invoice-row="processing"');
    expect(shown).toContain("Processing");
  });
});
