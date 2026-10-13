import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT_LINE } from "./businessContact.ts";
import { BOOKING_PROCESSING_LABEL } from "./invoiceProcessing.ts";
import {
  CLIENT_EMAIL_SAMPLE,
  CLIENT_EMAIL_TEMPLATE_KEYS,
  CLIENT_EMAIL_TEMPLATES,
  builtinEmailSubject,
  clientBuiltinEmailHtml,
  clientEmailPreview,
  defaultEmailTemplate,
  displayOrderNumber,
  fillEmailPlaceholders,
  readEmailTemplateOverride,
  templateShowsMoney,
} from "./clientEmailTemplates.ts";
import { builtinEmailHtml } from "../server/services/email.ts";
import {
  CLIENT_CONFIRMATION_HTML,
  CLIENT_CONFIRMATION_SUBJECT,
  resolveClientConfirmation,
} from "../functions/src/clientConfirmationEmail.ts";

const CONTACT_VISIBLE = "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com";

describe("client email catalog", () => {
  it("uses one document id and {{name}} placeholders for every client email", () => {
    expect(CLIENT_EMAIL_TEMPLATE_KEYS).toEqual([
      "booking_received",
      "account_password_setup",
      "order_confirmed",
      "gallery_delivery",
      "invoice",
      "payment_receipt",
      "contact_confirmation",
      "clientConfirmation",
    ]);
    for (const meta of CLIENT_EMAIL_TEMPLATES) {
      const source = defaultEmailTemplate(meta.id);
      expect(source.subject.trim().length).toBeGreaterThan(0);
      expect(source.htmlBody.trim().length).toBeGreaterThan(0);
      const withoutTokens = `${source.subject}\n${source.htmlBody}`.replace(/\{\{\w+\}\}/g, "");
      expect(withoutTokens).not.toMatch(/\{[a-zA-Z]+\}/);
      for (const name of meta.placeholders) {
        const token = `{{${name}}}`;
        expect(`${source.subject}\n${source.htmlBody}`).toContain(token);
      }
    }
  });

  it("rejects a missing or old-shaped override", () => {
    expect(readEmailTemplateOverride(null)).toBeNull();
    expect(readEmailTemplateOverride({ subject: "Hi", body: "Plain {clientName}" })).toBeNull();
    expect(readEmailTemplateOverride({ subject: "  ", htmlBody: "<p>Hi</p>" })).toBeNull();
    expect(readEmailTemplateOverride({ subject: "Hi", htmlBody: "   " })).toBeNull();
    expect(readEmailTemplateOverride({ subject: " Hi ", htmlBody: "<p>{{clientName}}</p>" })).toEqual({
      subject: "Hi",
      htmlBody: "<p>{{clientName}}</p>",
    });
    expect(fillEmailPlaceholders("Hello {{clientName}} {{missing}}", { clientName: "Drew" })).toBe(
      "Hello Drew {{missing}}",
    );
  });

  it("gives real subjects and says the booking was received", () => {
    const sample = CLIENT_EMAIL_SAMPLE;
    for (const key of CLIENT_EMAIL_TEMPLATE_KEYS) {
      const subject = builtinEmailSubject(key, sample);
      expect(subject.length).toBeGreaterThan(0);
      expect(subject).not.toBe("Message from Iconic Images");
    }
    expect(builtinEmailSubject("booking_received", sample)).toBe(
      "Your Iconic order #104 was received: 100 Congress Ave, Austin, TX 78701",
    );
    expect(builtinEmailSubject("booking_received", sample)).not.toMatch(/confirmed/i);
    expect(builtinEmailSubject("order_confirmed", sample)).toMatch(/is confirmed/i);
    expect(builtinEmailSubject("invoice", sample)).toBe("Invoice INV-104 from Iconic Images");
    expect(builtinEmailSubject("payment_receipt", sample)).toBe("Payment received — INV-104");
    expect(builtinEmailSubject("clientConfirmation", sample)).toBe("We received your Iconic order #104");
  });

  it("prints Processing (2.8%) on every money email and the public contact line", () => {
    for (const key of CLIENT_EMAIL_TEMPLATE_KEYS) {
      const html = clientBuiltinEmailHtml(key, CLIENT_EMAIL_SAMPLE);
      expect(html).toContain("tel:+12813560965");
      expect(html).toContain("mailto:photos@iconicimagestx.com");
      expect(html.replace(/<[^>]+>/g, "")).toContain(CONTACT_VISIBLE);
      expect(html.toLowerCase()).not.toContain(`cadi${"@"}`);
      expect(html).not.toContain("utm_");
      if (templateShowsMoney(key)) {
        expect(html).toContain(BOOKING_PROCESSING_LABEL);
        expect(BOOKING_PROCESSING_LABEL).toBe("Processing (2.8%)");
      }
    }
    expect(CONTACT_VISIBLE).toBe(BUSINESS_CONTACT_LINE);
  });

  it("previews the built-in HTML, including the branded receipt, until the draft changes", () => {
    for (const key of CLIENT_EMAIL_TEMPLATE_KEYS) {
      const preview = clientEmailPreview(key);
      expect(preview.builtin).toBe(true);
      expect(preview.html).toBe(clientBuiltinEmailHtml(key, CLIENT_EMAIL_SAMPLE));
      expect(preview.html).toBe(builtinEmailHtml(key, CLIENT_EMAIL_SAMPLE));
      expect(preview.subject).toBe(builtinEmailSubject(key, CLIENT_EMAIL_SAMPLE));
    }
    const receipt = clientEmailPreview("payment_receipt");
    expect(receipt.html).toContain("RECEIPT");
    expect(receipt.html).toContain("PROCESSING");
    expect(receipt.html).toContain("TOTAL PAID");
    expect(receipt.html).toContain("Processing (2.8%)");
    expect(receipt.html).toContain("Your downloads are ready");
    expect(receipt.html).not.toContain("INCLUDED");
    const edited = clientEmailPreview("payment_receipt", {
      subject: "Thanks {{clientName}}",
      htmlBody: "<p>Paid {{amount}}</p>",
    });
    expect(edited.builtin).toBe(false);
    expect(edited.subject).toBe("Thanks Drew Feig");
    expect(edited.html).toBe("<p>Paid $564.37</p>");
  });

  it("shows #104 on the order-created email and never the document id", () => {
    expect(displayOrderNumber("#104")).toBe("#104");
    expect(displayOrderNumber("ord_abc123")).toBe("");
    expect(displayOrderNumber("orders/abc")).toBe("");
    const order = {
      id: "firestoreDocId",
      clientName: "Drew Feig",
      orderNumber: "#104",
      addressLabel: "100 Congress Ave, Austin, TX 78701",
      services: ["The Showcase"],
      lineItems: [{ name: "The Showcase", price: 549 }],
      notes: "Gate code is on the lockbox.",
    };
    const message = resolveClientConfirmation(order, { subject: "Booking Confirmed – {propertyAddress}", body: "Order ID: {orderId}" });
    expect(message.subject).toBe("We received your Iconic order #104");
    expect(message.html).toContain("#104");
    expect(message.html).not.toContain("firestoreDocId");
    expect(message.html).toContain("100 Congress Ave, Austin, TX 78701");
    expect(message.html).toBe(fillEmailPlaceholders(CLIENT_CONFIRMATION_HTML, {
      clientName: "Drew Feig",
      clientEmail: "",
      clientPhone: "",
      propertyAddress: "100 Congress Ave, Austin, TX 78701",
      services: "The Showcase",
      lineItems: "The Showcase — $549",
      total: "0",
      notes: "Gate code is on the lockbox.",
      orderNumber: "#104",
    }));
    expect(message.html).toBe(clientBuiltinEmailHtml("clientConfirmation", {
      clientName: "Drew Feig",
      propertyAddress: "100 Congress Ave, Austin, TX 78701",
      services: "The Showcase",
      lineItems: "The Showcase — $549",
      notes: "Gate code is on the lockbox.",
      orderNumber: "#104",
      total: "0",
    }));
    expect(CLIENT_CONFIRMATION_SUBJECT).toBe(defaultEmailTemplate("clientConfirmation").subject);
    const stored = resolveClientConfirmation(order, {
      subject: "Order {{orderNumber}}",
      htmlBody: "<p>{{orderNumber}} {{propertyAddress}}</p>",
    });
    expect(stored).toEqual({
      subject: "Order #104",
      html: "<p>#104 100 Congress Ave, Austin, TX 78701</p>",
    });
  });

  it("leaves the notify switch and the order-created gate alone", () => {
    const notify = readFileSync(new URL("./clientNotify.ts", import.meta.url), "utf8");
    const fn = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");
    expect(notify).toContain('return env.CLIENT_NOTIFY_LIVE === "true"');
    expect(fn).toContain('process.env.CLIENT_COMMS_ZONE === "RED" || process.env.CLIENT_NOTIFY_LIVE !== "true"');
  });
});
