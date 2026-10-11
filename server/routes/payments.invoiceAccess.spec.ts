import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

/**
 * Public invoice GET and checkout. A derived id is not enough.
 * Staff and the owning client still see the full invoice.
 */

const TOKEN = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
const DERIVED = "listing_studio1";
const LEGACY = "AbCdEfGhIjKlMnOpQrSt";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
}));

function seed(collection: string, id: string, data: Record<string, unknown>) {
  if (!store.collections[collection]) store.collections[collection] = new Map();
  store.collections[collection].set(id, data);
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
                return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref };
              },
              async update(patch: Record<string, unknown>) {
                const current = docs(name).get(id) || {};
                if (!store.collections[name]) store.collections[name] = new Map();
                store.collections[name].set(id, { ...current, ...patch });
              },
            };
            return ref;
          },
          where(field: string, _op: string, value: string) {
            const run = async () => {
              const matches = [...docs(name).entries()]
                .filter(([, data]) => data[field] === value)
                .map(([id, data]) => ({ id, exists: true, data: () => ({ ...data }) }));
              return { empty: matches.length === 0, docs: matches };
            };
            return { limit: () => ({ get: run }), get: run };
          },
        };
      },
    };
  }
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  const admin = {
    apps: [{ name: "invoice-access-test" }],
    firestore,
    auth: () => ({
      async verifyIdToken(token: string) {
        if (token === "owner") return { uid: "client-ada", email: "ada@example.com" };
        if (token === "other") return { uid: "client-bob", email: "bob@example.com" };
        if (token === "staff") return { uid: "staff-1", email: "staff@iconicimagestx.com" };
        if (token === "photo") return { uid: "photo-1", email: "photo@iconicimagestx.com" };
        throw new Error("invalid");
      },
    }),
  };
  return { default: admin };
});

import paymentsRouter from "./payments";

const invoice = {
  clientName: "Ada Agent",
  clientEmail: "ada@example.com",
  clientPhone: "512-555-0100",
  phone: "512-555-0100",
  billToAddress: "10 Oak Street",
  notes: "lockbox 1234",
  clientId: "client-ada",
  orderId: "order-1",
  galleryId: "gal-1",
  listingId: "studio1",
  invoiceNumber: "INV-2026-0008",
  lineItems: [{ id: "line-secret", name: "Photos", description: "MLS", qty: 1, unitPrice: 250, price: 250 }],
  subtotal: 250,
  tax: 0,
  total: 250,
  amountPaid: 0,
  amountDue: 250,
  status: "sent",
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/payments", paymentsRouter);
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
  seed("invoices", DERIVED, { ...invoice, payToken: TOKEN });
  seed("invoices", LEGACY, { ...invoice, payToken: "" });
  seed("staff", "staff-1", { role: "coordinator", isActive: true });
  seed("staff", "photo-1", { role: "photographer", isActive: true });
});

async function getInvoice(id: string, query = "", authorization?: string) {
  return fetch(`${baseUrl}/api/payments/invoice/${id}${query}`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("GET /api/payments/invoice/:id", () => {
  it("rejects a derived invoice with no token and accepts the matching token", async () => {
    const missing = await getInvoice(DERIVED);
    const missingBody = await missing.json();
    expect(missing.status).toBe(404);
    expect(missingBody).toEqual({ error: "Invoice not found." });

    const wrong = await getInvoice(DERIVED, "?t=wrong-token");
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toEqual({ error: "Invoice not found." });

    const gone = await getInvoice("missing-invoice", `?t=${TOKEN}`);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual(missingBody);

    const ok = await getInvoice(DERIVED, `?t=${TOKEN}`);
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body.clientName).toBe("Ada Agent");
    expect(body.invoiceNumber).toBe("INV-2026-0008");
    expect(body.lineItems).toEqual([{ name: "Photos", description: "MLS", qty: 1, unitPrice: 250, price: 250 }]);
    expect(body.total).toBe(250);
    expect(body.amountDue).toBe(250);
    expect(body.status).toBe("sent");
    expect(body).not.toHaveProperty("clientEmail");
    expect(body).not.toHaveProperty("clientPhone");
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("notes");
    expect(body).not.toHaveProperty("clientId");
    expect(body).not.toHaveProperty("orderId");
    expect(body).not.toHaveProperty("galleryId");
    expect(body).not.toHaveProperty("payToken");
    expect(JSON.stringify(body)).not.toContain("ada@example.com");
    expect(JSON.stringify(body)).not.toContain("512-555-0100");
  });

  it("keeps a tokenless legacy auto-id payable and still hides contact fields", async () => {
    const res = await getInvoice(LEGACY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.clientName).toBe("Ada Agent");
    expect(body).not.toHaveProperty("clientEmail");
    expect(body).not.toHaveProperty("phone");
  });

  it("lets the owner and staff open a derived invoice without the token", async () => {
    seed("invoices", DERIVED, { ...invoice });
    const owner = await getInvoice(DERIVED, "", "Bearer owner");
    const ownerBody = await owner.json();
    expect(owner.status).toBe(200);
    expect(ownerBody.clientEmail).toBe("ada@example.com");
    expect(ownerBody.notes).toBe("lockbox 1234");

    const staff = await getInvoice(DERIVED, "", "Bearer staff");
    const staffBody = await staff.json();
    expect(staff.status).toBe(200);
    expect(staffBody.clientEmail).toBe("ada@example.com");
    expect(staffBody.galleryId).toBe("gal-1");

    const other = await getInvoice(DERIVED, "", "Bearer other");
    expect(other.status).toBe(404);
    const photo = await getInvoice(DERIVED, "", "Bearer photo");
    expect(photo.status).toBe(404);

    const badSession = await getInvoice(DERIVED, `?t=${TOKEN}`, "Bearer not-a-session");
    seed("invoices", DERIVED, { ...invoice, payToken: TOKEN });
    const withToken = await getInvoice(DERIVED, `?t=${TOKEN}`, "Bearer not-a-session");
    expect(withToken.status).toBe(200);
    expect(await withToken.json()).not.toHaveProperty("clientEmail");
    expect(badSession.status).toBe(404);
  });
});

describe("POST /api/payments/invoice/:id/checkout", () => {
  it("does not start checkout without the token and does not call Square with one", async () => {
    const savedToken = process.env.SQUARE_ACCESS_TOKEN;
    const savedLocation = process.env.SQUARE_LOCATION_ID;
    delete process.env.SQUARE_ACCESS_TOKEN;
    delete process.env.SQUARE_LOCATION_ID;
    try {
      const blocked = await fetch(`${baseUrl}/api/payments/invoice/${DERIVED}/checkout`, { method: "POST" });
      expect(blocked.status).toBe(404);
      expect(await blocked.json()).toEqual({ error: "Invoice not found." });

      const opened = await fetch(`${baseUrl}/api/payments/invoice/${DERIVED}/checkout?t=${TOKEN}`, { method: "POST" });
      expect(opened.status).toBe(503);
      expect(await opened.json()).toEqual({ error: "Square payments are not configured yet." });
    } finally {
      if (savedToken === undefined) delete process.env.SQUARE_ACCESS_TOKEN;
      else process.env.SQUARE_ACCESS_TOKEN = savedToken;
      if (savedLocation === undefined) delete process.env.SQUARE_LOCATION_ID;
      else process.env.SQUARE_LOCATION_ID = savedLocation;
    }
  });
});
