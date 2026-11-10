import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { MemoryLibraryRepo } from "../services/memoryLibraryRepo";
import { setLibraryForTests, MediaLibrary } from "../services/mediaLibrary";
import { StorageError, type B2Storage, type SignedPut } from "../services/b2Storage";

vi.mock("firebase-admin", () => {
  const staff = new Map<string, Record<string, unknown>>([
    ["admin-1", { role: "admin", isActive: true, firstName: "Cadi", lastName: "Owner" }],
    ["photo-1", { role: "photographer", isActive: true, firstName: "Pat", lastName: "Photo" }],
  ]);
  const firestore = () => ({
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            async get() {
              if (name !== "staff") return { exists: false, data: () => undefined };
              const data = staff.get(id);
              return { exists: Boolean(data), data: () => (data ? { ...data } : undefined) };
            },
          };
        },
      };
    },
  });
  const admin = {
    apps: [{ name: "files-test" }],
    firestore,
    auth: () => ({
      async verifyIdToken(token: string) {
        if (token === "admin") return { uid: "admin-1", email: "cadi@iconicimagestx.com" };
        if (token === "photo") return { uid: "photo-1", email: "pat@iconicimagestx.com" };
        throw new Error("bad token");
      },
    }),
  };
  return { default: admin };
});

import filesRouter from "./files";

class FakeB2 implements B2Storage {
  objects = new Map<string, { size: number; contentType: string }>();
  async presignPut(key: string, contentType: string): Promise<SignedPut> {
    return { url: `https://b2.test/${encodeURIComponent(key)}`, headers: { "Content-Type": contentType } };
  }
  async presignGet(key: string): Promise<string> { return `https://b2.test/get/${encodeURIComponent(key)}`; }
  async createMultipart() { return { uploadId: "up-1" }; }
  async presignPart(): Promise<SignedPut> { return { url: "https://b2.test/part", headers: {} }; }
  async completeMultipart() { return undefined; }
  async abortMultipart() { return undefined; }
  async head(key: string) { return this.objects.get(key) ?? null; }
  async move() { throw new StorageError(500, "unused"); }
  async remove() { return undefined; }
}

let server: Server;
let baseUrl = "";
let storage: FakeB2;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/files", filesRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  setLibraryForTests(null);
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  storage = new FakeB2();
  setLibraryForTests(new MediaLibrary(new MemoryLibraryRepo(), storage, () => 1_700_000_000_000));
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

describe("files routes", () => {
  it("requires a staff token and rejects a path that escapes the library", async () => {
    const anonymous = await fetch(`${baseUrl}/api/files`);
    expect(anonymous.status).toBe(401);

    const traversal = await fetch(`${baseUrl}/api/files/sign-upload`, {
      method: "POST",
      headers: auth("admin"),
      body: JSON.stringify({ folder: "../etc", name: "x.jpg", size: 12, contentType: "image/jpeg" }),
    });
    expect(traversal.status).toBe(400);
    const body = await traversal.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("lets staff list the library and blocks a photographer from Admin", async () => {
    const listed = await fetch(`${baseUrl}/api/files`, { headers: auth("admin") });
    expect(listed.status).toBe(200);
    const library = await listed.json();
    expect(library.folders.map((folder: { name: string }) => folder.name)).toContain("Inbox");

    const denied = await fetch(`${baseUrl}/api/files/sign-upload`, {
      method: "POST",
      headers: auth("photo"),
      body: JSON.stringify({ folder: "Admin", name: "notes.pdf", size: 40, contentType: "application/pdf" }),
    });
    expect(denied.status).toBe(403);

    const signed = await fetch(`${baseUrl}/api/files/sign-upload`, {
      method: "POST",
      headers: auth("photo"),
      body: JSON.stringify({ folder: "Inbox", name: "front.jpg", size: 40, contentType: "image/jpeg" }),
    });
    expect(signed.status).toBe(200);
    const upload = await signed.json();
    expect(upload.url).toContain("b2.test");
    expect(upload.key).toBe("Inbox/front.jpg");
    expect(upload.headers["Content-Type"]).toBe("image/jpeg");
  });
});
