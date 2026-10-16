import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

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
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function preflight(origin: string) {
  return fetch(`${baseUrl}/api/bookings`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
}

describe("booking CORS", () => {
  it("allows the Wix page and its HTML component iframe to POST", async () => {
    const site = await preflight("https://www.iconicimagestx.com");
    const apex = await preflight("https://iconicimagestx.com");
    const frame = await preflight("https://www-iconicimagestx-com.filesusr.com");
    const wixsite = await preflight("https://iconicimagestx.wixsite.com");

    expect(site.headers.get("access-control-allow-origin")).toBe("https://www.iconicimagestx.com");
    expect(apex.headers.get("access-control-allow-origin")).toBe("https://iconicimagestx.com");
    expect(frame.headers.get("access-control-allow-origin")).toBe("https://www-iconicimagestx-com.filesusr.com");
    expect(wixsite.headers.get("access-control-allow-origin")).toBe("https://iconicimagestx.wixsite.com");
    expect(frame.headers.get("access-control-allow-methods") || "").toContain("POST");
  });

  it("does not allow an unrelated origin", async () => {
    const response = await preflight("https://evil.example");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
