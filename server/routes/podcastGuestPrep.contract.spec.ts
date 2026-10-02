import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../../public/podcast-guest-prep.html", import.meta.url), "utf8");
const vercel = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
const nodeBuild = readFileSync(new URL("../node-build.ts", import.meta.url), "utf8");
const header = readFileSync(new URL("../../client/components/Header.tsx", import.meta.url), "utf8");
const footer = readFileSync(new URL("../../client/components/Footer.tsx", import.meta.url), "utf8");

describe("podcast guest prep sheet", () => {
  it("keeps the standalone sheet, noindex, and Mike's mailto", () => {
    expect(page).toContain("<title>Podcast Guest Prep | Iconic Images</title>");
    expect(page).toContain('<meta name="robots" content="noindex">');
    expect(page).toContain('const KEY = "iconic-guest-prep-v1"');
    expect(page).toContain("localStorage.getItem(KEY)");
    expect(page).toContain("mike@iconicimagestx.com");
    expect(page).toContain('id="mailLink"');
    expect(page).toContain('id="meterFill"');
  });

  it("is served at /podcast-guest-prep ahead of the SPA fallback", () => {
    const vercelRewrites = JSON.parse(vercel).rewrites as { source: string; destination: string }[];
    const prep = vercelRewrites.filter((rule) => rule.source.startsWith("/podcast-guest-prep"));
    const spa = vercelRewrites.findIndex((rule) => rule.destination === "/index.html");
    expect(prep).toEqual([
      { source: "/podcast-guest-prep", destination: "/podcast-guest-prep.html" },
      { source: "/podcast-guest-prep/", destination: "/podcast-guest-prep.html" },
    ]);
    expect(vercelRewrites.findIndex((rule) => rule.source === "/podcast-guest-prep")).toBeLessThan(spa);

    expect(netlify).toContain('from = "/podcast-guest-prep"');
    expect(netlify).toContain('to = "/podcast-guest-prep.html"');
    expect(vite).toContain('req.url = `/podcast-guest-prep.html${search}`');
    expect(nodeBuild).toContain('"/podcast-guest-prep"');
    expect(nodeBuild).toContain('"/podcast-guest-prep/"');
    expect(nodeBuild.indexOf("podcast-guest-prep.html")).toBeLessThan(nodeBuild.indexOf('app.get("/{*splat}"'));
  });

  it("stays off the marketing header and footer", () => {
    expect(header).not.toContain("podcast-guest-prep");
    expect(footer).not.toContain("podcast-guest-prep");
  });
});
