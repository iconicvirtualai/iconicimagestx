import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { resetMarketingStoreForTests } from "../services/marketingStore";
import { resetChannelCampaignStoreForTests } from "../services/channelCampaignStore";
import { setCampaignDeliveryForTests, type OutboundMail } from "../services/campaignDelivery";
import { setHolyGrailAudienceReaderForTests } from "../services/holyGrailAudience";

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  CLIENT_NOTIFY_LIVE: process.env.CLIENT_NOTIFY_LIVE,
  CLIENT_COMMS_ZONE: process.env.CLIENT_COMMS_ZONE,
  CAMPAIGN_SEND_LIVE: process.env.CAMPAIGN_SEND_LIVE,
  CAMPAIGN_SEND_DELAY_MS: process.env.CAMPAIGN_SEND_DELAY_MS,
  CHANNEL_CAMPAIGN_TEST_ROLE: process.env.CHANNEL_CAMPAIGN_TEST_ROLE,
  CHANNEL_CAMPAIGN_SAMPLE: process.env.CHANNEL_CAMPAIGN_SAMPLE,
  MARKETING_UNSUBSCRIBE_SECRET: process.env.MARKETING_UNSUBSCRIBE_SECRET,
  MARKETING_PUBLIC_URL: process.env.MARKETING_PUBLIC_URL,
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
  setCampaignDeliveryForTests({ mailer: null, texter: null });
  setHolyGrailAudienceReaderForTests(undefined);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetMarketingStoreForTests();
  resetChannelCampaignStoreForTests();
  setCampaignDeliveryForTests({ mailer: null, texter: null });
  setHolyGrailAudienceReaderForTests(undefined);
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.CLIENT_COMMS_ZONE;
  delete process.env.CAMPAIGN_SEND_LIVE;
  delete process.env.CHANNEL_CAMPAIGN_TEST_ROLE;
  delete process.env.CHANNEL_CAMPAIGN_SAMPLE;
  process.env.CAMPAIGN_SEND_DELAY_MS = "0";
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-unsubscribe-secret";
  process.env.MARKETING_PUBLIC_URL = "https://iconicimagestx.vercel.app";
});

async function api(path: string, init: RequestInit = {}, token = "temp-admin-token") {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function seedPeople() {
  const people = [
    { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", phone: "2815550101", emailVerified: true },
    { email: "sam@example.com", firstName: "Sam", lastName: "Rivera", phone: "2815550144", emailVerified: true },
    { email: "unsub@example.com", firstName: "Una", lastName: "Subbed", emailVerified: true },
    { email: "dnc@example.com", firstName: "Dana", lastName: "Quiet", phone: "2815550177", emailVerified: true },
  ];
  for (const person of people) {
    const savedPerson = await api("/api/marketing/contacts", { method: "POST", body: JSON.stringify(person) });
    expect(savedPerson.response.status).toBe(200);
  }
  for (const entry of [
    { value: "unsub@example.com", reason: "unsubscribed", note: "Unsubscribed" },
    { value: "dnc@example.com", reason: "manual", note: "Do not contact" },
  ]) {
    const savedEntry = await api("/api/marketing/suppression", { method: "POST", body: JSON.stringify(entry) });
    expect(savedEntry.response.status).toBe(200);
  }
}

function draftBody() {
  return {
    name: "Spring listing refresh",
    purpose: "Invite past clients to book a spring media refresh.",
    startsOn: "2026-11-18",
    endsOn: "2026-11-30",
    ownerName: "Cadi",
    email: {
      enabled: true,
      mode: "builder",
      subject: "Spring photos for {FirstName}",
      preheader: "A fresh set",
      blocks: [{ id: "book", type: "button", text: "Book", url: "", href: "https://iconicimagestx.com/book" }],
      scheduledAt: "2026-11-18T15:00:00.000Z",
    },
    sms: { enabled: true, body: "Hi {FirstName}, spring dates are open.", scheduledAt: "2026-11-19T16:00:00.000Z" },
    posts: [{ id: "ig", platform: "instagram", copy: "Spring listings", mediaUrl: "/email/holiday-2026/logo.png", mediaName: "logo.png", scheduledAt: "2026-11-20T18:00:00.000Z" }],
  };
}

async function readyCampaign() {
  await seedPeople();
  const created = await api("/api/channel-campaigns", { method: "POST", body: JSON.stringify(draftBody()) });
  expect(created.response.status).toBe(201);
  const id = created.data.campaign.id as string;
  expect((await api(`/api/channel-campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status: "draft" }) })).response.status).toBe(200);
  expect((await api(`/api/channel-campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status: "ready" }) })).response.status).toBe(200);
  return id;
}

describe("channel campaigns", () => {
  it("requires staff and keeps a dry run from emailing or texting anyone", async () => {
    const open = await api("/api/channel-campaigns", {}, "");
    expect(open.response.status).toBe(401);

    const mail: OutboundMail[] = [];
    const texts: { to: string; body: string }[] = [];
    setCampaignDeliveryForTests({
      mailer: async (message) => { mail.push(message); },
      texter: async (to, body) => { texts.push({ to, body }); return { sid: "SM1" }; },
    });

    const id = await readyCampaign();
    const audience = await api("/api/channel-campaigns/audience");
    expect(audience.data.audience.emailCount).toBe(2);
    expect(audience.data.audience.smsCount).toBe(2);
    expect(audience.data.audience.unsubscribe).toBe(1);
    expect(audience.data.audience.doNotContact).toBe(1);

    process.env.CHANNEL_CAMPAIGN_TEST_ROLE = "coordinator";
    const denied = await api(`/api/channel-campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status: "approved" }) });
    expect(denied.response.status).toBe(403);
    delete process.env.CHANNEL_CAMPAIGN_TEST_ROLE;

    const approved = await api(`/api/channel-campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status: "approved" }) });
    expect(approved.response.status).toBe(200);

    const dry = await api(`/api/channel-campaigns/${id}/send`, { method: "POST", body: "{}" });
    expect(dry.response.status).toBe(200);
    expect(dry.data.dryRun).toBe(true);
    expect(dry.data.live).toBe(false);
    expect(mail).toHaveLength(0);
    expect(texts).toHaveLength(0);
    expect(dry.data.log.lines.map((line: { to: string }) => line.to)).toEqual(expect.arrayContaining(["ada@example.com", "sam@example.com", "2815550101", "instagram"]));
    expect(dry.data.log.lines.find((line: { channel: string }) => line.channel === "sms").detail).toMatch(/STOP/);
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();

    const testSend = await api(`/api/channel-campaigns/${id}/test`, { method: "POST", body: JSON.stringify({ firstName: "Cadi" }) });
    expect(testSend.response.status).toBe(200);
    expect(testSend.data.to).toBe("temp-admin@iconicimagestx.com");
    expect(mail.map((message) => message.to)).toEqual(["temp-admin@iconicimagestx.com"]);
    expect(mail[0].html).toContain("26410 Oakridge Dr");
    expect(mail[0].html).toContain("/unsubscribe");
    expect(mail[0].html).not.toContain("ada@example.com");

    process.env.CAMPAIGN_SEND_LIVE = "true";
    const sent = await api(`/api/channel-campaigns/${id}/send`, { method: "POST", body: "{}" });
    expect(sent.response.status).toBe(200);
    expect(sent.data.dryRun).toBe(false);
    expect(sent.data.sent).toBe(4);
    expect(mail.map((message) => message.to).sort()).toEqual(["ada@example.com", "sam@example.com", "temp-admin@iconicimagestx.com"]);
    expect(texts.map((message) => message.to).sort()).toEqual(["2815550101", "2815550144"]);
    expect(texts.every((message) => /STOP/.test(message.body))).toBe(true);
    expect(mail.some((message) => message.to === "dnc@example.com" || message.to === "unsub@example.com")).toBe(false);
  });

  it("reads the Holy Grail sheet without writing it", async () => {
    const calls: string[] = [];
    setHolyGrailAudienceReaderForTests({
      async get(range: string) {
        calls.push(range);
        if (range.includes("📇 Contacts") && range.includes("A1:ZZ1")) {
          return [["Email", "Phone", "Live Status", "Email OK", "First Name", "Last Name"]];
        }
        if (range.includes("📇 Contacts")) {
          return [
            ["sheet@example.com", "2815550160", "", "YES", "Sheet", "Person"],
            ["quiet@example.com", "", "⛔ DNC", "NO", "Quiet", "One"],
          ];
        }
        return [["Email", "Phone", "Name"]];
      },
    });
    const audience = await api("/api/channel-campaigns/audience");
    expect(audience.response.status).toBe(200);
    expect(audience.data.audience.emailCount).toBe(1);
    expect(audience.data.audience.doNotContact).toBe(1);
    expect(audience.data.audience.sheetNote).toMatch(/Nothing was written/);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((range) => range.includes("!"))).toBe(true);

    const source = readFileSync(new URL("../services/holyGrailAudience.ts", import.meta.url), "utf8");
    expect(source).toContain("values.get");
    expect(source).not.toContain("values.update");
    expect(source).not.toContain("batchUpdate");
    expect(source).not.toContain("values.append");

    const route = readFileSync(new URL("./channelCampaigns.ts", import.meta.url), "utf8");
    expect(route).not.toMatch(/CLIENT_NOTIFY_LIVE\s*=/);
    expect(route).not.toContain("BOOKING_NOTIFY_LIVE");
    expect(route).not.toContain("THANKFUL_RSVP_CONFIRM_LIVE");
    expect(route).not.toContain("CLIENT_PORTAL_ENABLED");

    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    const start = rules.indexOf("match /channelCampaigns/{campaignId}");
    const block = rules.slice(start, rules.indexOf("match /channelCampaignCounters", start));
    expect(block).toContain("allow read: if isStaff();");
    expect(block).toContain("allow write: if false;");
    expect(rules).toContain("match /socialHandoff/{itemId}");
    expect(rules).toContain("match /channelCampaignCounters/{docId}");
  });
});
