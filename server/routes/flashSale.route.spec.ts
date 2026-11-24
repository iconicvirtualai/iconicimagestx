import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../index";
import { resetFlashSaleMemory, flashSaleMemoryOrders, flashSaleMemoryOrderTwins } from "../services/flashSaleOrders";
import { resetFlashSaleRateLimit } from "./flashSale";

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
  resetFlashSaleRateLimit();
  resetFlashSaleMemory();
  process.env.SQUARE_ACCESS_TOKEN = "sq-test";
  process.env.SQUARE_LOCATION_ID = "LOC";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (envBackup.SQUARE_ACCESS_TOKEN === undefined) delete process.env.SQUARE_ACCESS_TOKEN;
  else process.env.SQUARE_ACCESS_TOKEN = envBackup.SQUARE_ACCESS_TOKEN;
  if (envBackup.SQUARE_LOCATION_ID === undefined) delete process.env.SQUARE_LOCATION_ID;
  else process.env.SQUARE_LOCATION_ID = envBackup.SQUARE_LOCATION_ID;
  if (envBackup.SQUARE_ENVIRONMENT === undefined) delete process.env.SQUARE_ENVIRONMENT;
  else process.env.SQUARE_ENVIRONMENT = envBackup.SQUARE_ENVIRONMENT;
});

function buyer(bundle: number) {
  return { bundle, addon: "reel", name: "Ada Agent", email: "ada@example.com", phone: "2815550100" };
}

describe("flash sale checkout", () => {
  it("records an order and returns a Square link without capturing a payment", async () => {
    let posted: { url: string; body: Record<string, unknown> } | null = null;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      if (!String(url).includes("squareup")) return realFetch(url, init as RequestInit);
      posted = { url: String(url), body: JSON.parse(init?.body || "{}") };
      return {
        ok: true,
        json: async () => ({ payment_link: { id: "link-1", order_id: "sq-1", url: "https://square.link/u/flash" } }),
      };
    });

    const five = await fetch(`${baseUrl}/api/flash-sale/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buyer(5)),
    });
    const body = await five.json() as { checkoutUrl?: string; orderNumber?: string };
    expect(five.status).toBe(200);
    expect(body.checkoutUrl).toBe("https://square.link/u/flash");
    expect(posted?.url).toBe("https://connect.squareupsandbox.com/v2/online-checkout/payment-links");
    const lines = (posted?.body.order as { line_items?: Array<{ name?: string; base_price_money?: { amount?: number } }> }).line_items;
    expect(lines?.map((line) => line.base_price_money?.amount)).toEqual([125000, 3500]);
    expect(lines?.[0]?.name).toBe("Black Friday Sale · 5 shoots");
    expect(lines?.[1]?.name).toBe("Processing (2.8%)");
    const saved = flashSaleMemoryOrders();
    expect(saved).toHaveLength(1);
    expect(saved[0].collection).toBe("orderRequests");
    expect(saved[0].clientName).toBe("Ada Agent");
    expect(saved[0].clientEmail).toBe("ada@example.com");
    expect(saved[0].email).toBe("ada@example.com");
    expect(saved[0].clientPhone).toBe("2815550100");
    expect(saved[0].address).toBe("");
    expect(saved[0].total).toBe(1285);
    expect(saved[0].status).toBe("awaiting-payment");
    expect(saved[0].orderNumber).toBe(body.orderNumber);
    expect(Array.isArray(saved[0].lineItems)).toBe(true);
    expect(String(saved[0].source)).toBe("flash-sale");
    expect(saved[0].title).toBe("Black Friday Sale · 5 shoots");
    expect(saved[0].leadSource).toBe("Black Friday Sale");
    const twin = flashSaleMemoryOrderTwins();
    expect(twin).toHaveLength(1);
    expect(twin[0].collection).toBe("orders");
    expect(twin[0].id).toBe(saved[0].id);
    expect(twin[0].orderRequestId).toBe(saved[0].id);
    expect(saved[0].orderId).toBe(saved[0].id);

    const ten = await fetch(`${baseUrl}/api/flash-sale/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buyer(10), addon: "floor-plan" }),
    });
    expect(ten.status).toBe(200);
  });

  it("does not open Square for a bad bundle", async () => {
    const response = await fetch(`${baseUrl}/api/flash-sale/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buyer(7)),
    });
    expect(response.status).toBe(400);
    expect(flashSaleMemoryOrders()).toHaveLength(0);
  });
});
