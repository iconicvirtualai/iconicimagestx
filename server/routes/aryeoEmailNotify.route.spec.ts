import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { CLIENT_EMAIL_NOTIFY_TEST_SINK } from "../../shared/aryeoEmailNotify";
import {
  resetEmailNotifyForTests,
  setClientEmailDeliveryOverride,
  setEmailNotifyStoreForTests,
  createMemoryEmailNotifyStore,
} from "../services/aryeoEmailNotify";

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  CLIENT_EMAIL_NOTIFY_LIVE: process.env.CLIENT_EMAIL_NOTIFY_LIVE,
  CLIENT_NOTIFY_LIVE: process.env.CLIENT_NOTIFY_LIVE,
  CRON_SECRET: process.env.CRON_SECRET,
};

let server: Server;
let baseUrl = "";
const sent: string[] = [];

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.CLIENT_EMAIL_NOTIFY_LIVE;
  delete process.env.CLIENT_NOTIFY_LIVE;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setClientEmailDeliveryOverride(null);
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  sent.length = 0;
  resetEmailNotifyForTests();
  setEmailNotifyStoreForTests(createMemoryEmailNotifyStore());
  setClientEmailDeliveryOverride(async (message) => {
    sent.push(message.to);
  });
  delete process.env.CLIENT_EMAIL_NOTIFY_LIVE;
  delete process.env.CLIENT_NOTIFY_LIVE;
});

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer temp-admin-token");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

describe("notification settings", () => {
  it("lists customer emails, previews one, and sends a test only to the QA sink", async () => {
    const listed = await api("/api/client-email-notify");
    expect(listed.response.status).toBe(200);
    expect(listed.data.live).toBe(false);
    expect(listed.data.reminderHoursBefore).toBe(24);
    expect(listed.data.notifications.some((row: { key: string }) => row.key === "customer_appointment_scheduled")).toBe(true);
    expect(listed.data.notifications.find((row: { key: string }) => row.key === "customer_user_verification").wired).toBe(false);
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();

    const preview = await api("/api/client-email-notify/preview", {
      method: "POST",
      body: JSON.stringify({ key: "customer_appointment_scheduled" }),
    });
    expect(preview.data.subject).toContain("Appointment Confirmed");
    expect(preview.data.html).not.toMatch(/Open House/i);

    const test = await api("/api/client-email-notify/test", {
      method: "POST",
      body: JSON.stringify({ key: "customer_order_confirmation" }),
    });
    expect(test.response.status).toBe(200);
    expect(sent).toEqual([CLIENT_EMAIL_NOTIFY_TEST_SINK]);

    const off = await api("/api/client-email-notify", {
      method: "PATCH",
      body: JSON.stringify({ key: "customer_order_confirmation", enabled: false }),
    });
    expect(off.data.enabled).toBe(false);
  });

  it("runs the cron only with the cron secret and does not touch the other live flags", async () => {
    process.env.CRON_SECRET = "cron-test";
    const denied = await fetch(`${baseUrl}/api/client-email-notify/run`, { method: "POST" });
    expect(denied.status).toBe(401);
    const allowed = await fetch(`${baseUrl}/api/client-email-notify/run`, {
      method: "POST",
      headers: { Authorization: "Bearer cron-test" },
    });
    expect(allowed.status).toBe(200);
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
    expect(process.env.CLIENT_EMAIL_NOTIFY_LIVE).toBeUndefined();
  });
});
