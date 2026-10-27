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
    const api = {
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
              async set(data: Record<string, unknown>) {
                docs(name).set(id, { ...data });
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
      async runTransaction(fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        update: (ref: { update: (patch: Record<string, unknown>) => Promise<void> }, patch: Record<string, unknown>) => void;
        set: (ref: { set: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>) {
        const writes: Array<() => Promise<void>> = [];
        const tx = {
          get(ref: { get: () => Promise<unknown> }) {
            return ref.get();
          },
          update(ref: { update: (patch: Record<string, unknown>) => Promise<void> }, patch: Record<string, unknown>) {
            writes.push(() => ref.update(patch));
          },
          set(ref: { set: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) {
            writes.push(() => ref.set(data));
          },
        };
        const result = await fn(tx);
        for (const write of writes) await write();
        return result;
      },
    };
    return api;
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

const confirmEvent = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../services/apprenticeshipCalendar", () => ({
  confirmApprenticeshipEvent: confirmEvent,
}));
const resolveLate = vi.hoisted(() => vi.fn(async () => "confirmed"));
vi.mock("../services/apprenticeshipHolds", () => ({
  resolveLateApprenticeshipPayment: resolveLate,
}));

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
    expect(sent.idempotency_key).toBe("inv-sl-deposit");
    expect(sent.checkout_options.redirect_url).toBe(
      "https://deposit.test/senior-living?deposit=received&order=ORD+-+L+-+10001",
    );
    const invoice = store.collections.invoices.get("inv-sl") || {};
    expect(invoice.squareDepositCheckoutUrl).toBe("https://square.test/pay");
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

  it("charges the apprenticeship booking fee on the same Square deposit checkout", async () => {
    seed("invoices", "inv-ap", {
      status: "draft",
      payToken: TOKEN,
      invoiceNumber: "INV-2026-0003",
      clientEmail: "ada@example.com",
      clientName: "Ada",
      total: 77.1,
      amountDue: 77.1,
      amountPaid: 0,
      depositRequired: true,
      depositAmount: 25,
      depositPaid: 0,
      orderId: "order-ap",
      orderRequestId: "req-ap",
      orderNumber: "#042",
      source: "apprenticeship",
    });
    seed("orders", "order-ap", {
      source: "apprenticeship",
      total: 77.1,
      balanceDue: 77.1,
      orderNumber: "#042",
    });
    seed("orderRequests", "req-ap", { source: "apprenticeship", balanceDue: 77.1 });
    const response = await fetch(`${baseUrl}/api/payments/invoice/inv-ap/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(response.status).toBe(200);
    const squareCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("squareup.com"));
    const sent = JSON.parse(String(squareCall?.[1].body));
    expect(sent.quick_pay.price_money.amount).toBe(2500);
    expect(sent.quick_pay.name).toContain("booking fee");
    expect(sent.quick_pay.name).toContain("#042");
    expect(sent.checkout_options.redirect_url).toBe(
      "https://deposit.test/apprenticeship?booking=received&order=%23042",
    );
    expect((store.collections.invoices.get("inv-ap") || {}).status).toBe("draft");
  });

  it("returns /realestate-75 bookings to the /realestate-75 schedule section", async () => {
    seed("invoices", "inv-re75", {
      status: "draft",
      payToken: TOKEN,
      invoiceNumber: "INV-2026-0004",
      clientEmail: "ada@example.com",
      total: 77.1,
      amountDue: 77.1,
      amountPaid: 0,
      depositRequired: true,
      depositAmount: 25,
      depositPaid: 0,
      orderId: "order-re75",
      orderNumber: "#043",
      source: "apprenticeship",
      depositReturn: "realestate-75",
    });
    seed("orders", "order-re75", { source: "apprenticeship", total: 77.1, orderNumber: "#043" });
    const response = await fetch(`${baseUrl}/api/payments/invoice/inv-re75/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(response.status).toBe(200);
    const squareCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("squareup.com"));
    const sent = JSON.parse(String(squareCall?.[1].body));
    expect(sent.quick_pay.price_money.amount).toBe(2500);
    expect(sent.checkout_options.redirect_url).toBe(
      "https://deposit.test/realestate-75/schedule?booking=received&order=%23043",
    );
    expect((store.collections.invoices.get("inv-re75") || {}).status).toBe("draft");
  });

  it("returns the stored deposit link on a repeated click", async () => {
    const first = await fetch(`${baseUrl}/api/payments/invoice/inv-sl/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    const second = await fetch(`${baseUrl}/api/payments/invoice/inv-sl/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toMatchObject({ checkoutUrl: "https://square.test/pay", provider: "square" });
    expect(await second.json()).toMatchObject({ checkoutUrl: "https://square.test/pay", provider: "square" });
    const squareCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("squareup.com"));
    expect(squareCalls).toHaveLength(1);
    expect(JSON.parse(String(squareCalls[0][1].body)).idempotency_key).toBe("inv-sl-deposit");
  });

  it("refuses when the deposit is already recorded", async () => {
    seed("invoices", "inv-sl", {
      ...(store.collections.invoices.get("inv-sl") || {}),
      depositPaid: 128.5,
      depositPaidAt: "SERVER_TIME",
      squareDepositPaymentLinkId: "link-created",
      squareDepositOrderId: "sq-order-created",
      squareDepositCheckoutUrl: "https://square.test/pay",
    });
    const response = await fetch(`${baseUrl}/api/payments/invoice/inv-sl/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(response.status).toBe(409);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("squareup.com"))).toBe(false);
  });
});

function depositWebhook(payment: Record<string, unknown>) {
  const raw = JSON.stringify({ data: { object: { payment } } });
  return fetch(`${baseUrl}/api/payments/square-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-square-hmacsha256-signature": sign(raw),
    },
    body: raw,
  });
}

describe("Square webhook while deposit checkout is off", () => {
  it("still records a paid deposit link as a deposit with the balance due", async () => {
    delete process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;
    seed("invoices", "inv-sl", {
      ...(store.collections.invoices.get("inv-sl") || {}),
      squareDepositPaymentLinkId: "dep-link",
      squareDepositOrderId: "dep-order",
    });
    const response = await depositWebhook({
      id: "pay-dep-off",
      status: "COMPLETED",
      amount_money: { amount: 12850 },
      payment_link_id: "dep-link",
      order_id: "dep-order",
      note: "invoiceId:inv-sl",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, deposit: true });
    const invoice = store.collections.invoices.get("inv-sl") || {};
    expect(invoice.status).toBe("draft");
    expect(invoice.depositPaid).toBe(128.5);
    expect(invoice.depositPaidAt).toBe("SERVER_TIME");
    expect(invoice.amountDue).toBe(128.5);
    expect(invoice.amountPaid).toBe(128.5);
    expect((store.collections.orders.get("order-sl") || {}).balanceDue).toBe(128.5);
    process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = "true";
  });

  it("still marks a non-deposit Square payment through the full-payment path", async () => {
    delete process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;
    seed("invoices", "inv-full-off", {
      status: "sent",
      total: 250,
      amountDue: 250,
      amountPaid: 0,
      orderId: "order-full-off",
      clientId: "",
      clientName: "Ada",
      clientEmail: "",
      squarePaymentLinkId: "full-link",
    });
    seed("orders", "order-full-off", { source: "booking_form", balanceDue: 250 });
    const response = await depositWebhook({
      id: "pay-full-off",
      status: "COMPLETED",
      amount_money: { amount: 25000 },
      payment_link_id: "full-link",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deposit).toBeUndefined();
    expect((store.collections.invoices.get("inv-full-off") || {}).status).toBe("paid");
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
    expect(store.collections.transactions?.get("square-pay-dep")?.squarePaymentId).toBe("pay-dep");
  });

  it("records an apprenticeship booking fee through the same deposit webhook", async () => {
    seed("invoices", "inv-ap", {
      status: "draft",
      total: 77.1,
      amountDue: 77.1,
      amountPaid: 0,
      depositRequired: true,
      depositAmount: 25,
      depositPaid: 0,
      orderId: "order-ap",
      orderRequestId: "req-ap",
      orderNumber: "#042",
      source: "apprenticeship",
      squareDepositPaymentLinkId: "ap-link",
      squareDepositOrderId: "ap-order",
    });
    seed("orders", "order-ap", {
      source: "apprenticeship",
      total: 77.1,
      balanceDue: 77.1,
      status: "awaiting_deposit",
      orderNumber: "#042",
      calendarEventId: "evt-1",
      calendarId: "apprentice-calendar",
    });
    seed("orderRequests", "req-ap", { source: "apprenticeship", balanceDue: 77.1 });
    confirmEvent.mockClear();
    const response = await depositWebhook({
      id: "pay-ap",
      status: "COMPLETED",
      amount_money: { amount: 2500 },
      payment_link_id: "ap-link",
      order_id: "ap-order",
      note: "invoiceId:inv-ap",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, deposit: true });
    const invoice = store.collections.invoices.get("inv-ap") || {};
    expect(invoice.status).toBe("draft");
    expect(invoice.depositPaid).toBe(25);
    expect(invoice.amountDue).toBe(52.1);
    expect((store.collections.orders.get("order-ap") || {}).balanceDue).toBe(52.1);
    expect((store.collections.orders.get("order-ap") || {}).status).toBe("confirmed");
    expect((store.collections.orders.get("order-ap") || {}).depositStatus).toBe("paid");
    expect((store.collections.orderRequests.get("req-ap") || {}).balanceDue).toBe(52.1);
    expect((store.collections.orderRequests.get("req-ap") || {}).depositStatus).toBe("paid");
    expect(confirmEvent).toHaveBeenCalledWith({
      calendarId: "apprentice-calendar",
      eventId: "evt-1",
      orderNumber: "#042",
    });
  });

  it("does not apply a stored deposit link twice or count it as payment in full", async () => {
    seed("invoices", "inv-sl", {
      ...(store.collections.invoices.get("inv-sl") || {}),
      squareDepositPaymentLinkId: "dep-link",
      squareDepositOrderId: "dep-order",
    });
    const first = await depositWebhook({
      id: "pay-dep",
      status: "COMPLETED",
      amount_money: { amount: 12850 },
      payment_link_id: "dep-link",
      order_id: "dep-order",
      note: "invoiceId:inv-sl",
    });
    const replay = await depositWebhook({
      id: "pay-dep",
      status: "COMPLETED",
      amount_money: { amount: 12850 },
      payment_link_id: "dep-link",
      order_id: "dep-order",
      note: "invoiceId:inv-sl",
    });
    const another = await depositWebhook({
      id: "pay-dep-again",
      status: "COMPLETED",
      amount_money: { amount: 12850 },
      payment_link_id: "dep-link",
      order_id: "dep-order",
      note: "invoiceId:inv-sl",
    });
    expect(first.status).toBe(200);
    expect(await replay.json()).toMatchObject({ received: true, deposit: true });
    expect(await another.json()).toMatchObject({ received: true, deposit: true });
    const invoice = store.collections.invoices.get("inv-sl") || {};
    expect(invoice.status).toBe("draft");
    expect(invoice.depositPaid).toBe(128.5);
    expect(invoice.amountDue).toBe(128.5);
    expect(invoice.amountPaid).toBe(128.5);
    expect(invoice.payments).toHaveLength(1);
    expect(store.collections.transactions?.size).toBe(1);
    expect((store.collections.orders.get("order-sl") || {}).balanceDue).toBe(128.5);
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

describe("apprenticeship hold expired", () => {
  function seedExpired() {
    seed("invoices", "inv-exp", {
      status: "draft",
      payToken: TOKEN,
      total: 77.1,
      amountDue: 77.1,
      amountPaid: 0,
      depositRequired: true,
      depositAmount: 25,
      depositPaid: 0,
      orderId: "order-exp",
      orderNumber: "#044",
      source: "apprenticeship",
      holdExpired: true,
      squareDepositPaymentLinkId: "exp-link",
      squareDepositOrderId: "exp-order",
      squareDepositCheckoutUrl: "https://square.test/old",
    });
    seed("orders", "order-exp", {
      source: "apprenticeship",
      status: "expired_unpaid",
      total: 77.1,
      balanceDue: 77.1,
      orderNumber: "#044",
      calendarEventId: "evt-gone",
    });
  }

  it("will not hand out the $25 checkout after the hold expired", async () => {
    seedExpired();
    const response = await fetch(`${baseUrl}/api/payments/invoice/inv-exp/deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: TOKEN }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/hold expired/);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("squareup.com"))).toBe(false);
  });

  it("records a late $25 and hands the expired order to the re-confirm check", async () => {
    seedExpired();
    resolveLate.mockClear();
    confirmEvent.mockClear();
    const response = await depositWebhook({
      id: "pay-late",
      status: "COMPLETED",
      amount_money: { amount: 2500 },
      payment_link_id: "exp-link",
      order_id: "exp-order",
      note: "invoiceId:inv-exp",
    });
    expect(response.status).toBe(200);
    expect((store.collections.invoices.get("inv-exp") || {}).depositPaid).toBe(25);
    const order = store.collections.orders.get("order-exp") || {};
    expect(order.status).toBe("expired_unpaid");
    expect(resolveLate).toHaveBeenCalledWith("order-exp");
    expect(confirmEvent).not.toHaveBeenCalled();
  });
});
