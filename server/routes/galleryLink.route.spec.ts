import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

const LISTING_ID = "V92oe4gWihszc95tEcVQ";

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

describe("GET /api/galleries/link/:id", () => {
  it("is registered before the authed gallery read and does not send client mail", () => {
    const galleries = readFileSync(new URL("./galleries.ts", import.meta.url), "utf8");
    const linkAt = galleries.indexOf('"/link/:id"');
    const idAt = galleries.indexOf('"/:id"');
    expect(linkAt).toBeGreaterThan(-1);
    expect(idAt).toBeGreaterThan(linkAt);

    const resolver = readFileSync(new URL("./galleryLink.ts", import.meta.url), "utf8");
    expect(resolver).not.toContain("sendEmail");
    expect(resolver).not.toContain("sendSMS");
    expect(resolver).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(resolver).not.toContain("CLIENT_COMMS_ZONE");
  });

  it("rejects an unsafe id before Firebase is required", async () => {
    const res = await fetch(`${baseUrl}/api/galleries/link/short`);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("invalid_id");
    expect(data.message).toMatch(/not a gallery or project id/);
  });

  it("does not call a missing id a missing gallery when Admin is not configured", async () => {
    const res = await fetch(`${baseUrl}/api/galleries/link/${LISTING_ID}`);
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.code).toBe("lookup_unavailable");
    expect(data.message).toMatch(/not a missing gallery id/);
    expect(data.message).not.toMatch(/CLIENT_NOTIFY_LIVE/);
  });
});
