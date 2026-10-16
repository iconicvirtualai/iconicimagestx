import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../client/App.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../../client/components/Header.tsx", import.meta.url), "utf8");
const footer = readFileSync(new URL("../../client/components/Footer.tsx", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const nodeBuild = readFileSync(new URL("../node-build.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

describe("public holiday and studios routes", () => {
  it("registers the pages and the short redirects", () => {
    expect(app).toContain('path="/tis-the-season"');
    expect(app).toContain('path="/studios"');
    expect(app).toContain('path="/december" element={<Navigate to="/tis-the-season" replace />}');
    expect(app).toContain('path="/holiday-packages" element={<Navigate to="/tis-the-season" replace />}');
    expect(app).toContain('path="/iconic-studios" element={<Navigate to="/studios" replace />}');
    expect(app).toContain('path="/studio" element={<Navigate to="/studio-105" replace />}');
    expect(header).toContain("withStudiosNav");
    expect(footer).toContain("withStudiosNav");
  });

  it("redirects the same paths on Netlify and the Node server", () => {
    for (const path of ["/december", "/december/", "/holiday-packages", "/holiday-packages/"]) {
      expect(netlify).toContain(`from = "${path}"`);
      expect(nodeBuild).toContain(`"${path}"`);
    }
    expect(netlify).toContain('to = "/tis-the-season"');
    expect(nodeBuild).toContain('res.redirect(302, "/tis-the-season")');
    for (const path of ["/iconic-studios", "/iconic-studios/"]) {
      expect(netlify).toContain(`from = "${path}"`);
      expect(nodeBuild).toContain(`"${path}"`);
    }
    expect(netlify).toContain('to = "/studios"');
    expect(nodeBuild).toContain('res.redirect(302, "/studios")');
    expect(nodeBuild.indexOf('res.redirect(302, "/tis-the-season")')).toBeLessThan(nodeBuild.indexOf('app.get("/{*splat}"'));
  });

  it("leaves client notification off in the example env", () => {
    expect(envExample).toMatch(/^CLIENT_NOTIFY_LIVE=$/m);
    expect(envExample).not.toMatch(/^CLIENT_NOTIFY_LIVE=true/m);
    expect(envExample).toMatch(/^HOLIDAY_SQUARE_PAY_URL=$/m);
    expect(envExample).toMatch(/^STUDIOS_SQUARE_PAY_URL=$/m);
  });
});
