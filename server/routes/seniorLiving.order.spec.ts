import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));

const notify = vi.hoisted(() => vi.fn(async () => undefined));
const sendEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true })));

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
      async set(data: Record<string, unknown>) {
        docs(name).set(id, { ...data });
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
            return ref(name, id || `auto-${++store.seq}`);
          },
          async add(data: Record<string, unknown>) {
            const id = `auto-${++store.seq}`;
            docs(name).set(id, { ...data });
            return ref(name, id);
          },
          where() {
            return {
              where() {
                return this;
              },
              async get() {
                return {
                  docs: [...docs(name).entries()].map(([id, data]) => ({
                    id,
                    data: () => ({ ...data }),
                  })),
                };
              },
            };
          },
        };
      },
    };
  }
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  return { default: { apps: [{ name: "senior-order-test" }], firestore } };
});

vi.mock("../services/officeOrderNotify", () => ({
  notifyOfficeOfOrder: notify,
}));

vi.mock("../services/email", () => ({
  sendEmail,
}));

import seniorLivingRouter from "./seniorLiving";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/senior-living", seniorLivingRouter);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  delete process.env.CLIENT_NOTIFY_LIVE;
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  store.collections = {};
  store.seq = 0;
  notify.mockClear();
  sendEmail.mockClear();
  delete process.env.CLIENT_NOTIFY_LIVE;
});

function orderBody() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const scheduledDate = date.toISOString().slice(0, 10);
  return {
    tour: true,
    roomCount: 0,
    facilitySqft: 0,
    community: "A Woodlands-area senior living community",
    address: "100 Oak St, Spring, TX 77380",
    name: "Ada Lovelace",
    title: "Director",
    phone: "281-555-0199",
    email: "ada@community.example",
    onsiteContact: "Front desk",
    notes: "Use the main entrance.",
    scheduledDate,
    scheduledTime: "9:00 AM",
    hosting: "monthly-hosting",
  };
}

describe("POST /api/senior-living/order", () => {
  it("creates a senior living order and a draft deposit invoice", async () => {
    const response = await fetch(`${baseUrl}/api/senior-living/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderBody()),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.orderNumber).toMatch(/ORD/);
    expect(body.depositAmount).toBe(128.5);
    expect(body.confirmationEmail).toBe(false);
    expect(body.payToken).toEqual(expect.any(String));

    const orders = [...(store.collections.orders || new Map()).values()];
    expect(orders).toHaveLength(1);
    expect(orders[0].source).toBe("senior-living");
    expect(orders[0].total).toBe(257);
    expect(orders[0].balanceDue).toBe(257);
    expect(orders[0].scheduledTime).toBe("9:00 AM");
    expect(orders[0].hosting).toBe("monthly-hosting");
    expect(orders[0].hostingLabel).toBe("Monthly hosting");

    const invoices = [...(store.collections.invoices || new Map()).values()];
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).toBe("draft");
    expect(invoices[0].depositRequired).toBe(true);
    expect(invoices[0].depositAmount).toBe(128.5);
    expect(invoices[0].amountDue).toBe(257);
    expect(invoices[0].source).toBe("senior-living");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      saved: expect.objectContaining({
        depositAmount: 128.5,
        hostingLabel: "Monthly hosting",
        vibeNote: expect.stringContaining("Tour hosting: Monthly hosting. Pricing confirmed with your quote"),
      }),
    }));
  });

  it("emails the client only when client notify is live", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    const response = await fetch(`${baseUrl}/api/senior-living/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderBody()),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).confirmationEmail).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "ada@community.example",
    }));
  });
});
