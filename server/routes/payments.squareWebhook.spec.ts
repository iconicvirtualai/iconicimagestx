import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createMemoryFirestore } from "../lib/memoryFirestore";
import { useAppFirestore } from "../lib/appFirestore";
import { setEmailDeliveryOverride } from "../services/email";
import { signSquareWebhook } from "../services/squareWebhook";
import { squarePaymentNote } from "../../shared/paymentAccess";

const memory = createMemoryFirestore();
const sent: Array<{ to: string; subject: string; html: string; text?: string }> = [];
const KEY = "test-square-webhook-key";
const NOTIFICATION_URL = "https://iconicimagestx.vercel.app/api/payments/square-webhook";

vi.mock("firebase-admin", () => {
  const firestore = () => {
    throw new Error("Live Firestore is not used by the Square webhook tests.");
  };
  return { default: { firestore, apps: [] } };
});

import paymentsRouter from "./payments";

const ENV_KEYS = [
  "SQUARE_WEBHOOK_SIGNATURE_KEY",
  "SQUARE_WEBHOOK_NOTIFICATION_URL",
  "CLIENT_NOTIFY_LIVE",
  "CLIENT_COMMS_ZONE",
  "NOTIFY_TEST_ALLOWLIST",
  "PUBLIC_SITE_URL",
  "VITE_PUBLIC_SITE_URL",
  "APP_URL",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function useEnv(overrides: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY;
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = NOTIFICATION_URL;
  process.env.PUBLIC_SITE_URL = "https://iconicimagestx.vercel.app";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function paymentEvent(input: {
  type?: string;
  eventId: string;
  paymentId: string;
  amountCents: number;
  invoiceId: string;
  status?: string;
}) {
  return {
    merchant_id: "MLTEST",
    type: input.type || "payment.updated",
    event_id: input.eventId,
    created_at: "2026-10-11T05:41:00Z",
    data: {
      type: "payment",
      id: input.paymentId,
      object: {
        payment: {
          id: input.paymentId,
          status: input.status || "COMPLETED",
          amount_money: { amount: input.amountCents, currency: "USD" },
          total_money: { amount: input.amountCents, currency: "USD" },
          source_type: "CARD",
          card_details: { status: "CAPTURED", card: { card_brand: "VISA", last_4: "1111" } },
          note: squarePaymentNote(input.invoiceId, "TEST-DELIVERY-QA"),
          reference_id: input.invoiceId,
        },
      },
    },
  };
}

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use("/api/payments/square-webhook", express.raw({ type: "application/json" }));
  app.use(express.json());
  app.use("/api/payments", paymentsRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  useAppFirestore(null);
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  memory.clear();
  sent.length = 0;
  useAppFirestore(memory.db);
  useEnv({});
  setEmailDeliveryOverride(async (message) => {
    sent.push(message);
  });
});

afterEach(() => {
  setEmailDeliveryOverride(null);
  useAppFirestore(null);
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function seedPaidWorld(invoice: Record<string, unknown> = {}) {
  memory.seed("invoices", "playtest-delivery-qa-invoice", {
    playtest: true,
    invoiceNumber: "TEST-DELIVERY-QA",
    clientName: "TEST - Delivery QA",
    clientEmail: "ops+deliveryqa@iconicimagestx.com",
    clientId: "playtest-delivery-qa-client",
    orderId: "playtest-delivery-qa-order",
    galleryId: "playtest-delivery-qa-gallery",
    listingId: "playtest-delivery-qa-listing",
    lineItems: [{ name: "TEST - Delivery QA", qty: 1, price: 1 }],
    subtotal: 1,
    total: 1,
    amountPaid: 0,
    amountDue: 1,
    status: "sent",
    ...invoice,
  });
  memory.seed("orders", "playtest-delivery-qa-order", { playtest: true, history: [], depositPaid: 0 });
  memory.seed("listings", "playtest-delivery-qa-listing", {
    playtest: true,
    orderId: "playtest-delivery-qa-order",
    invoiceId: "playtest-delivery-qa-invoice",
    galleryId: "playtest-delivery-qa-gallery",
    auditLog: [],
    lockDownloads: true,
    requirePayment: true,
    downloadEnabled: false,
    downloadsReleased: false,
    paymentStatus: "unpaid",
    invoiceStatus: "sent",
  });
  memory.seed("galleries", "playtest-delivery-qa-gallery", {
    playtest: true,
    listingId: "playtest-delivery-qa-listing",
    orderId: "playtest-delivery-qa-order",
    invoiceId: "playtest-delivery-qa-invoice",
    lockDownloads: true,
    downloadEnabled: false,
    downloadsReleased: false,
    paymentStatus: "unpaid",
  });
  memory.seed("clients", "playtest-delivery-qa-client", { totalSpend: 0, playtest: true });
}

async function postEvent(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  const signed = signature === undefined ? signSquareWebhook(raw, KEY, NOTIFICATION_URL) : signature;
  const response = await fetch(`${baseUrl}/api/payments/square-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-square-hmacsha256-signature": signed,
    },
    body: raw,
  });
  const json = await response.json();
  return { status: response.status, json };
}

describe("Square webhook paid unlock", () => {
  it("rejects a missing key and a bad signature without changing the invoice", async () => {
    seedPaidWorld();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useEnv({ SQUARE_WEBHOOK_SIGNATURE_KEY: undefined });
    const event = paymentEvent({
      eventId: "evt-missing-key",
      paymentId: "pay-missing-key",
      amountCents: 100,
      invoiceId: "playtest-delivery-qa-invoice",
    });
    const missing = await postEvent(event, "not-a-signature");
    expect(missing.status).toBe(401);
    expect(warn.mock.calls.map((call) => call.join(" ")).join("\n")).toMatch(/webhook not configured/i);
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.status).toBe("sent");
    expect(memory.get("orders", "playtest-delivery-qa-order")?.history).toEqual([]);

    useEnv({});
    const bad = await postEvent(event, "bad-signature");
    expect(bad.status).toBe(403);
    expect(bad.json.error).toMatch(/signature/i);
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.amountPaid).toBe(0);
    expect(memory.get("listings", "playtest-delivery-qa-listing")?.downloadEnabled).toBe(false);
    expect(sent).toHaveLength(0);
    warn.mockRestore();
  });

  it("unlocks a fully paid playtest invoice and treats a replay as a no-op", async () => {
    seedPaidWorld();
    useEnv({ NOTIFY_TEST_ALLOWLIST: "ops+deliveryqa@iconicimagestx.com" });
    const event = paymentEvent({
      eventId: "evt-playtest-full",
      paymentId: "pay-playtest-full",
      amountCents: 100,
      invoiceId: "playtest-delivery-qa-invoice",
    });
    const first = await postEvent(event);
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ received: true, applied: true, unlocked: true, email: "allowlist" });

    const invoice = memory.get("invoices", "playtest-delivery-qa-invoice");
    expect(invoice).toMatchObject({
      status: "paid",
      amountPaid: 1,
      amountDue: 0,
      amountStillDue: 0,
      squarePaymentId: "pay-playtest-full",
      paymentMethod: "square",
      squarePaymentMethod: "VISA",
      playtest: true,
    });
    expect(invoice?.paidAt).toBeTruthy();

    const unlock = {
      clientGalleryDownloadsUnlocked: true,
      lockDownloads: false,
      downloadsReleased: true,
      downloadEnabled: true,
      paymentStatus: "paid",
      invoiceStatus: "paid",
    };
    expect(memory.get("listings", "playtest-delivery-qa-listing")).toMatchObject(unlock);
    expect(memory.get("galleries", "playtest-delivery-qa-gallery")).toMatchObject(unlock);
    const history = memory.get("orders", "playtest-delivery-qa-order")?.history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("Payment received $1.00 via Square; downloads unlocked");
    expect(history[0].details).toMatch(/test allowlist/);
    expect(history[0].email).toBe("allowlist");
    expect(memory.get("listings", "playtest-delivery-qa-listing")?.auditLog).toEqual(history);
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("RECEIPT");
    expect(sent[0].html).toContain("Your downloads are ready");
    expect(sent[0].html).toContain("https://iconicimagestx.vercel.app/gallery/playtest-delivery-qa-gallery");
    expect(sent[0].html).not.toContain("View your listing presentation");
    expect(sent[0].text).toContain("TOTAL PAID");
    expect(sent[0].text).toContain("INCLUDED");

    const replay = await postEvent(event);
    expect(replay.status).toBe(200);
    expect(replay.json.duplicate).toBe(true);
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.amountPaid).toBe(1);
    expect(memory.get("orders", "playtest-delivery-qa-order")?.history).toHaveLength(1);
    expect(sent).toHaveLength(1);

    const duplicateUpdate = paymentEvent({
      eventId: "evt-playtest-full-again",
      paymentId: "pay-playtest-full",
      amountCents: 100,
      invoiceId: "playtest-delivery-qa-invoice",
    });
    const second = await postEvent(duplicateUpdate);
    expect(second.json.duplicate).toBe(true);
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.amountPaid).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("updates a partial payment and does not unlock", async () => {
    seedPaidWorld({ subtotal: 100, total: 100, amountDue: 100, lineItems: [{ name: "THE SHOWCASE", qty: 1, price: 100 }] });
    const event = paymentEvent({
      type: "payment.created",
      eventId: "evt-partial",
      paymentId: "pay-partial",
      amountCents: 4000,
      invoiceId: "playtest-delivery-qa-invoice",
    });
    const result = await postEvent(event);
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ applied: true, unlocked: false, email: "suppressed" });
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")).toMatchObject({
      status: "partial",
      amountPaid: 40,
      amountDue: 60,
      amountStillDue: 60,
    });
    const listing = memory.get("listings", "playtest-delivery-qa-listing");
    expect(listing?.lockDownloads).toBe(true);
    expect(listing?.downloadEnabled).toBe(false);
    expect(listing?.downloadsReleased).toBe(false);
    expect(listing?.clientGalleryDownloadsUnlocked).toBeUndefined();
    expect(listing?.paymentStatus).toBe("partial");
    const history = memory.get("orders", "playtest-delivery-qa-order")?.history as Array<Record<string, unknown>>;
    expect(history[0].action).toBe("Payment received $40.00 via Square");
    expect(String(history[0].action)).not.toContain("downloads unlocked");
    expect(history[0].details).toMatch(/Balance due \$60\.00/);
    expect(history[0].details).toMatch(/suppressed/);
    expect(history[0].email).toBe("suppressed");
    expect(sent).toHaveLength(0);
    expect(memory.get("galleries", "playtest-delivery-qa-gallery")?.downloadEnabled).toBe(false);
  });

  it("follows a tombstone redirectInvoiceId onto the live invoice", async () => {
    seedPaidWorld();
    memory.seed("invoices", "listing_oldstudio", {
      redirectInvoiceId: "playtest-delivery-qa-invoice",
      status: "void",
      clientEmail: "ops+deliveryqa@iconicimagestx.com",
    });
    const event = paymentEvent({
      eventId: "evt-tombstone",
      paymentId: "pay-tombstone",
      amountCents: 100,
      invoiceId: "listing_oldstudio",
    });
    const result = await postEvent(event);
    expect(result.status).toBe(200);
    expect(result.json.unlocked).toBe(true);
    expect(memory.get("invoices", "listing_oldstudio")?.status).toBe("void");
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.status).toBe("paid");
    expect(memory.get("listings", "playtest-delivery-qa-listing")?.downloadEnabled).toBe(true);
  });

  it("returns 200 and changes nothing when the invoice is unknown", async () => {
    seedPaidWorld();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = paymentEvent({
      eventId: "evt-unknown",
      paymentId: "pay-unknown",
      amountCents: 100,
      invoiceId: "does-not-exist",
    });
    const result = await postEvent(event);
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ received: true, unmatched: true });
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.status).toBe("sent");
    expect(memory.get("orders", "playtest-delivery-qa-order")?.history).toEqual([]);
    expect(memory.get("squareWebhookEvents", "evt-unknown")).toBeUndefined();
    expect(sent).toHaveLength(0);
    expect(warn.mock.calls.map((call) => call.join(" ")).join("\n")).toMatch(/no invoice matched/i);
    warn.mockRestore();
  });

  it("levels an invoice.payment_made and does not double-count the later payment.updated", async () => {
    seedPaidWorld({ squareOrderId: "sq-order-playtest", squareInvoiceId: "inv-square-1" });
    const made = {
      type: "invoice.payment_made",
      event_id: "evt-invoice-paid",
      data: {
        type: "invoice",
        id: "inv-square-1",
        object: {
          invoice: {
            id: "inv-square-1",
            order_id: "sq-order-playtest",
            status: "PAID",
            payment_requests: [
              { total_completed_amount_money: { amount: 100, currency: "USD" } },
            ],
          },
        },
      },
    };
    const first = await postEvent(made);
    expect(first.json).toMatchObject({ applied: true, unlocked: true });
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.amountPaid).toBe(1);

    const updated = paymentEvent({
      eventId: "evt-after-invoice",
      paymentId: "pay-after-invoice",
      amountCents: 100,
      invoiceId: "playtest-delivery-qa-invoice",
    });
    const second = await postEvent(updated);
    expect(second.json.duplicate).toBe(true);
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.amountPaid).toBe(1);
    expect(memory.get("invoices", "playtest-delivery-qa-invoice")?.squarePaymentId).toBe("pay-after-invoice");
    const history = memory.get("orders", "playtest-delivery-qa-order")?.history as unknown[];
    expect(history).toHaveLength(1);
  });
});
