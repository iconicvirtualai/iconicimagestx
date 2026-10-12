import type { Server } from "node:http";
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

/**
 * Senior-living deposit checkout is additive.
 * A normal invoice checkout still marks the invoice sent.
 * A deposit link leaves the invoice as a draft and records only the deposit.
 */

const TOKEN = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
}));

function docs(name: string) {
  if (!store.collections[name]) store.collections[name] = new Map();
  return store.collections[name];
}

function seed(collection: string, id: string, data: Record<string, unknown>) {
  docs(collection).set(id, { ...data });
}

vi.mock("firebase-admin", () => {
  function firestore() {
    return {
      collection(name: string) {
        return {
          doc(id: string) {
            const ref = {
              id,
              async get() {
                const data = docs(name).get(id);
                return {
                  id,
                  exists: data !== undefined,
                  data: () => (data ? { ...data } : undefined),
                  ref,
                };
              },
              async update(patch: Record<string, unknown>) {
                const current = docs(name).get(id) || {};
                docs(name).set(id, { ...current, ...patch });
              },
            };
            return ref;
          },
          async add(data: Record<string, unknown>) {
            const id = `tx-${docs(name).size + 1}`;
            docs(name).set(id, { ...data });
            return { id };
          },
          where(field: string, _op: string, value: unknown) {
            const run = async () => {
              const matches = [...docs(name).entries()]
                .filter(([, data]) => data[field] === value)
                .map(([id, data]) => ({ id, exists: true, data: () => ({ ...data }) }));
              return { empty: matches.length === 0, docs: matches };
            };
            return { limit: () => ({ get: run }), get: run };
          },
        };
      },
    };
  }
  firestore.FieldValue = {
    serverTimestamp: () => "SERVER_TIME",
    increment: (amount: number) => ({ increment: amount }),
  };
  const admin = {
    apps: [{ name: "deposit-test" }],
    firestore,
    auth: () => ({
      async verifyIdToken() {
        throw new Error("invalid");
      },
    }),
  };
  return { default: admin };
});

import paymentsRouter from "./payments";

const envBackup = {
  SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID,
  SQUARE_WEBHOOK_SIGNATURE_KEY: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
  APP_URL: process.env.APP_URL,
  SENIOR_DEPOSIT_CHECKOUT_LIVE: process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE,
};

let server: Server;
let baseUrl = "";
const fetchMock = vi.fn();
const realFetch = globalThis.fetch.bind(globalThis);

beforeAll(async () => {
  process.env.SQUARE_ACCESS_TOKEN = "sq-test";
  process.env.SQUARE_LOCATION_ID = "loc-test";
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "whsec-test";
  process.env.APP_URL = "https://deposit.test";
  process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = "true";
  fetchMock.mockImplementation((url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (target.includes("squareup.com")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          payment_link: {
            id: "link-created",
            url: "https://square.test/pay",
            order_id: "sq-order-created",
          },
        }),
      });
    }
    return realFetch(url as string, init);
  });
  vi.stubGlobal("fetch", fetchMock);
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
  process.env.SQUARE_ACCESS_TOKEN = envBackup.SQUARE_ACCESS_TOKEN;
  process.env.SQUARE_LOCATION_ID = envBackup.SQUARE_LOCATION_ID;
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = envBackup.SQUARE_WEBHOOK_SIGNATURE_KEY;
  process.env.APP_URL = envBackup.APP_URL;
  if (envBackup.SENIOR_DEPOSIT_CHECKOUT_LIVE === undefined) delete process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;
  else process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = envBackup.SENIOR_DEPOSIT_CHECKOUT_LIVE;
  vi.unstubAllGlobals();
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  store.collections = {};
  fetchMock.mockClear();
  seed("invoices", "inv-book", {
    status: "draft",
    payToken: TOKEN,
    invoiceNumber: "INV-2026-0001",
    clientEmail: "ada@example.com",
    clientName: "Ada",
    total: 250,
    amountDue: 250,
    amountPaid: 0,
    orderId: "order-book",
    source: "booking_form",
  });
  seed("orders", "order-book", { source: "booking_form", total: 250, balanceDue: 250 });
  seed("invoices", "inv-sl", {
    status: "draft",
    payToken: TOKEN,
    invoiceNumber: "INV-2026-0002",
    clientEmail: "ada@example.com",
    clientName: "Ada",
    total: 257,
    amountDue: 257,
    amountPaid: 0,
    depositRequired: true,
    depositAmount: 128.5,
    depositPaid: 0,
    orderId: "order-sl",
    orderRequestId: "req-sl",
    orderNumber: "ORD - L - 10001",
    source: "senior-living",
  });
  seed("orders", "order-sl", {
    source: "senior-living",
    total: 257,
    balanceDue: 257,
    orderNumber: "ORD - L - 10001",
  });
  seed("orderRequests", "req-sl", { source: "senior-living", balanceDue: 257 });
});

function sign(body: string) {
  return crypto
    .createHmac("sha256", "whsec-test")
    .update(`https://deposit.test/api/payments/square-webhook${body}`)
    .digest("base64");
}

describe("deposit checkout while the flag is off", () => {
  it("returns 404 and does not start Square", async () => {
    delete process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;
    const response = await fetch(`${baseUrl}/api/payments/invoice/inv-sl/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(response.status).toBe(404);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("squareup.com"))).toBe(false);
    expect((store.collections.invoices.get("inv-sl") || {}).status).toBe("draft");
    process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = "true";
  });
});

describe("deposit checkout", () => {
  it("charges only the deposit and leaves a senior living invoice as a draft", async () => {
    const response = await fetch(`${baseUrl}/api/payments/invoice/inv-sl/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkoutUrl).toBe("https://square.test/pay");
    const squareCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("squareup.com"));
    const sent = JSON.parse(String(squareCall?.[1].body));
    expect(sent.quick_pay.price_money.amount).toBe(12850);
    expect(sent.checkout_options.redirect_url).toBe(
      "https://deposit.test/senior-living?deposit=received&order=ORD+-+L+-+10001",
    );
    const invoice = store.collections.invoices.get("inv-sl") || {};
    expect(invoice.status).toBe("draft");
    expect(invoice.sentAt).toBeUndefined();
    expect(invoice.squareInvoiceId).toBeUndefined();
    expect(invoice.squarePaymentLinkId).toBeUndefined();
    expect(invoice.squareDepositPaymentLinkId).toBe("link-created");
    expect(invoice.squareDepositOrderId).toBe("sq-order-created");
  });

  it("refuses a non-senior-living invoice and still sends a normal checkout", async () => {
    const refused = await fetch(`${baseUrl}/api/payments/invoice/inv-book/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(refused.status).toBe(403);
    expect((store.collections.invoices.get("inv-book") || {}).status).toBe("draft");

    const checkout = await fetch(`${baseUrl}/api/payments/invoice/inv-book/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(checkout.status).toBe(200);
    const invoice = store.collections.invoices.get("inv-book") || {};
    expect(invoice.status).toBe("sent");
    expect(invoice.squarePaymentLinkId).toBe("link-created");
    const squareCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("squareup.com"));
    const sent = JSON.parse(String(squareCall?.[1].body));
    expect(sent.quick_pay.price_money.amount).toBe(25000);
  });
});

describe("Square webhook while deposit checkout is off", () => {
  it("leaves the full-payment path in place", async () => {
    delete process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;
    seed("invoices", "inv-sl", {
      ...(store.collections.invoices.get("inv-sl") || {}),
      clientEmail: "",
      squareDepositPaymentLinkId: "dep-link",
      squareDepositOrderId: "dep-order",
    });
    const raw = JSON.stringify({
      data: {
        object: {
          payment: {
            id: "pay-dep-off",
            status: "COMPLETED",
            amount_money: { amount: 12850 },
            payment_link_id: "dep-link",
            order_id: "dep-order",
            note: "invoiceId:inv-sl",
          },
        },
      },
    });
    const response = await fetch(`${baseUrl}/api/payments/square-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-square-hmacsha256-signature": sign(raw),
      },
      body: raw,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deposit).toBeUndefined();
    const invoice = store.collections.invoices.get("inv-sl") || {};
    expect(invoice.status).toBe("partial");
    expect(invoice.depositPaidAt).toBeUndefined();
    expect(invoice.amountDue).toBe(128.5);
    process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = "true";
  });
});

describe("Square webhook deposit payment", () => {
  it("records the deposit, keeps the invoice draft, and sets the remaining balance", async () => {
    seed("invoices", "inv-sl", {
      ...(store.collections.invoices.get("inv-sl") || {}),
      squareDepositPaymentLinkId: "dep-link",
      squareDepositOrderId: "dep-order",
    });
    const raw = JSON.stringify({
      data: {
        object: {
          payment: {
            id: "pay-dep",
            status: "COMPLETED",
            amount_money: { amount: 12850 },
            payment_link_id: "dep-link",
            order_id: "dep-order",
            note: "invoiceId:inv-sl",
          },
        },
      },
    });
    const response = await fetch(`${baseUrl}/api/payments/square-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-square-hmacsha256-signature": sign(raw),
      },
      body: raw,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, deposit: true });
    const invoice = store.collections.invoices.get("inv-sl") || {};
    expect(invoice.status).toBe("draft");
    expect(invoice.sentAt).toBeUndefined();
    expect(invoice.depositPaid).toBe(128.5);
    expect(invoice.depositPaidAt).toBe("SERVER_TIME");
    expect(invoice.amountDue).toBe(128.5);
    expect(invoice.amountPaid).toBe(128.5);
    expect(invoice.payments).toEqual([
      expect.objectContaining({ type: "deposit", amount: 128.5, squarePaymentId: "pay-dep" }),
    ]);
    expect((store.collections.orders.get("order-sl") || {}).balanceDue).toBe(128.5);
    expect((store.collections.orderRequests.get("req-sl") || {}).balanceDue).toBe(128.5);
  });

  it("still marks a full Square payment paid", async () => {
    seed("invoices", "inv-full", {
      status: "sent",
      total: 250,
      amountDue: 250,
      amountPaid: 0,
      orderId: "order-full",
      clientId: "",
      clientName: "Ada",
      squarePaymentLinkId: "full-link",
    });
    seed("orders", "order-full", { source: "booking_form", balanceDue: 250 });
    const raw = JSON.stringify({
      data: {
        object: {
          payment: {
            id: "pay-full",
            status: "COMPLETED",
            amount_money: { amount: 25000 },
            payment_link_id: "full-link",
          },
        },
      },
    });
    const response = await fetch(`${baseUrl}/api/payments/square-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-square-hmacsha256-signature": sign(raw),
      },
      body: raw,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deposit).toBeUndefined();
    const invoice = store.collections.invoices.get("inv-full") || {};
    expect(invoice.status).toBe("paid");
    expect(invoice.amountDue).toBe(0);
  });
});
