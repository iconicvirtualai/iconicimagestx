import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../index";
import { SMS_HELP_REPLY } from "../../shared/a2p";
import { isSmsStopped, readMarketingOptInForTests, resetSmsProgramForTests } from "../services/smsProgram";

const deliverCampaignSms = vi.hoisted(() => vi.fn(async () => ({ sid: "SM-opt-in", status: "queued" })));

vi.mock("../services/sms", async () => {
  const actual = await vi.importActual<typeof import("../services/sms")>("../services/sms");
  return { ...actual, deliverCampaignSms };
});

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  delete process.env.CAMPAIGN_SEND_LIVE;
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetSmsProgramForTests();
  deliverCampaignSms.mockClear();
  delete process.env.CAMPAIGN_SEND_LIVE;
});

describe("marketing SMS opt-in", () => {
  it("stores consent and does not text when CAMPAIGN_SEND_LIVE is unset", async () => {
    const rejected = await fetch(`${baseUrl}/api/sms/marketing-opt-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "Ada Lovelace", phone: "2815550101", consent: false, source: "/sms" }),
    });
    expect(rejected.status).toBe(400);

    const response = await fetch(`${baseUrl}/api/sms/marketing-opt-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "A2P-Test",
        "X-Forwarded-For": "203.0.113.8",
      },
      body: JSON.stringify({ name: "Ada Lovelace", phone: "(281) 555-0101", consent: true, source: "/sms" }),
    });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.confirmation).toBe("skipped");
    expect(body.source).toBe("/sms");
    expect(body.consentTextVersion).toBe("2026-10-01-marketing-v1");
    expect(deliverCampaignSms).not.toHaveBeenCalled();
    expect(process.env.CAMPAIGN_SEND_LIVE).toBeUndefined();
    const saved = readMarketingOptInForTests("2815550101");
    expect(saved).toMatchObject({
      phone: "2815550101",
      source: "/sms",
      ip: "203.0.113.8",
      userAgent: "A2P-Test",
      marketingSmsOptIn: true,
      consentTextVersion: "2026-10-01-marketing-v1",
    });
    expect(saved?.createdAt).toBeTruthy();
  });

  it("sends the confirmation only when CAMPAIGN_SEND_LIVE is exactly true", async () => {
    process.env.CAMPAIGN_SEND_LIVE = "true";
    const response = await fetch(`${baseUrl}/api/sms/marketing-opt-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "Ada Lovelace", phone: "2815550102", consent: true, source: "/sms" }),
    });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.confirmation).toBe("sent");
    expect(deliverCampaignSms).toHaveBeenCalledTimes(1);
    expect(deliverCampaignSms.mock.calls[0]?.[2]).toBe(true);
    delete process.env.CAMPAIGN_SEND_LIVE;
  });
});

describe("STOP and HELP on the existing inbound webhooks", () => {
  it("opts the number out everywhere on STOP and replies to HELP", async () => {
    await fetch(`${baseUrl}/api/sms/marketing-opt-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "Ada Lovelace", phone: "2815550103", consent: true, source: "/sms" }),
    });

    const stop = await fetch(`${baseUrl}/api/sms/opt-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: "+12815550103", Body: "STOP" }),
    });
    expect(stop.status).toBe(200);
    expect(await isSmsStopped("2815550103")).toBe(true);
    expect(readMarketingOptInForTests("2815550103")?.marketingSmsOptIn).toBe(false);

    const help = await fetch(`${baseUrl}/api/sms/opt-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: "+12815550103", Body: "HELP" }),
    });
    expect(await help.text()).toContain(SMS_HELP_REPLY.replaceAll("&", "&amp;"));

    const webhook = await fetch(`${baseUrl}/api/sms/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: "+12815550109", Body: "HELP" }),
    });
    expect(await webhook.text()).toContain(SMS_HELP_REPLY.replaceAll("&", "&amp;"));
    expect(process.env.CAMPAIGN_SEND_LIVE).toBeUndefined();
  });
});
