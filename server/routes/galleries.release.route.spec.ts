import { readFileSync } from "node:fs";
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

describe("gallery release gate route", () => {
  it("requires a coordinator before it checks the order", async () => {
    const release = await fetch(`${baseUrl}/api/galleries/gallery1234/release`);
    expect(release.status).toBe(401);
    const deliver = await fetch(`${baseUrl}/api/galleries/gallery1234/deliver`, { method: "POST" });
    expect(deliver.status).toBe(401);
    const status = await fetch(`${baseUrl}/api/galleries/gallery1234/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "delivered" }),
    });
    expect(status.status).toBe(401);
    const downloads = await fetch(`${baseUrl}/api/galleries/gallery1234/downloads`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ released: true }),
    });
    expect(downloads.status).toBe(401);
  });

  it("keeps delivery from treating a request flag as a staff release", () => {
    const source = readFileSync(new URL("./galleries.ts", import.meta.url), "utf8");
    expect(source).toContain('"/:id/downloads"');
    expect(source).toContain("downloadsReleased");
    expect(source).not.toContain("req.body.downloadEnabled");
    expect(source).not.toContain("req.body?.downloadEnabled");
    expect(source).toContain("Ignore body.downloadEnabled");

    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    const start = rules.indexOf("match /galleries/{galleryId}");
    const block = start === -1 ? "" : rules.slice(start, rules.indexOf("match /", start + 20));
    expect(block).toContain("resource.data.downloadEnabled == true");
    expect(block).toContain("resource.data.status in ['delivered', 'approved']");
  });

  it("does not open Firebase when Admin is not configured", async () => {
    const res = await fetch(`${baseUrl}/api/galleries/gallery1234/release`, {
      headers: { Authorization: "Bearer temp-admin-token" },
    });
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toMatch(/Firebase Admin is not configured/);
  });
});
