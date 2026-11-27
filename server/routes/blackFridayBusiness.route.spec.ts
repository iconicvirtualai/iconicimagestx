import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BLACK_FRIDAY_BUSINESS_ENDS_MS } from "../../shared/blackFridayBusiness";
import { createServer } from "../index";
import { resetFlashSaleMemory, flashSaleMemoryOrders } from "../services/flashSaleOrders";
import { resetBlackFridayBusinessRateLimit } from "./blackFridayBusiness";

let server: Server;
let baseUrl = "";
const envBackup = {
  SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
};

beforeAll(async () => {
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetBlackFridayBusinessRateLimit();
  resetFlashSaleMemory();
  process.env.SQUARE_ACCESS_TOKEN = "sq-test";
  process.env.SQUARE_LOCATION_ID = "LOC";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (envBackup.SQUARE_ACCESS_TOKEN === undefined) delete process.env.SQUARE_ACCESS_TOKEN;
  else process.env.SQUARE_ACCESS_TOKEN = envBackup.SQUARE_ACCESS_TOKEN;
  if (envBackup.SQUARE_LOCATION_ID === undefined) delete process.env.SQUARE_LOCATION_ID;
  else process.env.SQUARE_LOCATION_ID = envBackup.SQUARE_LOCATION_ID;
  if (envBackup.SQUARE_ENVIRONMENT === undefined) delete process.env.SQUARE_ENVIRONMENT;
  else process.env.SQUARE_ENVIRONMENT = envBackup.SQUARE_ENVIRONMENT;
});

function buyer(packageId: string) {
  return {
    package: packageId,
    name: "Ada Agent",
    business: "Ada Realty",
    email: "ada@example.com",
    phone: "2815550100",
  };
}

describe("black friday business checkout", () => {
  it("charges each package in full with no processing fee and returns a Square link", async () => {
    vi.spyOn(Date, "now").mockReturnValue(BLACK_FRIDAY_BUSINESS_ENDS_MS);
    const posted: Array<{ amount: number; name: string }> = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      if (!String(url).includes("squareup")) return realFetch(url, init as RequestInit);
      const body = JSON.parse(init?.body || "{}") as {
        order?: { line_items?: Array<{ name?: string; base_price_money?: { amount?: number } }> };
      };
      const lines = body.order?.line_items || [];
      expect(lines).toHaveLength(1);
      posted.push({
        amount: lines[0]?.base_price_money?.amount || 0,
        name: lines[0]?.name || "",
      });
      return {
        ok: true,
        json: async () => ({ payment_link: { id: "link-bfb", order_id: "sq-bfb", url: "https://square.link/u/bfb" } }),
      };
    });

    const expected = [
      { id: "blitz", cents: 200000, dollars: 2000, name: "Black Friday · The Content Blitz" },
      { id: "growth", cents: 250000, dollars: 2500, name: "Black Friday · The Growth Engine" },
      { id: "domination", cents: 600000, dollars: 6000, name: "Black Friday · The 90-Day Domination" },
    ];

    for (const item of expected) {
      resetFlashSaleMemory();
      const response = await fetch(`${baseUrl}/api/black-friday-business/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buyer(item.id)),
      });
      const body = await response.json() as { checkoutUrl?: string; total?: string; orderNumber?: string };
      expect(response.status).toBe(200);
      expect(body.checkoutUrl).toBe("https://square.link/u/bfb");
      expect(body.total).toBe(item.dollars === 2000 ? "$2,000" : item.dollars === 2500 ? "$2,500" : "$6,000");
      const saved = flashSaleMemoryOrders();
      expect(saved).toHaveLength(1);
      expect(saved[0].source).toBe("black-friday-business");
      expect(saved[0].package).toBe(item.id);
      expect(saved[0].processing).toBe(0);
      expect(saved[0].total).toBe(item.dollars);
      expect(saved[0].status).toBe("awaiting-payment");
      expect(saved[0].orderNumber).toBe(body.orderNumber);
      expect(String(saved[0].notes)).not.toMatch(/\bA\.?\s*I\.?\b/i);
    }

    expect(posted.map((line) => line.amount)).toEqual([200000, 250000, 600000]);
    expect(posted.map((line) => line.name)).toEqual(expected.map((item) => item.name));
  });

  it("blocks a new checkout after 11:59:59 PM CT and does not open Square", async () => {
    const realFetch = globalThis.fetch;
    let squareCalls = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (String(url).includes("squareup")) {
        squareCalls += 1;
        return { ok: false, json: async () => ({}) };
      }
      return realFetch(url, init);
    });
    vi.spyOn(Date, "now").mockReturnValue(BLACK_FRIDAY_BUSINESS_ENDS_MS + 1000);

    const response = await fetch(`${baseUrl}/api/black-friday-business/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buyer("growth")),
    });
    const body = await response.json() as { error?: string };
    expect(response.status).toBe(410);
    expect(body.error).toBe("This Black Friday offer has ended.");
    expect(squareCalls).toBe(0);
    expect(flashSaleMemoryOrders()).toHaveLength(0);
  });

  it("does not open Square for an unknown package", async () => {
    const response = await fetch(`${baseUrl}/api/black-friday-business/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buyer("weekly")),
    });
    expect(response.status).toBe(400);
    expect(flashSaleMemoryOrders()).toHaveLength(0);
  });
});
