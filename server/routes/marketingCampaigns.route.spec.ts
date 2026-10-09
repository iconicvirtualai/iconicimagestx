import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { resetMarketingStoreForTests } from "../services/marketingStore";
import { setGmassClientForTests, type GmassClient } from "../services/gmassClient";

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  CLIENT_NOTIFY_LIVE: process.env.CLIENT_NOTIFY_LIVE,
  CLIENT_COMMS_ZONE: process.env.CLIENT_COMMS_ZONE,
  MARKETING_DEMO: process.env.MARKETING_DEMO,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.CLIENT_COMMS_ZONE;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  setGmassClientForTests(null);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetMarketingStoreForTests();
  setGmassClientForTests(null);
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.MARKETING_DEMO;
});

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer temp-admin-token");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function gmassMock(writesEnabled: boolean, calls: { draft?: unknown; send?: unknown }[]): GmassClient {
  return {
    configured: true,
    writesEnabled,
    getUser: async () => ({ email: "photos@iconicimagestx.com" }),
    getWarmup: async () => [],
    listUnsubscribeDomains: async () => [],
    addUnsubscribe: async () => ({}),
    removeUnsubscribe: async () => ({}),
    addUnsubscribeDomain: async () => ({}),
    removeUnsubscribeDomain: async () => ({}),
    createDraft: async (draft) => {
      calls.push({ draft });
      return { campaignDraftId: "draft-1" };
    },
    sendCampaign: async (_id, settings) => {
      calls.push({ send: settings });
      return { campaignId: 4242 };
    },
    sendTransactional: async () => ({ ok: true }),
    listCampaigns: async () => [],
    getCampaign: async () => ({ campaignId: 4242, statistics: { recipients: 1, opens: 0, clicks: 0, replies: 0, unsubscribes: 0, bounces: 0, blocks: 0 } }),
    report: async () => ({ data: [], metadata: { totalRecords: 0 } }),
  };
}

describe("campaign send guard", () => {
  it("confirms the suppressed count and refuses to call GMass until sending is enabled", async () => {
    await api("/api/marketing/imports/commit", {
      method: "POST",
      body: JSON.stringify({
        headers: ["email", "first", "last"],
        rows: [
          ["ready@example.com", "Ready", "Agent"],
          ["fresh@example.com", "Fresh", "Import"],
          ["bruce@anywhere.com", "Bruce", "Kink"],
        ],
        mapping: { email: "email", first: "firstName", last: "lastName" },
      }),
    });
    const created = await api("/api/marketing/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "October agents", subject: "Hi {FirstName|there}", html: "<p>Hi {FirstName|there}</p>", audienceMode: "all" }),
    });
    const id = created.data.campaign.id;
    const preview = await api(`/api/marketing/campaigns/${id}/preview`, { method: "POST", body: JSON.stringify({ overlapOverride: false }) });
    expect(preview.response.status).toBe(200);
    expect(preview.data.confirmation.recipientCount).toBe(2);
    expect(preview.data.confirmation.suppressed).toBe(1);
    expect(preview.data.confirmation.unverified).toBe(2);
    expect(preview.data.confirmation.warnings[0]).toMatch(/never verified/);
    expect(preview.data.confirmation.removedPreview.some((item: { email: string }) => item.email === "bruce@anywhere.com")).toBe(true);

    const calls: { draft?: { emailAddresses?: string; fromEmail?: string } }[] = [];
    process.env.CLIENT_NOTIFY_LIVE = "true";
    setGmassClientForTests(gmassMock(false, calls));
    const blocked = await api(`/api/marketing/campaigns/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ token: preview.data.confirmation.token, overlapOverride: false }),
    });
    expect(blocked.response.status).toBe(503);
    expect(calls).toHaveLength(0);

    setGmassClientForTests(gmassMock(true, calls));
    const sent = await api(`/api/marketing/campaigns/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ token: preview.data.confirmation.token, overlapOverride: false }),
    });
    expect(sent.response.status).toBe(200);
    expect(sent.data.campaign.gmassCampaignId).toBe("4242");
    expect(calls[0].draft?.emailAddresses?.split(",").sort()).toEqual(["fresh@example.com", "ready@example.com"]);
    expect(calls[0].draft?.fromEmail).toBe("photos@iconicimagestx.com");

    const second = await api("/api/marketing/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Overlap", subject: "Again", html: "<p>Hi</p>", audienceMode: "all" }),
    });
    const held = await api(`/api/marketing/campaigns/${second.data.campaign.id}/preview`, { method: "POST", body: "{}" });
    expect(held.data.confirmation.overlapHeld).toBe(2);
    expect(held.data.confirmation.recipientCount).toBe(0);
    const overridden = await api(`/api/marketing/campaigns/${second.data.campaign.id}/preview`, {
      method: "POST",
      body: JSON.stringify({ overlapOverride: true }),
    });
    expect(overridden.data.confirmation.recipientCount).toBe(2);
    expect(overridden.data.confirmation.overlapHeld).toBe(0);
  });

  it("sends as a saved from address and rejects one that was never added", async () => {
    const added = await api("/api/marketing/settings", {
      method: "POST",
      body: JSON.stringify({
        sendingAccounts: [
          { email: "photos@iconicimagestx.com", label: "Photos" },
          { email: "news@iconicimagestx.com", label: "News" },
        ],
      }),
    });
    expect(added.response.status).toBe(200);
    expect(added.data.settings.sendingAccounts.map((account: { email: string }) => account.email)).toEqual([
      "photos@iconicimagestx.com",
      "news@iconicimagestx.com",
    ]);

    await api("/api/marketing/imports/commit", {
      method: "POST",
      body: JSON.stringify({
        headers: ["email"],
        rows: [["ready@example.com"]],
        mapping: { email: "email" },
      }),
    });
    const created = await api("/api/marketing/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: "News list",
        subject: "Hello",
        html: "<p>Hi</p>",
        audienceMode: "all",
        fromEmail: "news@iconicimagestx.com",
      }),
    });
    expect(created.data.campaign.fromEmail).toBe("news@iconicimagestx.com");
    const rejected = await api(`/api/marketing/campaigns/${created.data.campaign.id}`, {
      method: "POST",
      body: JSON.stringify({ fromEmail: "stranger@example.com" }),
    });
    expect(rejected.response.status).toBe(400);

    const preview = await api(`/api/marketing/campaigns/${created.data.campaign.id}/preview`, { method: "POST", body: "{}" });
    expect(preview.data.confirmation.fromEmail).toBe("news@iconicimagestx.com");
    const calls: { draft?: { fromEmail?: string } }[] = [];
    process.env.CLIENT_NOTIFY_LIVE = "true";
    setGmassClientForTests(gmassMock(true, calls));
    const sent = await api(`/api/marketing/campaigns/${created.data.campaign.id}/send`, {
      method: "POST",
      body: JSON.stringify({ token: preview.data.confirmation.token, overlapOverride: false }),
    });
    expect(sent.response.status).toBe(200);
    expect(calls[0].draft?.fromEmail).toBe("news@iconicimagestx.com");
  });

  it("keeps the public sample route off unless the demo flag is set", async () => {
    const hidden = await api("/api/marketing/demo/sample-report", { method: "POST", body: "{}" });
    expect(hidden.response.status).toBe(404);
  });
});
