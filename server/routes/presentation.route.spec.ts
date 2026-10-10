import fs from "fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

const savedEnv = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

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
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("presentation routes", () => {
  it("serves the seeded presentation without Firebase", async () => {
    const res = await fetch(`${baseUrl}/api/presentations/preview`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.seeded).toBe(true);
    expect(data.agentName).toBe("");
    expect(data.address).toBe("");
    expect(data.photos.length).toBeGreaterThan(8);
    expect(data.photos[0].url).toContain("/media/photos/");
    expect(data.meta.title).toContain("Iconic Images");
    expect(JSON.stringify(data)).not.toMatch(/email|sms|phone/i);
  });

  it("rejects a short token and an unknown token", async () => {
    const bad = await fetch(`${baseUrl}/api/presentations/nope`);
    expect(bad.status).toBe(400);
    const missing = await fetch(`${baseUrl}/api/presentations/abcdefghijklmnopqrstuv`);
    expect(missing.status).toBe(404);
  });

  it("does not save a share link without staff auth", async () => {
    const res = await fetch(`${baseUrl}/api/listings/listing1234/presentation`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("refuses to write a token when Firebase Admin is not configured and does not notify", async () => {
    const res = await fetch(`${baseUrl}/api/listings/listing1234/presentation`, {
      method: "POST",
      headers: {
        Authorization: "Bearer temp-admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.notified).toBe(false);
    expect(data.previewPath).toBe("/present/preview");
    expect(String(data.error)).not.toMatch(/email|sms|texted/i);
  });

  it("returns share tags for the sample presentation", async () => {
    const res = await fetch(`${baseUrl}/api/presentations/shell/preview`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("og:title");
    expect(html).toContain("Sample presentation");
    expect(html).toContain("noindex");
  });

  it("rewrites /present/:token to the API function before the SPA fallback", async () => {
    const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as {
      functions: Record<string, unknown>;
      rewrites: Array<{ source: string; destination: string }>;
    };
    // api/index.mjs is the only API function. /api/(.*) is what invokes it.
    // /api/presentations/shell/:token is not a function file, so a rewrite
    // there never runs and the SPA catch-all serves index.html.
    expect(vercel.functions["api/index.mjs"]).toBeTruthy();
    expect(fs.existsSync("api/presentations/shell.mjs")).toBe(false);
    expect(fs.existsSync("api/presentations/shell.js")).toBe(false);
    const apiEntry = vercel.rewrites.find((rule) => rule.source === "/api/(.*)");
    expect(apiEntry?.destination).toBe("/api/index");
    const spa = vercel.rewrites.findIndex((rule) => rule.destination === "/index.html");
    expect(spa).toBeGreaterThanOrEqual(0);
    const present = vercel.rewrites.findIndex((rule) => rule.source === "/present/:token");
    expect({
      destination: vercel.rewrites[present]?.destination ?? null,
      beforeSpa: present >= 0 && present < spa,
    }).toEqual({ destination: "/api/index", beforeSpa: true });
    expect(vercel.rewrites.some((rule) => rule.destination.includes("/api/presentations/shell"))).toBe(false);

    const app = fs.readFileSync("client/App.tsx", "utf8");
    expect(app).toContain('path="/present/:token" element={<ListingPresentation />}');

    // Vite's dev plugin sets this flag, including under Vitest. The Vercel
    // function does not, so clear it while the handler is exercised.
    const savedDev = process.env.ICONIC_VITE_DEV;
    delete process.env.ICONIC_VITE_DEV;
    const shellFile = "dist/spa/index.html";
    try {
      const shell = await fetch(`${baseUrl}/api/presentations/shell/preview`);
      const page = await fetch(`${baseUrl}/present/preview`);
      const shellHtml = await shell.text();
      const pageHtml = await page.text();
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(pageHtml).toBe(shellHtml);
      expect(pageHtml).toContain('property="og:title"');
      expect(pageHtml).toContain("Sample presentation · Iconic Images");
      expect(pageHtml).toContain('property="og:description"');
      expect(pageHtml).toContain('property="og:image"');
      expect(pageHtml).toContain('name="twitter:card"');
      expect(pageHtml).toContain("noindex");

      const marker = "data-presentation-client-shell";
      fs.mkdirSync("dist/spa", { recursive: true });
      fs.writeFileSync(
        shellFile,
        `<!doctype html><html><head><title>Iconic</title></head><body><div id="root" ${marker}="1"></div><script type="module" src="/assets/client.js"></script></body></html>`,
      );
      const withClient = await fetch(`${baseUrl}/present/preview`);
      const clientHtml = await withClient.text();
      expect(withClient.status).toBe(200);
      expect(clientHtml).toContain(marker);
      expect(clientHtml).toContain('id="root"');
      expect(clientHtml).toContain("/assets/client.js");
      expect(clientHtml).toContain('property="og:title"');
      expect(clientHtml).toContain("Sample presentation · Iconic Images");
      expect(clientHtml).toContain("noindex");

      const missing = await fetch(`${baseUrl}/present/abcdefghijklmnopqrstuv`);
      const missingHtml = await missing.text();
      expect(missing.status).toBe(404);
      expect(missing.headers.get("content-type")).toContain("text/html");
      expect(missingHtml).toBe(
        "<!doctype html><title>Presentation</title><p>This presentation link is not active.</p>",
      );
      expect(missingHtml).not.toContain(marker);
      expect(missingHtml).not.toMatch(/firebase|node_modules|FIREBASE_SERVICE_ACCOUNT|at\s+\w+\s+\(/i);
    } finally {
      fs.rmSync(shellFile, { force: true });
      if (savedDev === undefined) delete process.env.ICONIC_VITE_DEV;
      else process.env.ICONIC_VITE_DEV = savedDev;
    }
  });
});
