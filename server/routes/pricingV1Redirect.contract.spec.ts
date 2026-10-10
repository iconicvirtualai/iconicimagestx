import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../client/App.tsx", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  redirects?: { source: string; destination: string; statusCode?: number; permanent?: boolean }[];
  rewrites: { source: string; destination: string }[];
};
const netlify = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const nodeBuild = readFileSync(new URL("../node-build.ts", import.meta.url), "utf8");
const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");

const OLD = ["/pricing-v1", "/pricing-v1/"];

describe("retired /pricing-v1", () => {
  it("permanently redirects the old URL to /pricing on Vercel, ahead of the SPA rewrite", () => {
    const redirects = (vercel.redirects ?? []).filter((rule) => OLD.includes(rule.source));
    expect(redirects).toEqual([
      { source: "/pricing-v1", destination: "/pricing", statusCode: 301 },
      { source: "/pricing-v1/", destination: "/pricing", statusCode: 301 },
    ]);
    const spa = vercel.rewrites.findIndex((rule) => rule.destination === "/index.html");
    expect(spa).toBeGreaterThanOrEqual(0);
    expect(vercel.rewrites.some((rule) => OLD.includes(rule.source))).toBe(false);
  });

  it("uses the same 301 on Netlify, the Node server, and the Vite dev server", () => {
    for (const path of OLD) {
      expect(netlify).toContain(`from = "${path}"`);
    }
    expect(netlify).toContain('to = "/pricing"');
    expect(netlify).toContain("status = 301");
    expect(nodeBuild).toContain('"/pricing-v1"');
    expect(nodeBuild).toContain('"/pricing-v1/"');
    expect(nodeBuild).toContain('res.redirect(301, "/pricing")');
    expect(nodeBuild.indexOf('res.redirect(301, "/pricing")')).toBeLessThan(
      nodeBuild.indexOf('app.get("/{*splat}"'),
    );
    expect(vite).toContain('pathOnly === "/pricing-v1"');
    expect(vite).toContain('pathOnly === "/pricing-v1/"');
    expect(vite).toContain("res.statusCode = 301");
    expect(vite).toContain('res.setHeader("Location", "/pricing")');
  });

  it("removes the old page, route, and import and leaves /pricing in place", () => {
    expect(existsSync(new URL("../../client/pages/PricingV1.tsx", import.meta.url))).toBe(false);
    expect(app).not.toContain("PricingV1");
    expect(app).not.toContain('path="/pricing-v1"');
    expect(app).toContain('<Route path="/pricing" element={<Pricing />} />');
    expect(app).toContain('<Route path="/book" element={<Book />} />');
  });
});
