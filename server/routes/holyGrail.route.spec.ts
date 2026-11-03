import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

let server: Server;
let port = 0;

beforeAll(async () => {
  delete process.env.HOLY_GRAIL_SYNC_LIVE;
  process.env.CRON_SECRET = "cron-test";
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  delete process.env.CRON_SECRET;
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function request(path: string, authorization?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      headers: authorization ? { authorization } : {},
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode || 0, body: raw ? JSON.parse(raw) as Record<string, unknown> : {} });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("Holy Grail routes", () => {
  it("rejects cron calls without the cron secret", async () => {
    const sync = await request("/api/holy-grail/sync");
    const har = await request("/api/holy-grail/har", "Bearer nope");
    const dry = await request("/api/holy-grail/dry-run");
    expect(sync.status).toBe(401);
    expect(har.status).toBe(401);
    expect(dry.status).toBe(401);
  });

  it("does not write when the live flag is off", async () => {
    const sync = await request("/api/holy-grail/sync", "Bearer cron-test");
    expect(sync.status).toBe(200);
    expect(sync.body).toMatchObject({ ok: true, live: false, wrote: false, dryRun: false });
    expect(String(sync.body.message)).toContain("HOLY_GRAIL_SYNC_LIVE");
  });

  it("keeps the daily HAR cron as a no-write stub", async () => {
    const har = await request("/api/holy-grail/har", "Bearer cron-test");
    expect(har.status).toBe(200);
    expect(har.body).toMatchObject({ ok: true, stub: true, wrote: false });
    expect(String(har.body.message)).toContain("doorsopentour");
  });

  it("rejects a dry-run since value that is not a timestamp", async () => {
    const dry = await request("/api/holy-grail/dry-run?since=yesterday", "Bearer cron-test");
    expect(dry.status).toBe(400);
  });
});
