import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { classifyTestData } from "../../shared/testDataCleanup";
import { VIRTUAL_STAGING_PRO_UNIT_PRICE } from "../../shared/virtualStagingPro";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
  signed: [] as Array<Record<string, unknown>>,
  files: new Map<string, { size: number; contentType: string }>(),
}));

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true, delivery: "mock" })));
const sendSMS = vi.hoisted(() => vi.fn(async () => ({ sid: "sms" })));

function docs(name: string) {
  if (!store.collections[name]) store.collections[name] = new Map();
  return store.collections[name];
}

vi.mock("firebase-admin", () => {
  function ref(name: string, id: string) {
    return {
      id,
      async get() {
        const data = docs(name).get(id);
        return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
      },
      async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
        const prev = options?.merge ? (docs(name).get(id) || {}) : {};
        docs(name).set(id, { ...prev, ...data });
      },
      async update(patch: Record<string, unknown>) {
        docs(name).set(id, { ...(docs(name).get(id) || {}), ...patch });
      },
    };
  }
  function firestore() {
    return {
      collection(name: string) {
        return {
          doc(id?: string) {
            return ref(name, id || `auto${++store.seq}abcd`);
          },
          async add(data: Record<string, unknown>) {
            const id = `auto${++store.seq}abcd`;
            docs(name).set(id, { ...data });
            return ref(name, id);
          },
          count() {
            return { get: async () => ({ data: () => ({ count: docs(name).size }) }) };
          },
        };
      },
      async runTransaction(run: (tx: {
        get: (target: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (target: { set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> }, data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
      }) => Promise<unknown>) {
        return run({
          get: (target) => target.get(),
          set: (target, data, options) => target.set(data, options),
        });
      },
    };
  }
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  return {
    default: {
      apps: [{ name: "virtual-staging-pro-test" }],
      firestore,
      storage: () => ({
        bucket: () => ({
          name: "iconic-images-aicon.firebasestorage.app",
          setCorsConfiguration: async () => undefined,
          file: (path: string) => ({
            async getSignedUrl(options: Record<string, unknown>) {
              store.signed.push({ path, ...options });
              return [`https://storage.example/upload?path=${encodeURIComponent(path)}`];
            },
            async exists() {
              return [store.files.has(path)];
            },
            async getMetadata() {
              const file = store.files.get(path);
              if (!file) throw new Error("missing");
              return [{ size: String(file.size), contentType: file.contentType, metadata: {} }];
            },
            async setMetadata() {
              return undefined;
            },
            async delete() {
              store.files.delete(path);
            },
          }),
        }),
      }),
    },
  };
});

vi.mock("../services/email", () => ({ sendEmail }));
vi.mock("../services/sms", () => ({ sendSMS }));

import virtualStagingProRouter, { resetVirtualStagingProRateLimit, VIRTUAL_STAGING_PRO_RATE_MAX } from "./virtualStagingPro";

let server: Server;
let baseUrl = "";
const previousAdmin = process.env.ADMIN_EMAIL;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/virtual-staging-pro", virtualStagingProRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  process.env.ADMIN_EMAIL = previousAdmin;
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.CLIENT_COMMS_ZONE;
  delete process.env.NOTIFY_TEST_ALLOWLIST;
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  store.collections = {};
  store.seq = 0;
  store.signed = [];
  store.files.clear();
  sendEmail.mockClear();
  sendSMS.mockClear();
  resetVirtualStagingProRateLimit();
  process.env.ADMIN_EMAIL = "office@iconicimagestx.com";
  delete process.env.COORDINATOR_EMAIL;
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.CLIENT_COMMS_ZONE;
  delete process.env.NOTIFY_TEST_ALLOWLIST;
  delete process.env.BOOKING_NOTIFY_LIVE;
});

function photo(extra: Record<string, unknown> = {}) {
  return {
    fileName: "living.jpg",
    contentType: "image/jpeg",
    roomType: "Living Room",
    byteSize: 240000,
    ...extra,
  };
}

function orderBody(extra: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@woodlandsrealty.com",
    phone: "281-555-0199",
    address: "100 Oak St, Spring, TX 77380",
    style: "Modern",
    instructions: "Dark wood in the living room.",
    companyWebsite: "",
    total: 1,
    unitPrice: 1,
    photos: [photo({ price: 1, unitPrice: 999 }), photo({ fileName: "bed.png", contentType: "image/png", roomType: "Bedroom", byteSize: 180000 })],
    ...extra,
  };
}

function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/virtual-staging-pro/order", () => {
  it("saves a server-priced order and notifies staff only", async () => {
    const response = await post("/api/virtual-staging-pro/order", orderBody());
    expect(response.status).toBe(201);
    const body = await response.json() as {
      success: boolean;
      orderNumber: string;
      total: number;
      photoToken: string;
      uploads: Array<{ storagePath: string; contentType: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.orderNumber).toBe("#001");
    expect(body.total).toBe(2 * VIRTUAL_STAGING_PRO_UNIT_PRICE);
    expect(body.uploads).toHaveLength(2);
    expect(store.signed.map((entry) => entry.contentType)).toEqual(["image/jpeg", "image/png"]);

    const orders = [...(store.collections.orders || new Map()).values()];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      source: "virtual-staging-pro",
      status: "new",
      orderNumber: "#001",
      clientName: "Ada Lovelace",
      clientEmail: "ada@woodlandsrealty.com",
      phone: "281-555-0199",
      propertyAddress: "100 Oak St, Spring, TX 77380",
      stylePreference: "Modern",
      total: 50,
      balanceDue: 50,
      depositPaid: 0,
      paymentStatus: "invoice_after_review",
      countsTowardRevenue: false,
    });
    expect(orders[0].lineItems).toEqual([
      expect.objectContaining({ qty: 2, unitPrice: 25, price: 50 }),
    ]);
    expect(orders[0].qaOnly).toBeUndefined();
    expect(String(orders[0].vibeNote)).toContain("Dark wood");
    expect(String(orders[0].vibeNote)).toContain("Living Room");
    expect(store.collections.invoices).toBeUndefined();

    const requests = [...(store.collections.orderRequests || new Map()).values()];
    expect(requests[0]).toMatchObject({ status: "new", source: "virtual-staging-pro", orderNumber: "#001" });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      audience: "staff",
      template: "office_new_order",
      to: "office@iconicimagestx.com",
    }));
  });

  it("prices each full set of 10 at $200 and ignores a posted total", async () => {
    const photos = Array.from({ length: 12 }, (_, index) => photo({
      fileName: `room-${index}.jpg`,
      price: 1,
    }));
    const response = await post("/api/virtual-staging-pro/order", orderBody({ total: 1, unitPrice: 1, photos }));
    expect(response.status).toBe(201);
    const body = await response.json() as { total: number };
    expect(body.total).toBe(250);
    const orders = [...(store.collections.orders || new Map()).values()];
    expect(orders[0].total).toBe(250);
    expect(orders[0].balanceDue).toBe(250);
    expect(orders[0].lineItems).toEqual([
      expect.objectContaining({ qty: 1, unitPrice: 200, price: 200 }),
      expect.objectContaining({ qty: 2, unitPrice: 25, price: 50 }),
    ]);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ audience: "staff" }));
  });

  it("confirms uploaded photos without another client or office send", async () => {
    const created = await post("/api/virtual-staging-pro/order", orderBody({ photos: [photo()] }));
    const body = await created.json() as {
      orderId: string;
      orderNumber: string;
      photoToken: string;
      uploads: Array<{ storagePath: string }>;
    };
    const path = body.uploads[0].storagePath;
    store.files.set(path, { size: 240000, contentType: "image/jpeg" });
    sendEmail.mockClear();

    const confirmed = await post(`/api/virtual-staging-pro/orders/${body.orderId}/photos`, {
      photoToken: body.photoToken,
      photos: [{ storagePath: path }],
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ success: true, orderNumber: body.orderNumber });
    const order = [...(store.collections.orders || new Map()).values()][0];
    const photos = order.photos as Array<{ status: string; url: string }>;
    expect(photos[0].status).toBe("received");
    expect(photos[0].url).toContain(encodeURIComponent(path));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("rejects an oversized upload and a bad email", async () => {
    const missing = await post("/api/virtual-staging-pro/order", orderBody({ email: "not-an-email", photos: [photo()] }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Enter a valid email." });
    expect(sendEmail).not.toHaveBeenCalled();

    const created = await post("/api/virtual-staging-pro/order", orderBody({ photos: [photo()] }));
    const body = await created.json() as { orderId: string; photoToken: string; uploads: Array<{ storagePath: string }> };
    const path = body.uploads[0].storagePath;
    store.files.set(path, { size: 240001, contentType: "image/jpeg" });
    const tooBig = await post(`/api/virtual-staging-pro/orders/${body.orderId}/photos`, {
      photoToken: body.photoToken,
      photos: [{ storagePath: path }],
    });
    expect(tooBig.status).toBe(413);
    expect(String((await tooBig.json()).error)).toContain("281.356.0965");
    expect(store.files.has(path)).toBe(false);
  });

  it("drops a honeypot without saving or notifying", async () => {
    const response = await post("/api/virtual-staging-pro/order", orderBody({ companyWebsite: "https://spam.test" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(store.collections.orders).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("stamps QA TEST orders for the cleanup tool", async () => {
    const response = await post("/api/virtual-staging-pro/order", orderBody({
      name: "QA TEST Dana",
      photos: [photo()],
    }));
    expect(response.status).toBe(201);
    const [id, data] = [...(store.collections.orders || new Map()).entries()][0];
    expect(data).toMatchObject({ qaOnly: true, playtest: true, testData: true, clientName: "QA TEST Dana" });
    const report = classifyTestData([{ collection: "orders", id, data }]);
    expect(report.archiveRecords.map((record) => record.id)).toEqual([id]);
  });

  it("rate limits and does not notify the overflow", async () => {
    for (let i = 0; i < VIRTUAL_STAGING_PRO_RATE_MAX; i += 1) {
      const res = await post("/api/virtual-staging-pro/order", orderBody({ email: "bad" }));
      expect(res.status).toBe(400);
    }
    const blocked = await post("/api/virtual-staging-pro/order", orderBody());
    expect(blocked.status).toBe(429);
    expect(String((await blocked.json()).error)).toContain("281.356.0965");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("does not send client mail from this route", () => {
    const source = readFileSync(new URL("./virtualStagingPro.ts", import.meta.url), "utf8");
    const index = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    expect(source).toContain("notifyOfficeOfOrder");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("sendSMS");
    expect(source).not.toContain("booking_received");
    expect(source).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(index).toContain('app.use("/api/virtual-staging-pro", virtualStagingProRouter)');
  });
});
