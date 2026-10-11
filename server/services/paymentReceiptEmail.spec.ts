import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "../../shared/businessContact";
import { buildPaymentReceipt, processingFee, receiptLogoUrl } from "./paymentReceiptEmail";
import { presentationLinkForReceipt } from "./clientLinks";

const ENV = { PUBLIC_SITE_URL: "https://links.example" };

describe("payment receipt", () => {
  it("shows processing as included and never adds it on top of the amount paid", () => {
    expect(processingFee(549)).toBe(15.37);
    expect(processingFee(1)).toBe(0.03);
    const rendered = buildPaymentReceipt({
      invoice: {
        clientName: "Drew Feig",
        invoiceNumber: "12345",
        lineItems: [{ name: "The Showcase", qty: 1, unitPrice: 549, price: 549 }],
        subtotal: 549,
        promoDiscount: 0,
        fees: 0,
      },
      invoiceId: "inv-showcase",
      paidAt: new Date("2026-10-11T12:00:00Z"),
      unlocked: true,
      amountPaid: 549,
      balance: 0,
      galleryId: "gal-showcase",
      listing: { id: "listing-showcase" },
      presentationUrl: "https://links.example/present/showcase",
      env: ENV,
    });
    expect(rendered.html).toContain("RECEIPT");
    expect(rendered.html).toContain("PAYMENT RECEIVED");
    expect(rendered.html).toContain(receiptLogoUrl(ENV));
    expect(rendered.html).toContain("Arial, Helvetica, sans-serif");
    expect(rendered.html).toContain("THE SHOWCASE");
    expect(rendered.html).toContain("$549.00");
    expect(rendered.html).toContain("$15.37");
    expect(rendered.html).toContain("INCLUDED");
    expect(rendered.html).not.toContain("$564");
    expect(rendered.html).toContain("It is not an extra charge.");
    expect(rendered.html).toContain("Your downloads are ready");
    expect(rendered.html).toContain("View your listing presentation");
    expect(rendered.html).toContain("https://links.example/present/showcase");
    expect(rendered.html).toContain("Your downloads &amp; invoice");
    expect(rendered.html).toContain("https://links.example/gallery/gal-showcase");
    expect(rendered.html).toContain(LEGAL_BUSINESS_NAME);
    expect(rendered.html).toContain(BUSINESS_CONTACT.phoneDisplay);
    expect(rendered.html).toContain(BUSINESS_CONTACT.email);
    expect(rendered.html).toContain("26410 Oakridge Dr. Ste 105 - 108");
    expect(rendered.html).toContain("THANK YOU FOR BEING ICONIC");
    expect(rendered.text).toContain("PROCESSING $15.37 INCLUDED");
    expect(rendered.text).toContain("TOTAL PAID $549.00");
    expect(rendered.text).toContain("View your listing presentation: https://links.example/present/showcase");
  });

  it("uses the gallery as the primary button while the presentation link is null", () => {
    expect(presentationLinkForReceipt({ id: "playtest-delivery-qa-listing" })).toBeNull();
    const rendered = buildPaymentReceipt({
      invoice: {
        clientName: "TEST - Delivery QA",
        invoiceNumber: "TEST-DELIVERY-QA",
        lineItems: [{ name: "TEST - Delivery QA", qty: 1, price: 1 }],
        subtotal: 1,
      },
      invoiceId: "playtest-delivery-qa-invoice",
      paidAt: new Date("2026-10-11T05:41:00Z"),
      unlocked: true,
      amountPaid: 1,
      balance: 0,
      galleryId: "playtest-delivery-qa-gallery",
      listing: { id: "playtest-delivery-qa-listing" },
      env: ENV,
    });
    expect(rendered.html).toContain("Your downloads &amp; invoice");
    expect(rendered.html).not.toContain("View your listing presentation");
    expect(rendered.html).toContain("https://links.example/gallery/playtest-delivery-qa-gallery");
    expect(rendered.html).toContain("$0.03");
    expect(rendered.html).toContain("TOTAL PAID");
    expect(rendered.text).not.toContain("View your listing presentation");
  });
});
