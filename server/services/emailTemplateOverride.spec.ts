import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const { store, sendMail } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  sendMail: vi.fn(async () => ({ messageId: "test-message" })),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail,
      close: () => undefined,
    }),
  },
}));

vi.mock("firebase-admin", () => ({
  default: {
    apps: [{}],
    firestore: () => ({
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            const path = `${name}/${id}`;
            return {
              exists: store.has(path),
              data: () => store.get(path),
            };
          },
        }),
      }),
    }),
  },
}));

import { sendEmail } from "./email";
import { paymentReceiptFromVars } from "../../shared/paymentReceiptLayout";

const ENV_KEYS = ["CLIENT_NOTIFY_LIVE", "CLIENT_COMMS_ZONE", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  store.clear();
  sendMail.mockClear();
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("sendEmail template overrides", () => {
  it("keeps caller HTML, including the branded receipt, when no valid override is stored", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    process.env.SMTP_USER = "smtp@example.com";
    process.env.SMTP_PASS = "secret";
    const branded = paymentReceiptFromVars({
      clientName: "Drew Feig",
      invoiceNumber: "INV-104",
      amount: "$564.37",
      processing: "$15.37",
      totalPaid: "564.37",
      subtotal: "549",
      balance: "0",
      unlocked: "true",
      galleryUrl: "https://iconicimagestx.vercel.app/gallery/gal-sample",
      lineItemsJson: JSON.stringify([{ name: "The Showcase", qty: 1, unitPrice: 549, price: 549 }]),
    });
    store.set("emailTemplates/payment_receipt", { subject: "Old", body: "Thanks {clientName}" });
    await sendEmail({
      to: "drew@example.com",
      template: "payment_receipt",
      subject: branded.subject,
      html: branded.html,
      text: branded.text,
      variables: { clientName: "Drew Feig", invoiceNumber: "INV-104" },
    });
    const message = sendMail.mock.calls[0]?.[0];
    expect(message?.subject).toBe(branded.subject);
    expect(message?.html).toBe(branded.html);
    expect(message?.html).toContain("RECEIPT");
    expect(message?.text).toBe(branded.text);
  });

  it("replaces the branded receipt when a valid payment_receipt override is stored", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    process.env.SMTP_USER = "smtp@example.com";
    process.env.SMTP_PASS = "secret";
    store.set("emailTemplates/payment_receipt", {
      subject: "Receipt {{invoiceNumber}}",
      htmlBody: "<p>Thanks {{clientName}}. Processing (2.8%)</p>",
    });
    await sendEmail({
      to: "drew@example.com",
      template: "payment_receipt",
      subject: "Payment received — INV-104",
      html: "<p>BRANDED RECEIPT</p>",
      text: "plain receipt",
      variables: { clientName: "Drew Feig", invoiceNumber: "INV-104" },
    });
    const message = sendMail.mock.calls[0]?.[0];
    expect(message?.subject).toBe("Receipt INV-104");
    expect(message?.html).toBe("<p>Thanks Drew Feig. Processing (2.8%)</p>");
    expect(message?.html).not.toContain("BRANDED RECEIPT");
    expect(message?.text).toBeUndefined();
  });

  it("still passes the branded receipt into sendEmail and leaves download unlock in place", () => {
    const payments = readFileSync(new URL("../routes/payments.ts", import.meta.url), "utf8");
    expect(payments).toContain('template: "payment_receipt"');
    expect(payments).toContain("html,");
    expect(payments).toContain("buildPaymentReceipt");
    expect(payments).toContain("async function syncDownloadAccess");
    expect(payments).toContain("async function applySuccessfulPayment");
    expect(payments).toContain("squareSignatureValid");
  });
});
