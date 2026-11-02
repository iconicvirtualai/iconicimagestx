import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  passwords: new Map<string, string>(),
  claims: new Map<string, Record<string, unknown>>(),
  revoked: [] as string[],
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
        if (token === "photo-claim") return { uid: "photo-1", email: "dummy.photo@example.com", mustChangePassword: true };
        if (token === "client-token") return { uid: "client-1", email: "ada@example.com" };
        throw new Error("invalid");
      },
      async updateUser(uid: string, patch: { password?: string }) {
        if (patch.password) state.passwords.set(uid, patch.password);
        return { uid };
      },
      async getUser(uid: string) {
        return { uid, customClaims: { ...(state.claims.get(uid) || {}) } };
      },
      async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
        state.claims.set(uid, { ...claims });
      },
      async revokeRefreshTokens(uid: string) {
        state.revoked.push(uid);
      },
    }),
  };
  return { default: admin };
});

import accountPasswordRouter from "./accountPassword";
import { requireAuth } from "../middleware/auth";
import { blockUntilPasswordChanged } from "../middleware/mustChangePassword";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(blockUntilPasswordChanged);
  app.get("/api/probe", (_req, res) => res.json({ ok: true }));
  app.get("/api/session/probe", requireAuth, (_req, res) => res.json({ ok: true }));
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
  state.claims = new Map();
  state.revoked = [];
  state.docs.set("staff/photo-1", { role: "photographer", mustChangePassword: true, email: "dummy.photo@example.com" });
  state.docs.set("clients/client-1", { email: "ada@example.com", mustChangePassword: true });
  state.claims.set("photo-1", { mustChangePassword: true });
  state.claims.set("client-1", { mustChangePassword: true });
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

describe("must-change password gate", () => {
  it("blocks authenticated routes, allows the password route, and clears the claim", async () => {
    const claimed = await fetch(`${baseUrl}/api/probe`, { headers: { Authorization: "Bearer photo-claim" } });
    expect(claimed.status).toBe(403);
    expect(await claimed.json()).toMatchObject({ code: "must_change_password" });

    const flagged = await fetch(`${baseUrl}/api/session/probe`, { headers: { Authorization: "Bearer photo-token" } });
    expect(flagged.status).toBe(403);
    expect(await flagged.json()).toMatchObject({ code: "must_change_password" });

    const changed = await change("photo-token", "chosen-password");
    expect(changed.status).toBe(200);
    expect(state.docs.get("staff/photo-1")?.mustChangePassword).toBe(false);
    expect(state.claims.get("photo-1")?.mustChangePassword).toBeUndefined();
    expect(state.revoked).toContain("photo-1");

    const open = await fetch(`${baseUrl}/api/session/probe`, { headers: { Authorization: "Bearer photo-token" } });
    expect(open.status).toBe(200);
    expect(await open.json()).toEqual({ ok: true });
  });
});

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
