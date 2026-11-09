/**
 * Pay Now opens a Square checkout for the discounted total.
 * Pay Later and a missing method do not. Pay Now does not send a new text.
 */
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setEmailDeliveryOverride } from "../services/email";
import { quotePayNow } from "../../shared/payNow";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));

const sendSMS = vi.hoisted(() => vi.fn(async () => ({ sid: "SM-test", status: "queued" })));
const squareCheckout = vi.hoisted(() => vi.fn(async () => ({
  payment: "square" as const,
  checkoutUrl: "https://square.example/pay-now",
  linkId: "link-1",
  squareOrderId: "sq-order-1",
})));
const titusCheckout = vi.hoisted(() => vi.fn(async () => ({
  ok: true as const,
  checkoutId: "titus-1",
  checkoutUrl: "https://titus.example/checkout",
  status: "requires-payment",
})));
const availability = vi.hoisted(() => vi.fn());
const createHold = vi.hoisted(() => vi.fn());

function docs(name: string) {
  if (!store.collections[name]) store.collections[name] = new Map();
  return store.collections[name];
}

vi.mock("../services/sms", () => ({
  sendSMS,
  SMS_TEMPLATES: {
    bookingConfirmation: (name: string, date: string, address: string, total: string) =>
      `Hi ${name} ${date} ${address} ${total}`,
    newBookingAlert: (address: string, date: string, services: string) =>
      `alert ${address} ${date} ${services}`,
  },
}));

vi.mock("../services/holidaySquareCheckout", () => ({
  createHolidaySquareCheckout: squareCheckout,
}));

vi.mock("../services/payAtClose", () => ({
  createTitusCheckout: titusCheckout,
}));

vi.mock("firebase-admin", () => {
  function ref(name: string, id: string) {
    return {
      id,
      async get() {
        const data = docs(name).get(id);
        return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref: this };
      },
      async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
        docs(name).set(id, options?.merge ? { ...(docs(name).get(id) || {}), ...data } : { ...data });
      },
      async update(patch: Record<string, unknown>) {
        docs(name).set(id, { ...(docs(name).get(id) || {}), ...patch });
      },
    };
  }
  function query(name: string) {
    return {
      where() { return query(name); },
      limit() { return query(name); },
      orderBy() { return query(name); },
      async get() {
        const entries = [...docs(name).entries()];
        return {
          empty: entries.length === 0,
          docs: entries.map(([id, data]) => ({
            id,
            data: () => ({ ...data }),
            ref: ref(name, id),
          })),
        };
      },
    };
  }
  function firestore() {
    return {
      collection(name: string) {
        return {
          doc(id?: string) {
            return ref(name, id || `auto-${++store.seq}`);
          },
          async add(data: Record<string, unknown>) {
            const id = `auto-${++store.seq}`;
            docs(name).set(id, { ...data });
            return ref(name, id);
          },
          where() { return query(name); },
          async get() { return query(name).get(); },
          count() {
            return { get: async () => ({ data: () => ({ count: docs(name).size }) }) };
          },
        };
      },
      async runTransaction(fn: (tx: {
        get: (target: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (target: { set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> }, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
      }) => Promise<unknown>) {
        const writes: Array<() => Promise<void>> = [];
        const tx = {
          get(target: { get: () => Promise<unknown> }) { return target.get(); },
          set(target: { set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> }, data: Record<string, unknown>, options?: { merge?: boolean }) {
            writes.push(() => target.set(data, options));
          },
        };
        const result = await fn(tx);
        for (const write of writes) await write();
        return result;
      },
    };
  }
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  return { default: { apps: [], firestore, auth: () => ({}) } };
});

vi.mock("../services/bookingAvailability", () => ({
  readBookingAvailability: availability,
  createBookingCalendarHold: createHold,
  deleteBookingCalendarHold: vi.fn(async () => undefined),
}));

vi.mock("../services/holidayCalendar", () => ({
  createHolidayCalendarEvent: vi.fn(),
  deleteHolidayCalendarEvent: vi.fn(async () => undefined),
}));

vi.mock("../services/bookingClient", () => ({
  attachBookingClient: vi.fn(async () => ({
    clientId: null,
    createdAccount: false,
    passwordSetupLink: null,
    skipReason: null,
  })),
  createRequestedAppointment: vi.fn(async () => undefined),
  sendFirebasePasswordEmail: vi.fn(async () => undefined),
}));

vi.mock("../services/bookingListing", () => ({
  ensureBookingListingForRequest: vi.fn(async () => null),
}));

import bookingsRouter, { resetPublicBookingRateLimit } from "./bookings";

const SLOT = {
  start: "2026-10-14T14:00:00.000Z",
  end: "2026-10-14T15:30:00.000Z",
  date: "2026-10-14",
  time: "9:00 AM",
  label: "Wed, Oct 14 · 9:00 AM",
  photographerId: "mike-luna",
  photographerName: "Mike Luna",
};

const ENV_KEYS = [
  "CLIENT_NOTIFY_LIVE",
  "CLIENT_COMMS_ZONE",
  "NOTIFY_TEST_ALLOWLIST",
  "ADMIN_PHONE",
  "BOOKING_NOTIFY_LIVE",
  "THANKFUL_RSVP_CONFIRM_LIVE",
  "INVOICE_PROCESSING_MODE",
  "PAY_AT_CLOSE_LIVE",
  "PAY_AT_CLOSE_API_KEY",
] as const;

const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/bookings", bookingsRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  setEmailDeliveryOverride(null);
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  resetPublicBookingRateLimit();
  store.collections = {};
  store.seq = 0;
  docs("counters").set("orderNumbers", { last: 41 });
  sendSMS.mockClear();
  squareCheckout.mockClear();
  titusCheckout.mockClear();
  availability.mockReset();
  availability.mockResolvedValue({
    live: true,
    slots: [SLOT],
    durationMinutes: 90,
    bufferMinutes: 30,
    driveMode: "buffer",
  });
  createHold.mockReset();
  createHold.mockResolvedValue({
    calendarId: "mike@iconicimagestx.com",
    eventId: "evt-1",
    htmlLink: "https://calendar.google.com/calendar/event?eid=evt-1",
  });
  for (const key of ENV_KEYS) delete process.env[key];
  setEmailDeliveryOverride(async () => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  setEmailDeliveryOverride(null);
  vi.restoreAllMocks();
});

async function postBooking(paymentMethod?: string) {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "281-555-0199",
      address: "26410 Oak Ridge Dr, Spring, TX 77380",
      selectedBasics: ["photos-18"],
      slotStart: SLOT.start,
      photographerId: "mike-luna",
      ...(paymentMethod ? { paymentMethod } : {}),
    }),
  });
  const body = await response.json();
  return { response, body };
}

function savedInvoice(): Record<string, unknown> {
  const invoices = docs("invoices");
  expect(invoices.size).toBe(1);
  return [...invoices.values()][0];
}

describe("booking payment checkout", () => {
  it("returns a checkoutUrl only for pay_now and pay_at_close", async () => {
    const payNow = await postBooking("pay_now");
    expect(payNow.response.status).toBe(201);
    expect(payNow.body.checkoutUrl).toBe("https://square.example/pay-now");
    expect(payNow.body.payment).toBe("pay_now");
    expect(sendSMS).not.toHaveBeenCalled();

    squareCheckout.mockClear();
    sendSMS.mockClear();
    const later = await postBooking("pay_later");
    expect(later.response.status).toBe(201);
    expect(later.body.checkoutUrl).toBeUndefined();
    expect(squareCheckout).not.toHaveBeenCalled();
    expect(titusCheckout).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();

    const missing = await postBooking();
    expect(missing.response.status).toBe(201);
    expect(missing.body.checkoutUrl).toBeUndefined();
    expect(squareCheckout).not.toHaveBeenCalled();

    process.env.PAY_AT_CLOSE_LIVE = "true";
    const close = await postBooking("pay_at_close");
    expect(close.response.status).toBe(201);
    expect(close.body.checkoutUrl).toBe("https://titus.example/checkout");
    expect(close.body.payment).toBe("pay_at_close");
    expect(squareCheckout).not.toHaveBeenCalled();
    expect(titusCheckout).toHaveBeenCalledTimes(1);
  });

  it("charges Square the discounted total, with processing on and off", async () => {
    const onQuote = quotePayNow({ packageCents: 13900, processingOn: true, processingPercent: 2.8 });
    const on = await postBooking("pay_now");
    expect(on.response.status).toBe(201);
    const onInvoice = savedInvoice();
    const onLines = onInvoice.lineItems as Array<{ id?: string; price?: number }>;
    expect(onLines.find((item) => item.id === "promo-pay-now")?.price).toBe(-5);
    expect(onInvoice.paymentMethod).toBe("pay_now");
    expect(onInvoice.total).toBe(onQuote.totalCents / 100);
    expect(squareCheckout).toHaveBeenCalledTimes(1);
    expect(squareCheckout.mock.calls[0][0].amount).toBe(onInvoice.total);
    expect(squareCheckout.mock.calls[0][0].amount).toBe(137.75);
    const order = [...docs("orderRequests").values()][0];
    expect(order.paymentMethod).toBe("pay_now");
    expect((order.lineItems as Array<{ id?: string; price?: number }>).find((item) => item.id === "promo-pay-now")?.price).toBe(-5);

    store.collections = {};
    store.seq = 0;
    docs("counters").set("orderNumbers", { last: 41 });
    squareCheckout.mockClear();
    process.env.INVOICE_PROCESSING_MODE = "off";
    const offQuote = quotePayNow({ packageCents: 13900, processingOn: false, processingPercent: 2.8 });
    const off = await postBooking("pay_now");
    expect(off.response.status).toBe(201);
    const offInvoice = savedInvoice();
    expect(offInvoice.total).toBe(offQuote.totalCents / 100);
    expect(offInvoice.total).toBe(134);
    expect(squareCheckout.mock.calls[0][0].amount).toBe(134);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("does not add a client email or text inside the Pay Now checkout", () => {
    const source = readFileSync(new URL("./bookings.ts", import.meta.url), "utf8");
    const start = source.indexOf("let payNowCheckoutUrl");
    const end = source.indexOf("let payAtCloseCheckoutUrl", start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("createHolidaySquareCheckout");
    expect(block).toContain('logLabel: "Pay Now"');
    expect(block).not.toContain("sendEmail");
    expect(block).not.toContain("sendSMS");
    expect(block).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(block).not.toContain("BOOKING_NOTIFY_LIVE");
    expect(block).not.toContain("THANKFUL_RSVP_CONFIRM_LIVE");
  });
});
