import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

const CLIENT_ROSTER_FILES = [
  "client/hooks/useOperationsMetrics.ts",
  "client/pages/AdminSchedule.tsx",
  "client/lib/photographerRoster.ts",
  "shared/scheduleBoard.ts",
];

const STAFF_CALENDAR_ADDRESSES = [
  "mike@iconicimagestx.com",
  "armando@iconicimagestx.com",
  "pedro@iconicimagestx.com",
  "steven@iconicimagestx.com",
  "cadi@iconicimagestx.com",
  "daniel@iconicimagestx.com",
];

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("GET /api/calendar/roster", () => {
  it("requires a staff token before it returns photographer calendars", async () => {
    const res = await fetch(`${baseUrl}/api/calendar/roster`);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toMatch(/authentication token/i);
    expect(JSON.stringify(data)).not.toContain("@iconicimagestx.com");
  });

  it("rejects a token that is not a Firebase staff session", async () => {
    const res = await fetch(`${baseUrl}/api/calendar/roster`, {
      headers: { Authorization: "Bearer not-a-staff-token" },
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain("mike@iconicimagestx.com");
  });

  it("is staff-gated and stays out of the client roster sources", () => {
    const serverIndex = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const routeAt = serverIndex.indexOf('app.get("/api/calendar/roster", requireStaff');
    expect(routeAt).toBeGreaterThan(-1);

    for (const file of CLIENT_ROSTER_FILES) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      for (const address of STAFF_CALENDAR_ADDRESSES) {
        expect(source, file).not.toContain(address);
      }
    }
  });
});
