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
    expect(clients).toContain('"/me/listings/:id/data"');
    expect(clients).toContain("handlePatchPortalData");

    const source = [
      readFileSync(new URL("./portalListing.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../shared/portalListingDetail.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(source).not.toMatch(/har\.com/i);
    expect(source).not.toMatch(/squareup|square\.com|publishInvoice/i);
    expect(source).not.toMatch(/cubicasa\.com/i);
  });

  it("requires a client session to edit, and reads a listing link without one", async () => {
    const res = await fetch(`${baseUrl}/api/clients/me/listings/listing1234`);
    expect(res.status).toBe(401);
    const media = await fetch(`${baseUrl}/api/clients/me/listings/listing1234/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photo", id: "front", hidden: true }),
    });
    expect(media.status).toBe(401);
    const website = await fetch(`${baseUrl}/api/clients/me/listings/listing1234/website`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ font: "serif" }),
    });
    expect(website.status).toBe(401);
    const data = await fetch(`${baseUrl}/api/clients/me/listings/listing1234/data`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: { line1: "9 Main" }, facts: { beds: "4" } }),
    });
    expect(data.status).toBe(401);

    const index = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    expect(index).toContain('app.get("/api/portal/listings/:id", handleGetPublicPortalListing)');
    expect(index).not.toContain('app.get("/api/portal/listings"');
    expect(index).not.toContain('"/api/portal/home"');

    const handler = readFileSync(new URL("./portalListing.ts", import.meta.url), "utf8");
    const start = handler.indexOf("export const handleGetPublicPortalListing");
    const end = handler.indexOf("export const handleGetPortalListing");
    const pub = handler.slice(start, end);
    expect(pub).toContain("visitorPortalListingDetail");
    expect(pub).not.toContain("clientCanViewListing");
    expect(pub).not.toContain("authorizedListing");
    expect(handler).toContain("authorizedListing");

    const app = readFileSync(new URL("../../client/App.tsx", import.meta.url), "utf8");
    expect(app).toContain('path="/portal/listings/:listingId"');
    expect(app).not.toContain('path="/portal/listings"');
    expect(app).toContain('path="/portal/home"');

    const home = readFileSync(new URL("../../client/pages/ClientPortal.tsx", import.meta.url), "utf8");
    expect(home).toContain('to="/portal"');

    const missingId = await fetch(`${baseUrl}/api/portal/listings/no`);
    expect(missingId.status).toBe(404);
    const missingBody = await missingId.json();
    expect(missingBody.title).toBeUndefined();
    expect(missingBody.photos).toBeUndefined();

    const shared = await fetch(`${baseUrl}/api/portal/listings/listing1234`);
    expect(shared.status).not.toBe(401);
    expect([200, 404, 503]).toContain(shared.status);
    const sharedBody = await shared.json();
    if (shared.status === 200) {
      expect(sharedBody.id).toBe("listing1234");
      expect(sharedBody.invoices).toEqual([]);
      const body = JSON.stringify(sharedBody);
      expect(body).not.toMatch(/invoiceNumber|amountDue|"total"|Payment recorded|\bInvoice\b/i);
    } else {
      expect(sharedBody.title).toBeUndefined();
      expect(sharedBody.photos).toBeUndefined();
    }

    const bare = await fetch(`${baseUrl}/api/portal/listings`);
    expect(bare.status).toBe(404);
    const publicWrite = await fetch(`${baseUrl}/api/portal/listings/listing1234/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photo", id: "front", hidden: true }),
    });
    expect(publicWrite.status).toBe(404);
    const publicData = await fetch(`${baseUrl}/api/portal/listings/listing1234/data`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: { line1: "9 Main" }, facts: { beds: "4" } }),
    });
    expect(publicData.status).toBe(404);
  });
});
