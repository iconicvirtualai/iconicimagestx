/**
 * Public booking confirmation SMS follows CLIENT_NOTIFY_LIVE.
 * booking_received email stays outside that gate.
 */
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setEmailDeliveryOverride } from "../services/email";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));

const sendSMS = vi.hoisted(() => vi.fn(async () => ({ sid: "SM-test", status: "queued" })));
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

const CLIENT_PHONE = "281-555-0199";
const CLIENT_EMAIL = "ada@example.com";
const ALLOWLIST_EMAIL = "ops+deliveryqa@iconicimagestx.com";

const ENV_KEYS = [
  "CLIENT_NOTIFY_LIVE",
  "CLIENT_COMMS_ZONE",
  "NOTIFY_TEST_ALLOWLIST",
  "ADMIN_PHONE",
  "ADMIN_EMAIL",
  "BOOKING_NOTIFY_LIVE",
  "THANKFUL_RSVP_CONFIRM_LIVE",
] as const;

const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const sent: Array<{ to: string; subject: string }> = [];

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
  sent.length = 0;
  sendSMS.mockClear();
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
  process.env.ADMIN_EMAIL = "office@iconicimagestx.com";
  setEmailDeliveryOverride(async (message) => {
    sent.push({ to: message.to, subject: message.subject });
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  setEmailDeliveryOverride(null);
  vi.restoreAllMocks();
});

function skipLines(): string[] {
  return vi.mocked(console.info).mock.calls
    .map((call) => call.map((part) => String(part)).join(" "))
    .filter((line) => line.includes("Client confirmation SMS skipped"));
}

async function postBooking(email = CLIENT_EMAIL) {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Ada",
      lastName: "Lovelace",
      email,
      phone: CLIENT_PHONE,
      address: "100 Oak St, Spring, TX 77380",
      selectedBasics: ["photos-20"],
      slotStart: SLOT.start,
      photographerId: "mike-luna",
    }),
  });
  const body = await response.json();
  return { response, body };
}

describe("client booking confirmation SMS", () => {
  it("makes zero client SMS calls when CLIENT_NOTIFY_LIVE is unset or not exactly true", async () => {
    for (const value of [undefined, "false", "TRUE", ""]) {
      sendSMS.mockClear();
      vi.mocked(console.info).mockClear();
      sent.length = 0;
      if (value === undefined) delete process.env.CLIENT_NOTIFY_LIVE;
      else process.env.CLIENT_NOTIFY_LIVE = value;

      const { response, body } = await postBooking();

      expect(response.status, `flag ${String(value)}`).toBe(201);
      expect(sendSMS, `flag ${String(value)}`).not.toHaveBeenCalled();
      expect(body.notifications?.sms).toBe("gated");
      expect(skipLines().some((line) => line.includes("No message sent."))).toBe(true);
      expect(sent.some((message) => message.to.includes(CLIENT_EMAIL))).toBe(true);
    }
  });

  it("attempts the client SMS when CLIENT_NOTIFY_LIVE is exactly true", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";

    const { response, body } = await postBooking();

    expect(response.status).toBe(201);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({
      to: CLIENT_PHONE,
      kind: "booking_confirmation",
    }));
    expect(String(sendSMS.mock.calls[0]?.[0]?.body || "")).toContain("Ada");
    expect(body.notifications?.sms).toBe("sent");
    expect(skipLines()).toEqual([]);
    expect(sent.some((message) => message.to.includes(CLIENT_EMAIL))).toBe(true);
  });

  it("keeps the RED pause and the exact allowlist exception on the same helper", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    process.env.CLIENT_COMMS_ZONE = "RED";

    const paused = await postBooking();
    expect(paused.response.status).toBe(201);
    expect(sendSMS).not.toHaveBeenCalled();
    expect(paused.body.notifications?.sms).toBe("gated");
    expect(skipLines().some((line) => line.includes("CLIENT_COMMS_ZONE=RED") && line.includes("No message sent."))).toBe(true);

    sendSMS.mockClear();
    delete process.env.CLIENT_NOTIFY_LIVE;
    delete process.env.CLIENT_COMMS_ZONE;
    process.env.NOTIFY_TEST_ALLOWLIST = ALLOWLIST_EMAIL.toUpperCase();

    const allowed = await postBooking(ALLOWLIST_EMAIL);
    expect(allowed.response.status).toBe(201);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({
      to: CLIENT_PHONE,
      kind: "booking_confirmation",
    }));
    expect(allowed.body.notifications?.sms).toBe("sent");
  });
});
