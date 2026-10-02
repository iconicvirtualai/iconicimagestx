import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyBareNotFound } from "../lib/bareClientNotFound";
import { createServer } from "../index";

const savedEnv = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  ICONIC_VITE_DEV: process.env.ICONIC_VITE_DEV,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.ICONIC_VITE_DEV;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (savedEnv.ENABLE_TEMP_ADMIN === undefined) delete process.env.ENABLE_TEMP_ADMIN;
  else process.env.ENABLE_TEMP_ADMIN = savedEnv.ENABLE_TEMP_ADMIN;
  if (savedEnv.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = savedEnv.VERCEL;
  if (savedEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
  if (savedEnv.ICONIC_VITE_DEV === undefined) delete process.env.ICONIC_VITE_DEV;
  else process.env.ICONIC_VITE_DEV = savedEnv.ICONIC_VITE_DEV;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("bare /studio and /gallery", () => {
  it("returns HTTP 404 with helpful links and no oops copy", async () => {
    for (const path of ["/studio", "/studio/", "/gallery", "/gallery/"]) {
      const res = await fetch(`${baseUrl}${path}`);
      const html = await res.text();
      expect(res.status, path).toBe(404);
      expect(res.headers.get("content-type") || "").toContain("text/html");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      expect(html).toContain("Page not found");
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/portfolio"');
      expect(html).toContain('href="/contact"');
      expect(html).toContain('href="/login"');
      expect(html).toContain("Client Login");
      expect(html).not.toContain("Oops!");
      if (path.startsWith("/gallery")) {
        expect(html).toContain("gallery link includes an ID");
      } else {
        expect(html).toContain("studio link includes an ID");
        expect(html).toContain('href="/studio-105"');
      }
    }
  });

  it("keeps the api ping route on 200", async () => {
    const res = await fetch(`${baseUrl}/api/ping`);
    expect(res.status).toBe(200);
  });

  it("injects the 404 into the spa shell without dropping the app script", () => {
    const shell = `<!doctype html><html><head><title>Iconic Images - Creative Media Partners</title></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`;
    const html = applyBareNotFound(shell, "/gallery");
    expect(html).toContain('src="/assets/index.js"');
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain("Page not found | Iconic Images");
    expect(html).toContain("gallery link includes an ID");
    expect(html).not.toContain("Oops!");
  });

  it("is routed ahead of the spa fallback and does not catch id links", () => {
    const vercel = JSON.parse(read("../../vercel.json"));
    const rewrites = vercel.rewrites as { source: string; destination: string }[];
    const spa = rewrites.findIndex((rule) => rule.destination === "/index.html");
    for (const source of ["/studio", "/studio/", "/gallery", "/gallery/"]) {
      const index = rewrites.findIndex((rule) => rule.source === source);
      expect(index, source).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(spa);
      expect(rewrites[index].destination).toBe("/api/index");
    }
    expect(
      rewrites
        .filter((rule) => rule.source.startsWith("/studio") || rule.source.startsWith("/gallery"))
        .map((rule) => rule.source)
        .sort(),
    ).toEqual(["/gallery", "/gallery/", "/studio", "/studio/"]);
    expect(vercel.functions["api/index.mjs"].includeFiles).toContain("dist/spa/index.html");

    const netlify = read("../../netlify.toml");
    expect(netlify).toContain('from = "/studio"');
    expect(netlify).toContain('from = "/gallery"');
    expect(netlify).toContain("status = 404");
    expect(netlify).toContain('to = "/index.html"');

    const app = read("../../client/App.tsx");
    expect(app).toContain('<Route path="/studio" element={<BareClientRouteNotFound />} />');
    expect(app).toContain('<Route path="/gallery" element={<BareClientRouteNotFound />} />');
    expect(app).toContain('<Route path="/studio/:listingId" element={<ClientStudio />} />');
    expect(app).toContain('<Route path="/gallery/:galleryId" element={<PublicGallery />} />');

    const page = read("../../client/pages/BareClientRouteNotFound.tsx");
    const copy = read("../../shared/bareClientRoute.ts");
    expect(page).toContain("Layout");
    expect(page).toContain("BARE_CLIENT_ROUTE_LINKS");
    expect(page).toContain('to={link.href}');
    expect(copy).toContain('href: "/portfolio"');
    expect(copy).toContain('href: "/contact"');
    expect(copy).toContain('href: "/login"');
    expect(copy).toContain('label: "Client Login"');
    expect(page).not.toContain("Oops!");

    const vite = read("../../vite.config.ts");
    expect(vite).toContain("isBareClientRoute");
    expect(vite).toContain("statusCode = 404");
    expect(vite.indexOf("statusCode = 404")).toBeLessThan(vite.indexOf("server.middlewares.use(app)"));

    const nodeBuild = read("../node-build.ts");
    expect(nodeBuild).toContain("isBareClientRoute(req.path)");
    expect(nodeBuild).toContain("status(404)");
    expect(nodeBuild.indexOf("isBareClientRoute(req.path)")).toBeLessThan(nodeBuild.indexOf('res.sendFile(path.join(distPath, "index.html"))'));
  });
});
