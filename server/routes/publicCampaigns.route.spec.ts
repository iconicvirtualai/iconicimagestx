/**
 * @vitest-environment node
 */
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const store = vi.hoisted(() => ({
  added: [] as Array<{ collection: string; id: string; data: Record<string, unknown> }>,
  apps: [{ name: "public-campaign-test" }] as Array<{ name: string }>,
}));

const notify = vi.hoisted(() =>
  vi.fn(async (_input: { isNewOrder: boolean; saved: { email?: string } }) => ({ sent: true })),
);

vi.mock("firebase-admin", () => {
  const firestore = () => ({
    collection(name: string) {
      return {
        async add(data: Record<string, unknown>) {
          const id = `req${store.added.length + 1}`;
          store.added.push({ collection: name, id, data });
          return { id };
        },
      };
    },
  });
  (firestore as unknown as { FieldValue: { serverTimestamp: () => string } }).FieldValue = {
    serverTimestamp: () => "ts",
  };
  return {
    default: {
      get apps() {
        return store.apps;
      },
      firestore,
    },
  };
});

vi.mock("../services/officeOrderNotify", () => ({
  notifyOfficeOfOrder: notify,
}));

import publicCampaignsRouter, { resetPublicCampaignRateLimit } from "./publicCampaigns";

const holiday = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "281-555-0100",
  packageId: "single",
  preferredDate: "2026-12-01",
  preferredTime: "10:00",
  families: 1,
  notes: "Front door.",
  website: "",
};

const session = {
  kind: "session",
  name: "Grace Hopper",
  email: "grace@example.com",
  phone: "281-555-0199",
  roomId: "noir",
  preferredDate: "2026-11-20",
  preferredTime: "15:00",
  lengthId: "60",
  notes: "",
  website: "",
};

let server: Server;
let baseUrl = "";
const notifyLive = process.env.CLIENT_NOTIFY_LIVE;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/public-campaigns", publicCampaignsRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (notifyLive === undefined) delete process.env.CLIENT_NOTIFY_LIVE;
  else process.env.CLIENT_NOTIFY_LIVE = notifyLive;
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  store.added.length = 0;
  store.apps.splice(0, store.apps.length, { name: "public-campaign-test" });
  notify.mockClear();
  resetPublicCampaignRateLimit();
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.HOLIDAY_SQUARE_PAY_URL;
  delete process.env.STUDIOS_SQUARE_PAY_URL;
});

function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.40" },
    body: JSON.stringify(body),
  });
}

describe("public campaign requests", () => {
  it("rejects an invalid holiday request before writing", async () => {
    const res = await post("/api/public-campaigns/holiday", { ...holiday, email: "nope" });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Enter a valid email.");
    expect(store.added).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
  });

  it("writes a holiday request to Firestore and flags the office without emailing the client", async () => {
    const res = await post("/api/public-campaigns/holiday", holiday);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(store.added).toHaveLength(1);
    expect(store.added[0].collection).toBe("orderRequests");
    expect(store.added[0].data.officeFlag).toBe(true);
    expect(store.added[0].data.needsOfficeReview).toBe(true);
    expect(store.added[0].data.clientEmailSent).toBe(false);
    expect(store.added[0].data.source).toBe("tis-the-season");
    expect(store.added[0].data.subtotal).toBe(99);
    expect(store.added[0].data.processing).toBe(2.77);
    expect(notify).toHaveBeenCalledTimes(1);
    const input = notify.mock.calls[0]?.[0];
    expect(input?.isNewOrder).toBe(true);
    expect(input?.saved.email).toBe("ada@example.com");
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
    const source = readFileSync(new URL("./publicCampaigns.ts", import.meta.url), "utf8");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toMatch(/CLIENT_NOTIFY_LIVE\s*=/);
    expect(source).not.toContain("cadi@");
  });

  it("drops a honeypot without a Firestore write", async () => {
    const res = await post("/api/public-campaigns/holiday", { ...holiday, website: "spam" });
    expect(res.status).toBe(200);
    expect(store.added).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("writes a studios pass request with a draft price and no invented pay link", async () => {
    const res = await post("/api/public-campaigns/studios", {
      kind: "pass",
      name: "Grace Hopper",
      email: "grace@example.com",
      phone: "281-555-0199",
      passId: "backstage",
      website: "",
    });
    expect(res.status).toBe(201);
    expect(store.added[0].data.priceStatus).toBe("draft");
    expect(store.added[0].data.total).toBe(0);
    expect(store.added[0].data.draftMonthly).toBe(199);
    expect(store.added[0].data.officeFlag).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    const config = await fetch(`${baseUrl}/api/public-campaigns/studios`);
    expect(await config.json()).toEqual({
      payLink: null,
      processingNote: "A 2.8% processing fee is added at checkout.",
    });
  });

  it("writes a studio time request and returns 503 when Firestore is not configured", async () => {
    const ok = await post("/api/public-campaigns/studios", session);
    expect(ok.status).toBe(201);
    expect(store.added[0].data.roomId).toBe("noir");
    expect(store.added[0].data.calendarConnected).toBe(false);
    store.apps.splice(0, store.apps.length);
    store.added.length = 0;
    notify.mockClear();
    const res = await post("/api/public-campaigns/studios", { ...session, email: "other@example.com" });
    expect(res.status).toBe(503);
    expect(store.added).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
