import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const TOKEN = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
const OTHER = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
}));

function seed(collection: string, id: string, data: Record<string, unknown>) {
  if (!store.collections[collection]) store.collections[collection] = new Map();
  store.collections[collection].set(id, { ...data });
}

function read(collection: string, id: string) {
  return store.collections[collection]?.get(id);
}

vi.mock("firebase-admin", () => {
  function docs(name: string) {
    return store.collections[name] || new Map<string, Record<string, unknown>>();
  }
  function firestore() {
    return {
      collection(name: string) {
        return {
          doc(id: string) {
            const ref = {
              id,
              async get() {
                const data = docs(name).get(id);
                return {
                  id,
                  exists: data !== undefined,
                  data: () => (data ? { ...data } : undefined),
                  ref,
                };
              },
              async update(patch: Record<string, unknown>) {
                const current = docs(name).get(id);
                if (!current) throw new Error(`missing ${name}/${id}`);
                docs(name).set(id, { ...current, ...patch });
              },
            };
            return ref;
          },
          where(field: string, _op: string, value: string) {
            const run = async () => {
              const matches = [...docs(name).entries()]
                .filter(([, data]) => data[field] === value)
                .map(([id, data]) => ({
                  id,
                  data: () => ({ ...data }),
                }));
              return { empty: matches.length === 0, docs: matches };
            };
            return { limit: () => ({ get: run }), get: run };
          },
        };
      },
    };
  }
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  return { default: { apps: [{}], firestore, auth: () => ({}) } };
});

import ordersRouter from "./orders";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use("/api/orders", ordersRouter);
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

beforeEach(() => {
  store.collections = {};
  seed("orderRequests", "req-1", {
    dotOptIn: false,
    dotOptInToken: TOKEN,
    convertedToOrderId: "order-1",
  });
  seed("orders", "order-1", { dotOptIn: false, orderRequestId: "req-1" });
  seed("orders", "order-other", { dotOptIn: false, dotOptInToken: OTHER });
});

async function click(token: string) {
  return fetch(`${baseUrl}/api/orders/dot-opt-in?t=${encodeURIComponent(token)}`);
}

describe("GET /api/orders/dot-opt-in", () => {
  it("sets dotOptIn on the order and stays true when clicked again", async () => {
    const first = await click(TOKEN);
    const firstHtml = await first.text();
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/html");
    expect(firstHtml).toContain("Your open house is listed.");
    expect(firstHtml).toContain('href="https://doorsopentour.com"');
    expect(firstHtml).not.toContain(TOKEN);
    expect(firstHtml).toContain("font-family:Inter,ui-sans-serif,system-ui,sans-serif");
    expect(read("orders", "order-1")?.dotOptIn).toBe(true);
    expect(read("orderRequests", "req-1")?.dotOptIn).toBe(true);
    expect(read("orders", "order-other")?.dotOptIn).toBe(false);

    const second = await click(TOKEN);
    expect(second.status).toBe(200);
    expect(read("orders", "order-1")?.dotOptIn).toBe(true);
    expect(read("orderRequests", "req-1")?.dotOptIn).toBe(true);
    expect(read("orders", "order-other")?.dotOptIn).toBe(false);
  });

  it("rejects a missing token without changing orders", async () => {
    const missing = await click("nope");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("This link is not valid.");
    expect(read("orders", "order-1")?.dotOptIn).toBe(false);
    expect(read("orderRequests", "req-1")?.dotOptIn).toBe(false);

    const blank = await fetch(`${baseUrl}/api/orders/dot-opt-in`);
    expect(blank.status).toBe(404);
    expect(read("orders", "order-other")?.dotOptIn).toBe(false);
  });
});
