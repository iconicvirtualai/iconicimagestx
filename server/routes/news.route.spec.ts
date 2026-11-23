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

describe("staff news archive", () => {
  it("hides the newsletter HTML until a staff member is signed in", async () => {
    const open = await fetch(`${baseUrl}/api/news`);
    expect(open.status).toBe(401);

    const list = await fetch(`${baseUrl}/api/news`, { headers: { Authorization: "Bearer temp-admin-token" } });
    expect(list.status).toBe(200);
    const body = await list.json() as { issues: Array<{ slug: string; path: string; emailHtml?: string }> };
    const issue = body.issues.find((item) => item.slug === "holysmokes");
    expect(issue).toMatchObject({ path: "/insights/news/holysmokes" });
    expect(issue?.emailHtml).toBeUndefined();

    const page = await fetch(`${baseUrl}/api/news/issues/newsletter/holysmokes`, {
      headers: { Authorization: "Bearer temp-admin-token" },
    });
    expect(page.status).toBe(200);
    const detail = await page.json() as { issue: { emailHtml: string } };
    expect(detail.issue.emailHtml).toContain("flash-sale?bundle=5");
    expect(detail.issue.emailHtml).toContain("Cadi, Mike, Armando, Daniel, Steven, Pedro and David");
  });
});
