import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../client/App.tsx", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  redirects?: { source: string; destination: string; permanent?: boolean }[];
  rewrites: { source: string; destination: string }[];
};
const netlify = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const nodeBuild = readFileSync(new URL("../node-build.ts", import.meta.url), "utf8");
const galleryLink = readFileSync(new URL("../../shared/clientGalleryLink.ts", import.meta.url), "utf8");

const BARE = ["/studio", "/studio/", "/gallery", "/gallery/"];

describe("bare /studio and /gallery", () => {
  it("sends bare studio to Studio 105 and bare gallery to the client portal", () => {
    expect(app).toContain('<Route path="/studio" element={<Navigate to="/studio-105" replace />} />');
    expect(app).toContain('<Route path="/gallery" element={<Navigate to="/portal" replace />} />');
    expect(app).toContain('<Route path="/studio-105" element={<Studio105 />} />');
    expect(app).toContain('<Route path="/studio/:listingId" element={<ClientStudio />} />');
    expect(app).toContain('<Route path="/gallery/:galleryId" element={<PublicGallery />} />');
    expect(app).not.toContain('path="/studio/*"');
    expect(app).not.toContain('path="/gallery/*"');
  });

  it("redirects only the exact bare paths on Vercel, ahead of the SPA rewrite", () => {
    const redirects = (vercel.redirects ?? []).filter(
      (rule) => rule.source.startsWith("/studio") || rule.source.startsWith("/gallery"),
    );
    expect(redirects.map((rule) => rule.source)).toEqual(BARE);
    for (const rule of redirects) {
      expect(rule.permanent).toBe(false);
      expect(rule.source.includes(":") || rule.source.includes("*") || rule.source.includes("(")).toBe(false);
    }
    expect(redirects.filter((rule) => rule.source.startsWith("/studio")).map((rule) => rule.destination)).toEqual([
      "/studio-105",
      "/studio-105",
    ]);
    expect(redirects.filter((rule) => rule.source.startsWith("/gallery")).map((rule) => rule.destination)).toEqual([
      "/portal",
      "/portal",
    ]);
    const spa = vercel.rewrites.findIndex((rule) => rule.destination === "/index.html");
    expect(spa).toBeGreaterThanOrEqual(0);
    expect(vercel.rewrites.some((rule) => rule.source === "/studio" || rule.source === "/gallery")).toBe(false);
  });

  it("redirects the same bare paths on Netlify and the Node server", () => {
    for (const path of BARE) {
      expect(netlify).toContain(`from = "${path}"`);
      expect(nodeBuild).toContain(`"${path}"`);
    }
    expect(netlify).toContain('to = "/studio-105"');
    expect(netlify).toContain('to = "/portal"');
    expect(netlify).toContain("status = 302");
    expect(nodeBuild).toContain('res.redirect(302, "/studio-105")');
    expect(nodeBuild).toContain('res.redirect(302, "/portal")');
    expect(nodeBuild.indexOf('res.redirect(302, "/studio-105")')).toBeLessThan(
      nodeBuild.indexOf('app.get("/{*splat}"'),
    );
    expect(nodeBuild.indexOf('res.redirect(302, "/portal")')).toBeLessThan(
      nodeBuild.indexOf('app.get("/{*splat}"'),
    );
  });

  it("keeps Lock Studio on id-bearing studio links", () => {
    expect(galleryLink).toContain("listing.lockStudio === true");
    expect(galleryLink).toContain('code: "studio_locked"');
    expect(galleryLink).toContain("httpStatus: 403");
  });
});
