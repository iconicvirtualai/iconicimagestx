import { readFileSync } from "node:fs";
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
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("portal listing detail routes", () => {
  it("is registered on the client portal and does not publish payment or look up public records", () => {
    const clients = readFileSync(new URL("./clients.ts", import.meta.url), "utf8");
    const listingAt = clients.indexOf('"/me/listings/:id"');
    const idAt = clients.indexOf('"/:id"');
    expect(listingAt).toBeGreaterThan(-1);
    expect(idAt).toBeGreaterThan(listingAt);

    const source = [
      readFileSync(new URL("./portalListing.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../shared/portalListingDetail.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(source).not.toMatch(/har\.com/i);
    expect(source).not.toMatch(/squareup|square\.com|publishInvoice/i);
    expect(source).not.toMatch(/cubicasa\.com/i);
  });

  it("requires a client session before reading a listing file", async () => {
    const res = await fetch(`${baseUrl}/api/clients/me/listings/listing1234`);
    expect(res.status).toBe(401);
    const media = await fetch(`${baseUrl}/api/clients/me/listings/listing1234/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photo", id: "front", hidden: true }),
    });
    expect(media.status).toBe(401);
  });
});
