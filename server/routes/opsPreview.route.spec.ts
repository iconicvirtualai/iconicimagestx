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

describe("photographer preview route", () => {
  it("is admin-only and does not write", async () => {
    const open = await fetch(`${baseUrl}/api/ops/photographer-preview?staffId=photographer1`);
    expect(open.status).toBe(401);

    const post = await fetch(`${baseUrl}/api/ops/photographer-preview`, {
      method: "POST",
      headers: {
        Authorization: "Bearer temp-admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ staffId: "photographer1" }),
    });
    expect(post.status).toBe(404);

    const missing = await fetch(`${baseUrl}/api/ops/photographer-preview`, {
      headers: { Authorization: "Bearer temp-admin-token" },
    });
    expect(missing.status).toBe(400);

    const unread = await fetch(`${baseUrl}/api/ops/photographer-preview?staffId=photographer1`, {
      headers: { Authorization: "Bearer temp-admin-token" },
    });
    expect(unread.status).toBe(503);
    const body = await unread.json();
    expect(body.error).toMatch(/demo photographer/i);
    expect(JSON.stringify(body)).not.toMatch(/CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE/);
  });
});
