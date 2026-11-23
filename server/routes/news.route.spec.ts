import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { renderNewsShell } from "./news";
import { CANONICAL_WWW_ORIGIN, DEFAULT_SITE_ORIGIN } from "@shared/siteSeo";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  delete process.env.ICONIC_VITE_DEV;
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

describe("news pages", () => {
  it("lists HOLYYY SMOKES and serves crawlable meta for the issue", async () => {
    const list = await fetch(`${baseUrl}/api/news`);
    expect(list.status).toBe(200);
    const body = await list.json() as { issues: Array<{ slug: string; path: string; category: string; source: string }> };
    const issue = body.issues.find((item) => item.slug === "holysmokes");
    expect(issue).toMatchObject({ path: "/news/holysmokes", category: "newsletter", source: "folder" });

    const page = await fetch(`${baseUrl}/news/holysmokes`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<title>HOLYYY SMOKES | Iconic Images</title>");
    expect(html).toContain('property="og:image"');
    expect(html).toContain(`${DEFAULT_SITE_ORIGIN}/marketing/email/holy-smokes-2026/hero.jpg`);
    expect(html).toContain(`${DEFAULT_SITE_ORIGIN}/news/holysmokes`);
    expect(html).toContain("Not in real estate");

    const www = await renderNewsShell("newsletter", "holysmokes", CANONICAL_WWW_ORIGIN);
    expect(www.status).toBe(200);
    expect(www.html).toContain(`${CANONICAL_WWW_ORIGIN}/marketing/email/holy-smokes-2026/hero.jpg`);
    expect(www.html).toContain(`${CANONICAL_WWW_ORIGIN}/news/holysmokes`);

    const wrongShelf = await fetch(`${baseUrl}/news/promos/holysmokes`);
    expect(wrongShelf.status).toBe(404);
    expect(await wrongShelf.text()).toContain('name="robots" content="noindex, nofollow"');
  });
});
