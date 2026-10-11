import fs from "fs";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INTENDED_OWNER_EMAIL } from "../../shared/ownerAccess";
import { OWNER_ORDERS_HEADERS } from "../../shared/ownerOrders";
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

const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEET_ID = "1vHkdHRhAWKcnsv8-d1ZZSWRr-OZyy0xCaqK1Bi3VB3Q";
const TEN_OH_FIVE = new Date("2026-10-11T03:05:00.000Z");

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

function writeCalls() {
  return googleState.state.calls.filter((call) => call.scopes.includes(WRITE_SCOPE));
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
    expect(consumeOwnerOrderRateLimit("cadi@iconicimagestx.com", start + 5)).toEqual({
      ok: false,
      error: "Too many orders. You can submit 5 per minute.",
    });
    expect(consumeOwnerOrderRateLimit("other@iconicimagestx.com", start + 5).ok).toBe(true);
    expect(consumeOwnerOrderRateLimit("cadi@iconicimagestx.com", start + 60_000).ok).toBe(true);

    resetOwnerOrderRateLimitForTests();
    for (let i = 0; i < 50; i += 1) {
      expect(consumeOwnerOrderRateLimit("cadi@iconicimagestx.com", start + i * 60_000).ok).toBe(true);
    }
    expect(consumeOwnerOrderRateLimit("cadi@iconicimagestx.com", start + 50 * 60_000)).toEqual({
      ok: false,
      error: "Too many orders. You can submit 50 per day.",
    });
    expect(consumeOwnerOrderRateLimit("cadi@iconicimagestx.com", start + 24 * 60 * 60 * 1000).ok).toBe(true);
  });

  it("does not count invalid text or a failed write", async () => {
    useFakeSheets();
    googleState.state.titles = ["Orders"];
    for (let i = 0; i < 6; i += 1) {
      const rejected = await submitOwnerOrder({ raw: "   ", ownerEmail: INTENDED_OWNER_EMAIL, now: TEN_OH_FIVE });
      expect(rejected).toMatchObject({ ok: false, status: 400 });
    }
    expect(googleState.state.calls).toEqual([]);

    googleState.state.failAppend = true;
    for (let i = 0; i < 5; i += 1) {
      await expect(submitOwnerOrder({
        raw: "Book it",
        ownerEmail: INTENDED_OWNER_EMAIL,
        now: new Date(TEN_OH_FIVE.getTime() + i),
      })).rejects.toThrow(/append failed/);
    }
    googleState.state.failAppend = false;
    const saved = await submitOwnerOrder({
      raw: "Book it",
      ownerEmail: INTENDED_OWNER_EMAIL,
      now: new Date(TEN_OH_FIVE.getTime() + 10),
    });
    expect(saved.ok).toBe(true);
  });
});

describe("owner order sheet writes", () => {
  it("creates a missing Orders tab, freezes the header, and appends a RAW row", async () => {
    useFakeSheets();
    const saved = await submitOwnerOrder({
      raw: "=Book it",
      ownerEmail: INTENDED_OWNER_EMAIL,
      now: TEN_OH_FIVE,
    });
    expect(saved).toEqual({
      ok: true,
      order: {
        timestamp: "2026-10-10 10:05 PM CT",
        text: "'=Book it",
        status: "New",
        ownerBot: "",
        reply: "",
      },
    });
    expect(googleState.state.calls.map((call) => call.method)).toEqual([
      "spreadsheets.get",
      "spreadsheets.batchUpdate",
      "spreadsheets.values.update",
      "spreadsheets.values.append",
    ]);
    expect(writeCalls()).toHaveLength(4);
    expect(googleState.state.calls.every((call) => call.scopes.length === 1 && call.scopes[0] === WRITE_SCOPE)).toBe(true);

    const created = googleState.state.calls[1].args as {
      spreadsheetId: string;
      requestBody: { requests: Array<{ addSheet: { properties: { title: string; gridProperties: { frozenRowCount: number } } } }> };
    };
    expect(created.spreadsheetId).toBe(SHEET_ID);
    expect(created.requestBody.requests).toEqual([
      {
        addSheet: {
          properties: {
            title: "Orders",
            gridProperties: { frozenRowCount: 1 },
          },
        },
      },
    ]);

    const header = googleState.state.calls[2].args as {
      range: string;
      valueInputOption: string;
      requestBody: { values: string[][] };
    };
    expect(header.range).toBe("'Orders'!A1:E1");
    expect(header.valueInputOption).toBe("RAW");
    expect(header.requestBody.values).toEqual([Array.from(OWNER_ORDERS_HEADERS)]);

    const append = googleState.state.calls[3].args as {
      spreadsheetId: string;
      range: string;
      valueInputOption: string;
      insertDataOption: string;
      requestBody: { values: string[][] };
    };
    expect(append).toEqual({
      spreadsheetId: SHEET_ID,
      range: "'Orders'!A:E",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [["2026-10-10 10:05 PM CT", "'=Book it", "New", "", ""]],
      },
    });
    expect(JSON.stringify(googleState.state.calls)).not.toContain("USER_ENTERED");
  });

  it("appends onto an existing Orders tab without creating it again", async () => {
    useFakeSheets();
    googleState.state.titles = ["Friday Scorecard", "Orders"];
    await submitOwnerOrder({ raw: "+call", ownerEmail: INTENDED_OWNER_EMAIL, now: TEN_OH_FIVE });
    expect(googleState.state.calls.map((call) => call.method)).toEqual([
      "spreadsheets.get",
      "spreadsheets.values.append",
    ]);
    const append = googleState.state.calls[1].args as { requestBody: { values: string[][] }; valueInputOption: string };
    expect(append.valueInputOption).toBe("RAW");
    expect(append.requestBody.values).toEqual([["2026-10-10 10:05 PM CT", "'+call", "New", "", ""]]);
  });

  it("rejects 2,001 characters before any sheet call", async () => {
    useFakeSheets();
    const rejected = await submitOwnerOrder({
      raw: `=${"x".repeat(2000)}`,
      ownerEmail: INTENDED_OWNER_EMAIL,
      now: TEN_OH_FIVE,
    });
    expect(rejected).toMatchObject({ ok: false, status: 400 });
    expect(googleState.state.jwtScopes).toEqual([]);
    const accepted = await submitOwnerOrder({
      raw: `=${"x".repeat(1999)}`,
      ownerEmail: INTENDED_OWNER_EMAIL,
      now: TEN_OH_FIVE,
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.order.text).toBe(`'=${"x".repeat(1999)}`);
  });
});

describe("owner order sheet reads", () => {
  it("returns the last 10 rows newest first and does not write", async () => {
    useFakeSheets();
    googleState.state.titles = ["Orders"];
    const header = ["Timestamp CT", "Order text", "Status", "Owner bot", "Cadi 2.0 reply"];
    const grid = [header];
    for (let i = 1; i <= 12; i += 1) {
      grid.push([`T${i}`, `Order ${i}`, "New", i === 12 ? "Inbox" : "", i === 12 ? "Done" : ""]);
    }
    googleState.state.grid = grid;
    const listed = await listOwnerOrders();
    expect(listed.configured).toBe(true);
    expect(listed.orders).toHaveLength(10);
    expect(listed.orders[0]).toEqual({
      timestamp: "T12",
      text: "Order 12",
      status: "New",
      ownerBot: "Inbox",
      reply: "Done",
    });
    expect(listed.orders[9].text).toBe("Order 3");
    expect(listed.orders.map((order) => order.text)).not.toContain("Order 1");
    expect(listed.orders.map((order) => order.text)).not.toContain("Order 2");
    expect(googleState.state.calls.map((call) => call.method)).toEqual([
      "spreadsheets.get",
      "spreadsheets.values.get",
    ]);
    expect(googleState.state.calls.every((call) => call.scopes.length === 1 && call.scopes[0] === READONLY_SCOPE)).toBe(true);
    expect(writeCalls()).toEqual([]);
  });

  it("reads columns by header name", async () => {
    useFakeSheets();
    googleState.state.titles = ["Orders"];
    googleState.state.grid = [
      ["Cadi 2.0 reply", "Owner bot", "Status", "Order text", "Timestamp CT"],
      ["Seen", "Inbox", "Done", "Call the lab", "2026-10-10 10:05 PM CT"],
    ];
    const listed = await listOwnerOrders();
    expect(listed.orders).toEqual([
      {
        timestamp: "2026-10-10 10:05 PM CT",
        text: "Call the lab",
        status: "Done",
        ownerBot: "Inbox",
        reply: "Seen",
      },
    ]);
  });

  it("returns an empty list when the Orders tab is missing and does not create it", async () => {
    useFakeSheets();
    const listed = await listOwnerOrders();
    expect(listed.orders).toEqual([]);
    expect(googleState.state.calls.map((call) => call.method)).toEqual(["spreadsheets.get"]);
    expect(googleState.state.calls[0].scopes).toEqual([READONLY_SCOPE]);
    expect(googleState.state.titles).toEqual(["Friday Scorecard"]);
  });
});

describe("sheets scopes", () => {
  it("keeps the write scope on the orders write path only", async () => {
    useFakeSheets();
    await loadOwnerSuite({ fresh: true });
    await listOwnerOrders();
    expect(googleState.state.jwtScopes.length).toBeGreaterThan(0);
    expect(googleState.state.jwtScopes.every((scopes) => scopes.length === 1 && scopes[0] === READONLY_SCOPE)).toBe(true);
    expect(writeCalls()).toEqual([]);

    const before = googleState.state.jwtScopes.length;
    googleState.state.titles = ["Orders"];
    await submitOwnerOrder({ raw: "Hello", ownerEmail: INTENDED_OWNER_EMAIL, now: TEN_OH_FIVE });
    expect(googleState.state.jwtScopes.slice(0, before).every((scopes) => scopes[0] === READONLY_SCOPE)).toBe(true);
    expect(googleState.state.jwtScopes.slice(before)).toEqual([[WRITE_SCOPE]]);
    expect(writeCalls().length).toBeGreaterThan(0);
    expect(writeCalls().every((call) => call.scopes.length === 1 && call.scopes[0] === WRITE_SCOPE)).toBe(true);
    expect(googleState.state.calls.filter((call) => call.scopes[0] === READONLY_SCOPE).some((call) => call.method === "spreadsheets.values.batchGet")).toBe(true);

    const sheetsSource = fs.readFileSync("server/services/ownerSheets.ts", "utf8");
    const ordersSource = fs.readFileSync("server/services/ownerOrders.ts", "utf8");
    expect(sheetsSource).not.toMatch(/auth\/spreadsheets(?!\.readonly)/);
    expect(ordersSource).toMatch(/auth\/spreadsheets(?!\.readonly)/);
    expect(ordersSource).toContain('valueInputOption: "RAW"');
    expect(ordersSource).not.toContain("USER_ENTERED");
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

  it("validates, rate limits, and appends through the owner route", async () => {
    process.env.OWNER_EMAILS = INTENDED_OWNER_EMAIL;
    useFakeSheets();
    googleState.state.titles = ["Orders"];
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
    expect(saved.status).toBe(201);
    const created = await saved.json() as { order: { text: string; status: string; ownerBot: string; reply: string; timestamp: string } };
    expect(created.order).toMatchObject({ text: "'@ping", status: "New", ownerBot: "", reply: "" });
    expect(created.order.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2} [AP]M CT$/);
    const append = googleState.state.calls.find((call) => call.method === "spreadsheets.values.append");
    expect(append?.scopes).toEqual([WRITE_SCOPE]);
    expect((append?.args as { valueInputOption?: string }).valueInputOption).toBe("RAW");

    googleState.state.grid = [
      ["Timestamp CT", "Order text", "Status", "Owner bot", "Cadi 2.0 reply"],
      [created.order.timestamp, created.order.text, "New", "", ""],
    ];
    const listed = await fetch(`${baseUrl}/api/owners/orders`, { headers: { Authorization: "Bearer cadi-id-token" } });
    expect(listed.status).toBe(200);
    expect(listed.headers.get("cache-control")).toContain("no-store");
    const body = await listed.json() as { orders: Array<{ text: string }> };
    expect(body.orders[0].text).toBe("'@ping");
    expect(googleState.state.calls.filter((call) => call.method === "spreadsheets.values.get").every((call) => call.scopes[0] === READONLY_SCOPE)).toBe(true);

    resetGoogle();
    googleState.state.titles = ["Orders"];
    resetOwnerOrderRateLimitForTests();
    for (let i = 0; i < 5; i += 1) {
      const ok = await fetch(`${baseUrl}/api/owners/orders`, { method: "POST", headers, body: JSON.stringify({ text: `Order ${i}` }) });
      expect(ok.status).toBe(201);
    }
    const limited = await fetch(`${baseUrl}/api/owners/orders`, { method: "POST", headers, body: JSON.stringify({ text: "One more" }) });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many orders. You can submit 5 per minute." });
    expect(googleState.state.calls.filter((call) => call.method === "spreadsheets.values.append")).toHaveLength(5);
  });
});
