import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

let server: Server;
let baseUrl = "";

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
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe("unlisted news pages", () => {
  it("serves an issue by direct link and keeps the index staff-only", async () => {
    const open = await fetch(`${baseUrl}/api/news`);
    expect(open.status).toBe(401);

    const page = await fetch(`${baseUrl}/api/news/issues/newsletter/holysmokes`);
    expect(page.status).toBe(200);
    expect(String(page.headers.get("x-robots-tag"))).toContain("noindex");
    const detail = await page.json() as { issue: { path: string; emailHtml: string } };
    expect(detail.issue.path).toBe("/news/holysmokes");
    expect(detail.issue.emailHtml).toContain("flash-sale?bundle=5");
    expect(detail.issue.emailHtml).toContain("BLACK FRIDAY SALE");

    const list = await fetch(`${baseUrl}/api/news`, { headers: { Authorization: "Bearer temp-admin-token" } });
    expect(list.status).toBe(200);
    const body = await list.json() as { issues: Array<{ slug: string; path: string; emailHtml?: string }> };
    expect(body.issues.find((item) => item.slug === "holysmokes")).toMatchObject({ path: "/news/holysmokes" });
    expect(body.issues[0]?.emailHtml).toBeUndefined();
  });
});
