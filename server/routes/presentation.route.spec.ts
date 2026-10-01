import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

const savedEnv = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (savedEnv.ENABLE_TEMP_ADMIN === undefined) delete process.env.ENABLE_TEMP_ADMIN;
  else process.env.ENABLE_TEMP_ADMIN = savedEnv.ENABLE_TEMP_ADMIN;
  if (savedEnv.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = savedEnv.VERCEL;
  if (savedEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("presentation routes", () => {
  it("serves the seeded presentation without Firebase", async () => {
    const res = await fetch(`${baseUrl}/api/presentations/preview`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.seeded).toBe(true);
    expect(data.agentName).toBe("");
    expect(data.address).toBe("");
    expect(data.photos.length).toBeGreaterThan(8);
    expect(data.photos[0].url).toContain("/media/photos/");
    expect(data.meta.title).toContain("Iconic Images");
    expect(JSON.stringify(data)).not.toMatch(/email|sms|phone/i);
  });

  it("rejects a short token and an unknown token", async () => {
    const bad = await fetch(`${baseUrl}/api/presentations/nope`);
    expect(bad.status).toBe(400);
    const missing = await fetch(`${baseUrl}/api/presentations/abcdefghijklmnopqrstuv`);
    expect(missing.status).toBe(404);
  });

  it("does not save a share link without staff auth", async () => {
    const res = await fetch(`${baseUrl}/api/listings/listing1234/presentation`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("refuses to write a token when Firebase Admin is not configured and does not notify", async () => {
    const res = await fetch(`${baseUrl}/api/listings/listing1234/presentation`, {
      method: "POST",
      headers: {
        Authorization: "Bearer temp-admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.notified).toBe(false);
    expect(data.previewPath).toBe("/present/preview");
    expect(String(data.error)).not.toMatch(/email|sms|texted/i);
  });

  it("returns share tags for the sample presentation", async () => {
    const res = await fetch(`${baseUrl}/api/presentations/shell/preview`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("og:title");
    expect(html).toContain("Sample presentation");
    expect(html).toContain("noindex");
  });
});
