import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { CANONICAL_WWW_ORIGIN, DEFAULT_SITE_ORIGIN, robotsTxt, sitemapXml } from "@shared/siteSeo";

let server: Server;
let port = 0;

beforeAll(async () => {
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function get(path: string, host: string): Promise<{ status: number; body: string; vary: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: "GET", headers: { host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
          vary: res.headers.vary,
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

describe("host-aware sitemap and robots", () => {
  it("keeps vercel.app and preview hosts on the live origin", async () => {
    for (const host of ["iconicimagestx.vercel.app", "preview-abc123.vercel.app", "localhost:8080"]) {
      const sitemap = await get("/sitemap.xml", host);
      const robots = await get("/robots.txt", host);
      expect(sitemap.status, host).toBe(200);
      expect(sitemap.body).toBe(sitemapXml(DEFAULT_SITE_ORIGIN));
      expect(sitemap.body).not.toContain("iconicimagestx.com");
      expect(robots.body).toBe(robotsTxt(DEFAULT_SITE_ORIGIN));
      expect(String(sitemap.vary).toLowerCase()).toContain("host");
    }
  });

  it("uses www for the custom domain hosts only", async () => {
    for (const host of ["www.iconicimagestx.com", "iconicimagestx.com"]) {
      const sitemap = await get("/sitemap.xml", host);
      const robots = await get("/robots.txt", host);
      expect(sitemap.body).toBe(sitemapXml(CANONICAL_WWW_ORIGIN));
      expect(sitemap.body).toContain(`${CANONICAL_WWW_ORIGIN}/about`);
      expect(sitemap.body).not.toContain("vercel.app");
      expect(robots.body).toBe(robotsTxt(CANONICAL_WWW_ORIGIN));
      expect(robots.body).toContain(`Sitemap: ${CANONICAL_WWW_ORIGIN}/sitemap.xml`);
    }
  });
});
