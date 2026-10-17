import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { buildVercelRedirects } from "../../shared/spaRouting";
import {
  THANKFUL_BUFFER_MINUTES,
  THANKFUL_SLOT_MINUTES,
  THANKFUL_RSVP_CLOSED_ERROR,
  openThankfulSlots,
  thankfulZonedTimeToUtc,
} from "../../shared/thankfulEvent";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));

const listBusy = vi.hoisted(() => vi.fn());
const createHold = vi.hoisted(() => vi.fn());
const deleteHold = vi.hoisted(() => vi.fn(async () => undefined));

function docs(name: string) {
  if (!store.collections[name]) store.collections[name] = new Map();
  return store.collections[name];
}

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
      where() {
        return query(name);
      },
      limit() {
        return query(name);
      },
      orderBy() {
        return query(name);
      },
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
          where() {
            return query(name);
          },
          async get() {
            return query(name).get();
          },
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
          get(target: { get: () => Promise<unknown> }) {
            return target.get();
          },
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
  return { default: { apps: [{ name: "thankful-test" }], firestore } };
});

vi.mock("../services/thankfulCalendar", () => ({
  listThankfulBusy: listBusy,
  createThankfulCalendarHold: createHold,
  deleteThankfulCalendarHold: deleteHold,
}));

import thankfulRouter, { resetThankfulRateLimit } from "./thankful";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const BUSY = [{
  start: thankfulZonedTimeToUtc(2026, 11, 14, 12, 0).toISOString(),
  end: thankfulZonedTimeToUtc(2026, 11, 14, 12, 15).toISOString(),
}];

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const app = express();
  app.use(express.json());
  app.use("/api/thankful", thankfulRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  vi.useRealTimers();
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  store.collections = {};
  store.seq = 0;
  docs("counters").set("orderNumbers", { last: 41 });
  resetThankfulRateLimit();
  listBusy.mockReset();
  createHold.mockReset();
  deleteHold.mockClear();
  listBusy.mockResolvedValue({ ok: true, busy: BUSY });
  createHold.mockResolvedValue({
    calendarId: "photos@iconicimagestx.com",
    eventId: "evt-thankful",
    htmlLink: "https://calendar.google.com/calendar/event?eid=evt-thankful",
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function savedOrder(): Record<string, unknown> {
  const orders = docs("orderRequests");
  expect(orders.size).toBe(1);
  return [...orders.values()][0];
}

function rsvpBody(slotStart: string) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "281-555-0199",
    partySize: 3,
    menuVote: "menu-1",
    santa: false,
    notes: "Bringing a cat",
    slotStart,
  };
}

describe("thankful slots API", () => {
  it("returns 15-minute slots with a 5-minute buffer around existing events", async () => {
    const response = await fetch(`${baseUrl}/api/thankful/slots`);
    const body = await response.json();
    const expected = openThankfulSlots({ now: NOW, busy: BUSY });
    expect(response.status).toBe(200);
    expect(body.live).toBe(true);
    expect(body.closed).toBe(false);
    expect(body.closesLabel).toBe("Monday, Nov 9, 2026");
    expect(body.socialOpen).toBe(true);
    expect(body.durationMinutes).toBe(THANKFUL_SLOT_MINUTES);
    expect(body.bufferMinutes).toBe(THANKFUL_BUFFER_MINUTES);
    expect(body.slots).toEqual(expected);
    expect(body.slots.map((slot: { time: string }) => slot.time)).not.toContain("12:00 PM");
    expect(body.slots.map((slot: { time: string }) => slot.time)).not.toContain("11:45 AM");
    expect(body.slots.map((slot: { time: string }) => slot.time)).toContain("11:30 AM");
    expect(body.slots.every((slot: { start: string; end: string }) => Date.parse(slot.end) - Date.parse(slot.start) === 15 * 60 * 1000)).toBe(true);
    const packed = JSON.stringify(body);
    expect(packed).not.toContain("vercel.app");
    expect(packed.toLowerCase()).not.toContain("cadi@");
  });
});

describe("thankful RSVP", () => {
  it("saves party size, menu vote, and Santa", async () => {
    const slot = openThankfulSlots({ now: NOW, busy: BUSY })[0];
    const response = await fetch(`${baseUrl}/api/thankful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rsvpBody(slot.start)),
    });
    const body = await response.json();
    const saved = savedOrder();
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.orderNumber).toBe("#042");
    expect(saved.partySize).toBe(3);
    expect(saved.menuVote).toBe("menu-1");
    expect(saved.santa).toBe(false);
    expect(saved.notes).toBe("Bringing a cat");
    expect(saved.calendarHold).toBe("held");
    expect(saved.officeFlag).toBeNull();
    expect(saved.source).toBe("thankful_event");
    expect(docs("thankfulMenuVotes").get("ada@example.com")?.menuVote).toBe("menu-1");
    expect(createHold).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain("vercel.app");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("cadi@");
  });

  it("saves the RSVP when the calendar hold throws", async () => {
    const slot = openThankfulSlots({ now: NOW, busy: BUSY })[0];
    const message = `Calendar insert failed ${"x".repeat(400)}`;
    const err = new Error(message);
    const secret = "hold-secret-DO-NOT-STORE";
    Object.assign(err, { secret, config: { private_key: secret } });
    createHold.mockRejectedValue(err);

    const response = await fetch(`${baseUrl}/api/thankful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rsvpBody(slot.start), partySize: 2, menuVote: "menu-3", santa: true }),
    });
    const body = await response.json();
    const saved = savedOrder();
    const stored = JSON.stringify(saved);

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(saved.partySize).toBe(2);
    expect(saved.menuVote).toBe("menu-3");
    expect(saved.santa).toBe(true);
    expect(saved.calendarHold).toBe("failed");
    expect(saved.officeFlag).toBe("calendar_hold_failed");
    expect(saved.calendarHoldError).toBe(message.slice(0, 300));
    expect(saved.officeNote).toContain(slot.label);
    expect(saved.officeNote).toContain("Add it to the calendar manually.");
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain("private_key");
    expect(console.error).toHaveBeenCalledWith("[Thankful] Calendar hold failed:", err);
  });

  it("saves the RSVP when the calendar returns no event id", async () => {
    const slot = openThankfulSlots({ now: NOW, busy: BUSY })[0];
    createHold.mockResolvedValue({
      calendarId: "photos@iconicimagestx.com",
      eventId: null,
      htmlLink: null,
    });
    const response = await fetch(`${baseUrl}/api/thankful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rsvpBody(slot.start)),
    });
    const saved = savedOrder();
    expect(response.status).toBe(201);
    expect(saved.calendarHold).toBe("failed");
    expect(saved.officeFlag).toBe("calendar_hold_failed");
    expect(saved.calendarHoldError).toBe("Calendar returned no event id.");
    expect(saved.partySize).toBe(3);
    expect(saved.menuVote).toBe("menu-1");
    expect(saved.santa).toBe(false);
  });

  it("rejects a second menu vote from the same email", async () => {
    const slot = openThankfulSlots({ now: NOW, busy: BUSY })[0];
    const first = await fetch(`${baseUrl}/api/thankful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rsvpBody(slot.start)),
    });
    expect(first.status).toBe(201);
    const second = await fetch(`${baseUrl}/api/thankful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rsvpBody(slot.start), email: "Ada@Example.com", menuVote: "menu-2" }),
    });
    const body = await second.json();
    expect(second.status).toBe(409);
    expect(body.alreadyVoted).toBe(true);
    expect(body.error).toContain("already voted");
    expect(docs("orderRequests").size).toBe(1);
    expect(docs("thankfulMenuVotes").get("ada@example.com")?.menuVote).toBe("menu-1");
    expect(createHold).toHaveBeenCalledOnce();

    const other = await fetch(`${baseUrl}/api/thankful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rsvpBody(slot.start), email: "bryce@example.com", menuVote: "menu-3" }),
    });
    expect(other.status).toBe(201);
    expect(docs("orderRequests").size).toBe(2);
    expect(createHold).toHaveBeenCalledTimes(2);
  });

  it("rejects an RSVP after Monday, Nov 9, 2026", async () => {
    vi.setSystemTime(thankfulZonedTimeToUtc(2026, 11, 10, 0, 1));
    const slot = openThankfulSlots({ now: NOW, busy: [] })[0];
    const response = await fetch(`${baseUrl}/api/thankful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rsvpBody(slot.start)),
    });
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe(THANKFUL_RSVP_CLOSED_ERROR);
    expect(docs("orderRequests").size).toBe(0);
    expect(createHold).not.toHaveBeenCalled();
    vi.setSystemTime(NOW);
  });

  it("does not send client mail", () => {
    const source = readFileSync(new URL("./thankful.ts", import.meta.url), "utf8");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("sendSMS");
    expect(source).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(source).not.toContain("booking_received");
    const calendar = readFileSync(new URL("../services/thankfulCalendar.ts", import.meta.url), "utf8");
    expect(calendar).toContain('export const THANKFUL_CALENDAR_ID = "photos@iconicimagestx.com"');
    const page = readFileSync(new URL("../../client/pages/Thankful.tsx", import.meta.url), "utf8");
    expect(page).not.toContain("gserviceaccount.com");
    const app = readFileSync(new URL("../../client/App.tsx", import.meta.url), "utf8");
    expect(app).toContain('path="/thankful"');
    expect(app).toContain('path="/events/thankful-for-you-always"');
    expect(app).toContain('path="/holiday-event"');
    expect(app).toContain('<Navigate to="/thankful" replace />');
    expect(source).not.toContain("notifyOffice");
    expect(source).not.toContain("sendMail");
    const redirects = buildVercelRedirects();
    expect(redirects).toEqual(expect.arrayContaining([
      { source: "/events/thankful-for-you-always", destination: "/thankful", permanent: false },
      { source: "/events/thankful-for-you-always/", destination: "/thankful", permanent: false },
      { source: "/holiday-event", destination: "/thankful", permanent: false },
      { source: "/holiday-event/", destination: "/thankful", permanent: false },
    ]));
  });
});

describe("thankful social checkout", () => {
  it("saves a Square invoice at the pre-event price plus 2.8%", async () => {
    const response = await fetch(`${baseUrl}/api/thankful/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ada Lovelace",
        email: "Ada@Example.com",
        phone: "281-555-0199",
        packageId: "baseline",
        termId: "12",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.orderNumber).toBe("#042");
    expect(body.total).toBe(2775.6);
    expect(body.payToken).toEqual(expect.any(String));
    expect(body.invoiceId).toEqual(expect.any(String));
    expect(body.checkoutReady).toBe(false);
    const invoices = docs("invoices");
    expect(invoices.size).toBe(1);
    const invoice = [...invoices.values()][0];
    expect(invoice.subtotal).toBe(2700);
    expect(invoice.processing).toBe(75.6);
    expect(invoice.total).toBe(2775.6);
    expect(invoice.amountDue).toBe(2775.6);
    expect(invoice.paymentProvider).toBe("square");
    expect(invoice.depositRequired).toBe(false);
    expect(invoice.source).toBe("thankful_social");
    expect(invoice.clientEmail).toBe("ada@example.com");
    expect(invoice.packageName).toBe("The Baseline");
    expect(invoice.socialTerm).toBe("12");
    expect(JSON.stringify(body)).not.toContain("vercel.app");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("cadi@");
  });

  it("rejects checkout at the start of Nov 14, 2026", async () => {
    vi.setSystemTime(thankfulZonedTimeToUtc(2026, 11, 14, 0, 0));
    const response = await fetch(`${baseUrl}/api/thankful/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "281-555-0199",
        packageId: "professional-suite",
        termId: "3",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toContain("Nov 14");
    expect(docs("invoices").size).toBe(0);
    vi.setSystemTime(NOW);
  });
});
