import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import twilio from "twilio";
import { createServer } from "../index";
import { getTeamChatRepo, resetMemoryTeamChat } from "../services/teamChatRepo";
import {
  createTeamThread,
  publishTeamMessage,
  setTeamPushSenderForTests,
  setTeamSmsSenderForTests,
} from "../services/teamChat";
import { setOrderResolverForTests } from "./teamChat";

const sendSms = vi.fn(async () => ({ sid: "SM_TEST" }));
const sendPush = vi.fn(async () => true);

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TEAM_SMS_WEBHOOK_URL: process.env.TEAM_SMS_WEBHOOK_URL,
  TEAM_SMS_LIVE: process.env.TEAM_SMS_LIVE,
  CLIENT_NOTIFY_LIVE: process.env.CLIENT_NOTIFY_LIVE,
};

let server: Server;
let baseUrl = "";
const token = "team-chat-test-token";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  process.env.NODE_ENV = "test";
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  setTeamSmsSenderForTests(null);
  setTeamPushSenderForTests(null);
  setOrderResolverForTests(null);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.TEAM_SMS_WEBHOOK_URL = `${baseUrl}/api/team-chat/sms/webhook`;
  delete process.env.TEAM_SMS_LIVE;
  delete process.env.CLIENT_NOTIFY_LIVE;
  sendSms.mockClear();
  sendPush.mockClear();
  setTeamSmsSenderForTests(sendSms);
  setTeamPushSenderForTests(sendPush);
  const repo = resetMemoryTeamChat();
  repo.staff.set("alex", { uid: "alex", name: "Alex Rivera", role: "photographer", phone: "(832) 555-0100" });
  repo.staff.set("cadi", { uid: "cadi", name: "Cadi", role: "admin", phone: "8325550199" });
  repo.staff.set("temp-admin-uid", { uid: "temp-admin-uid", name: "Temporary Admin", role: "admin", phone: null });
});

async function postWebhook(params: Record<string, string>, signature?: string) {
  const body = new URLSearchParams(params);
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if (signature) headers.set("X-Twilio-Signature", signature);
  const response = await fetch(`${baseUrl}/api/team-chat/sms/webhook`, { method: "POST", headers, body });
  const text = await response.text();
  return { response, text };
}

function sign(params: Record<string, string>) {
  return twilio.getExpectedTwilioSignature(token, `${baseUrl}/api/team-chat/sms/webhook`, params);
}

async function seedDispatch() {
  const repo = resetMemoryTeamChat();
  repo.staff.set("alex", { uid: "alex", name: "Alex Rivera", role: "photographer", phone: "(832) 555-0100" });
  repo.staff.set("cadi", { uid: "cadi", name: "Cadi", role: "admin", phone: "8325550199" });
  repo.staff.set("temp-admin-uid", { uid: "temp-admin-uid", name: "Temporary Admin", role: "admin", phone: null });
  const thread = await createTeamThread({
    repo,
    kind: "channel",
    name: "dispatch",
    creator: { uid: "cadi", name: "Cadi", role: "admin", phone: "8325550199" },
    memberIds: ["alex"],
  });
  return { repo, thread };
}

describe("team SMS webhook", () => {
  it("rejects a missing or invalid Twilio signature", async () => {
    const params = { From: "+18325550100", Body: "Hello", MessageSid: "SM1" };
    const missing = await postWebhook(params);
    expect(missing.response.status).toBe(403);
    const forged = await postWebhook(params, "not-a-signature");
    expect(forged.response.status).toBe(403);
    expect(await getTeamChatRepo().listThreads()).toEqual([]);
  });

  it("accepts a valid signature and keeps the reply on the most recent thread", async () => {
    const { repo, thread } = await seedDispatch();
    await publishTeamMessage({
      repo,
      threadId: thread.id,
      senderId: "cadi",
      senderName: "Cadi",
      senderRole: "staff",
      body: "Client asked to start in the backyard.",
      source: "app",
    });
    expect(sendSms).not.toHaveBeenCalled();
    const params = { From: "+18325550100", Body: "Starting in the backyard", MessageSid: "SM_RECENT" };
    const result = await postWebhook(params, sign(params));
    expect(result.response.status).toBe(200);
    expect(result.text).toContain("<Response>");
    const messages = await repo.listMessages(thread.id, 10);
    expect(messages.map((message) => message.body)).toContain("Starting in the backyard");
    expect(messages[messages.length - 1]?.senderName).toBe("Alex Rivera");
    expect(JSON.stringify(messages)).not.toMatch(/555-0100|8325550100/);
  });

  it("switches threads when the reply starts with that thread code", async () => {
    const repo = resetMemoryTeamChat();
    repo.staff.set("alex", { uid: "alex", name: "Alex Rivera", role: "photographer", phone: "+18325550100" });
    repo.staff.set("cadi", { uid: "cadi", name: "Cadi", role: "admin", phone: "+18325550199" });
    const dispatch = await createTeamThread({
      repo,
      kind: "channel",
      name: "dispatch",
      creator: { uid: "cadi", name: "Cadi", role: "admin", phone: "+18325550199" },
      memberIds: ["alex"],
    });
    const studio = await createTeamThread({
      repo,
      kind: "channel",
      name: "studio",
      creator: { uid: "cadi", name: "Cadi", role: "admin", phone: "+18325550199" },
      memberIds: ["alex"],
    });
    await repo.setActiveThread("+18325550100", dispatch.id);
    const params = { From: "+18325550100", Body: `${studio.code} Twilight is up`, MessageSid: "SM_SWITCH" };
    const result = await postWebhook(params, sign(params));
    expect(result.response.status).toBe(200);
    const studioMessages = await repo.listMessages(studio.id, 10);
    const dispatchMessages = await repo.listMessages(dispatch.id, 10);
    expect(studioMessages.map((message) => message.body)).toContain("Twilight is up");
    expect(dispatchMessages).toHaveLength(0);
  });

  it("handles STOP and HELP without posting them as chat", async () => {
    const { repo, thread } = await seedDispatch();
    const stop = { From: "+18325550100", Body: "STOP", MessageSid: "SM_STOP" };
    const stopped = await postWebhook(stop, sign(stop));
    expect(stopped.response.status).toBe(200);
    expect(stopped.text).toContain("no longer get Iconic team texts");
    expect((await repo.getPrefs("alex")).smsOptOut).toBe(true);
    const help = { From: "+18325550100", Body: "HELP", MessageSid: "SM_HELP" };
    const helped = await postWebhook(help, sign(help));
    expect(helped.text).toContain("Reply STOP to opt out");
    expect(await repo.listMessages(thread.id, 10)).toHaveLength(0);
  });

  it("logs a dry run and skips SMS when the person has push", async () => {
    const { repo, thread } = await seedDispatch();
    await repo.savePush("alex", [{ endpoint: "https://push.example/alex", p256dh: "key", auth: "auth" }]);
    delete process.env.TEAM_SMS_LIVE;
    await publishTeamMessage({
      repo,
      threadId: thread.id,
      senderId: "cadi",
      senderName: "Cadi",
      senderRole: "staff",
      body: "Push this",
      source: "app",
    });
    expect(sendPush).toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    const pushed = await repo.listSmsLog(10);
    expect(pushed[0]?.status).toBe("push");
    expect(JSON.stringify(pushed)).not.toMatch(/phone|5550100/i);

    sendPush.mockResolvedValueOnce(false);
    await repo.savePush("alex", []);
    await publishTeamMessage({
      repo,
      threadId: thread.id,
      senderId: "cadi",
      senderName: "Cadi",
      senderRole: "staff",
      body: "Would have texted",
      source: "app",
    });
    expect(sendSms).not.toHaveBeenCalled();
    const logs = await repo.listSmsLog(10);
    expect(logs.some((entry) => entry.status === "dry-run" && entry.recipientName === "Alex Rivera")).toBe(true);
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
  });
});

describe("client shooter messages", () => {
  it("texts the shooter only and returns no phone number", async () => {
    const repo = resetMemoryTeamChat();
    repo.staff.set("alex", { uid: "alex", name: "Alex Rivera", role: "photographer", phone: "+18325550100" });
    repo.staff.set("temp-admin-uid", { uid: "temp-admin-uid", name: "Temporary Admin", role: "admin", phone: null });
    setOrderResolverForTests(async () => ({
      clientId: "client-1",
      clientName: "Example Agent",
      photographer: { uid: "alex", name: "Alex Rivera", role: "photographer", phone: "+18325550100" },
      orderId: "order-1",
      listingId: "listing-1",
      address: "100 Example Street",
    }));
    const response = await fetch(`${baseUrl}/api/team-chat/portal/message`, {
      method: "POST",
      headers: {
        Authorization: "Bearer temp-admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingId: "listing-1", body: "Gate code is 4481." }),
    });
    expect(response.status).toBe(403);
    setOrderResolverForTests(async () => ({
      clientId: "temp-admin-uid",
      clientName: "Example Agent",
      photographer: { uid: "alex", name: "Alex Rivera", role: "photographer", phone: "+18325550100" },
      orderId: "order-1",
      listingId: "listing-1",
      address: "100 Example Street",
    }));
    repo.staff.delete("temp-admin-uid");
    const sent = await fetch(`${baseUrl}/api/team-chat/portal/message`, {
      method: "POST",
      headers: {
        Authorization: "Bearer temp-admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingId: "listing-1", body: "Gate code is 4481." }),
    });
    const data = await sent.json();
    expect(sent.status).toBe(200);
    expect(JSON.stringify(data)).not.toMatch(/5550100|phone/i);
    expect(sendSms).not.toHaveBeenCalled();
    const logs = await repo.listSmsLog(10);
    expect(logs.map((entry) => entry.recipientName)).toEqual(["Alex Rivera"]);
    expect(logs[0]?.status).toBe("dry-run");
    const messages = await repo.listMessages(data.thread.id, 10);
    expect(messages[0]?.senderRole).toBe("client");
  });
});
