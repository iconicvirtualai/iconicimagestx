import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../index";
import { publicSiteUrl } from "../../shared/publicSiteUrl";
import { resetStockFootageRateLimit } from "./stockFootage";

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
  resetStockFootageRateLimit();
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

describe("amenity stock checkout", () => {
  it("starts a Square payment link and does not list the locked photos", async () => {
    let posted: { url: string; body: Record<string, unknown> } | null = null;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      if (!String(url).includes("squareup")) return realFetch(url, init as RequestInit);
      posted = { url: String(url), body: JSON.parse(init?.body || "{}") };
      return {
        ok: true,
        json: async () => ({ payment_link: { id: "link-1", order_id: "order-1", url: "https://square.link/u/amenity" } }),
      };
    });

    const response = await fetch(`${baseUrl}/api/stock-footage/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "artavia" }),
    });
    const body = await response.json() as { checkoutUrl?: string; manualDelivery?: boolean; orderNumber?: string };
    expect(response.status).toBe(200);
    expect(body.checkoutUrl).toBe("https://square.link/u/amenity");
    expect(body.manualDelivery).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/A73033|webp|download/i);
    expect(posted?.url).toBe("https://connect.squareupsandbox.com/v2/online-checkout/payment-links");
    const redirect = (posted?.body.checkout_options as { redirect_url?: string } | undefined)?.redirect_url;
    expect(redirect).toBe(`${publicSiteUrl()}/stock-footage?paid=1&set=artavia&order=${body.orderNumber}`);
    expect(redirect).not.toMatch(/iconicimagestx\.com/);
    const quick = posted?.body.quick_pay as { name?: string; price_money?: { amount?: number } };
    expect(quick.name).toContain("Artavia amenity photos");
    expect(quick.price_money?.amount).toBe(4999);
  });

  it("refuses an unknown set and a non-Square checkout URL", async () => {
    const missing = await fetch(`${baseUrl}/api/stock-footage/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "memorial" }),
    });
    expect(missing.status).toBe(404);

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (!String(url).includes("squareup")) return realFetch(url, init);
      return {
        ok: true,
        json: async () => ({ payment_link: { url: "https://evil.example/pay" } }),
      };
    });
    const refused = await fetch(`${baseUrl}/api/stock-footage/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "woodforest" }),
    });
    expect(refused.status).toBe(503);
    const body = await refused.json() as { checkoutUrl?: string };
    expect(body.checkoutUrl).toBeUndefined();
  });

  it("does not serve unpaid amenity files", async () => {
    const locked = await fetch(`${baseUrl}/media/amenities/artavia/A7303323.jpg`);
    expect(locked.status).toBe(404);
    const directory = await fetch(`${baseUrl}/media/amenities/benders-landing/`);
    expect(directory.status).toBe(404);
    const ping = await fetch(`${baseUrl}/api/ping`);
    expect(ping.status).toBe(200);
  });
});
