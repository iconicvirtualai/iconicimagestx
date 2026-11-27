import fs from "fs";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INTENDED_OWNER_EMAIL } from "../../shared/ownerAccess";
import { createServer } from "../index";
import { __setOwnerIdTokenVerifierForTests } from "./ownerGate";
import {
  consumeOwnerOrderRateLimit,
  formatOrderTimestampCt,
  listOwnerOrders,
  neutralizeSheetFormula,
  prepareOwnerOrderText,
  resetOwnerOrderRateLimitForTests,
  submitOwnerOrder,
} from "./ownerOrders";
import { clearOwnerSuiteCacheForTests, loadOwnerSuite } from "./ownerSheets";

const TEN_OH_FIVE = new Date("2026-10-11T03:05:00.000Z");
const OWNERS_SHEET_PREFIX = "1vHkdHRhAWKcnsv8";

interface SheetsCall {
  scopes: string[];
  method: string;
  args: Record<string, unknown>;
}

const googleState = vi.hoisted(() => {
  const state = {
    jwtScopes: [] as string[][],
    calls: [] as SheetsCall[],
    titles: ["Friday Scorecard"] as string[],
    grid: [] as unknown[][],
    failAppend: false,
  };

  class JWT {
    scopes: string[];
    constructor(options?: { scopes?: string[] }) {
      this.scopes = [...(options?.scopes || [])];
      state.jwtScopes.push(this.scopes);
    }
  }

  function sheets(options: { auth: { scopes: string[] } }) {
    const scopes = options.auth.scopes;
    const record = (method: string, args: unknown) => {
      state.calls.push({ scopes, method, args: (args || {}) as Record<string, unknown> });
    };
    return {
      spreadsheets: {
        get: async (args: unknown) => {
          record("spreadsheets.get", args);
          return { data: { sheets: state.titles.map((title) => ({ properties: { title } })) } };
        },
        batchUpdate: async (args: { requestBody?: { requests?: Array<{ addSheet?: { properties?: { title?: string } } }> } }) => {
          record("spreadsheets.batchUpdate", args);
          for (const request of args?.requestBody?.requests || []) {
            const title = request?.addSheet?.properties?.title;
            if (title && !state.titles.includes(title)) state.titles.push(title);
          }
          return { data: {} };
        },
        values: {
          get: async (args: unknown) => {
            record("spreadsheets.values.get", args);
            return { data: { values: state.grid } };
          },
          batchGet: async (args: { ranges?: string[] }) => {
            record("spreadsheets.values.batchGet", args);
            return { data: { valueRanges: (args?.ranges || []).map(() => ({ values: [] })) } };
          },
          update: async (args: unknown) => {
            record("spreadsheets.values.update", args);
            return { data: {} };
          },
          append: async (args: unknown) => {
            record("spreadsheets.values.append", args);
            if (state.failAppend) {
              const error = new Error("append failed") as Error & { code?: number };
              error.code = 500;
              throw error;
            }
            return { data: {} };
          },
        },
      },
    };
  }

  return { state, JWT, sheets };
});

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: googleState.JWT },
    sheets: googleState.sheets,
  },
}));

const KEYS = [
  "OWNER_EMAILS",
  "OWNER_SUITE_FIXTURES",
  "OWNER_SESSION_SECRET",
  "OWNER_SHEETS_SA_EMAIL",
  "OWNER_SHEETS_SA_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "VERCEL",
  "VERCEL_ENV",
  "NODE_ENV",
] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function resetGoogle() {
  googleState.state.jwtScopes = [];
  googleState.state.calls = [];
  googleState.state.titles = ["Friday Scorecard"];
  googleState.state.grid = [];
  googleState.state.failAppend = false;
}

function useFakeSheets() {
  delete process.env.OWNER_SUITE_FIXTURES;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = "test";
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: "sheets-reader@iconic-images-aicon.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
  });
}


beforeEach(() => {
  restoreEnv();
  resetGoogle();
  resetOwnerOrderRateLimitForTests();
  clearOwnerSuiteCacheForTests();
  __setOwnerIdTokenVerifierForTests(null);
});

afterEach(() => {
  restoreEnv();
  resetOwnerOrderRateLimitForTests();
  clearOwnerSuiteCacheForTests();
  __setOwnerIdTokenVerifierForTests(null);
});

describe("owner order text", () => {
  it("trims, rejects empty text, and caps the length at 2,000 characters", () => {
    expect(prepareOwnerOrderText("")).toEqual({ ok: false, error: "Enter an order." });
    expect(prepareOwnerOrderText("   \n")).toEqual({ ok: false, error: "Enter an order." });
    expect(prepareOwnerOrderText(null)).toEqual({ ok: false, error: "Enter an order." });
    expect(prepareOwnerOrderText(12)).toEqual({ ok: false, error: "Enter an order." });
    const exact = "a".repeat(2000);
    expect(prepareOwnerOrderText(`  ${exact}  `)).toEqual({ ok: true, text: exact });
    expect(prepareOwnerOrderText("b".repeat(2001))).toEqual({
      ok: false,
      error: "Orders are limited to 2,000 characters.",
    });
  });

  it("neutralizes a leading formula character and leaves ordinary text alone", () => {
    expect(neutralizeSheetFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeSheetFormula("+1 512")).toBe("'+1 512");
    expect(neutralizeSheetFormula("-10")).toBe("'-10");
    expect(neutralizeSheetFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(prepareOwnerOrderText("  =cmd  ")).toEqual({ ok: true, text: "'=cmd" });
    expect(prepareOwnerOrderText("hello = world")).toEqual({ ok: true, text: "hello = world" });
    expect(prepareOwnerOrderText("a+b")).toEqual({ ok: true, text: "a+b" });
  });

  it("stamps America/Chicago as a CT clock time", () => {
    expect(formatOrderTimestampCt(TEN_OH_FIVE)).toBe("2026-10-10 10:05 PM CT");
    expect(formatOrderTimestampCt(new Date("2026-10-10T14:05:00.000Z"))).toBe("2026-10-10 9:05 AM CT");
    expect(formatOrderTimestampCt(new Date("2026-01-15T06:05:00.000Z"))).toBe("2026-01-15 12:05 AM CT");
  });
});

describe("owner order rate limit", () => {
  it("allows 5 submits a minute and 50 a day, per owner", () => {
    const start = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(consumeOwnerOrderRateLimit("Cadi@IconicImagesTX.com", start + i).ok).toBe(true);
    }
    expect(consumeOwnerOrderRateLimit(INTENDED_OWNER_EMAIL, start + 5)).toEqual({
      ok: false,
      error: "Too many orders. You can submit 5 per minute.",
    });
    expect(consumeOwnerOrderRateLimit("other@iconicimagestx.com", start + 5).ok).toBe(true);
    expect(consumeOwnerOrderRateLimit(INTENDED_OWNER_EMAIL, start + 60_000).ok).toBe(true);

    resetOwnerOrderRateLimitForTests();
    for (let i = 0; i < 50; i += 1) {
      expect(consumeOwnerOrderRateLimit(INTENDED_OWNER_EMAIL, start + i * 60_000).ok).toBe(true);
    }
    expect(consumeOwnerOrderRateLimit(INTENDED_OWNER_EMAIL, start + 50 * 60_000)).toEqual({
      ok: false,
      error: "Too many orders. You can submit 50 per day.",
    });
    expect(consumeOwnerOrderRateLimit(INTENDED_OWNER_EMAIL, start + 24 * 60 * 60 * 1000).ok).toBe(true);
  });

  it("does not write a valid order to a spreadsheet", async () => {
    useFakeSheets();
    for (let i = 0; i < 6; i += 1) {
      const rejected = await submitOwnerOrder({ raw: "   ", ownerEmail: INTENDED_OWNER_EMAIL, now: TEN_OH_FIVE });
      expect(rejected).toMatchObject({ ok: false, status: 400 });
    }
    const saved = await submitOwnerOrder({
      raw: "Book it",
      ownerEmail: INTENDED_OWNER_EMAIL,
      now: TEN_OH_FIVE,
    });
    expect(saved).toEqual({ ok: false, status: 503, error: "Orders are not connected." });
    expect(googleState.state.calls).toEqual([]);
    expect(googleState.state.jwtScopes).toEqual([]);
  });
});

describe("owners workbook is unlinked", () => {
  it("does not call Sheets for a list or a submit", async () => {
    useFakeSheets();
    const listed = await listOwnerOrders();
    expect(listed).toEqual({
      orders: [],
      configured: false,
      notice: "Orders are not connected.",
      readerEmail: null,
    });
    const saved = await submitOwnerOrder({
      raw: "=Book it",
      ownerEmail: INTENDED_OWNER_EMAIL,
      now: TEN_OH_FIVE,
    });
    expect(saved).toMatchObject({ ok: false, status: 503 });
    await loadOwnerSuite({ fresh: true });
    expect(googleState.state.calls).toEqual([]);
    expect(googleState.state.jwtScopes).toEqual([]);
  });

  it("keeps the owners workbook id out of the server source", () => {
    const sheetsSource = fs.readFileSync("server/services/ownerSheets.ts", "utf8");
    const ordersSource = fs.readFileSync("server/services/ownerOrders.ts", "utf8");
    const routes = fs.readFileSync("server/routes/owners.ts", "utf8");
    const combined = sheetsSource + ordersSource + routes;
    expect(combined).not.toContain(OWNERS_SHEET_PREFIX);
    expect(combined).not.toContain("spreadsheets/d/");
    expect(ordersSource).not.toContain("spreadsheets.values");
    expect(sheetsSource).not.toContain("spreadsheets.get");
  });
});

describe("orders routes", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    process.env.OWNER_SESSION_SECRET = "owners-suite-test-secret";
    const app = createServer();
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it("answers 404 for a non-owner and does not touch sheets", async () => {
    process.env.OWNER_EMAILS = INTENDED_OWNER_EMAIL;
    useFakeSheets();
    resetGoogle();
    __setOwnerIdTokenVerifierForTests(async () => ({
      email: "admin@iconicimagestx.com",
      uid: "admin-uid",
    }));
    const posted = await fetch(`${baseUrl}/api/owners/orders`, {
      method: "POST",
      headers: { Authorization: "Bearer admin-id-token", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "=secret order" }),
    });
    const listed = await fetch(`${baseUrl}/api/owners/orders`, {
      headers: { Authorization: "Bearer admin-id-token" },
    });
    expect(posted.status).toBe(404);
    expect(listed.status).toBe(404);
    expect(await posted.text()).not.toContain("secret order");
    expect(googleState.state.jwtScopes).toEqual([]);
    expect(googleState.state.calls).toEqual([]);
  });

  it("validates an owner order and does not write it", async () => {
    process.env.OWNER_EMAILS = INTENDED_OWNER_EMAIL;
    useFakeSheets();
    __setOwnerIdTokenVerifierForTests(async () => ({
      email: "Cadi@IconicImagesTX.com",
      uid: "cadi-uid",
    }));
    const headers = { Authorization: "Bearer cadi-id-token", "Content-Type": "application/json" };

    const empty = await fetch(`${baseUrl}/api/owners/orders`, { method: "POST", headers, body: JSON.stringify({ text: "  " }) });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Enter an order." });

    const tooLong = await fetch(`${baseUrl}/api/owners/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "c".repeat(2001) }),
    });
    expect(tooLong.status).toBe(400);
    expect(googleState.state.calls).toEqual([]);

    const saved = await fetch(`${baseUrl}/api/owners/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "@ping" }),
    });
    expect(saved.status).toBe(503);
    expect(await saved.json()).toEqual({ error: "Orders are not connected." });
    expect(googleState.state.calls).toEqual([]);

    const listed = await fetch(`${baseUrl}/api/owners/orders`, { headers: { Authorization: "Bearer cadi-id-token" } });
    expect(listed.status).toBe(200);
    expect(listed.headers.get("cache-control")).toContain("no-store");
    const body = await listed.json() as { orders: unknown[]; configured: boolean; notice: string };
    expect(body.orders).toEqual([]);
    expect(body.configured).toBe(false);
    expect(body.notice).toBe("Orders are not connected.");
  });
});
