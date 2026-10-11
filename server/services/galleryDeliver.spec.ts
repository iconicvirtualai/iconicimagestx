import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, sendMail } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  sendMail: vi.fn(async (message: { subject?: string; html?: string; to?: string }) => {
    void message;
    return { messageId: "test-message" };
  }),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail,
      close: () => undefined,
    }),
  },
}));

vi.mock("./sms", () => ({
  sendSMS: vi.fn(async () => ({ sent: false, suppressed: true })),
  SMS_TEMPLATES: {
    photosDelivered: (name: string, url: string) => `${name} ${url}`,
  },
}));

vi.mock("./galleryReleaseGate", () => ({
  loadGalleryReleaseForGallery: vi.fn(async () => ({
    complete: true,
    message: "Ready.",
    gaps: [],
    percent: 100,
  })),
}));

vi.mock("firebase-admin", () => {
  function apply(path: string, data: Record<string, unknown>) {
    const current = { ...(store.get(path) || {}) };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "_arrayUnion" in (value as object)) {
        const prev = Array.isArray(current[key]) ? current[key] as unknown[] : [];
        current[key] = [...prev, ...(value as { _arrayUnion: unknown[] })._arrayUnion];
      } else {
        current[key] = value;
      }
    }
    store.set(path, current);
  }

  function docRef(collection: string, id: string) {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      get: async () => ({
        id,
        exists: store.has(path),
        data: () => store.get(path),
        ref: docRef(collection, id),
      }),
      update: async (data: Record<string, unknown>) => {
        if (!store.has(path)) throw new Error(`missing ${path}`);
        apply(path, data);
      },
    };
  }

  function collection(name: string) {
    const filters: Array<[string, unknown]> = [];
    const api = {
      doc: (id: string) => docRef(name, id),
      where: (field: string, _op: string, value: unknown) => {
        filters.push([field, value]);
        return api;
      },
      limit: () => api,
      get: async () => {
        const docs = [...store.entries()]
          .filter(([path, data]) => path.startsWith(`${name}/`) && filters.every(([field, value]) => data[field] === value))
          .map(([path]) => {
            const id = path.slice(name.length + 1);
            return { id, data: () => store.get(path), ref: docRef(name, id) };
          });
        return { empty: docs.length === 0, docs };
      },
    };
    return api;
  }

  const firestore = () => ({ collection });
  (firestore as unknown as { FieldValue: unknown; Timestamp: unknown }).FieldValue = {
    serverTimestamp: () => "server-time",
    arrayUnion: (...items: unknown[]) => ({ _arrayUnion: items }),
  };
  (firestore as unknown as { Timestamp: { fromDate: (date: Date) => Date } }).Timestamp = {
    fromDate: (date: Date) => date,
  };
  return { default: { firestore, apps: [{}] } };
});

import { deliverGalleryToClient } from "./galleryDeliver";

const ENV_KEYS = [
  "PUBLIC_SITE_URL",
  "VITE_PUBLIC_SITE_URL",
  "APP_URL",
  "CLIENT_NOTIFY_LIVE",
  "CLIENT_COMMS_ZONE",
  "NOTIFY_TEST_ALLOWLIST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_HOST",
  "SMTP_PORT",
  "EMAIL_FROM",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function useEnv(overrides: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.APP_URL = "https://www.iconicimagestx.com";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function seed(invoice: Record<string, unknown>) {
  store.clear();
  store.set("galleries/gal-1", {
    playtest: true,
    orderId: "order-1",
    listingId: "listing-1",
    clientId: "client-1",
    clientName: "Ada",
    address: "123 Main St",
    invoiceId: "inv-1",
  });
  store.set("orders/order-1", {
    playtest: true,
    history: [],
    clientEmail: "ada@example.com",
  });
  store.set("listings/listing-1", {
    playtest: true,
    orderId: "order-1",
    invoiceId: "inv-1",
    auditLog: [],
  });
  store.set("clients/client-1", { email: "ada@example.com", name: "Ada" });
  store.set("invoices/inv-1", { orderId: "order-1", total: 120, ...invoice });
}

function history() {
  return (store.get("orders/order-1")?.history || []) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  sendMail.mockClear();
  useEnv({});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("deliverGalleryToClient", () => {
  it("writes history when the notify gate suppresses the email, including playtest", async () => {
    seed({ status: "sent", payToken: "tok-1" });
    const result = await deliverGalleryToClient("gal-1", {
      actor: { name: "Cadi", email: "staff@example.com" },
      now: new Date("2026-10-11T02:00:00.000Z"),
    });

    expect(result.deliveryUrl).toBe("https://iconicimagestx.vercel.app/gallery/gal-1");
    expect(result.deliveryUrl).not.toContain("iconicimagestx.com");
    expect(sendMail).not.toHaveBeenCalled();
    expect(history()).toEqual([
      expect.objectContaining({
        action: "Gallery delivered",
        by: "Cadi (staff@example.com)",
        at: "2026-10-11T02:00:00.000Z",
        recipients: ["ada@example.com"],
        email: "suppressed",
      }),
    ]);
    expect(history()[0].details).toContain("suppressed by the notify gate");
    expect(store.get("listings/listing-1")?.auditLog).toEqual(history());
    expect(store.get("galleries/gal-1")?.playtest).toBe(true);
  });

  it("sends the public gallery link, subject, and tokenized pay link via the allowlist", async () => {
    useEnv({
      PUBLIC_SITE_URL: "https://links.example/",
      NOTIFY_TEST_ALLOWLIST: "ada@example.com",
      SMTP_USER: "smtp@example.com",
      SMTP_PASS: "secret",
    });
    seed({ id: "inv-1", status: "sent", payToken: "tok-1" });
    await deliverGalleryToClient("gal-1", {
      actor: { email: "staff@example.com" },
      now: new Date("2026-10-11T03:00:00.000Z"),
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]?.[0];
    if (!message?.html || !message.subject) throw new Error("No delivery email was sent.");
    expect(message.subject).toBe("Your gallery is ready: 123 Main St");
    expect(message.html).toContain("https://links.example/studio/listing-1/site");
    expect(message.html).toContain(">View Gallery</a>");
    expect(message.html).toContain("Your downloads & invoice");
    expect(message.html).toContain("https://links.example/gallery/gal-1");
    expect(message.html.indexOf("https://links.example/studio/listing-1/site")).toBeLessThan(
      message.html.indexOf("https://links.example/gallery/gal-1"),
    );
    expect(message.html).toContain("https://links.example/invoice/inv-1?t=tok-1");
    expect(message.html).not.toContain("iconicimagestx.com/gallery");
    expect(message.html).not.toContain("/invoice/listing_");
    expect(message.html).not.toContain("/invoice/ordreq_");
    expect(history()[0]).toMatchObject({
      email: "allowlist",
      recipients: ["ada@example.com"],
    });
    expect(String(history()[0].details)).toContain("test allowlist");
    expect(store.get("galleries/gal-1")?.deliveryUrl).toBe("https://links.example/gallery/gal-1");
  });

  it("omits the pay link when the invoice is paid or has no token", async () => {
    useEnv({
      CLIENT_NOTIFY_LIVE: "true",
      SMTP_USER: "smtp@example.com",
      SMTP_PASS: "secret",
    });
    seed({ id: "inv-1", status: "paid", payToken: "tok-1" });
    await deliverGalleryToClient("gal-1", { actor: { uid: "staff-1" } });
    const paidHtml = sendMail.mock.calls[0]?.[0]?.html || "";
    expect(paidHtml).toContain("View Gallery");
    expect(paidHtml).toContain("https://iconicimagestx.vercel.app/studio/listing-1/site");
    expect(paidHtml).toContain("Your downloads & invoice");
    expect(paidHtml).toContain("https://iconicimagestx.vercel.app/gallery/gal-1");
    expect(paidHtml).not.toContain("Pay invoice");
    expect(paidHtml).not.toContain("tok-1");
    expect(history()[0].email).toBe("sent");

    sendMail.mockClear();
    seed({ id: "listing_studio1", status: "sent" });
    await deliverGalleryToClient("gal-1", { actor: { uid: "staff-1" } });
    const guessHtml = sendMail.mock.calls[0]?.[0]?.html || "";
    expect(guessHtml).not.toContain("/invoice/listing_");
    expect(guessHtml).not.toContain("/invoice/ordreq_");
    expect(guessHtml).not.toContain("Pay invoice");
  });
});
