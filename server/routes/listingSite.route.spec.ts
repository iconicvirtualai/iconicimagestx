import fs from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { resetListingSiteMemory, seedListingSite } from "../services/listingSiteStore";

let server: Server;
let baseUrl = "";

const published = {
  id: "listing1234",
  address: { street: "123 Main St", city: "Spring", state: "TX", zip: "77373" },
  listPrice: 485000,
  bedrooms: 4,
  bathrooms: 3,
  portalWebsite: { design: "two-up", published: true, font: "modern", color: "teal", style: "minimal" },
  images: [
    { id: "front", name: "Front", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" },
    { id: "zip", name: "archive.zip", url: "https://cdn.example/archive.zip", contentType: "application/zip" },
  ],
  agentName: "Ada Agent",
  brokerage: "Harbor Realty",
  licenseNumber: "000000",
  agentPhone: "(281) 555-0100",
  agentEmail: "agent@example.com",
  matterportUrl: "https://my.matterport.com/show/?m=abc123",
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  resetListingSiteMemory();
});

afterAll(async () => {
  resetListingSiteMemory();
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe("listing sites", () => {
  it("returns 404 for a missing or unpublished listing", async () => {
    seedListingSite({ ...published, portalWebsite: { ...published.portalWebsite, published: false } });
    const missing = await fetch(`${baseUrl}/api/listing-sites/9-missing-oak-st-spring`);
    const unpublished = await fetch(`${baseUrl}/api/listing-sites/123-main-st-spring`);
    expect(missing.status).toBe(404);
    expect(unpublished.status).toBe(404);
  });

  it("serves a published site without original or zip urls", async () => {
    seedListingSite(published);
    const response = await fetch(`${baseUrl}/api/listing-sites/123-main-st-spring`);
    expect(response.status).toBe(200);
    const body = await response.json() as { photos: Array<{ url: string }>; design: string; tourEmbedUrl: string };
    expect(body.design).toBe("two-up");
    expect(body.photos.map((photo) => photo.url)).toEqual(["/api/media/display/listing1234/0"]);
    expect(JSON.stringify(body)).not.toContain("cdn.example");
    expect(JSON.stringify(body)).not.toMatch(/\.zip|original|download/i);
    expect(body.tourEmbedUrl).toBe("https://my.matterport.com/show/?m=abc123");
  });

  it("requires consent before saving a showing request", async () => {
    seedListingSite(published);
    const denied = await fetch(`${baseUrl}/api/listing-sites/123-main-st-spring/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sam Buyer", contact: "sam@example.com", consent: false }),
    });
    expect(denied.status).toBe(400);
    const saved = await fetch(`${baseUrl}/api/listing-sites/123-main-st-spring/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sam Buyer", contact: "sam@example.com", when: "Saturday", consent: true }),
    });
    expect(saved.status).toBe(200);
  });

  it("sends a published shell and a 404 page for an unknown slug", async () => {
    seedListingSite(published);
    const savedDev = process.env.ICONIC_VITE_DEV;
    delete process.env.ICONIC_VITE_DEV;
    const shellFile = "dist/spa/index.html";
    fs.mkdirSync("dist/spa", { recursive: true });
    fs.writeFileSync(shellFile, `<!doctype html><html><body><div id="root" data-listing-site-shell="1"></div></body></html>`);
    try {
      const page = await fetch(`${baseUrl}/l/123-main-st-spring`);
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(html).toContain("data-listing-site-shell");
      const missing = await fetch(`${baseUrl}/l/9-missing-oak-st-spring`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain("not published");
    } finally {
      fs.rmSync(shellFile, { force: true });
      if (savedDev === undefined) delete process.env.ICONIC_VITE_DEV;
      else process.env.ICONIC_VITE_DEV = savedDev;
    }
  });
});
