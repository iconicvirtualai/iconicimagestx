import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { mikeCallSlots } from "../../shared/mikeCallSlots";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));

const readBlocks = vi.hoisted(() => vi.fn(async () => {
  throw new Error("calendar off");
}));

function docs(name: string) {
  if (!store.collections[name]) store.collections[name] = new Map();
  return store.collections[name];
}

vi.mock("../services/bookingAvailability", () => ({
  readPhotographerCalendarBlocks: readBlocks,
}));

vi.mock("firebase-admin", () => {
  function ref(name: string, id: string) {
    return {
      id,
      async get() {
        const data = docs(name).get(id);
        return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
      },
      async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
        const prev = options?.merge ? (docs(name).get(id) || {}) : {};
        docs(name).set(id, { ...prev, ...data });
      },
      async update(patch: Record<string, unknown>) {
        docs(name).set(id, { ...(docs(name).get(id) || {}), ...patch });
      },
    };
  }
  function firestore() {
    return {
      collection(name: string) {
        return {
          doc(id?: string) {
            return ref(name, id || `auto${++store.seq}`);
          },
          async add(data: Record<string, unknown>) {
            const id = `auto${++store.seq}`;
            docs(name).set(id, { ...data });
            return ref(name, id);
          },
          async get() {
            return {
              docs: [...docs(name).entries()].map(([id, data]) => ({
                id,
                data: () => ({ ...data }),
              })),
            };
          },
          count() {
            return { get: async () => ({ data: () => ({ count: docs(name).size }) }) };
          },
        };
      },
      async runTransaction(run: (tx: {
        get: (target: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (target: { set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> }, data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
      }) => Promise<unknown>) {
        return run({
          get: (target) => target.get(),
          set: (target, data, options) => target.set(data, options),
        });
      },
    };
  }
  firestore.FieldValue = {
    serverTimestamp: () => "SERVER_TIME",
    increment: (by: number) => ({ increment: by }),
  };
  return { default: { apps: [{ name: "video-team-test" }], firestore } };
});

import videoTeamRouter, { resetVideoTeamRateLimit } from "./videoTeam";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/video-team", videoTeamRouter);
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
  readBlocks.mockReset();
  readBlocks.mockRejectedValue(new Error("calendar off"));
  resetVideoTeamRateLimit();
});

function inquiry(extra: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "",
    film: "listing",
    placeKind: "location",
    placeText: "200 Oak Ave, Spring, TX",
    whenDate: "2026-12-10",
    whenText: "",
    usage: ["social"],
    budgetBand: "under-300",
    availability: "one-off",
    camera: "love",
    goal: "keep-up",
    intent: "buy",
    packageId: "basic-reel",
    ...extra,
  };
}

describe("video team inquiry", () => {
  it("does not send mail or texts from this route", () => {
    const source = readFileSync(new URL("./videoTeam.ts", import.meta.url), "utf8");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("sendSMS");
    expect(source).not.toContain("cadi@");
  });

  it("falls back to Mike's weekday windows when the calendar cannot be read", async () => {
    const response = await fetch(`${baseUrl}/api/video-team/mike-slots`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.live).toBe(false);
    expect(data.windows).toBe("Monday–Friday, 9:00 AM–12:00 PM or 2:00 PM–4:00 PM CT");
    expect(data.photographer).toBe("Mike Luna");
    expect(data.slots.length).toBeGreaterThan(0);
    expect(data.slots.some((slot: { time: string }) => slot.time === "12:00 PM" || slot.time === "4:00 PM")).toBe(false);
    expect(JSON.stringify(data)).not.toContain("cadi@");
    expect(JSON.stringify(data)).not.toContain("mike@");
  });

  it("saves a buy inquiry on the order-request desk", async () => {
    const response = await fetch(`${baseUrl}/api/video-team/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inquiry()),
    });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.source).toBe("video-team-form");
    expect(data.orderNumber).toBeTruthy();
    const saved = [...docs("orderRequests").values()];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      clientName: "Ada Lovelace",
      email: "ada@example.com",
      source: "video-team-form",
      status: "new",
      leadSource: "Video team page",
      videoTeamIntent: "buy",
      total: 125,
      countsTowardRevenue: false,
    });
    expect(saved[0].lineItems).toEqual([
      expect.objectContaining({ id: "basic-reel", name: "Basic Reel", price: 125 }),
    ]);
  });

  it("saves a call slot without emailing", async () => {
    const slot = mikeCallSlots({ now: new Date() })[0];
    const response = await fetch(`${baseUrl}/api/video-team/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inquiry({ intent: "call", slot })),
    });
    expect(response.status).toBe(200);
    const saved = [...docs("orderRequests").values()][0];
    expect(saved).toMatchObject({
      source: "video-team-form",
      videoTeamIntent: "call",
      photographerPreference: "Mike Luna",
      bookingPhotographerId: "mike-luna",
      callSlotStart: slot.start,
      scheduledTime: slot.time,
    });
  });

  it("drops a honeypot and rejects a bad phone", async () => {
    const hidden = await fetch(`${baseUrl}/api/video-team/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inquiry({ companyWebsite: "https://spam.example" })),
    });
    expect(hidden.status).toBe(200);
    expect(docs("orderRequests").size).toBe(0);

    const bad = await fetch(`${baseUrl}/api/video-team/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inquiry({ email: "", phone: "123" })),
    });
    expect(bad.status).toBe(400);
    expect(docs("orderRequests").size).toBe(0);
  });
});
