import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMemoryFirestore } from "../lib/memoryFirestore";
import { createServer } from "../index";
import { hashBotRoomKey, resetBotRoomRateLimits, useBotRoomFirestore } from "../services/botRoom";

const memory = createMemoryFirestore();

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  AGENT_SERVICE_KEY: process.env.AGENT_SERVICE_KEY,
  CLIENT_NOTIFY_LIVE: process.env.CLIENT_NOTIFY_LIVE,
  BOOKING_NOTIFY_LIVE: process.env.BOOKING_NOTIFY_LIVE,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.AGENT_SERVICE_KEY;
  useBotRoomFirestore(memory.db);
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  useBotRoomFirestore(null);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  memory.clear();
  resetBotRoomRateLimits();
  delete process.env.AGENT_SERVICE_KEY;
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.BOOKING_NOTIFY_LIVE;
});

async function api(path: string, init: RequestInit = {}, token = "temp-admin-token") {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function issueCodyKey(): Promise<string> {
  const created = await api("/api/botroom/keys", {
    method: "POST",
    body: JSON.stringify({ label: "Cody site", botName: "Cody" }),
  });
  expect(created.response.status).toBe(201);
  expect(typeof created.data.key).toBe("string");
  return created.data.key as string;
}

describe("botroom auth and messages", () => {
  it("rejects a bad key and a revoked key, and takes sender from the key", async () => {
    const key = await issueCodyKey();
    const dumped = JSON.stringify(memory.dump());
    expect(dumped).not.toContain(key);
    expect(dumped).toContain(hashBotRoomKey(key));

    const bad = await api("/api/botroom/messages", {
      method: "POST",
      body: JSON.stringify({ topic: "Orders", body: "should not land", sender: "Cody" }),
      headers: { "x-botroom-key": "br_not-a-real-key" },
    }, "");
    expect(bad.response.status).toBe(401);
    expect(bad.data.error).toMatch(/invalid bot key/i);

    const posted = await api("/api/botroom/messages", {
      method: "POST",
      body: JSON.stringify({
        topic: "Site launch",
        body: "<p>Hello <b>Cadi</b></p><script>alert(1)</script>",
        sender: "Nora",
        platform: "human",
        mentions: ["Cora"],
        needsCadi: true,
      }),
      headers: { "x-botroom-key": key },
    }, "");
    expect(posted.response.status).toBe(201);
    expect(posted.data.message.sender).toBe("Cody");
    expect(posted.data.message.platform).toBe("grok");
    expect(posted.data.message.verified).toBe(true);
    expect(posted.data.message.body).toBe("Hello Cadi");
    expect(posted.data.message.needsCadi).toBe(true);
    expect(posted.data.message.mentions).toEqual(["Cora"]);
    expect(JSON.stringify(posted.data)).not.toContain(key);

    const keys = await api("/api/botroom/keys");
    expect(keys.response.status).toBe(200);
    expect(JSON.stringify(keys.data)).not.toContain(key);
    expect(keys.data.keys[0].keyHash).toBeUndefined();
    expect(keys.data.keys[0].botName).toBe("Cody");

    const revoked = await api(`/api/botroom/keys/${keys.data.keys[0].id}/revoke`, { method: "POST" });
    expect(revoked.response.status).toBe(200);

    const after = await api("/api/botroom/messages", {
      method: "POST",
      body: JSON.stringify({ topic: "Orders", body: "revoked keys cannot post" }),
      headers: { "x-botroom-key": key },
    }, "");
    expect(after.response.status).toBe(401);
    expect(after.data.error).toMatch(/revoked/i);

    const room = await api("/api/botroom/messages");
    expect(room.data.messages).toHaveLength(1);
    expect(room.data.messages[0].sender).toBe("Cody");
  });

  it("posts, reads since, and acks without using the shared service key", async () => {
    const cora = await api("/api/botroom/keys", {
      method: "POST",
      body: JSON.stringify({ label: "ChatGPT Cora", botName: "Cora" }),
    });
    const cody = await api("/api/botroom/keys", {
      method: "POST",
      body: JSON.stringify({ label: "Grok Cody", botName: "Cody" }),
    });
    const coraKey = cora.data.key as string;
    const codyKey = cody.data.key as string;

    const first = await api("/api/botroom/messages", {
      method: "POST",
      body: JSON.stringify({
        topic: "Appt reminders",
        body: "Appt: Tomorrow 10:00 AM at 1842 Oak Street.",
        mentions: ["Cody"],
        links: [{ kind: "order", id: "ord_1842" }],
        needsCadi: true,
      }),
      headers: { "x-botroom-key": coraKey },
    }, "");
    expect(first.response.status).toBe(201);
    expect(first.data.message.sender).toBe("Cora");
    expect(first.data.message.platform).toBe("chatgpt");

    const second = await api("/api/botroom/messages", {
      method: "POST",
      body: JSON.stringify({
        topic: "Appt reminders",
        body: "I will keep deploys off that window.",
        mentions: ["Cora"],
        replyTo: first.data.message.id,
      }),
      headers: { "x-botroom-key": codyKey },
    }, "");
    expect(second.response.status).toBe(201);
    expect(second.data.message.sender).toBe("Cody");
    expect(second.data.message.replyTo).toBe(first.data.message.id);

    const since = await api(`/api/botroom/messages?since=${encodeURIComponent(first.data.message.id)}&topic=${encodeURIComponent("Appt reminders")}&mention=Cora`, {
      headers: { "x-botroom-key": codyKey },
    }, "");
    expect(since.response.status).toBe(200);
    expect(since.data.messages.map((message: { sender: string }) => message.sender)).toEqual(["Cody"]);
    expect(since.data.nextSince).toBe(second.data.message.id);

    const acked = await api(`/api/botroom/messages/${first.data.message.id}/ack`, {
      method: "POST",
      headers: { "x-botroom-key": codyKey },
    }, "");
    expect(acked.response.status).toBe(200);
    expect(acked.data.message.readers.map((reader: { name: string }) => reader.name)).toEqual(["Cody"]);

    const again = await api(`/api/botroom/messages/${first.data.message.id}/ack`, {
      method: "POST",
      headers: { "x-botroom-key": codyKey },
    }, "");
    expect(again.data.message.readers).toHaveLength(1);

    const human = await api("/api/botroom/messages", {
      method: "POST",
      body: JSON.stringify({ topic: "Calendar", body: "Confirmed the shooter.", sender: "Nora" }),
    });
    expect(human.response.status).toBe(201);
    expect(human.data.message.sender).toBe("Cadi");
    expect(human.data.message.platform).toBe("human");
    expect(human.data.message.verified).toBe(true);
  });

  it("marks a shared service-key sender unverified and keeps the spec public", async () => {
    process.env.AGENT_SERVICE_KEY = "shared-agent-key-for-tests";
    const posted = await api("/api/botroom/messages", {
      method: "POST",
      body: JSON.stringify({
        topic: "Orders",
        body: "Shared key post shared-agent-key-for-tests",
        sender: "Sam",
      }),
      headers: { "x-agent-key": "shared-agent-key-for-tests" },
    }, "");
    expect(posted.response.status).toBe(201);
    expect(posted.data.message.sender).toBe("Sam");
    expect(posted.data.message.platform).toBe("grok");
    expect(posted.data.message.verified).toBe(false);
    expect(posted.data.message.body).not.toContain("shared-agent-key-for-tests");
    expect(posted.data.message.body).toContain("[redacted]");

    const open = await fetch(`${baseUrl}/api/botroom/messages`);
    expect(open.status).toBe(401);

    const spec = await fetch(`${baseUrl}/api/botroom/openapi.json`);
    const document = await spec.json();
    expect(spec.status).toBe(200);
    expect(document.openapi).toBe("3.1.0");
    expect(document.components.securitySchemes.BotRoomKey.name).toBe("x-botroom-key");
    expect(document.paths["/messages"].get.parameters.some((item: { name: string }) => item.name === "since")).toBe(true);
    expect(JSON.stringify(document)).not.toContain("shared-agent-key-for-tests");
  });

  it("denies direct client access in the Firestore rules and does not touch client notify", () => {
    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    expect(rules).toMatch(/match \/botRoomMessages\/\{messageId\}[\s\S]*allow read, write: if false/);
    expect(rules).toMatch(/match \/botRoomKeys\/\{keyId\}[\s\S]*allow read, write: if false/);
    const source = readFileSync(new URL("./botroom.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/sendEmail|sendSMS|CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE/);
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
    expect(process.env.BOOKING_NOTIFY_LIVE).toBeUndefined();
  });
});
