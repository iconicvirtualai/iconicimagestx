import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createServer } from "../index";
import { getMarketingStore, resetMarketingStoreForTests } from "../services/marketingStore";

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = "test";
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (saved.ENABLE_TEMP_ADMIN === undefined) delete process.env.ENABLE_TEMP_ADMIN;
  else process.env.ENABLE_TEMP_ADMIN = saved.ENABLE_TEMP_ADMIN;
  if (saved.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = saved.VERCEL;
  if (saved.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = saved.VERCEL_ENV;
  if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = saved.NODE_ENV;
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetMarketingStoreForTests();
});

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer temp-admin-token");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

describe("marketing routes", () => {
  it("rejects anonymous and keeps the list admin-only at the route", async () => {
    const open = await fetch(`${baseUrl}/api/marketing/contacts`);
    expect(open.status).toBe(401);
  });

  it("imports a csv, dedupes, tags in bulk, and saves a segment", async () => {
    const commit = await api("/api/marketing/imports/commit", {
      method: "POST",
      body: JSON.stringify({
        headers: ["Email", "First Name", "Tags"],
        rows: [
          ["Ada@Example.com", "Ada", "vip"],
          ["ada@example.com", "Ada", "austin"],
          ["not-an-email", "Nope", ""],
        ],
        mapping: { Email: "email", "First Name": "firstName", Tags: "tags" },
        extraTags: ["import-oct"],
      }),
    });
    expect(commit.response.status).toBe(200);
    expect(commit.data.summary.created).toBe(1);
    expect(commit.data.summary.duplicatesInFile).toBe(1);
    expect(commit.data.summary.invalid).toHaveLength(1);

    const list = await api("/api/marketing/contacts");
    expect(list.data.contacts).toHaveLength(1);
    expect(list.data.contacts[0].email).toBe("ada@example.com");
    expect(list.data.contacts[0].tags).toEqual(expect.arrayContaining(["vip", "austin", "import-oct"]));

    const tagged = await api("/api/marketing/contacts/tags", {
      method: "POST",
      body: JSON.stringify({ emails: ["ada@example.com"], add: ["agents"], remove: ["vip"] }),
    });
    expect(tagged.response.status).toBe(200);
    const filtered = await api("/api/marketing/contacts?tag=agents");
    expect(filtered.data.contacts).toHaveLength(1);
    expect(filtered.data.contacts[0].tags).not.toContain("vip");

    const segment = await api("/api/marketing/segments", {
      method: "POST",
      body: JSON.stringify({ name: "Agents", filter: { tagsAll: ["agents"], tagsAny: [], tagsNone: [], query: "", source: "", verified: "", fields: [] } }),
    });
    expect(segment.response.status).toBe(200);
    const segments = await api("/api/marketing/segments");
    expect(segments.data.segments[0].count).toBe(1);
  });

  it("reads an xlsx upload and links a customer with the same email", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Email", "First"],
      ["Pat@Example.com", "Pat"],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "People");
    const base64 = XLSX.write(book, { type: "base64", bookType: "xlsx" });
    const parsed = await api("/api/marketing/imports/parse", {
      method: "POST",
      body: JSON.stringify({ filename: "people.xlsx", base64 }),
    });
    expect(parsed.response.status).toBe(200);
    expect(parsed.data.suggested.Email).toBe("email");
    const commit = await api("/api/marketing/imports/commit", {
      method: "POST",
      body: JSON.stringify({
        headers: parsed.data.headers,
        rows: parsed.data.rows,
        mapping: parsed.data.suggested,
      }),
    });
    expect(commit.data.summary.created).toBe(1);

    const store = getMarketingStore();
    store.replaceClients?.([{
      id: "client-9",
      email: "pat@example.com",
      firstName: "Patricia",
      lastName: "Stone",
      phone: "281-555-0199",
      company: "Iconic",
    }]);
    const synced = await api("/api/marketing/contacts/sync", { method: "POST" });
    expect(synced.data.total).toBe(1);
    const detail = await api("/api/marketing/contacts/detail?email=pat@example.com");
    expect(detail.data.contact.clientId).toBe("client-9");
    expect(detail.data.contact.firstName).toBe("Patricia");
    expect(detail.data.contact.emailVerified).toBe(true);
  });

  it("seeds the standing blacklist and accepts a public unsubscribe", async () => {
    const list = await api("/api/marketing/suppression");
    const values = list.data.entries.map((entry: { value: string }) => entry.value);
    expect(values).toContain("thekinkteam.com");
    expect(values).toContain("bruce kink");
    expect(values).toContain("jacalyn henthorne");
    const personal = list.data.entries.find((entry: { value: string }) => entry.value === "rebecca nye");
    expect(personal.hold).toBe("personal");

    const unsub = await fetch(`${baseUrl}/api/marketing/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Gone@Example.com" }),
    });
    expect(unsub.status).toBe(200);
    const again = await api("/api/marketing/suppression");
    expect(again.data.entries.some((entry: { value: string }) => entry.value === "gone@example.com")).toBe(true);
  });
});
