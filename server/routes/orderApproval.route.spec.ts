import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { OWNER_FIXTURE_BEARER, signOwnerSession } from "../services/ownerGate";
import { readOrderApproval, resetOrderApprovalMemory, seedOrderForApproval } from "../services/orderApprovalStore";

const KEYS = ["ENABLE_TEMP_ADMIN", "OWNER_EMAILS", "OWNER_SUITE_FIXTURES", "OWNER_SESSION_SECRET", "VERCEL", "VERCEL_ENV", "NODE_ENV"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  process.env.OWNER_SESSION_SECRET = "owners-suite-test-secret";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = "test";
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  resetOrderApprovalMemory();
  seedOrderForApproval("order-1");
});

afterEach(() => {
  for (const key of KEYS) {
    if (key === "NODE_ENV" || key === "ENABLE_TEMP_ADMIN" || key === "OWNER_SESSION_SECRET") continue;
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(async () => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetOrderApprovalMemory();
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function patch(body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/api/admin/orders/order-1/approval`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as { error?: string; approval?: { status: string; note: string; by: string; at: string } } | null;
  return { response, json };
}

describe("order approval", () => {
  it("asks for a sign-in when the request has no owner or admin", async () => {
    const { response } = await patch({ status: "Completed", note: "" });
    expect(response.status).toBe(401);
    expect(readOrderApproval("order-1")).toBeNull();
  });

  it("stores the approval for an admin", async () => {
    const { response, json } = await patch(
      { status: "Go for it!", note: "" },
      { Authorization: "Bearer temp-admin-token" },
    );
    expect(response.status).toBe(200);
    expect(json?.approval?.status).toBe("Go for it!");
    expect(json?.approval?.by).toBe("temp-admin@iconicimagestx.com");
    expect(json?.approval?.at).toBeTruthy();
    expect(readOrderApproval("order-1")?.status).toBe("Go for it!");
  });

  it("requires a note for Needs Revisions", async () => {
    const { response, json } = await patch(
      { status: "Needs Revisions", note: "   " },
      { Authorization: "Bearer temp-admin-token" },
    );
    expect(response.status).toBe(400);
    expect(json?.error).toBe("Add a note for Needs Revisions.");
    expect(readOrderApproval("order-1")).toBeNull();
  });

  it("returns 404 when the order is missing", async () => {
    const response = await fetch(`${baseUrl}/api/admin/orders/missing-order/approval`, {
      method: "PATCH",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Completed", note: "" }),
    });
    expect(response.status).toBe(404);
  });

  it("stores the approval for the owner", async () => {
    process.env.OWNER_EMAILS = "owner@example.com";
    process.env.OWNER_SUITE_FIXTURES = "true";
    const { response, json } = await patch(
      { status: "Needs Revisions", note: " Warm the twilight frames. " },
      { Authorization: `Bearer ${OWNER_FIXTURE_BEARER}` },
    );
    expect(response.status).toBe(200);
    expect(json?.approval).toMatchObject({
      status: "Needs Revisions",
      note: "Warm the twilight frames.",
      by: "owner@example.com",
    });
  });

  it("accepts an owner session cookie", async () => {
    process.env.OWNER_EMAILS = "owner@example.com";
    const token = signOwnerSession(
      { email: "owner@example.com", uid: "owner-1" },
      "owners-suite-test-secret",
    );
    const { response, json } = await patch(
      { status: "Completed", note: "" },
      { Cookie: `owners_session=${token}` },
    );
    expect(response.status).toBe(200);
    expect(json?.approval?.by).toBe("owner@example.com");
    expect(json?.approval?.status).toBe("Completed");
  });
});
