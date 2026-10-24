import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { APPRENTICESHIP_CALENDAR_FALLBACK } from "../../shared/apprenticeship";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));

const availability = vi.hoisted(() => vi.fn());
const createEvent = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
const lazyRelease = vi.hoisted(() => vi.fn(async () => undefined));
const cronRelease = vi.hoisted(() => vi.fn(async () => ({ checked: 1, released: 1, eventsDeleted: 1, eventErrors: 0 })));

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
      async set(data: Record<string, unknown>) {
        docs(name).set(id, { ...data });
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
      async get() {
        return {
          docs: [...docs(name).entries()].map(([id, data]) => ({
            id,
            data: () => ({ ...data }),
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
        set: (target: { set: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) => void;
        update: (target: { update: (patch: Record<string, unknown>) => Promise<void> }, patch: Record<string, unknown>) => void;
      }) => Promise<unknown>) {
        const writes: Array<() => Promise<void>> = [];
        const tx = {
          get(target: { get: () => Promise<unknown> }) {
            return target.get();
          },
          set(target: { set: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) {
            writes.push(() => target.set(data));
          },
          update(target: { update: (patch: Record<string, unknown>) => Promise<void> }, patch: Record<string, unknown>) {
            writes.push(() => target.update(patch));
          },
        };
        const result = await fn(tx);
        for (const write of writes) await write();
        return result;
      },
    };
  }
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  return { default: { apps: [{ name: "apprenticeship-test" }], firestore } };
});

vi.mock("../services/apprenticeshipCalendar", () => ({
  readApprenticeshipAvailability: availability,
  createApprenticeshipEvent: createEvent,
}));

vi.mock("../services/apprenticeshipHolds", () => ({
  maybeReleaseExpiredApprenticeshipHolds: lazyRelease,
  releaseExpiredApprenticeshipHolds: cronRelease,
}));

vi.mock("../services/officeOrderNotify", () => ({
  notifyOfficeOfOrder: notify,
}));

vi.mock("../middleware/auth", () => ({
  requireStaff: (req: { headers: { authorization?: string } }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    if (req.headers.authorization !== "Bearer staff") {
      return res.status(401).json({ error: "No authentication token provided." });
    }
    next();
  },
}));

import apprenticeshipRouter, { resetApprenticeshipRateLimit } from "./apprenticeship";

const SLOT = {
  start: "2026-10-14T14:00:00.000Z",
  end: "2026-10-14T14:20:00.000Z",
  date: "2026-10-14",
  time: "9:00 AM",
  label: "Wed, Oct 14 · 9:00 AM",
};

let server: Server;
let baseUrl = "";

const flagBackup = process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;

beforeAll(async () => {
  process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = "true";
  const app = express();
  app.use(express.json());
  app.use("/api/apprenticeship", apprenticeshipRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (flagBackup === undefined) delete process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;
  else process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = flagBackup;
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE = "true";
  store.collections = {};
  store.seq = 0;
  resetApprenticeshipRateLimit();
  notify.mockClear();
  lazyRelease.mockClear();
  cronRelease.mockClear();
  createEvent.mockClear();
  availability.mockClear();
  docs("counters").set("orderNumbers", { last: 41 });
  availability.mockResolvedValue({
    available: true,
    slots: [SLOT],
    durationMinutes: 20,
    calendarId: "steven@iconicimagestx.com",
    serviceAccountEmail: "firebase@project.iam.gserviceaccount.com",
    missingCredentials: false,
    setupNote: null,
  });
  createEvent.mockResolvedValue({
    calendarId: "steven@iconicimagestx.com",
    eventId: "evt-1",
    htmlLink: "https://calendar.google.com/event",
  });
});

const booking = {
  packageId: "apprentice-25",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "281-555-0199",
  address: "100 Oak St, Spring, TX 77380",
  slotStart: SLOT.start,
};

describe("apprenticeship slots", () => {
  it("returns open slots and hides the admin setup note", async () => {
    const response = await fetch(`${baseUrl}/api/apprenticeship/slots?package=apprentice-25`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots).toEqual([SLOT]);
    expect(body.fallback).toBeNull();
    expect(body.durationMinutes).toBe(20);
    expect(JSON.stringify(body)).not.toContain("setupNote");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("not configured");
    expect(JSON.stringify(body)).not.toContain("serviceAccountEmail");
  });

  it("shows a public fallback when Steven's calendar cannot be read", async () => {
    availability.mockResolvedValue({
      available: false,
      slots: [],
      durationMinutes: 20,
      calendarId: "steven@iconicimagestx.com",
      serviceAccountEmail: "firebase@project.iam.gserviceaccount.com",
      missingCredentials: false,
      setupNote: "Steven needs to share steven@iconicimagestx.com with firebase@project.iam.gserviceaccount.com and allow Make changes to events, or set up domain-wide delegation.",
    });
    const response = await fetch(`${baseUrl}/api/apprenticeship/slots?package=apprentice-50`);
    const body = await response.json();
    expect(body.available).toBe(false);
    expect(body.slots).toEqual([]);
    expect(body.fallback).toBe(APPRENTICESHIP_CALENDAR_FALLBACK);
    expect(JSON.stringify(body)).not.toContain("domain-wide");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("not configured");
    expect(JSON.stringify(body)).not.toContain("firebase@");
  });

  it("gives the setup note only to staff", async () => {
    availability.mockResolvedValue({
      available: false,
      slots: [],
      durationMinutes: 20,
      calendarId: "steven@iconicimagestx.com",
      serviceAccountEmail: "firebase@project.iam.gserviceaccount.com",
      missingCredentials: false,
      setupNote: "Steven needs to share steven@iconicimagestx.com or set up domain-wide delegation.",
    });
    const anonymous = await fetch(`${baseUrl}/api/apprenticeship/setup`);
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(await anonymous.json())).not.toContain("domain-wide");

    const staff = await fetch(`${baseUrl}/api/apprenticeship/setup`, {
      headers: { Authorization: "Bearer staff" },
    });
    expect(staff.status).toBe(200);
    const body = await staff.json();
    expect(body.setupNote).toMatch(/domain-wide delegation/);
    expect(body.serviceAccountEmail).toBe("firebase@project.iam.gserviceaccount.com");
    expect(body.calendarId).toBe("steven@iconicimagestx.com");
  });
});

describe("apprenticeship order", () => {
  it("saves a #NNN order and holds the slot on Steven's calendar", async () => {
    const response = await fetch(`${baseUrl}/api/apprenticeship/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(booking),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.orderNumber).toBe("#042");
    expect(body.depositAmount).toBe(25);
    expect(body.total).toBe(77.1);
    expect(body.balanceDue).toBe(52.1);
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      orderNumber: "#042",
      slot: SLOT,
      clientEmail: "ada@example.com",
    }));
    const requests = [...docs("orderRequests").values()];
    const orders = [...docs("orders").values()];
    const invoices = [...docs("invoices").values()];
    expect(requests[0]).toMatchObject({
      orderNumber: "#042",
      source: "apprenticeship",
      status: "new",
      depositAmount: 25,
      processing: 2.1,
      total: 77.1,
      calendarEventId: "evt-1",
    });
    expect(orders[0]).toMatchObject({
      orderNumber: "#042",
      source: "apprenticeship",
      status: "awaiting_deposit",
      depositStatus: "awaiting",
      depositAmount: 25,
    });
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ hold: true }));
    expect(body.status).toBe("awaiting_deposit");
    expect(body.checkoutReady).toBe(true);
    expect(invoices[0]).toMatchObject({
      orderNumber: "#042",
      status: "draft",
      depositRequired: true,
      depositAmount: 25,
      paymentProvider: "square",
      processing: 2.1,
    });
    expect(notify).toHaveBeenCalled();
    expect(JSON.stringify(body).toLowerCase()).not.toContain("not configured");
  });

  it("does not invent a slot when the calendar cannot be reached", async () => {
    availability.mockResolvedValue({
      available: false,
      slots: [],
      durationMinutes: 20,
      calendarId: "steven@iconicimagestx.com",
      serviceAccountEmail: null,
      missingCredentials: true,
      setupNote: "Set FIREBASE_SERVICE_ACCOUNT.",
    });
    const held = await fetch(`${baseUrl}/api/apprenticeship/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(booking),
    });
    expect(held.status).toBe(503);
    expect(await held.json()).toEqual({ error: APPRENTICESHIP_CALENDAR_FALLBACK });
    expect(docs("orders").size).toBe(0);

    const requested = await fetch(`${baseUrl}/api/apprenticeship/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...booking, slotStart: "" }),
    });
    expect(requested.status).toBe(201);
    expect(createEvent).not.toHaveBeenCalled();
    expect([...docs("orderRequests").values()][0].orderNumber).toBe("#042");
  });

  it("refuses to save a booking when the $25 booking fee cannot be collected online", async () => {
    delete process.env.SENIOR_DEPOSIT_CHECKOUT_LIVE;
    const response = await fetch(`${baseUrl}/api/apprenticeship/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(booking),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/\$25 booking fee/);
    expect(docs("orders").size).toBe(0);
    expect(docs("invoices").size).toBe(0);
    expect(createEvent).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("tags /realestate-75 orders with its lead source, notes, and Square return page", async () => {
    const response = await fetch(`${baseUrl}/api/apprenticeship/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...booking,
        packageId: "apprentice-50",
        name: "",
        firstName: "Ada",
        lastName: "Lovelace",
        returnPage: "realestate-75",
        gclid: "abc_123-XYZ",
        details: "Brokerage: QA Realty\nHome: Vacant\nApprox sq ft: 1800",
      }),
    });
    expect(response.status).toBe(201);
    const request = [...docs("orderRequests").values()][0];
    const order = [...docs("orders").values()][0];
    const invoice = [...docs("invoices").values()][0];
    expect(request.leadSource).toBe("Real Estate $75 apprentice (Google Ads)");
    expect(request.gclid).toBe("abc_123-XYZ");
    expect(String(request.notes)).toContain("Brokerage: QA Realty");
    expect(String(request.notes)).toContain("Not confirmed until the $25 booking fee is paid.");
    expect(order.status).toBe("awaiting_deposit");
    expect(invoice.depositReturn).toBe("realestate-75");
  });

  it("ignores an unknown return page and a junk gclid", async () => {
    await fetch(`${baseUrl}/api/apprenticeship/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...booking, returnPage: "https://evil.example", gclid: "<script>" }),
    });
    const request = [...docs("orderRequests").values()][0];
    const invoice = [...docs("invoices").values()][0];
    expect(invoice.depositReturn).toBe("apprenticeship");
    expect(request.leadSource).toBe("Apprenticeship page");
    expect(request.gclid).toBeUndefined();
  });

  it("stores the slot and a 60-minute hold expiry, and releases expired holds before booking", async () => {
    const before = Date.now();
    const response = await fetch(`${baseUrl}/api/apprenticeship/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(booking),
    });
    const body = await response.json();
    expect(lazyRelease).toHaveBeenCalled();
    const order = [...docs("orders").values()][0];
    expect(order).toMatchObject({ slotStart: SLOT.start, slotEnd: SLOT.end, packageId: "apprentice-25" });
    const expires = Date.parse(String(order.holdExpiresAt));
    expect(expires - before).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(expires - before).toBeLessThanOrEqual(61 * 60 * 1000);
    expect(body.holdExpiresAt).toBe(order.holdExpiresAt);
  });
});

describe("unpaid hold release", () => {
  it("releases expired holds before reading open slots", async () => {
    await fetch(`${baseUrl}/api/apprenticeship/slots?package=apprentice-25`);
    expect(lazyRelease).toHaveBeenCalled();
    expect(lazyRelease.mock.invocationCallOrder[0]).toBeLessThan(availability.mock.invocationCallOrder[0]);
  });

  it("runs the cron sweep only with the cron secret", async () => {
    const backup = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-test";
    try {
      const anonymous = await fetch(`${baseUrl}/api/apprenticeship/release-holds`);
      expect(anonymous.status).toBe(401);
      const wrong = await fetch(`${baseUrl}/api/apprenticeship/release-holds`, { headers: { Authorization: "Bearer nope" } });
      expect(wrong.status).toBe(401);
      expect(cronRelease).not.toHaveBeenCalled();
      const ok = await fetch(`${baseUrl}/api/apprenticeship/release-holds`, { headers: { Authorization: "Bearer cron-test" } });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true, released: 1 });
      delete process.env.CRON_SECRET;
      const unset = await fetch(`${baseUrl}/api/apprenticeship/release-holds`, { headers: { Authorization: "Bearer " } });
      expect(unset.status).toBe(401);
    } finally {
      if (backup === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = backup;
    }
  });
});
