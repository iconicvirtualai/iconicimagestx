import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandedInvoice, BrandedInvoiceShell, InvoiceFaceSummary } from "@/components/invoice/BrandedInvoice";
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

const retiredMarketing = ["Media", "& Marketing"].join(" ");
const retiredSuite = ["Ste", "107"].join(" ");

describe("branded invoice pdf", () => {
  it("draws the template, embeds the logo, and keeps the charged total in display mode", () => {
    const face = invoiceFaceFromStored({
      lineItems: [{ name: "The Showcase", price: 549, qty: 1 }],
      subtotal: 549,
      total: 549,
      amountPaid: 0,
      amountDue: 549,
    });
    const bytes = brandedInvoicePdf({
      invoiceNumber: "12345",
      issuedAt: "2027-01-01",
      clientName: "Drew Feig",
      billToAddress: "123 Anywhere St., Any City",
      status: "",
      notes: "Gate code is 1234.",
      face,
      processingMode: "display",
    });
    const pdf = new TextDecoder().decode(bytes);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain("/Width 600");
    expect(pdf).toContain("/SMask");
    expect(bytes.length).toBeGreaterThan(1000);
    expect(pdf).toContain("INVOICE");
    expect(pdf).toContain("INVOICE NO : 12345");
    expect(pdf).toContain("JAN. 01, 2027");
    expect(pdf).toContain("INVOICE TO :");
    expect(pdf).toContain("DREW FEIG");
    expect(pdf).toContain("THE SHOWCASE");
    expect(pdf).toContain("DESCRIPTION");
    expect(pdf).toContain("QTY.");
    expect(pdf).toContain("SUB TOTAL");
    expect(pdf).toContain("PROCESSING");
    expect(pdf).toContain("PROMOTIONS");
    expect(pdf).toContain("FEES");
    expect(pdf).toContain("INCLUDED");
    expect(pdf).toContain("$15.37");
    expect(pdf).toContain("$549.00");
    expect(pdf).not.toContain("$564.37");
    expect(pdf).toContain("NOTES:");
    expect(pdf).toContain("Gate code is 1234.");
    expect(pdf).toContain("PAYMENT INFORMATION:");
    expect(pdf).toContain("THANK YOU FOR BEING ICONIC");
    expect(pdf).toContain("Iconic Images Photography, LLC");
    expect(pdf).toContain("26410 Oakridge Dr. Ste 105 - 108");
    expect(pdf).toContain("Spring, TX 77380");
    expect(pdf).toContain("photos@iconicimagestx.com");
    expect(pdf).toContain("281.356.0965");
    expect(pdf).not.toContain(retiredMarketing);
    expect(pdf).not.toContain(retiredSuite);
    expect(pdf).not.toContain("cadi" + "@");
    expect(pdf).not.toContain("Pay Securely");
  });

  it("adds 2.8% to the printed total only in charge mode", () => {
    const face = invoiceFaceFromStored({
      lineItems: [{ name: "The Showcase", price: 549, qty: 1 }],
      subtotal: 549,
      total: 549,
      amountDue: 549,
    });
    const pdf = new TextDecoder().decode(brandedInvoicePdf({
      invoiceNumber: "12345",
      clientName: "Drew Feig",
      billToAddress: "",
      status: "",
      face,
      processingMode: "charge",
    }));
    expect(pdf).toContain("PROCESSING");
    expect(pdf).toContain("$15.37");
    expect(pdf).toContain("$564.37");
    expect(pdf).not.toContain("INCLUDED");
  });

  it("prints a stored processing amount and does not add 2.8% again", () => {
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
      processingMode: "charge",
    }));
    expect(pdf).toContain("PROCESSING");
    expect(pdf).toContain("$4.00");
    expect(pdf).toContain("$104.00");
    expect(pdf).not.toContain("$2.80");
  });
});

describe("client invoice page", () => {
  it("restyles /invoice/:id, adds Download PDF, and leaves checkout in place", () => {
    expect(clientInvoice).toContain("Download PDF");
    expect(clientInvoice).toContain("BrandedInvoiceShell");
    expect(brandedInvoice).toContain("iconic-graffiti-logo.png");
    expect(brandedInvoice).toContain("iconic-graffiti-logo.webp");
    expect(brandedInvoice).toContain("data-testid=\"invoice-total-box\"");
    expect(clientInvoice).toContain("invoicePageInvoiceNumber");
    expect(clientInvoice).toContain("invoice.invoiceNumber");
    expect(clientInvoice).toContain("id: invoiceId");
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
    expect(html).toContain("26410 Oakridge Dr. Ste 105 - 108");
    expect(html).toContain("Spring, TX 77380");
    expect(html).toContain("281.356.0965");
    expect(html).toContain("photos@iconicimagestx.com");
    expect(html).not.toContain("cadi" + "@");
    expect(html).toContain("iconicimagestx.com");
    expect(html).not.toContain(retiredMarketing);
    expect(html).not.toContain(retiredSuite);
    expect(html).toContain("THANK YOU FOR BEING ICONIC");
    expect(html).toContain('data-testid="invoice-camera"');
  });
});

describe("invoice summary markup", () => {
  const showcase = invoiceFaceFromStored({
    subtotal: 549,
    total: 549,
    amountDue: 549,
    lineItems: [{ name: "The Showcase", price: 549, qty: 1 }],
  });

  it("prints 2.8% as included in display mode and adds it only in charge mode", () => {
    const display = renderToStaticMarkup(<InvoiceFaceSummary face={showcase} processingMode="display" />);
    expect(display).toContain("Sub total");
    expect(display).toContain("Promotions");
    expect(display).toContain("Fees");
    expect(display).toContain('data-testid="invoice-total-box"');
    expect(display).toContain('data-slot="money"');
    expect(display).toContain("whitespace-nowrap");
    expect(display).toContain('data-invoice-row="processing"');
    expect(display).toContain('data-processing-presentation="included"');
    expect(display).toContain("$15.37");
    expect(display).toContain("$549.00");
    expect(display).not.toContain("$564.37");
    expect(display).toContain("not an extra charge");

    const charge = renderToStaticMarkup(<InvoiceFaceSummary face={showcase} processingMode="charge" />);
    expect(charge).toContain('data-processing-presentation="added"');
    expect(charge).toContain("$15.37");
    expect(charge).toContain("$564.37");
    expect(charge).not.toContain("not an extra charge");
  });

  it("shows a stored processing amount instead of inventing another 2.8%", () => {
    const shown = renderToStaticMarkup(
      <InvoiceFaceSummary
        face={invoiceFaceFromStored({ subtotal: 80, processing: 5, total: 85, lineItems: [{ name: "Photos", price: 80 }] })}
        processingMode="charge"
      />,
    );
    expect(shown).toContain('data-processing-presentation="stored"');
    expect(shown).toContain("Processing");
    expect(shown).toContain("$5.00");
    expect(shown).toContain("$85.00");
    expect(shown).not.toContain("$2.24");
  });

  it("puts bill-to in the header and the legal footer on the full invoice", () => {
    const html = renderToStaticMarkup(
      <BrandedInvoice
        invoiceNumber="12345"
        issuedAt="2027-01-01"
        clientName="Drew Feig"
        billToAddress="123 Anywhere St., Any City"
        face={showcase}
        notes="Leave the lights on."
        processingMode="display"
      />,
    );
    expect(html).toContain("JAN. 01, 2027");
    expect(html).toContain("INVOICE TO :");
    expect(html).toContain("Drew Feig");
    expect(html.indexOf("INVOICE TO :")).toBeLessThan(html.indexOf("The Showcase"));
    expect(html).toContain("NOTES:");
    expect(html).toContain("Leave the lights on.");
    expect(html).toContain("Iconic Images Photography, LLC");
    expect(html).not.toContain(retiredMarketing);
    expect(html).not.toContain(retiredSuite);
    expect(html).not.toContain("cadi" + "@");
  });
});
