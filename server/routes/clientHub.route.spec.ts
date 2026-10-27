import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setEmailDeliveryOverride } from "../services/email";
import { resetClientHubMemory, seedClientHubMemory } from "../services/clientHubStore";
import { createServer } from "../index";

let server: Server;
let baseUrl = "";
const sent: string[] = [];

beforeAll(async () => {
  process.env.CLIENT_HUB_TEST_AUTH = "1";
  process.env.CLIENT_HUB_STORE = "memory";
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.BOOKING_NOTIFY_LIVE;
  setEmailDeliveryOverride(async (message) => {
    sent.push(message.to);
  });
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  sent.length = 0;
  resetClientHubMemory();
  seedClientHubMemory("clients", "owner-1", {
    firstName: "Example",
    lastName: "Agent",
    email: "owner@example.com",
    hubProfile: { brokerage: "Example Brokerage" },
  });
  seedClientHubMemory("clients", "member-uid", {
    firstName: "View",
    lastName: "Only",
    email: "view@example.com",
  });
  seedClientHubMemory("clients", "stranger", { firstName: "Stranger", lastName: "Person", email: "stranger@example.com" });
  seedClientHubMemory("teams", "team-1", { ownerClientId: "owner-1", name: "Example Team" });
  seedClientHubMemory("members", "member-1", {
    teamId: "team-1",
    ownerClientId: "owner-1",
    name: "View Only",
    email: "view@example.com",
    permissions: ["view"],
    linkedClientId: "member-uid",
    status: "active",
  });
  seedClientHubMemory("contacts", "contact-1", {
    ownerClientId: "owner-1",
    name: "Example Client",
    email: "client@example.com",
    tags: ["vip"],
    status: "active",
    source: "manual",
  });
  seedClientHubMemory("contacts", "other-contact", {
    ownerClientId: "stranger",
    name: "Other Client",
    email: "other@example.com",
    status: "lead",
  });
  seedClientHubMemory("billing", "owner-1", {
    ownerClientId: "owner-1",
    email: "billing@example.com",
    line1: "100 Example Street",
    balanceCents: 2500,
  });
  seedClientHubMemory("listings", "listing1234", {
    clientId: "owner-1",
    address: "100 Example Street",
    listingSiteInquiries: [{ name: "Example Buyer", contact: "buyer@example.com", at: "2026-10-02" }],
  });
});

afterAll(async () => {
  setEmailDeliveryOverride(null);
  delete process.env.CLIENT_HUB_TEST_AUTH;
  delete process.env.CLIENT_HUB_STORE;
  resetClientHubMemory();
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function headers(uid: string, email: string) {
  return {
    "content-type": "application/json",
    "x-client-hub-uid": uid,
    "x-client-hub-email": email,
  };
}

describe("client hub permission checks", () => {
  it("requires a signed-in client", async () => {
    const response = await fetch(`${baseUrl}/api/clients/me/hub/profile`);
    expect(response.status).toBe(401);
  });

  it("lets the owner save a profile and keeps another client out of that billing account", async () => {
    const saved = await fetch(`${baseUrl}/api/clients/me/hub/profile`, {
      method: "PATCH",
      headers: headers("owner-1", "owner@example.com"),
      body: JSON.stringify({ firstName: "Example", lastName: "Agent", phone: "(281) 555-0100", brokerage: "Example Brokerage", website: "https://example.com" }),
    });
    expect(saved.status).toBe(200);
    const body = await saved.json() as { profile: { brokerage: string; website: string } };
    expect(body.profile.brokerage).toBe("Example Brokerage");
    expect(body.profile.website).toBe("https://example.com/");

    const denied = await fetch(`${baseUrl}/api/clients/me/hub/billing?account=owner-1`, { headers: headers("stranger", "stranger@example.com") });
    expect(denied.status).toBe(403);
    const card = await fetch(`${baseUrl}/api/clients/me/hub/billing/card`, {
      method: "POST",
      headers: headers("owner-1", "owner@example.com"),
      body: JSON.stringify({ cardNumber: "4242424242424242", cvv: "123" }),
    });
    expect(card.status).toBe(400);
  });

  it("lets a view teammate read the team CRM and blocks billing and other teams", async () => {
    const contacts = await fetch(`${baseUrl}/api/clients/me/hub/clients`, { headers: headers("member-uid", "view@example.com") });
    expect(contacts.status).toBe(200);
    const body = await contacts.json() as { contacts: Array<{ email: string }> };
    expect(body.contacts.map((contact) => contact.email)).toContain("client@example.com");
    expect(body.contacts.map((contact) => contact.email)).toContain("buyer@example.com");
    expect(body.contacts.map((contact) => contact.email)).not.toContain("other@example.com");

    const write = await fetch(`${baseUrl}/api/clients/me/hub/clients`, {
      method: "POST",
      headers: headers("member-uid", "view@example.com"),
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(write.status).toBe(403);

    const billing = await fetch(`${baseUrl}/api/clients/me/hub/billing?account=owner-1`, { headers: headers("member-uid", "view@example.com") });
    expect(billing.status).toBe(403);
  });

  it("stores a team invite without sending mail while client notifications are off", async () => {
    const response = await fetch(`${baseUrl}/api/clients/me/hub/team/members`, {
      method: "POST",
      headers: headers("owner-1", "owner@example.com"),
      body: JSON.stringify({
        name: "Example Teammate",
        email: "teammate@example.com",
        phone: "(281) 555-0111",
        permissions: ["view", "order"],
        invite: true,
      }),
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { inviteEmail: string; members: Array<{ email: string }> };
    expect(body.inviteEmail).toBe("paused");
    expect(body.members.some((member) => member.email === "teammate@example.com")).toBe(true);
    expect(sent).toEqual([]);
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
    expect(process.env.BOOKING_NOTIFY_LIVE).toBeUndefined();
  });
});
