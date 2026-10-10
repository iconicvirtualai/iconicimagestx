import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

const INTERNAL = /fotello|collection|firestore/i;

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

describe("GET /api/galleries/public/:id", () => {
  it("returns a clean 404 for a missing gallery id", async () => {
    const id = "qa-nonexistent-gallery";
    const res = await fetch(`${baseUrl}/api/galleries/public/${id}`);
    const data = await res.json();
    const text = JSON.stringify(data);

    expect(res.status).toBe(404);
    expect(data).toEqual({ error: "We couldn't find this gallery." });
    expect(text).not.toMatch(INTERNAL);
    expect(text).not.toContain(id);
    expect(text).not.toMatch(/firebase/i);
  });

  it("returns the same 404 for a malformed id and does not echo it", async () => {
    const id = "__Fotello__";
    const res = await fetch(`${baseUrl}/api/galleries/public/${encodeURIComponent(id)}`);
    const data = await res.json();
    const text = JSON.stringify(data);

    expect(res.status).toBe(404);
    expect(data).toEqual({ error: "We couldn't find this gallery." });
    expect(text).not.toMatch(INTERNAL);
    expect(text).not.toContain(id);
  });
});
