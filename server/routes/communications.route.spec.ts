import { readFileSync } from "node:fs";
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
import { logCommunicationMessage, resetRememberedCommunications } from "../services/communicationLog";
import { GROK_API_URL, GROK_MISSING_MESSAGE, OPENAI_API_URL, setAssistantFetchForTests } from "../services/assistants";

const sendEmailMock = vi.mocked(sendEmail);
const sendSMSMock = vi.mocked(sendSMS);

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  CLIENT_NOTIFY_LIVE: process.env.CLIENT_NOTIFY_LIVE,
  XAI_API_KEY: process.env.XAI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OWNER_EMAILS: process.env.OWNER_EMAILS,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  process.env.NODE_ENV = "test";
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
  setAssistantFetchForTests(null);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetRememberedCommunications();
  sendEmailMock.mockReset();
  sendSMSMock.mockReset();
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.XAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  setAssistantFetchForTests(null);
});

async function api(path: string, init: RequestInit = {}, token = "temp-admin-token") {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

describe("communications hub", () => {
  it("lists connector-needed socials and keeps portal threads to that login", async () => {
    await logCommunicationMessage({
      threadId: "order:order-a",
      clientId: "client-a",
      senderId: "client-a",
      senderType: "client",
      senderName: "Ada",
      email: "ada@example.com",
      content: "Question about the listing",
      channel: "in-app",
      direction: "inbound",
      delivery: "logged",
    });
    await logCommunicationMessage({
      threadId: "order:order-b",
      clientId: "client-b",
      photographerId: "temp-admin-uid",
      senderId: "temp-admin-uid",
      senderType: "photographer",
      senderName: "Casey",
      content: "On my way",
      channel: "in-app",
      direction: "inbound",
      delivery: "logged",
    });

    const all = await api("/api/communications/threads");
    expect(all.response.status).toBe(200);
    const socials = all.data.threads.filter((thread: { audiences: string[] }) => thread.audiences.includes("socials"));
    expect(socials.map((thread: { title: string }) => thread.title)).toEqual(["Instagram", "Facebook", "TikTok", "Google Business"]);
    expect(socials.every((thread: { subtitle: string }) => thread.subtitle === "Connector needed")).toBe(true);

    const mine = await api("/api/communications/mine");
    expect(mine.data.threads.map((thread: { id: string }) => thread.id)).toEqual(["order:order-b"]);
    expect(JSON.stringify(mine.data)).not.toContain("ada@example.com");

    const open = await fetch(`${baseUrl}/api/communications/threads`);
    expect(open.status).toBe(401);
  });

  it("logs a gated email and SMS reply without sending when client notify is off", async () => {
    sendEmailMock.mockResolvedValue({ sent: false, delivery: "suppressed" });
    sendSMSMock.mockResolvedValue({ sid: "", status: "suppressed", suppressed: true });
    await logCommunicationMessage({
      threadId: "contact:lead-1",
      senderId: "lead",
      senderType: "client",
      senderName: "Bea",
      email: "bea@example.com",
      phone: "2815550199",
      content: "Can you shoot Friday?",
      channel: "contact",
      direction: "inbound",
      delivery: "logged",
    });

    const email = await api("/api/communications/reply", {
      method: "POST",
      body: JSON.stringify({ threadId: "contact:lead-1", channel: "email", body: "Yes, Friday works." }),
    });
    expect(email.response.status).toBe(503);
    expect(email.data.suppressed).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "bea@example.com", template: "manual_message" }));

    const sms = await api("/api/communications/reply", {
      method: "POST",
      body: JSON.stringify({ threadId: "contact:lead-1", channel: "sms", body: "Yes, Friday works." }),
    });
    expect(sms.response.status).toBe(503);
    expect(sendSMSMock).toHaveBeenCalledWith(expect.objectContaining({ to: "2815550199", body: "Yes, Friday works." }));

    const social = await api("/api/communications/reply", {
      method: "POST",
      body: JSON.stringify({ threadId: "social-instagram", channel: "email", body: "Hi" }),
    });
    expect(social.response.status).toBe(400);
    expect(social.data.error).toMatch(/Connector needed/);

    const listed = await api("/api/communications/threads?audience=leads");
    const lead = listed.data.threads.find((thread: { id: string }) => thread.id === "contact:lead-1");
    expect(lead.messages.some((message: { delivery: string; channel: string }) => message.delivery === "suppressed" && message.channel === "email")).toBe(true);
    expect(lead.messages.some((message: { delivery: string; channel: string }) => message.delivery === "suppressed" && message.channel === "sms")).toBe(true);
  });

  it("sends a staff reply only through the existing email and SMS helpers when notify is live", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    sendEmailMock.mockResolvedValue({ sent: true, delivery: "sent" });
    sendSMSMock.mockResolvedValue({ sid: "SM-test", status: "queued" });
    await logCommunicationMessage({
      threadId: "order:live-1",
      clientId: "client-a",
      senderId: "client-a",
      senderType: "client",
      senderName: "Ada",
      email: "ada@example.com",
      phone: "2815550100",
      content: "Invoice question",
      channel: "in-app",
      direction: "inbound",
      delivery: "logged",
    });
    const email = await api("/api/communications/reply", {
      method: "POST",
      body: JSON.stringify({ threadId: "order:live-1", channel: "email", body: "The invoice is attached." }),
    });
    expect(email.response.status).toBe(201);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    delete process.env.CLIENT_NOTIFY_LIVE;
  });

  it("keeps assistant keys on the server and names the missing Grok key", async () => {
    const status = await api("/api/communications/assist/status");
    expect(status.response.status).toBe(200);
    expect(status.data.grokNotice).toBe(GROK_MISSING_MESSAGE);
    expect(status.data.grok).toBe(false);
    expect(JSON.stringify(status.data)).not.toMatch(/sk-|xai-/);

    const blocked = await api("/api/communications/assist", {
      method: "POST",
      body: JSON.stringify({ provider: "grok", messages: [{ role: "user", content: "Hello" }] }),
    });
    expect(blocked.response.status).toBe(409);
    expect(blocked.data.error).toBe("Add XAI_API_KEY to enable Grok");

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const header = new Headers(init.headers).get("authorization") || "";
      expect(String(url)).toBe(GROK_API_URL);
      expect(header).toBe("Bearer xai-test-secret");
      return new Response(JSON.stringify({ choices: [{ message: { content: "Use the inbox filter." } }] }), { status: 200 });
    });
    setAssistantFetchForTests(fetchMock as typeof fetch);
    process.env.XAI_API_KEY = "xai-test-secret";
    const grok = await api("/api/communications/assist", {
      method: "POST",
      body: JSON.stringify({ provider: "grok", messages: [{ role: "user", content: "Where are leads?" }] }),
    });
    expect(grok.response.status).toBe(200);
    expect(grok.data.reply).toBe("Use the inbox filter.");
    expect(JSON.stringify(grok.data)).not.toContain("xai-test-secret");

    process.env.OPENAI_API_KEY = "sk-test-secret";
    setAssistantFetchForTests(vi.fn(async (url: string) => {
      expect(String(url)).toBe(OPENAI_API_URL);
      return new Response(JSON.stringify({ choices: [{ message: { content: "OpenAI ready." } }] }), { status: 200 });
    }) as typeof fetch);
    const openai = await api("/api/communications/assist", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", messages: [{ role: "user", content: "Hi" }] }),
    });
    expect(openai.data.reply).toBe("OpenAI ready.");
    expect(JSON.stringify(openai.data)).not.toContain("sk-test-secret");

    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).toContain("resource.data.clientId == request.auth.uid");
    expect(rules).toContain("resource.data.photographerId == request.auth.uid");
    expect(rules).toContain("request.auth.uid in resource.data.participantIds");
    expect(rules).toContain("match /contactThreads/{threadId}");
  });
});
