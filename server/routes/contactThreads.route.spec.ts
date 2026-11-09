import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("../services/sms", () => ({
  sendSMS: vi.fn(),
}));

import { createServer } from "../index";
import { sendEmail } from "../services/email";
import { sendSMS } from "../services/sms";
import { LIVE_CHAT_MAX_PER_WINDOW } from "../services/liveChat";
import {
  readContactThreadAlert,
  resetContactThreadStoreForTests,
  STAFF_THREAD_ALERT_INTERVAL_MS,
} from "../services/contactThreads";
import {
  contactThreadAdminUrl,
  resetContactThreadAlertLimiterForTests,
  setContactThreadAlertClockForTests,
} from "../services/contactThreadAlert";

const sendEmailMock = vi.mocked(sendEmail);
const sendSMSMock = vi.mocked(sendSMS);

const savedEnv = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  CONTACT_THREAD_STORE: process.env.CONTACT_THREAD_STORE,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  process.env.CONTACT_THREAD_STORE = "memory";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (savedEnv.ENABLE_TEMP_ADMIN === undefined) delete process.env.ENABLE_TEMP_ADMIN;
  else process.env.ENABLE_TEMP_ADMIN = savedEnv.ENABLE_TEMP_ADMIN;
  if (savedEnv.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = savedEnv.VERCEL;
  if (savedEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
  if (savedEnv.CONTACT_THREAD_STORE === undefined) delete process.env.CONTACT_THREAD_STORE;
  else process.env.CONTACT_THREAD_STORE = savedEnv.CONTACT_THREAD_STORE;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

beforeEach(() => {
  resetContactThreadStoreForTests();
  resetContactThreadAlertLimiterForTests();
  setContactThreadAlertClockForTests(null);
  sendEmailMock.mockReset();
  sendSMSMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true, delivery: "sent" });
  sendSMSMock.mockResolvedValue({ sid: "SM123", status: "queued" });
});

function expectStaffAlerts(times: number) {
  expect(sendEmailMock).toHaveBeenCalledTimes(times);
  expect(sendSMSMock).toHaveBeenCalledTimes(times);
  for (const [email] of sendEmailMock.mock.calls) {
    expect(email.to).toBe(process.env.CONTACT_FORM_EMAIL || "photos@iconicimagestx.com");
    expect(email.to).not.toBe(validBody.email);
    expect(email.cc).toBeUndefined();
    expect(email.bcc).toBeUndefined();
    expect(email.template).toBe("live_chat");
    expect(email.audience).toBe("staff");
    expect(email.replyTo).toBe(validBody.email);
    expect(JSON.stringify(email)).not.toContain("contact_confirmation");
  }
  for (const [sms] of sendSMSMock.mock.calls) {
    expect(sms.to).toBe("+12813560965");
    expect(sms.kind).toBe("staff_inbound");
    expect(sms.to).not.toContain("281-555-0199");
  }
}

function postThread(body: unknown, ip = "203.0.113.40") {
  return fetch(`${baseUrl}/api/contact/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify(body),
  });
}

function staffHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: "Bearer temp-admin-token",
    ...extra,
  };
}

const validBody = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "281-555-0199",
  message: "Can you shoot a listing on Thursday?",
};

describe("contact thread routes", () => {
  it("alerts staff when a visitor starts a thread and not when staff reply", async () => {
    const createdRes = await postThread(validBody, "203.0.113.41");
    const created = await createdRes.json();
    expect(createdRes.status).toBe(201);
    expect(created.thread.messages).toHaveLength(1);
    expect(created.accessToken).toBeTruthy();
    expect(JSON.stringify(created)).not.toContain("staffAlert");
    expect(JSON.stringify(created)).not.toContain("lastStaffAlertAt");

    expectStaffAlerts(1);
    const email = sendEmailMock.mock.calls[0][0];
    expect(email.variables).toMatchObject({
      senderName: "Ada Lovelace",
      senderEmail: "ada@example.com",
      senderPhone: "281-555-0199",
    });
    expect(email.variables?.message).toContain(validBody.message);
    expect(email.variables?.message).toContain(created.thread.id);
    expect(email.variables?.message).toContain("/admin/messages");
    expect(email.variables?.adminUrl).toContain(created.thread.id);
    const sms = sendSMSMock.mock.calls[0][0];
    expect(sms.body).toContain(contactThreadAdminUrl(created.thread.id));
    expect(sms.body).toContain("Ada Lovelace");
    expect(sms.body).toContain("Thursday");
    expect((await readContactThreadAlert(created.thread.id))?.staffAlertStatus).toBe("sent");

    const listRes = await fetch(`${baseUrl}/api/contact/staff/threads`, {
      headers: staffHeaders(),
    });
    const list = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0].id).toBe(created.thread.id);
    expect(list.threads[0].messages[0].text).toBe(validBody.message);
    expect(JSON.stringify(list)).not.toContain(created.accessToken);

    const replyRes = await fetch(`${baseUrl}/api/contact/staff/threads/${created.thread.id}/reply`, {
      method: "POST",
      headers: staffHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "Thursday morning works." }),
    });
    const reply = await replyRes.json();
    expect(replyRes.status).toBe(200);
    expect(reply.thread.messages.map((message: { sender: string; text: string }) => ({
      sender: message.sender,
      text: message.text,
    }))).toEqual([
      { sender: "client", text: validBody.message },
      { sender: "staff", text: "Thursday morning works." },
    ]);

    const seenRes = await fetch(`${baseUrl}/api/contact/threads/${created.thread.id}`, {
      headers: { "X-Contact-Thread-Token": created.accessToken },
    });
    const seen = await seenRes.json();
    expect(seenRes.status).toBe(200);
    expect(seen.thread.messages[1].text).toBe("Thursday morning works.");
    expect(seen.accessToken).toBeUndefined();

    expectStaffAlerts(1);
  });

  it("throttles a quick follow-up and alerts again after 10 minutes", async () => {
    expect(STAFF_THREAD_ALERT_INTERVAL_MS).toBe(10 * 60 * 1000);
    let clock = new Date("2026-11-09T15:00:00.000Z");
    setContactThreadAlertClockForTests(() => clock);

    const createdRes = await postThread(validBody, "203.0.113.42");
    const created = await createdRes.json();
    expect(createdRes.status).toBe(201);
    expectStaffAlerts(1);

    const follow = await postThread({
      ...validBody,
      message: "Morning is better.",
      threadId: created.thread.id,
      accessToken: created.accessToken,
    }, "203.0.113.42");
    const body = await follow.json();
    expect(follow.status).toBe(200);
    expect(body.thread.messages).toHaveLength(2);
    expect(body.thread.id).toBe(created.thread.id);
    expect(JSON.stringify(body)).not.toContain("staffAlert");
    expectStaffAlerts(1);
    const throttled = await readContactThreadAlert(created.thread.id);
    expect(throttled?.staffAlertStatus).toBe("throttled");
    expect(throttled?.lastStaffAlertAt).toBe("2026-11-09T15:00:00.000Z");

    clock = new Date(clock.getTime() + STAFF_THREAD_ALERT_INTERVAL_MS);
    const later = await postThread({
      ...validBody,
      message: "Afternoon works too.",
      threadId: created.thread.id,
      accessToken: created.accessToken,
    }, "203.0.113.42");
    const laterBody = await later.json();
    expect(later.status).toBe(200);
    expect(laterBody.thread.messages).toHaveLength(3);
    expectStaffAlerts(2);
    const sent = await readContactThreadAlert(created.thread.id);
    expect(sent?.staffAlertStatus).toBe("sent");
    expect(sent?.lastStaffAlertAt).toBe(clock.toISOString());
    expect(sendEmailMock.mock.calls[1][0].variables?.message).toContain("Afternoon works too.");
    expect(sendEmailMock.mock.calls[1][0].to).not.toBe(validBody.email);
    expect(sendSMSMock.mock.calls[1][0].to).toBe("+12813560965");
  });

  it("hides the thread from a missing or wrong token and from anonymous staff calls", async () => {
    const createdRes = await postThread(validBody, "203.0.113.43");
    const created = await createdRes.json();

    const hidden = await fetch(`${baseUrl}/api/contact/threads/${created.thread.id}`, {
      headers: { "X-Contact-Thread-Token": "wrong-token" },
    });
    expect(hidden.status).toBe(404);

    const staffList = await fetch(`${baseUrl}/api/contact/staff/threads`);
    expect(staffList.status).toBe(401);

    const staffReply = await fetch(`${baseUrl}/api/contact/staff/threads/${created.thread.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    expect(staffReply.status).toBe(401);

    const seen = await fetch(`${baseUrl}/api/contact/threads/${created.thread.id}`, {
      headers: { "X-Contact-Thread-Token": created.accessToken },
    });
    const seenBody = await seen.json();
    expect(seenBody.thread.messages).toHaveLength(1);
    expectStaffAlerts(1);
  });

  it("does not deliver a visitor message that has no reply path", async () => {
    const res = await postThread({ name: "Ada", message: "Hello" }, "203.0.113.44");
    expect(res.status).toBe(400);
    const listRes = await fetch(`${baseUrl}/api/contact/staff/threads`, { headers: staffHeaders() });
    const list = await listRes.json();
    expect(list.threads).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
  });

  it("rate-limits visitor posts and does not alert the blocked one", async () => {
    const ip = "203.0.113.45";
    for (let i = 0; i < LIVE_CHAT_MAX_PER_WINDOW; i += 1) {
      const ok = await postThread({ ...validBody, message: `Message ${i}` }, ip);
      expect(ok.status).toBe(201);
    }
    const blocked = await postThread(validBody, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expectStaffAlerts(LIVE_CHAT_MAX_PER_WINDOW);
  });

  it("saves the visitor message when the staff alert throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmailMock.mockRejectedValue(new Error("smtp down"));
    sendSMSMock.mockRejectedValue(new Error("twilio down"));
    try {
      const res = await postThread(validBody, "203.0.113.60");
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.error).toBeUndefined();
      expect(body.thread.messages).toHaveLength(1);
      expect(body.thread.messages[0].text).toBe(validBody.message);
      expect(JSON.stringify(body)).not.toContain("staffAlert");
      expect((await readContactThreadAlert(body.thread.id))?.staffAlertStatus).toBe("failed");
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][0].to).not.toBe(validBody.email);
      expect(sendSMSMock).toHaveBeenCalledTimes(1);
      expect(sendSMSMock.mock.calls[0][0].to).toBe("+12813560965");
      expect(sendSMSMock.mock.calls[0][0].to).not.toBe(validBody.phone);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("caps office alerts across visitors without dropping the message", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (let i = 0; i < LIVE_CHAT_MAX_PER_WINDOW; i += 1) {
        const ok = await postThread({ ...validBody, message: `Global ${i}` }, `198.51.100.${i + 1}`);
        expect(ok.status).toBe(201);
      }
      expectStaffAlerts(LIVE_CHAT_MAX_PER_WINDOW);

      const extra = await postThread({ ...validBody, message: "One more office chat" }, "198.51.100.50");
      const body = await extra.json();
      expect(extra.status).toBe(201);
      expect(body.thread.messages[0].text).toBe("One more office chat");
      expectStaffAlerts(LIVE_CHAT_MAX_PER_WINDOW);
      const alert = await readContactThreadAlert(body.thread.id);
      expect(alert?.staffAlertStatus).toBe("throttled");
      expect(alert?.lastStaffAlertAt).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("truncates a long visitor message and still links the admin thread", async () => {
    const message = `Hello ${"word ".repeat(200)}ENDMARK`;
    const res = await postThread({ ...validBody, message }, "203.0.113.70");
    const created = await res.json();
    expect(res.status).toBe(201);
    expect(created.thread.messages[0].text).toBe(message);
    expectStaffAlerts(1);
    const email = sendEmailMock.mock.calls[0][0];
    expect(email.variables?.message).toContain("Hello");
    expect(email.variables?.message).not.toContain("ENDMARK");
    expect(email.variables?.message).toContain(created.thread.id);
    expect(email.variables?.message).toContain("...");
    const sms = sendSMSMock.mock.calls[0][0];
    expect(sms.body).toContain(contactThreadAdminUrl(created.thread.id));
    expect(sms.body.length).toBeLessThanOrEqual(640);
  });
});
