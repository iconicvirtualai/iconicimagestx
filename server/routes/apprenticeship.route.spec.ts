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

beforeAll(async () => {
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
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  store.collections = {};
  store.seq = 0;
  resetApprenticeshipRateLimit();
  notify.mockClear();
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
      status: "confirmed",
      depositAmount: 25,
    });
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
});
