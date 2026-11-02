import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../index";
import { setTestCleanupHooks, type CleanupHooks } from "../services/testDataCleanupRun";
import type { CleanupBackup, CleanupRecord } from "../../shared/testDataCleanup";

let server: Server;
let baseUrl = "";

const records: CleanupRecord[] = [
  {
    collection: "orders",
    id: "order-149",
    data: { orderNumber: "#149", clientId: "client-real", calendarEventId: "evt-1", calendarId: "cal-1" },
  },
  {
    collection: "invoices",
    id: "inv-149",
    data: { orderId: "order-149", squareInvoiceId: "sq-inv-149", total: 10 },
  },
  {
    collection: "clients",
    id: "client-real",
    data: { email: "jane@brokerage.com", firstName: "Jane" },
  },
  {
    collection: "orders",
    id: "real-order",
    data: { orderNumber: "#180", clientName: "Jane Agent", clientEmail: "jane@brokerage.com" },
  },
];

function memoryHooks() {
  const docs = new Map<string, Record<string, unknown>>();
  for (const record of records) docs.set(`${record.collection}/${record.id}`, { ...record.data });
  const backups = new Map<string, CleanupBackup>();
  const removeHold = vi.fn(async () => undefined);
  const notify = vi.fn();
  let failBackup = false;
  const hooks: CleanupHooks = {
    async list() {
      return [...docs.entries()].map(([key, data]) => {
        const slash = key.indexOf("/");
        return { collection: key.slice(0, slash), id: key.slice(slash + 1), data: { ...data } };
      });
    },
    async writeBackup(backup) {
      if (failBackup) {
        failBackup = false;
        throw new Error("backup write failed");
      }
      backups.set(backup.runId, backup);
      return { location: `firestore:cleanupBackups/${backup.runId}` };
    },
    async readBackup(runId) {
      return backups.get(runId) || null;
    },
    async update(collection, id, patch) {
      const key = `${collection}/${id}`;
      const current = docs.get(key);
      if (!current) throw new Error(`missing ${key}`);
      docs.set(key, { ...current, ...patch });
    },
    async replace(collection, id, data) {
      docs.set(`${collection}/${id}`, { ...data });
    },
    removeHold,
  };
  return {
    hooks,
    docs,
    backups,
    removeHold,
    notify,
    failNextBackup() {
      failBackup = true;
    },
  };
}

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  setTestCleanupHooks(null);
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  setTestCleanupHooks(null);
});

function admin(email = "office@iconicimagestx.com") {
  return {
    Authorization: "Bearer temp-admin-token",
    "Content-Type": "application/json",
    "x-test-staff": JSON.stringify({ uid: "temp-admin-uid", email, role: "admin" }),
  };
}

describe("test data cleanup route", () => {
  it("requires an admin and dry-runs without writing", async () => {
    const memory = memoryHooks();
    setTestCleanupHooks(memory.hooks);
    const denied = await fetch(`${baseUrl}/api/admin/test-data/dry-run`, { method: "POST" });
    expect(denied.status).toBe(401);

    const dry = await fetch(`${baseUrl}/api/admin/test-data/dry-run`, { method: "POST", headers: admin() });
    expect(dry.status).toBe(200);
    const body = await dry.json() as { plainList: string; matched: Array<{ id: string }>; notificationsSent: unknown[] };
    expect(body.plainList).toContain("orders\torder-149\t#149\tknown test order #149");
    expect(body.plainList).toContain("needs a human look");
    expect(body.matched.map((row) => row.id)).toContain("order-149");
    expect(body.matched.map((row) => row.id)).not.toContain("real-order");
    expect(body.notificationsSent).toEqual([]);
    expect(memory.docs.get("orders/order-149")?.status).toBeUndefined();
    expect(memory.removeHold).not.toHaveBeenCalled();
    expect(memory.notify).not.toHaveBeenCalled();
  });

  it("apply waits for an explicit confirm, refuses when backup fails, then unarchives", async () => {
    const memory = memoryHooks();
    setTestCleanupHooks(memory.hooks);
    const missing = await fetch(`${baseUrl}/api/admin/test-data/apply`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
    expect(memory.docs.get("orders/order-149")?.testData).toBeUndefined();

    memory.failNextBackup();
    const failed = await fetch(`${baseUrl}/api/admin/test-data/apply`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ confirm: "APPLY" }),
    });
    expect(failed.status).toBe(409);
    expect(memory.docs.get("orders/order-149")?.status).toBeUndefined();
    expect(memory.removeHold).not.toHaveBeenCalled();
    expect(memory.backups.size).toBe(0);

    const applied = await fetch(`${baseUrl}/api/admin/test-data/apply`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ confirm: "APPLY" }),
    });
    expect(applied.status).toBe(200);
    const body = await applied.json() as {
      applied: boolean;
      runId: string;
      notificationsSent: unknown[];
      squareInvoices: Array<{ squareInvoiceId: string }>;
    };
    expect(body.applied).toBe(true);
    expect(body.notificationsSent).toEqual([]);
    expect(body.squareInvoices.map((row) => row.squareInvoiceId)).toEqual(["sq-inv-149"]);
    expect(memory.docs.get("orders/order-149")).toMatchObject({ status: "cancelled", testData: true });
    expect(memory.docs.get("clients/client-real")?.testData).toBeUndefined();
    expect(memory.docs.get("orders/real-order")?.status).toBeUndefined();
    expect(memory.removeHold).toHaveBeenCalledWith({ calendarId: "cal-1", eventId: "evt-1", sendUpdates: "none" });
    expect(memory.notify).not.toHaveBeenCalled();

    const restored = await fetch(`${baseUrl}/api/admin/test-data/unarchive`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ confirm: "UNARCHIVE", runId: body.runId }),
    });
    expect(restored.status).toBe(200);
    expect(memory.docs.get("orders/order-149")?.orderNumber).toBe("#149");
    expect(memory.docs.get("orders/order-149")?.testData).toBeUndefined();
    expect(memory.notify).not.toHaveBeenCalled();
  });
});
