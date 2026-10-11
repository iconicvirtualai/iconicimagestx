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
import { resetContactThreadStoreForTests } from "../services/contactThreads";

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
  sendEmailMock.mockReset();
  sendSMSMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true, delivery: "sent" });
  sendSMSMock.mockResolvedValue({ sid: "SM123", status: "queued" });
});

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
  it("lets staff reply on the visitor thread without email or text", async () => {
    const createdRes = await postThread(validBody, "203.0.113.41");
    const created = await createdRes.json();
    expect(createdRes.status).toBe(201);
    expect(created.thread.messages).toHaveLength(1);
    expect(created.accessToken).toBeTruthy();

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

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
  });

  it("keeps a follow-up visitor message on the same thread", async () => {
    const createdRes = await postThread(validBody, "203.0.113.42");
    const created = await createdRes.json();
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
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
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
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
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

  it("rate-limits visitor posts without sending email or text", async () => {
    const ip = "203.0.113.45";
    for (let i = 0; i < LIVE_CHAT_MAX_PER_WINDOW; i += 1) {
      const ok = await postThread({ ...validBody, message: `Message ${i}` }, ip);
      expect(ok.status).toBe(201);
    }
    const blocked = await postThread(validBody, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
  });
});
