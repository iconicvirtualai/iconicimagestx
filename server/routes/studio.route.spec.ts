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

async function postAi(authorization?: string) {
  const res = await fetch(`${baseUrl}/api/studio/ai-edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({
      listingId: "project1234",
      type: "virtual_stage",
      imageUrl: "https://cdn.example/room.jpg",
      sourcePath: "listings/project1234/photos/1_room.jpg",
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

describe("Iconic Studio AI route", () => {
  it("requires a staff token", async () => {
    const result = await postAi();
    expect(result.status).toBe(401);
    const order = await fetch(`${baseUrl}/api/studio/order-edits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: "project1234" }),
    });
    expect(order.status).toBe(401);
    const tick = await fetch(`${baseUrl}/api/studio/order-queue/tick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: "project1234" }),
    });
    expect(tick.status).toBe(401);
  });

  it("rejects an unknown edit type before touching storage", async () => {
    const res = await fetch(`${baseUrl}/api/studio/ai-edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer temp-admin-token",
      },
      body: JSON.stringify({ listingId: "project1234", type: "nope" }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/Unknown AI edit type/);
  });

  it("rejects a queue tick without a listing id before storage", async () => {
    const res = await fetch(`${baseUrl}/api/studio/order-queue/tick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer temp-admin-token",
      },
      body: JSON.stringify({ listingId: "short" }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/listing id/i);
  });

  it("returns a job stub path when Firebase Admin is not configured", async () => {
    const result = await postAi("Bearer temp-admin-token");
    expect(result.status).toBe(503);
    expect(result.data.error).toMatch(/Firebase Admin is not configured/);
  });
});
