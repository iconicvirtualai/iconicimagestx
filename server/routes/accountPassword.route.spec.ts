import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  passwords: new Map<string, string>(),
}));

function key(collection: string, id: string) {
  return `${collection}/${id}`;
}

vi.mock("firebase-admin", () => {
  function store() {
    return {
      collection(name: string) {
        return {
          doc(id: string) {
            const ref = {
              id,
              async get() {
                const data = state.docs.get(key(name, id));
                return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref };
              },
              async update(patch: Record<string, unknown>) {
                const current = state.docs.get(key(name, id));
                if (!current) throw new Error("missing");
                state.docs.set(key(name, id), { ...current, ...patch });
              },
            };
            return ref;
          },
        };
      },
    };
  }
  const firestore = Object.assign(store, {
    FieldValue: { serverTimestamp: () => "SERVER_TIME" },
  });
  const admin = {
    apps: [{ name: "account-password-test" }],
    firestore,
    auth: () => ({
      async verifyIdToken(token: string) {
        if (token === "photo-token") return { uid: "photo-1", email: "dummy.photo@example.com" };
        if (token === "client-token") return { uid: "client-1", email: "ada@example.com" };
        throw new Error("invalid");
      },
      async updateUser(uid: string, patch: { password?: string }) {
        if (patch.password) state.passwords.set(uid, patch.password);
        return { uid };
      },
    }),
  };
  return { default: admin };
});

import accountPasswordRouter from "./accountPassword";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/account", accountPasswordRouter);
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
  state.docs = new Map();
  state.passwords = new Map();
  state.docs.set("staff/photo-1", { role: "photographer", mustChangePassword: true, email: "dummy.photo@example.com" });
  state.docs.set("clients/client-1", { email: "ada@example.com", mustChangePassword: true });
});

function change(token: string, password: string) {
  return fetch(`${baseUrl}/api/account/password`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
}

describe("POST /api/account/password", () => {
  it("lets a photographer replace the temporary password and clears the flag", async () => {
    const res = await change("photo-token", "chosen-password");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mustChangePassword: false });
    expect(state.passwords.get("photo-1")).toBe("chosen-password");
    expect(state.docs.get("staff/photo-1")?.mustChangePassword).toBe(false);
  });

  it("clears the flag for a client login too", async () => {
    const res = await change("client-token", "chosen-password");
    expect(res.status).toBe(200);
    expect(state.docs.get("clients/client-1")?.mustChangePassword).toBe(false);
    expect(state.passwords.get("client-1")).toBe("chosen-password");
  });

  it("rejects a short password and a missing login", async () => {
    const open = await change("", "chosen-password");
    expect(open.status).toBe(401);
    const short = await change("photo-token", "short");
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: "Password must be at least 8 characters." });
    expect(state.passwords.size).toBe(0);
    expect(state.docs.get("staff/photo-1")?.mustChangePassword).toBe(true);
  });
});
