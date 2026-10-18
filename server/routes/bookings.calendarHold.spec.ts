import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setEmailDeliveryOverride } from "../services/email";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));

const availability = vi.hoisted(() => vi.fn());
const createHold = vi.hoisted(() => vi.fn());
const deleteHold = vi.hoisted(() => vi.fn(async () => undefined));
const createHoliday = vi.hoisted(() => vi.fn());
const deleteHoliday = vi.hoisted(() => vi.fn(async () => undefined));

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
  function auth() {
    return {
      async verifyIdToken(token: string) {
        if (token === "admin-token") return { uid: "admin-1", email: "owner@iconicimagestx.com" };
        if (token === "qa-token") return { uid: "qa-1", email: "ops+deliveryqa@iconicimagestx.com" };
        if (token === "photo-token") return { uid: "photo-1", email: "photo@iconicimagestx.com" };
        throw new Error("invalid");
      },
    };
  }
  return { default: { apps: [], firestore, auth } };
});

vi.mock("../services/bookingAvailability", () => ({
  readBookingAvailability: availability,
  createBookingCalendarHold: createHold,
  deleteBookingCalendarHold: deleteHold,
}));

vi.mock("../services/holidayCalendar", () => ({
  createHolidayCalendarEvent: createHoliday,
  deleteHolidayCalendarEvent: deleteHoliday,
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

import { chicagoDateKey, SOCIAL_RATE_BY_DATE } from "../../shared/thankfulEvent";
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

const SECRET = "hold-secret-DO-NOT-STORE";
const HEADER = "Bearer hold-header-DO-NOT-STORE";

let server: Server;
let baseUrl = "";
const sent: Array<{ to: string; subject: string; html: string; text?: string }> = [];
const previousAdmin = process.env.ADMIN_EMAIL;
const previousLive = process.env.CLIENT_NOTIFY_LIVE;

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
  if (previousAdmin === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = previousAdmin;
  if (previousLive === undefined) delete process.env.CLIENT_NOTIFY_LIVE;
  else process.env.CLIENT_NOTIFY_LIVE = previousLive;
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
  createHold.mockReset();
  deleteHold.mockClear();
  createHoliday.mockReset();
  deleteHoliday.mockReset();
  deleteHoliday.mockResolvedValue(undefined);
  availability.mockReset();
  availability.mockResolvedValue({
    live: true,
    slots: [SLOT],
    durationMinutes: 90,
    bufferMinutes: 30,
    driveMode: "buffer",
  });
  process.env.ADMIN_EMAIL = "office@iconicimagestx.com";
  delete process.env.CLIENT_NOTIFY_LIVE;
  setEmailDeliveryOverride(async (message) => {
    sent.push(message);
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

function savedOrder(): Record<string, unknown> {
  const orders = docs("orderRequests");
  expect(orders.size).toBe(1);
  return [...orders.values()][0];
}

async function postBooking() {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "281-555-0199",
      address: "100 Oak St, Spring, TX 77380",
      selectedBasics: ["photos-20"],
      slotStart: SLOT.start,
      photographerId: "mike-luna",
    }),
  });
  const body = await response.json();
  return { response, body };
}

describe("public booking calendar hold", () => {
  it("saves the order when the calendar insert throws and stores no secrets or headers", async () => {
    expect(process.env.CLIENT_NOTIFY_LIVE).not.toBe("true");
    const message = `Calendar insert failed ${"x".repeat(400)}`;
    const err = new Error(message);
    Object.assign(err, {
      secret: SECRET,
      headers: { Authorization: HEADER },
      config: { headers: { Authorization: HEADER }, private_key: SECRET },
      response: { headers: { Authorization: HEADER }, data: { private_key: SECRET } },
    });
    createHold.mockRejectedValue(err);

    const { response, body } = await postBooking();
    const saved = savedOrder();
    const stored = JSON.stringify(saved);

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.error).toBeUndefined();
    expect(saved.calendarHold).toBe("failed");
    expect(saved.officeFlag).toBe("calendar_hold_failed");
    expect(saved.calendarHoldError).toBe(message.slice(0, 300));
    expect(String(saved.calendarHoldError).length).toBeLessThanOrEqual(300);
    expect(saved.officeNote).toBe("Calendar hold failed for Mike Luna at Wed, Oct 14 · 9:00 AM. Add it to the calendar manually.");
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain(HEADER);
    expect(stored).not.toContain("Authorization");
    expect(stored).not.toContain("private_key");
    expect(stored).not.toContain("headers");
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain(HEADER);
    expect(console.error).toHaveBeenCalledWith("[Bookings] Calendar hold failed:", err);
    expect(sent.some((message) => message.html.includes("Add it to the calendar manually.") && message.html.includes("Mike Luna"))).toBe(true);
    expect(sent.some((message) => `${message.html} ${message.text || ""}`.includes(SECRET))).toBe(false);
  });

  it("saves the order when the calendar insert returns no event id", async () => {
    createHold.mockResolvedValue({
      calendarId: "mike@iconicimagestx.com",
      eventId: null,
      htmlLink: null,
    });

    const { response, body } = await postBooking();
    const saved = savedOrder();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(saved.calendarHold).toBe("failed");
    expect(saved.officeFlag).toBe("calendar_hold_failed");
    expect(saved.calendarHoldError).toBe("Calendar returned no event id.");
    expect(saved.officeNote).toContain("Mike Luna");
    expect(saved.officeNote).toContain("Wed, Oct 14 · 9:00 AM");
    expect(saved.officeNote).toContain("Add it to the calendar manually.");
    expect(saved.calendarEventId).toBeNull();
    expect(console.error).toHaveBeenCalledWith("[Bookings] Calendar hold failed:", "Calendar returned no event id.");
    expect(JSON.stringify(saved)).not.toContain("Authorization");
  });

  it("saves a good calendar hold as held", async () => {
    createHold.mockResolvedValue({
      calendarId: "mike@iconicimagestx.com",
      eventId: "evt-1",
      htmlLink: "https://calendar.google.com/calendar/event?eid=evt-1",
    });

    const { response, body } = await postBooking();
    const saved = savedOrder();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(saved.calendarHold).toBe("held");
    expect(saved.calendarHoldError).toBeNull();
    expect(saved.officeFlag).toBeNull();
    expect(saved.officeNote).toBeNull();
    expect(saved.calendarEventId).toBe("evt-1");
    expect(saved.calendarId).toBe("mike@iconicimagestx.com");
    expect(body).not.toHaveProperty("error");
    expect(sent.some((message) => message.text?.includes("Office note:") || message.html.includes("Calendar hold failed"))).toBe(false);
  });

  it("saves the Wix order page without a calendar slot and keeps the booking list private", async () => {
    expect(process.env.CLIENT_NOTIFY_LIVE).not.toBe("true");
    expect(process.env.BOOKING_NOTIFY_LIVE).toBeUndefined();

    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www-iconicimagestx-com.filesusr.com",
      },
      body: JSON.stringify({
        firstName: "TEST",
        lastName: "Cody - ignore",
        email: "ops+deliveryqa@iconicimagestx.com",
        phone: "281-356-0965",
        address: "26410 Oakridge Dr, Spring, TX 77380",
        lineItems: [{ name: "The Essentials — $249", price: 249 }],
        total: 249,
        pricing: { subtotal: 249, total: 249 },
        vibeNote: "COMPLETE BOOKING DETAILS\nQA reproduction. Please ignore.",
        scheduledDate: "2026-10-22",
        scheduledTime: "Morning",
        photographerPreference: "No preference",
        accessMethod: "QA test — do not visit",
        propertyStatus: "Not specified",
        furnishingStatus: "Not specified",
        selectedAddOns: [],
        selectedService: "The Essentials — $249",
        leadSource: "Iconic temporary booking page",
      }),
    });
    const body = await response.json();
    const saved = savedOrder();
    const listed = await fetch(`${baseUrl}/api/bookings`);
    const listedBody = await listed.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.error).toBeUndefined();
    expect(availability).not.toHaveBeenCalled();
    expect(createHold).not.toHaveBeenCalled();
    expect(saved.firstName).toBe("TEST");
    expect(saved.lastName).toBe("Cody - ignore");
    expect(saved.email).toBe("ops+deliveryqa@iconicimagestx.com");
    expect(saved.scheduledDate).toBe("2026-10-22");
    expect(saved.scheduledTime).toBe("Morning");
    expect(saved.calendarHold).toBe("none");
    expect(saved.calendarEventId).toBeNull();
    expect(saved.leadSource).toBe("Iconic temporary booking page");
    expect(listed.status).toBe(401);
    expect(listedBody).toEqual({ error: "No authentication token provided." });
    expect(sent.some((message) => message.subject?.includes("password") || message.html.includes("setup"))).toBe(false);
  });

  it("still requires an open time on /book when the calendar is live", async () => {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "281-555-0199",
        address: "100 Oak St, Spring, TX 77380",
        selectedBasics: ["photos-20"],
        scheduledDate: "2026-10-22",
        scheduledTime: "9:00 AM",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose an open time.");
    expect(docs("orderRequests").size).toBe(0);
    expect(createHold).not.toHaveBeenCalled();
  });

  it("rate-limits repeated public booking posts", async () => {
    const payload = {
      firstName: "TEST",
      lastName: "Cody - ignore",
      email: "ops+deliveryqa@iconicimagestx.com",
      phone: "281-356-0965",
      address: "26410 Oakridge Dr, Spring, TX 77380",
      lineItems: [{ name: "The Essentials — $249", price: 249 }],
      total: 249,
      scheduledDate: "2026-10-22",
      scheduledTime: "Afternoon",
      selectedService: "The Essentials — $249",
      leadSource: "Iconic temporary booking page",
    };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      statuses.push(response.status);
      if (response.status === 429) {
        expect(response.headers.get("retry-after")).toBeTruthy();
        const body = await response.json();
        expect(body.error).toContain("281.356.0965");
      }
    }

    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(docs("orderRequests").size).toBe(10);
  });

  it("publishes taken holiday times only and rejects a second RSVP for that slot", async () => {
    docs("orderRequests").set("real", {
      leadSource: "Thankful client holiday event RSVP",
      scheduledDate: "2026-11-07",
      requestedTimeLabel: "11:30 AM",
      email: "ada@example.com",
      clientName: "Ada Client",
      status: "new",
    });
    docs("orderRequests").set("qa", {
      leadSource: "Thankful client holiday event RSVP",
      scheduledDate: "2026-11-07",
      requestedTimeLabel: "1:15 PM",
      email: "ops+deliveryqa@iconicimagestx.com",
      clientName: "TEST Quinn",
      status: "new",
    });

    const listed = await fetch(`${baseUrl}/api/bookings/holiday-slots`);
    const slots = await listed.json();
    expect(listed.status).toBe(200);
    expect(slots.thankful.taken).toEqual(["11:30 AM"]);
    expect(JSON.stringify(slots)).not.toContain("ada@example.com");
    expect(JSON.stringify(slots)).not.toContain("Ada");
    expect(JSON.stringify(slots)).not.toContain("Quinn");

    const today = chicagoDateKey(new Date());
    const publicRate = await fetch(`${baseUrl}/api/bookings/social-rate?date=2026-11-07`);
    const publicBody = await publicRate.json();
    expect(publicRate.status).toBe(200);
    expect(publicRate.headers.get("cache-control")).toBe("no-store");
    expect(publicBody).toEqual({
      date: today,
      percent: Object.prototype.hasOwnProperty.call(SOCIAL_RATE_BY_DATE, today) ? SOCIAL_RATE_BY_DATE[today] : null,
      ended: !Object.prototype.hasOwnProperty.call(SOCIAL_RATE_BY_DATE, today),
      dropsTomorrow: Object.prototype.hasOwnProperty.call(SOCIAL_RATE_BY_DATE, today) && SOCIAL_RATE_BY_DATE[today] !== 20,
      preview: false,
    });
    expect(JSON.stringify(publicBody)).not.toContain("2026-11-06");
    expect(Object.keys(publicBody).sort()).toEqual(["date", "dropsTomorrow", "ended", "percent", "preview"]);

    docs("staff").set("admin-1", { role: "admin", isActive: true });
    const adminRate = await fetch(`${baseUrl}/api/bookings/social-rate?date=2026-11-07`, {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(await adminRate.json()).toMatchObject({ date: "2026-11-07", percent: 20, preview: true, dropsTomorrow: false });

    const qaRate = await fetch(`${baseUrl}/api/bookings/social-rate?date=2026-11-06`, {
      headers: { Authorization: "Bearer qa-token" },
    });
    expect(await qaRate.json()).toMatchObject({ date: "2026-11-06", percent: 21, preview: true });

    docs("staff").set("photo-1", { role: "photographer", isActive: true });
    const photoRate = await fetch(`${baseUrl}/api/bookings/social-rate?date=2026-11-07`, {
      headers: { Authorization: "Bearer photo-token" },
    });
    expect(await photoRate.json()).toMatchObject({ date: today, preview: false });

    docs("staff").set("admin-1", { role: "admin", isActive: false });
    const inactive = await fetch(`${baseUrl}/api/bookings/social-rate?date=2026-11-07`, {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(await inactive.json()).toMatchObject({ date: today, preview: false });

    const payload = {
      firstName: "Bea",
      lastName: "Client",
      email: "bea@example.com",
      phone: "281-555-0199",
      address: "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380",
      lineItems: [{ name: "Client Holiday Event RSVP", price: 0 }],
      total: 0,
      scheduledDate: "2026-11-07",
      scheduledTime: "Afternoon",
      requestedTimeLabel: "11:30 AM",
      selectedService: "Client Holiday Event RSVP",
      leadSource: "Thankful client holiday event RSVP",
    };
    const taken = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const takenBody = await taken.json();
    expect(taken.status).toBe(409);
    expect(takenBody.error).toBe("That time was just taken. Pick another.");

    const open = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, requestedTimeLabel: "1:15 PM", scheduledTime: "Afternoon" }),
    });
    expect(open.status).toBe(201);
  });

  it("quotes the Oct 17 social total and rejects an RSVP after the cutoff", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
    vi.setSystemTime(new Date("2026-10-17T21:16:00.000Z"));
    const social = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Ada",
        lastName: "Client",
        email: "ada@example.com",
        phone: "281-555-0199",
        address: "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380",
        lineItems: [{ name: "Social Saves 2027: The Baseline, 3 months", price: 1 }],
        total: 1,
        scheduledDate: "2026-11-07",
        scheduledTime: "Afternoon",
        selectedService: "Social Saves 2027: The Baseline, 3 months",
        socialPackage: "The Baseline",
        socialMonths: 3,
        leadSource: "Thankful social saves",
      }),
    });
    const socialBody = await social.json();
    const saved = savedOrder();
    expect(social.status).toBe(201);
    expect(socialBody.success).toBe(true);
    const line = (saved.lineItems as Array<{ price?: number }>).find((item) => (item.price || 0) > 0);
    expect(line?.price).toBe(665);
    expect(saved.total).toBe(683.62);
    expect(createHoliday).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-11-01T05:00:00.000Z"));
    const closed = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Bea",
        lastName: "Client",
        email: "bea@example.com",
        phone: "281-555-0199",
        address: "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380",
        lineItems: [{ name: "Client Holiday Event RSVP", price: 0 }],
        total: 0,
        scheduledDate: "2026-11-07",
        scheduledTime: "Afternoon",
        requestedTimeLabel: "12:00 PM",
        selectedService: "Client Holiday Event RSVP",
        leadSource: "Thankful client holiday event RSVP",
      }),
    });
    const closedBody = await closed.json();
    expect(closed.status).toBe(400);
    expect(closedBody.error).toBe("Headcount and menu votes closed Sat, Oct 31 at 11:59 PM CT.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts a Thankful RSVP on the photos calendar and still saves when that insert fails", async () => {
    createHoliday.mockResolvedValue({
      calendarId: "photos@iconicimagestx.com",
      eventId: "evt-rsvp",
      htmlLink: "https://calendar.google.com/calendar/event?eid=evt-rsvp",
    });
    const payload = {
      firstName: "Ada",
      lastName: "Client",
      email: "ada@example.com",
      phone: "281-555-0100",
      address: "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380",
      lineItems: [{ name: "Client Holiday Event RSVP", price: 0 }],
      total: 0,
      scheduledDate: "2026-11-07",
      scheduledTime: "Morning",
      requestedTimeLabel: "11:15 AM",
      selectedService: "Client Holiday Event RSVP",
      leadSource: "Thankful client holiday event RSVP",
      vibeNote: "Headcount: 4\nPhotos with Santa: Yes, please\nMenu vote: Herb turkey\nNotes: High chair",
    };
    const savedResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const savedBody = await savedResponse.json();
    const saved = savedOrder();
    const plan = createHoliday.mock.calls[0][0];

    expect(savedResponse.status).toBe(201);
    expect(savedBody.success).toBe(true);
    expect(createHold).not.toHaveBeenCalled();
    expect(plan.summary).toBe("Thankful RSVP — Ada Client (4)");
    expect(plan.description).toContain("Email: ada@example.com");
    expect(plan.description).toContain(`Order: ${saved.orderNumber}`);
    expect(plan.description).toContain(`/admin/order-request/`);
    expect(plan.start).toBe("2026-11-07T11:15:00");
    expect(plan.end).toBe("2026-11-07T11:30:00");
    expect(saved.calendarEventId).toBe("evt-rsvp");
    expect(saved.calendarId).toBe("photos@iconicimagestx.com");
    expect(saved.calendarHold).toBe("held");
    expect(saved.officeFlag).toBeNull();

    docs("orderRequests").clear();
    createHoliday.mockRejectedValue(new Error("calendar down"));
    const failed = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, email: "bea@example.com", requestedTimeLabel: "11:30 AM" }),
    });
    const failedSaved = savedOrder();
    expect(failed.status).toBe(201);
    expect(await failed.json()).toMatchObject({ success: true });
    expect(failedSaved.calendarHold).toBe("failed");
    expect(failedSaved.officeFlag).toBe("calendar_hold_failed");
    expect(failedSaved.calendarEventId).toBeNull();
    expect(failedSaved.calendarHoldError).toBe("calendar down");
  });

  it("does not calendar a test RSVP", async () => {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "TEST",
        lastName: "Quinn",
        email: "ops+deliveryqa@iconicimagestx.com",
        phone: "281-555-0100",
        address: "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380",
        lineItems: [{ name: "Client Holiday Event RSVP", price: 0 }],
        total: 0,
        scheduledDate: "2026-11-07",
        scheduledTime: "Afternoon",
        requestedTimeLabel: "12:00 PM",
        selectedService: "Client Holiday Event RSVP",
        leadSource: "Thankful client holiday event RSVP",
      }),
    });
    expect(response.status).toBe(201);
    expect(createHoliday).not.toHaveBeenCalled();
    expect(savedOrder().calendarHold).toBe("none");
  });

  it("cancels the order and deletes the calendar event without emailing the guest", async () => {
    docs("staff").set("admin-1", { role: "admin", isActive: true });
    docs("orderRequests").set("rsvp-9", {
      status: "new",
      email: "ada@example.com",
      calendarEventId: "evt-9",
      calendarId: "photos@iconicimagestx.com",
      leadSource: "Thankful client holiday event RSVP",
    });
    const before = sent.length;
    const response = await fetch(`${baseUrl}/api/bookings/rsvp-9/cancel`, {
      method: "PATCH",
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, calendarDeleted: true });
    expect(deleteHoliday).toHaveBeenCalledWith({
      calendarId: "photos@iconicimagestx.com",
      eventId: "evt-9",
    });
    expect(docs("orderRequests").get("rsvp-9")?.status).toBe("cancelled");
    expect(docs("orderRequests").get("rsvp-9")?.calendarEventId).toBe("evt-9");
    expect(docs("orderRequests").get("rsvp-9")?.calendarHold).toBe("none");
    expect(sent.length).toBe(before);
  });

  it("backfills missing holiday events once and is admin-only", async () => {
    docs("staff").set("admin-1", { role: "admin", isActive: true });
    docs("staff").set("photo-1", { role: "photographer", isActive: true });
    docs("orderRequests").set("legacy", {
      leadSource: "Thankful client holiday event RSVP",
      clientName: "Cara Client",
      email: "cara@example.com",
      phone: "281-555-0199",
      orderNumber: "#150",
      status: "new",
      scheduledDate: "2026-11-14",
      requestedTimeLabel: "11:00 AM",
      vibeNote: "Headcount: 5\nMenu vote: Ham\nNotes: Window seat",
    });
    docs("orderRequests").set("held", {
      leadSource: "Thankful client holiday event RSVP",
      clientName: "Ada Client",
      email: "ada@example.com",
      status: "new",
      scheduledDate: "2026-11-07",
      requestedTimeLabel: "11:15 AM",
      calendarEventId: "evt-held",
    });
    docs("orderRequests").set("qa", {
      leadSource: "Thankful client holiday event RSVP",
      clientName: "TEST Quinn",
      email: "ops+deliveryqa@iconicimagestx.com",
      status: "new",
      scheduledDate: "2026-11-07",
      requestedTimeLabel: "11:30 AM",
    });
    createHoliday.mockImplementation(async (plan: { orderId: string }) => ({
      calendarId: "photos@iconicimagestx.com",
      eventId: `evt-${plan.orderId}`,
      htmlLink: "https://calendar.google.com/event",
    }));

    const anonymous = await fetch(`${baseUrl}/api/bookings/holiday-calendar-backfill`, { method: "POST" });
    expect(anonymous.status).toBe(401);
    const photographer = await fetch(`${baseUrl}/api/bookings/holiday-calendar-backfill`, {
      method: "POST",
      headers: { Authorization: "Bearer photo-token" },
    });
    expect(photographer.status).toBe(403);

    const first = await fetch(`${baseUrl}/api/bookings/holiday-calendar-backfill`, {
      method: "POST",
      headers: { Authorization: "Bearer admin-token" },
    });
    const report = await first.json();
    expect(first.status).toBe(200);
    expect(report.created).toBe(1);
    expect(report.skipped).toMatchObject({ test: 1, alreadyScheduled: 1 });
    expect(report.moved).toEqual([
      expect.objectContaining({
        id: "legacy",
        name: "Cara Client",
        orderNumber: "#150",
        fromDate: "2026-11-14",
        toDate: "2026-11-07",
        fromTime: "11:00 AM",
        toTime: "11:00 AM",
        eventId: "evt-legacy",
      }),
    ]);
    expect(docs("orderRequests").get("legacy")).toMatchObject({
      calendarEventId: "evt-legacy",
      calendarId: "photos@iconicimagestx.com",
      scheduledDate: "2026-11-07",
      calendarHold: "held",
    });
    const plan = createHoliday.mock.calls[0][0];
    expect(plan.summary).toBe("Thankful RSVP — Cara Client (5)");
    expect(plan.description).not.toContain("attendees");

    const second = await fetch(`${baseUrl}/api/bookings/holiday-calendar-backfill`, {
      method: "POST",
      headers: { Authorization: "Bearer admin-token" },
    });
    const again = await second.json();
    expect(again.created).toBe(0);
    expect(again.skipped.alreadyScheduled).toBe(2);
    expect(createHoliday).toHaveBeenCalledTimes(1);
  });
});
