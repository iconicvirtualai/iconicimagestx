import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const store = vi.hoisted(() => ({
  added: [] as Array<{
    collection: string;
    id: string;
    data: Record<string, unknown>;
  }>,
}));

const notify = vi.hoisted(() =>
  vi.fn(
    async (_input: {
      isNewOrder: boolean;
      saved: Record<string, unknown>;
      adminUrl?: string;
      env?: Record<string, string | undefined>;
    }) => ({ sent: true }),
  ),
);
const sendEmail = vi.hoisted(() =>
  vi.fn(async () => ({ sent: true, delivery: "sent" as const })),
);

vi.mock("firebase-admin", () => {
  const firestore = () => ({
    collection(name: string) {
      return {
        async add(data: Record<string, unknown>) {
          const id = `sl${store.added.length + 1}`;
          store.added.push({ collection: name, id, data });
          return { id };
        },
      };
    },
  });
  (
    firestore as unknown as { FieldValue: { serverTimestamp: () => string } }
  ).FieldValue = {
    serverTimestamp: () => "ts",
  };
  return {
    default: {
      apps: [{ name: "senior-living-test" }],
      firestore,
    },
  };
});

vi.mock("../services/officeOrderNotify", () => ({
  notifyOfficeOfOrder: notify,
}));

vi.mock("../services/email", () => ({
  sendEmail,
}));

import {
  SENIOR_LIVING_OPS_EMAIL,
  SENIOR_LIVING_REQUESTS,
} from "../../shared/seniorLiving";
import seniorLivingRouter, {
  resetSeniorLivingRateLimit,
  SENIOR_LIVING_RATE_MAX,
} from "./seniorLiving";
import express from "express";

const valid = {
  name: "Ada Lovelace",
  community: "A Woodlands-area senior living community",
  email: "ada@community.example",
  phone: "281-555-0199",
  address: "100 Oak St, Spring, TX 77380",
  services: ["tour-3d", "rooms"],
  preferredDates: "April 14 or 15",
  notes: "Front desk can let you in.",
  companyWebsite: "",
};

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
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  store.added.length = 0;
  notify.mockClear();
  sendEmail.mockClear();
  resetSeniorLivingRateLimit();
  process.env.ADMIN_EMAIL = "photos@iconicimagestx.com";
  delete process.env.COORDINATOR_EMAIL;
});

function post(body: unknown, ip = "203.0.113.50") {
  return fetch(`${baseUrl}/api/senior-living`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("senior living request route", () => {
  it("rejects an incomplete request before writing or notifying", async () => {
    const res = await post({ ...valid, email: "nope", services: [] });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Enter a valid email.");
    expect(store.added).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("drops a honeypot without writing or notifying", async () => {
    const res = await post({
      ...valid,
      companyWebsite: "https://spam.example",
    });
    expect(res.status).toBe(200);
    expect(store.added).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("writes the request and calls office notify without emailing the client", async () => {
    const res = await post({
      ...valid,
      depositRequired: false,
      depositPercent: 0,
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(store.added).toHaveLength(1);
    expect(store.added[0].collection).toBe(SENIOR_LIVING_REQUESTS);
    expect(store.added[0].data.email).toBe(valid.email);
    expect(store.added[0].data.community).toBe(valid.community);
    expect(store.added[0].data.depositRequired).toBe(true);
    expect(store.added[0].data.depositPercent).toBe(50);
    expect(notify).toHaveBeenCalledTimes(1);
    const input = notify.mock.calls[0]?.[0];
    if (!input) throw new Error("office notify was not called");
    expect(input.isNewOrder).toBe(true);
    expect(input.saved.email).toBe(valid.email);
    expect(input.saved.clientEmail).toBe(valid.email);
    expect(input.saved.depositRequired).toBe(true);
    expect(input.saved.depositPercent).toBe(50);
    expect(input.saved.id).toBe(store.added[0].id);
    expect(input.env.ADMIN_EMAIL).toContain(SENIOR_LIVING_OPS_EMAIL);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/emailed you|confirmation email/i);
  });

  it("rate limits a noisy address and does not notify the overflow", async () => {
    for (let i = 0; i < SENIOR_LIVING_RATE_MAX; i += 1) {
      const res = await post({ ...valid, email: "bad" }, "203.0.113.77");
      expect(res.status).toBe(400);
    }
    const blocked = await post(valid, "203.0.113.77");
    expect(blocked.status).toBe(429);
    expect(notify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not send client mail from this route", () => {
    const source = readFileSync(
      new URL("./seniorLiving.ts", import.meta.url),
      "utf8",
    );
    const index = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    expect(source).toContain("notifyOfficeOfOrder");
    expect(source).toContain("seniorLivingOfficeEnv");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("booking_received");
    expect(source).not.toContain(["cadi", "@"].join(""));
    expect(index).toContain(
      'app.use("/api/senior-living", seniorLivingRouter)',
    );
  });
});
