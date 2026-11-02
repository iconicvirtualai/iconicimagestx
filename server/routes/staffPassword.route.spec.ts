import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const state = vi.hoisted(() => ({
  staff: new Map<string, Record<string, unknown>>(),
  users: new Map<string, { uid: string; email: string; password?: string; displayName?: string }>(),
  seq: 0,
}));

function userByEmail(email: string) {
  for (const user of state.users.values()) {
    if (user.email === email) return user;
  }
  return undefined;
}

vi.mock("firebase-admin", () => {
  function notFound() {
    return Object.assign(new Error("not found"), { code: "auth/user-not-found" });
  }
  function staffDocs() {
    return {
      collection(name: string) {
        return {
          doc(id: string) {
            const ref = {
              id,
              async get() {
                if (name !== "staff") return { id, exists: false, data: () => undefined, ref };
                const data = state.staff.get(id);
                return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref };
              },
              async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
                const current = options?.merge ? state.staff.get(id) || {} : {};
                state.staff.set(id, { ...current, ...data });
              },
              async update(patch: Record<string, unknown>) {
                const current = state.staff.get(id);
                if (!current) throw new Error("missing");
                state.staff.set(id, { ...current, ...patch });
              },
              async delete() {
                state.staff.delete(id);
              },
            };
            return ref;
          },
          where(field: string, _op: string, value: string) {
            return {
              async get() {
                const docs = [...state.staff.entries()]
                  .filter(([, data]) => data[field] === value)
                  .map(([id]) => staffDocs().collection(name).doc(id))
                  .map((ref) => ({
                    id: ref.id,
                    ref,
                    data: () => {
                      const data = state.staff.get(ref.id);
                      return data ? { ...data } : undefined;
                    },
                  }));
                return { empty: docs.length === 0, docs, size: docs.length };
              },
            };
          },
        };
      },
    };
  }
  const firestore = Object.assign(staffDocs, {
    FieldValue: { serverTimestamp: () => "SERVER_TIME" },
  });
  const admin = {
    apps: [{ name: "staff-password-test" }],
    firestore,
    auth: () => ({
      async verifyIdToken(token: string) {
        if (token === "admin-token") return { uid: "admin-1", email: "cadi@example.com" };
        throw new Error("invalid");
      },
      async getUserByEmail(email: string) {
        const user = userByEmail(email);
        if (!user) throw notFound();
        return { ...user };
      },
      async createUser(input: { email: string; password: string; displayName?: string }) {
        if (userByEmail(input.email)) {
          throw Object.assign(new Error("exists"), { code: "auth/email-already-exists" });
        }
        state.seq += 1;
        const user = { uid: `auth-${state.seq}`, email: input.email, password: input.password, displayName: input.displayName };
        state.users.set(user.uid, user);
        return { ...user };
      },
      async updateUser(uid: string, patch: { password?: string; displayName?: string; email?: string }) {
        const user = state.users.get(uid);
        if (!user) throw new Error("missing user");
        Object.assign(user, patch);
        return { ...user };
      },
    }),
  };
  return { default: admin };
});

import staffRouter from "./staff";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/staff", staffRouter);
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
  state.staff = new Map();
  state.users = new Map();
  state.seq = 0;
  state.staff.set("admin-1", { role: "admin", isActive: true, email: "cadi@example.com" });
});

function createPhotographer(body: Record<string, unknown>, token = "admin-token") {
  return fetch(`${baseUrl}/api/staff`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/staff password", () => {
  it("creates a photographer login and requires a password change", async () => {
    const res = await createPhotographer({
      firstName: "Dummy",
      lastName: "Photographer",
      email: "dummy.photo@example.com",
      role: "photographer",
      password: "temporary1",
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.role).toBe("photographer");
    expect(body.mustChangePassword).toBe(true);
    expect(body.password).toBeUndefined();
    const saved = state.staff.get(body.id);
    expect(saved).toMatchObject({
      email: "dummy.photo@example.com",
      role: "photographer",
      mustChangePassword: true,
      firebaseUid: body.id,
    });
    expect(saved).not.toHaveProperty("password");
    expect(state.users.get(body.id)?.password).toBe("temporary1");
  });

  it("updates the existing auth user when the email is already registered", async () => {
    state.users.set("existing-1", { uid: "existing-1", email: "dummy.photo@example.com", password: "old-password" });
    state.staff.set("manual_9", { email: "dummy.photo@example.com", role: "photographer", firstName: "Old" });
    const res = await createPhotographer({
      firstName: "Dummy",
      lastName: "Photographer",
      email: "Dummy.Photo@example.com",
      role: "photographer",
      password: "temporary1",
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: "existing-1", created: false, role: "photographer", mustChangePassword: true });
    expect(state.users.get("existing-1")?.password).toBe("temporary1");
    expect(state.staff.get("existing-1")).toMatchObject({ role: "photographer", mustChangePassword: true });
    expect(state.staff.has("manual_9")).toBe(false);
  });

  it("rejects a short password and an anonymous caller", async () => {
    const missing = await createPhotographer({
      firstName: "Dummy",
      email: "dummy.photo@example.com",
      role: "photographer",
      password: "temporary1",
    }, "");
    expect(missing.status).toBe(401);

    const short = await createPhotographer({
      firstName: "Dummy",
      email: "dummy.photo@example.com",
      role: "photographer",
      password: "short",
    });
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: "Password must be at least 8 characters." });
    expect(state.users.size).toBe(0);
  });
});

describe("POST /api/staff/:id/password", () => {
  it("sets a new password and requires the photographer to change it", async () => {
    state.users.set("photo-1", { uid: "photo-1", email: "dummy.photo@example.com", password: "temporary1" });
    state.staff.set("photo-1", {
      email: "dummy.photo@example.com",
      role: "photographer",
      firstName: "Dummy",
      lastName: "Photographer",
      isActive: true,
      mustChangePassword: false,
    });
    const res = await fetch(`${baseUrl}/api/staff/photo-1/password`, {
      method: "POST",
      headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ password: "replacement1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "photo-1", mustChangePassword: true });
    expect(state.users.get("photo-1")?.password).toBe("replacement1");
    expect(state.staff.get("photo-1")?.mustChangePassword).toBe(true);
  });
});
