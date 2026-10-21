import type { IncomingMessage, Server, ServerResponse } from "node:http";
import http from "node:http";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createMemoryFirestore } from "../lib/memoryFirestore";
import { useAppFirestore } from "../lib/appFirestore";
import { signSquareWebhook } from "../services/squareWebhook";

/**
 * api/index.mjs defaults to the Express app from server/vercel-handler.ts.
 * Vercel's Node launcher skips its JSON body helper for Express
 * (listener.listen is a function) and proxies the original bytes.
 * express.raw then sets req.body to that Buffer.
 * This file posts through that default export. A local copy of Vercel's body
 * helper consumes the stream, restores it, and leaves a JSON getter. Express 5
 * skips express.raw on that finished request; the route replays the raw bytes.
 */

const memory = createMemoryFirestore();
const KEY = "test-square-webhook-key";
const VERCEL_URL = "https://iconicimagestx.vercel.app/api/payments/square-webhook";

vi.mock("firebase-admin", () => {
  const apps: unknown[] = [];
  const firestore = () => ({ settings() {} });
  firestore.FieldValue = {
    serverTimestamp: () => "SERVER_TIME",
    increment: (amount: number) => ({ increment: amount }),
  };
  firestore.Timestamp = { fromDate: (date: Date) => date };
  return {
    default: {
      apps,
      initializeApp() {
        const app = {};
        apps.push(app);
        return app;
      },
      credential: {
        cert: () => ({}),
        applicationDefault: () => ({}),
      },
      firestore,
    },
  };
});

import vercelHandler from "../vercel-handler";
import paymentsRouter from "./payments";

const ENV_KEYS = [
  "SQUARE_WEBHOOK_SIGNATURE_KEY",
  "SQUARE_WEBHOOK_NOTIFICATION_URL",
  "APP_URL",
  "FRONTEND_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "CLIENT_NOTIFY_LIVE",
  "BOOKING_NOTIFY_LIVE",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function useProductionEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY;
  process.env.APP_URL = "https://iconicimagestx.com";
  process.env.FRONTEND_URL = "https://iconicimagestx.com";
}

function listen(handler: http.RequestListener): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

/**
 * Same shape as Vercel's addHelpers: buffer the body, restore the stream,
 * and expose a lazy req.body getter that JSON.parses those bytes.
 */
function withVercelBodyHelper(app: express.Express): http.RequestListener {
  return (req, res) => {
    void applyVercelBodyHelper(req, res, app);
  };
}

async function applyVercelBodyHelper(req: IncomingMessage, res: ServerResponse, app: express.Express) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const replicate = new PassThrough();
  const originalOn = req.on.bind(req);
  req.read = replicate.read.bind(replicate);
  req.on = req.addListener = ((name: string, listener: (...args: unknown[]) => void) => {
    if (name === "data" || name === "end") return replicate.on(name, listener);
    return originalOn(name, listener as (...args: unknown[]) => void);
  }) as IncomingMessage["on"];
  replicate.write(body);
  replicate.end();

  const contentType = String(req.headers["content-type"] || "");
  Object.defineProperty(req, "body", {
    configurable: true,
    enumerable: true,
    get() {
      let value: unknown;
      if (contentType.includes("application/json")) {
        value = body.length ? JSON.parse(body.toString("utf8")) : {};
      }
      Object.defineProperty(req, "body", { configurable: true, enumerable: true, writable: true, value });
      return value;
    },
    set(value) {
      Object.defineProperty(req, "body", { configurable: true, enumerable: true, writable: true, value });
    },
  });
  app(req, res);
}

let entry: { server: Server; baseUrl: string };
let helped: { server: Server; baseUrl: string };
let parsed: { server: Server; baseUrl: string };

beforeAll(async () => {
  entry = await listen(vercelHandler);
  helped = await listen(withVercelBodyHelper(vercelHandler));
  const parsedApp = express();
  parsedApp.use("/api/payments/square-webhook", (req, _res, next) => {
    req.body = { type: "payment.updated", note: "not-the-raw-bytes" };
    next();
  });
  parsedApp.use("/api/payments", paymentsRouter);
  parsed = await listen(parsedApp);
});

afterAll(async () => {
  useAppFirestore(null);
  await Promise.all([entry, helped, parsed].filter(Boolean).map((item) => new Promise<void>((resolve, reject) => {
    item.server.close((err) => (err ? reject(err) : resolve()));
  })));
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  memory.clear();
  useAppFirestore(memory.db);
  useProductionEnv();
});

function signedRawBody(): string {
  return '{"type": "payment.updated","event_id":"evt-raw-bytes","data":{"type":"payment","id":"pay-raw-bytes","object":{"payment":{"id":"pay-raw-bytes","status":"COMPLETED","amount_money":{"amount":100,"currency":"USD"},"note":"signed\\/raw"}}}}';
}

async function postRaw(baseUrl: string, raw: string, signature: string) {
  const response = await fetch(`${baseUrl}/api/payments/square-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-square-hmacsha256-signature": signature,
    },
    body: raw,
  });
  const json = await response.json();
  return { status: response.status, json };
}

describe("Square webhook through the Vercel Express entry", () => {
  it("verifies the exact bytes Square signs for the vercel.app URL", async () => {
    const raw = signedRawBody();
    expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw);
    const signature = signSquareWebhook(raw, KEY, VERCEL_URL);
    const result = await postRaw(entry.baseUrl, raw, signature);
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ received: true, unmatched: true });
    const logs = Object.keys(memory.dump()).filter((path) => path.startsWith("agentLogs/"));
    expect(logs).toHaveLength(1);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rejected = await postRaw(entry.baseUrl, raw, "bad-signature");
    expect(rejected.status).toBe(400);
    expect(rejected.json.error).toMatch(/Invalid Square webhook signature/);
    const details = warn.mock.calls.find((call) => String(call[0]).includes("signature rejected"))?.[1] as {
      path: string;
      signatureHeaderPresent: boolean;
      bodyLength: number;
      bodyIsBuffer: boolean;
      candidateUrls: string[];
    };
    expect(details).toMatchObject({
      path: "/api/payments/square-webhook",
      signatureHeaderPresent: true,
      bodyIsBuffer: true,
      bodyLength: Buffer.byteLength(raw),
    });
    expect(details.candidateUrls).toEqual(expect.arrayContaining([
      VERCEL_URL,
      "https://iconicimagestx.com/api/payments/square-webhook",
    ]));
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("bad-signature");
    expect(logged).not.toContain("signed");
    warn.mockRestore();
  });

  it("replays raw bytes when a Vercel-style JSON body getter consumed the stream", async () => {
    const raw = signedRawBody();
    const signature = signSquareWebhook(raw, KEY, VERCEL_URL);
    const result = await postRaw(helped.baseUrl, raw, signature);
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ received: true, unmatched: true });
  });

  it("refuses a parsed object instead of re-serializing it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = signedRawBody();
    const signature = signSquareWebhook(raw, KEY, VERCEL_URL);
    const result = await postRaw(parsed.baseUrl, raw, signature);
    expect(result.status).toBe(400);
    expect(result.json.error).toMatch(/raw body is unavailable/i);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toMatch(/raw request body is unavailable/);
    expect(logged).toContain("\"bodyIsBuffer\":false");
    expect(logged).toContain("\"bodyType\":\"object\"");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(signature);
    expect(logged).not.toContain("not-the-raw-bytes");
    expect(Object.keys(memory.dump())).toHaveLength(0);
    error.mockRestore();
  });
});
