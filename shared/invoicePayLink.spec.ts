import { describe, expect, it } from "vitest";
import { clientInvoiceUrl, invoicePayLinkFor } from "./invoicePayLink";

const ENV = { PUBLIC_SITE_URL: "https://links.example" };
const TOKEN = "paytokenvalue";

describe("invoicePayLinkFor", () => {
  it("returns a tokenized public link for an unpaid invoice", () => {
    const link = invoicePayLinkFor({ id: "AbCdEfGhIjKlMnOpQrSt", status: "sent", payToken: TOKEN }, ENV);
    expect(link).toBe("https://links.example/invoice/AbCdEfGhIjKlMnOpQrSt?t=paytokenvalue");
    expect(link).not.toContain("iconicimagestx.com");
    expect(link).not.toMatch(/\/invoice\/listing_/);
    expect(link).not.toMatch(/\/invoice\/ordreq_/);
  });

  it("omits the link when the invoice is paid or comped", () => {
    expect(invoicePayLinkFor({ id: "AbCdEfGhIjKlMnOpQrSt", status: "paid", payToken: TOKEN }, ENV)).toBeNull();
    expect(invoicePayLinkFor({ id: "AbCdEfGhIjKlMnOpQrSt", status: "COMPED", payToken: TOKEN }, ENV)).toBeNull();
  });

  it("never returns a guessable listing or order-request id", () => {
    expect(invoicePayLinkFor({ id: "listing_studio1", status: "sent" }, ENV)).toBeNull();
    expect(invoicePayLinkFor({ id: "ordreq_req1", status: "sent", payToken: "" }, ENV)).toBeNull();
    expect(invoicePayLinkFor({ id: "ordreq_req1", status: "sent", payToken: "   " }, ENV)).toBeNull();
    const tokenized = invoicePayLinkFor({ id: "listing_studio1", status: "sent", payToken: TOKEN }, ENV);
    expect(tokenized).toContain("?t=paytokenvalue");
    expect(tokenized).not.toBe("https://links.example/invoice/listing_studio1");
    expect(String(tokenized)).not.toMatch(/\/invoice\/listing_[^?]+$/);
    expect(String(tokenized)).not.toMatch(/\/invoice\/ordreq_[^?]+$/);
  });

  it("keeps a legacy auto-id on the public site when invoice email has no token yet", () => {
    expect(clientInvoiceUrl({ id: "AbCdEfGhIjKlMnOpQrSt", status: "sent" }, ENV)).toBe(
      "https://links.example/invoice/AbCdEfGhIjKlMnOpQrSt",
    );
    expect(clientInvoiceUrl({ id: "listing_studio1", status: "sent" }, ENV)).toBeNull();
    expect(clientInvoiceUrl({ id: "ordreq_req1", status: "draft" }, ENV)).toBeNull();
    expect(clientInvoiceUrl({ id: "AbCdEfGhIjKlMnOpQrSt", status: "paid" }, ENV)).toBeNull();
  });
});
