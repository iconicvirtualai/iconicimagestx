import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";

vi.mock("firebase-admin", () => ({
  default: {
    apps: [],
    firestore: () => { throw new Error("Firestore should not be used while signup is disabled."); },
    auth: () => ({ createUser: () => { throw new Error("Auth user should not be created."); } }),
  },
}));

import clientsRouter from "./clients";

let server: Server;
let baseUrl = "";
const saved = process.env.CLIENT_PORTAL_ENABLED;

beforeAll(async () => {
  delete process.env.CLIENT_PORTAL_ENABLED;
  const app = express();
  app.use(express.json());
  app.use("/api/clients", clientsRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (saved === undefined) delete process.env.CLIENT_PORTAL_ENABLED;
  else process.env.CLIENT_PORTAL_ENABLED = saved;
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("POST /api/clients/register", () => {
  it("returns a disabled response and does not create an account while the portal is off", async () => {
    delete process.env.CLIENT_PORTAL_ENABLED;
    const res = await fetch(`${baseUrl}/api/clients/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ada@example.com",
        password: "secret1",
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("client_portal_disabled");
    expect(body.error).toContain("photos@iconicimagestx.com");
  });

  it("leaves signup closed for TRUE, 1, and a blank flag", async () => {
    for (const value of ["TRUE", "1", "false", ""]) {
      process.env.CLIENT_PORTAL_ENABLED = value;
      const res = await fetch(`${baseUrl}/api/clients/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ada@example.com", password: "secret1", firstName: "Ada", lastName: "Lovelace" }),
      });
      expect(res.status).toBe(403);
    }
  });

  it("reaches account creation when the flag is exactly true", async () => {
    process.env.CLIENT_PORTAL_ENABLED = "true";
    const res = await fetch(`${baseUrl}/api/clients/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "secret1", firstName: "Ada", lastName: "Lovelace" }),
    });
    const body = await res.json();
    expect(res.status).not.toBe(403);
    expect(body.code).not.toBe("client_portal_disabled");
    delete process.env.CLIENT_PORTAL_ENABLED;
  });
});
