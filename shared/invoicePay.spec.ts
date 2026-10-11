import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clientPayPath,
  clientPayUrl,
  createPayToken,
  decideInvoiceView,
  isDerivedInvoiceId,
  isLegacyOpenAutoId,
  legacyInvoiceDocIds,
  publicInvoiceClient,
  publicInvoiceLines,
} from "./invoicePay";

const email = readFileSync(new URL("../server/services/email.ts", import.meta.url), "utf8");
const payments = readFileSync(new URL("../server/routes/payments.ts", import.meta.url), "utf8");
const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
const delivery = readFileSync(new URL("../server/services/galleryDeliver.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../client/pages/AdminInvoiceEditor.tsx", import.meta.url), "utf8");

describe("pay tokens and public invoice access", () => {
  it("mints a 256-bit base64url token", () => {
    const token = createPayToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toMatch(/[+/=]/);
    expect(createPayToken()).not.toBe(token);
  });

  it("keeps a legacy auto-id open and closes derived ids", () => {
    expect(isLegacyOpenAutoId("AbCdEfGhIjKlMnOpQrSt")).toBe(true);
    expect(isDerivedInvoiceId("listing_studio1")).toBe(true);
    expect(isDerivedInvoiceId("ordreq_req1")).toBe(true);
    expect(isDerivedInvoiceId("playtest-invoice-client1")).toBe(true);
    expect(isDerivedInvoiceId("playtest-delivery-qa-invoice")).toBe(true);
    expect(isLegacyOpenAutoId("listing_abcdefghijkl")).toBe(false);
    expect(isLegacyOpenAutoId("playtest-delivery-qa-invoice")).toBe(false);
    expect(legacyInvoiceDocIds({ orderRequestId: "req1", listingId: "studio1" })).toEqual([
      "ordreq_req1",
      "listing_studio1",
    ]);
  });

  it("requires a matching token for public callers once one is stored", () => {
    const matches = (stored: string, presented: string) => stored === presented && stored.length > 0;
    expect(decideInvoiceView({
      invoiceId: "listing_studio1",
      audience: "public",
      matches,
    })).toBe("deny");
    expect(decideInvoiceView({
      invoiceId: "listing_studio1",
      payToken: "secret-token",
      presentedToken: "secret-token",
      audience: "public",
      matches,
    })).toBe("public");
    expect(decideInvoiceView({
      invoiceId: "listing_studio1",
      payToken: "secret-token",
      presentedToken: "wrong-token",
      audience: "public",
      matches,
    })).toBe("deny");
    expect(decideInvoiceView({
      invoiceId: "AbCdEfGhIjKlMnOpQrSt",
      audience: "public",
      matches,
    })).toBe("public");
    expect(decideInvoiceView({
      invoiceId: "listing_studio1",
      audience: "staff",
      matches,
    })).toBe("full");
    expect(decideInvoiceView({
      invoiceId: "listing_studio1",
      audience: "owner",
      matches,
    })).toBe("full");
  });

  it("builds the client pay link without rewriting the id", () => {
    expect(clientPayPath("ordreq_req1")).toBe("/invoice/ordreq_req1");
    expect(clientPayPath("ordreq_req1", "tok")).toBe("/invoice/ordreq_req1?t=tok");
    expect(clientPayUrl("https://iconicimagestx.com/", "ordreq_req1", "tok", { paid: "1" })).toBe(
      "https://iconicimagestx.com/invoice/ordreq_req1?t=tok&paid=1",
    );
  });

  it("drops email, phone, and internal ids from the public payer fields", () => {
    expect(publicInvoiceClient({
      clientName: "Ada Agent",
      clientEmail: "ada@example.com",
      clientPhone: "512-555-0100",
    })).toEqual({ clientName: "Ada Agent" });
    expect(publicInvoiceLines([
      { id: "line-secret", name: "Photos", description: "MLS", qty: 1, unitPrice: 250, price: 250, category: "service" },
    ])).toEqual([{ name: "Photos", description: "MLS", qty: 1, unitPrice: 250, price: 250 }]);
  });

  it("puts the pay token on every client pay link", () => {
    expect(email).toContain('href="${vars.paymentUrl}"');
    expect(email).toContain("Pay Invoice");
    expect(email).toContain("Pay invoice");
    expect(payments).toContain("clientInvoiceUrl(");
    expect(payments).toContain('paid: "1"');
    expect(payments).not.toContain("clientPayUrl");
    expect(bookings).toContain('clientInvoiceUrl({ id: invoiceRef.id, status: "draft", payToken })');
    expect(bookings).not.toContain("clientPayUrl");
    expect(delivery).toContain("galleryDeliveryPayUrl");
    expect(delivery).not.toContain("clientPayUrl");
    expect(editor).toContain("clientInvoiceUrl(");
    expect(editor).not.toContain("window.location.origin");
    expect(editor).not.toContain("clientPaymentPath");
  });
});
