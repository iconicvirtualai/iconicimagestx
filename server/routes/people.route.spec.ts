import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/email", () => ({ sendEmail: vi.fn() }));
vi.mock("../services/sms", () => ({ sendSMS: vi.fn() }));

import { createServer } from "../index";
import { sendEmail } from "../services/email";
import { sendSMS } from "../services/sms";
import { resetPeopleDeskForTests, setPeopleActorForTests } from "../services/peopleDesk";
import type { DeskActor } from "../../shared/peopleProfiles.ts";

const sendEmailMock = vi.mocked(sendEmail);
const sendSMSMock = vi.mocked(sendSMS);

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  CLIENT_NOTIFY_LIVE: process.env.CLIENT_NOTIFY_LIVE,
  TEAM_SMS_LIVE: process.env.TEAM_SMS_LIVE,
  CAMPAIGN_SEND_LIVE: process.env.CAMPAIGN_SEND_LIVE,
  BOOKING_NOTIFY_LIVE: process.env.BOOKING_NOTIFY_LIVE,
  THANKFUL_RSVP_CONFIRM_LIVE: process.env.THANKFUL_RSVP_CONFIRM_LIVE,
  CLIENT_PORTAL_ENABLED: process.env.CLIENT_PORTAL_ENABLED,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.TEAM_SMS_LIVE;
  delete process.env.CAMPAIGN_SEND_LIVE;
  delete process.env.BOOKING_NOTIFY_LIVE;
  delete process.env.THANKFUL_RSVP_CONFIRM_LIVE;
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
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetPeopleDeskForTests();
  sendEmailMock.mockReset();
  sendSMSMock.mockReset();
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

const riley: DeskActor = {
  uid: "sample-riley",
  email: "riley.broker@example.com",
  kind: "client",
  role: "client",
  leadAdmin: false,
  permissions: null,
};

describe("people desk", () => {
  it("does not send mail or texts and leaves the live flags off", () => {
    const route = readFileSync("server/routes/people.ts", "utf8");
    const desk = readFileSync("server/services/peopleDesk.ts", "utf8");
    expect(route + desk).not.toMatch(/sendEmail|sendSMS|sendMail|twilio|nodemailer|holyGrail|HOLY_GRAIL/);
    expect(route).not.toMatch(/CLIENT_NOTIFY_LIVE|TEAM_SMS_LIVE|CAMPAIGN_SEND_LIVE|BOOKING_NOTIFY_LIVE|CLIENT_PORTAL_ENABLED/);
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
    expect(process.env.TEAM_SMS_LIVE).toBeUndefined();
    expect(process.env.CAMPAIGN_SEND_LIVE).toBeUndefined();
  });

  it("lists preview people and keeps production preview off", async () => {
    const { response, data } = await api("/api/people/directory?q=mike");
    expect(response.status).toBe(200);
    expect(data.profiles.some((profile: { displayName: string }) => profile.displayName === "Mike Luna")).toBe(true);
    expect(data.groups.some((group: { name: string }) => group.name === "Video group")).toBe(true);
    expect(previewBlockedInProduction()).toBe(false);
  });

  it("delivers an Admin Group message only to its members", async () => {
    setPeopleActorForTests(riley);
    const { response, data } = await api("/api/people/inbox/send", {
      method: "POST",
      body: JSON.stringify({ groupId: "preview-admin", body: "Please confirm the invoice.", subject: "Invoice" }),
    });
    expect(response.status).toBe(201);
    expect(data.external).toBe(false);
    expect(data.delivery).toBe("in-app");
    expect(data.notifiedUids.sort()).toEqual(["sample-cadi", "sample-cora", "sample-jane"]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
  });

  it("refuses a lead admin who is not allowed to message the Video group", async () => {
    const { response, data } = await api("/api/people/inbox/send", {
      method: "POST",
      body: JSON.stringify({ groupId: "preview-video", body: "Hello video desk" }),
    });
    expect(response.status).toBe(400);
    expect(String(data.error)).toMatch(/permission/i);
    expect(sendSMSMock).not.toHaveBeenCalled();
  });

  it("lets a lead admin read another group's thread without a notification", async () => {
    const { response, data } = await api("/api/people/inbox?folder=all-groups");
    expect(response.status).toBe(200);
    const video = data.threads.find((thread: { groupName: string }) => thread.groupName === "Video group");
    expect(video.notified).toBe(false);
    const own = await api("/api/people/inbox?folder=inbox");
    expect(own.data.threads.some((thread: { groupName: string }) => thread.groupName === "Video group")).toBe(false);
  });

  it("saves a draft without delivering it", async () => {
    const { response, data } = await api("/api/people/inbox/draft", {
      method: "POST",
      body: JSON.stringify({ profileIds: ["staff:sample-mike"], subject: "Schedule", body: "Are you free Thursday?" }),
    });
    expect(response.status).toBe(201);
    expect(data.thread.status).toBe("draft");
    expect(data.thread.notifyUids).toEqual([]);
    expect(data.external).toBe(false);
    const drafts = await api("/api/people/inbox?folder=drafts");
    expect(drafts.data.threads.some((thread: { subject: string }) => thread.subject === "Schedule")).toBe(true);
  });

  it("blocks a staff login whose messages permission is off", async () => {
    const locked: DeskActor = {
      uid: "sample-mike",
      email: "mike@iconicimagestx.com",
      kind: "staff",
      role: "photographer",
      leadAdmin: false,
      permissions: { "messages.view": false, "messages.compose": false },
    };
    setPeopleActorForTests(locked);
    const { response } = await api("/api/people/inbox");
    expect(response.status).toBe(403);
  });

  it("refuses a card number on profile settings", async () => {
    const { response } = await api("/api/people/client/sample-jane/settings", {
      method: "PATCH",
      body: JSON.stringify({ cardNumber: "4242424242424242", brokerage: "Sample Brokerage" }),
    });
    expect(response.status).toBe(400);
  });
});

function previewBlockedInProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}
