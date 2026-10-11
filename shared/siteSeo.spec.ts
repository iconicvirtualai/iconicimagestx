import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_ORIGIN,
  GENERIC_TITLE,
  OG_IMAGE_PATH,
  PUBLIC_PAGES,
  canonicalUrl,
  injectNoIndex,
  injectPublicPage,
  isNoIndexPath,
  metaPlan,
  robotsTxt,
  sitemapXml,
  stripPublicMeta,
} from "./siteSeo";

const shell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${GENERIC_TITLE}</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("public page meta", () => {
  it("uses the live vercel.app origin unless VITE_SITE_ORIGIN is set", () => {
    expect(DEFAULT_SITE_ORIGIN).toBe("https://iconicimagestx.vercel.app");
    expect(canonicalUrl("/about", DEFAULT_SITE_ORIGIN)).toBe("https://iconicimagestx.vercel.app/about");
    expect(canonicalUrl("/", DEFAULT_SITE_ORIGIN)).toBe("https://iconicimagestx.vercel.app/");
  });

  it("writes a plain description for each public page and skips prices and Iconic Credits", () => {
    const paths = PUBLIC_PAGES.map((page) => page.path);
    expect(paths).toEqual([
      "/",
      "/about",
      "/pricing",
      "/studio-105",
      "/portfolio",
      "/stock-footage",
      "/contact",
      "/socials",
      "/book",
      "/privacy",
      "/terms",
      "/login",
    ]);
    for (const page of PUBLIC_PAGES) {
      expect(page.title.length).toBeGreaterThan(8);
      expect(page.description.length).toBeGreaterThan(40);
      expect(page.description.length).toBeLessThan(170);
      expect(page.description).not.toMatch(/iconic credits/i);
      expect(page.description).not.toMatch(/\$\s?\d/);
      expect(page.description).not.toMatch(/\d+\.\d{2}/);
      expect(page.title).not.toMatch(/iconic credits/i);
    }
  });

  it("injects title, description, canonical, and social tags into the shell", () => {
    const about = PUBLIC_PAGES.find((page) => page.path === "/about")!;
    const html = injectPublicPage(shell, about, DEFAULT_SITE_ORIGIN);
    expect(html).toContain(`<title>${about.title}</title>`);
    expect(html).not.toContain(GENERIC_TITLE);
    expect(html).toContain(`<meta name="description" content="${about.description}" />`);
    expect(html).toContain(`<link rel="canonical" href="${DEFAULT_SITE_ORIGIN}/about" />`);
    expect(html).toContain(`<meta property="og:title" content="${about.title}" />`);
    expect(html).toContain(`<meta property="og:description" content="${about.description}" />`);
    expect(html).toContain(`<meta property="og:url" content="${DEFAULT_SITE_ORIGIN}/about" />`);
    expect(html).toContain(`<meta property="og:image" content="${DEFAULT_SITE_ORIGIN}${OG_IMAGE_PATH}" />`);
    expect(html).toContain(`<meta name="twitter:card" content="summary_large_image" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${DEFAULT_SITE_ORIGIN}${OG_IMAGE_PATH}" />`);
    expect(html).toContain('<div id="root"></div>');
  });

  it("marks private shells noindex and strips a previous public description", () => {
    const home = injectPublicPage(shell, PUBLIC_PAGES[0], DEFAULT_SITE_ORIGIN);
    const stripped = stripPublicMeta(home);
    expect(stripped).not.toContain("og:title");
    expect(stripped).not.toContain('name="description"');
    const html = injectNoIndex(home);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html.match(/og:title/g)).toBeNull();
    expect(html).toContain(`<title>${GENERIC_TITLE}</title>`);
  });

  it("noindexes private trees and leaves the public studio page indexable", () => {
    expect(isNoIndexPath("/admin")).toBe(true);
    expect(isNoIndexPath("/admin/login")).toBe(true);
    expect(isNoIndexPath("/admin/owners")).toBe(true);
    expect(isNoIndexPath("/portal")).toBe(true);
    expect(isNoIndexPath("/portal/home")).toBe(true);
    expect(isNoIndexPath("/owners")).toBe(true);
    expect(isNoIndexPath("/owners/extra")).toBe(true);
    expect(isNoIndexPath("/studio/listing-1")).toBe(true);
    expect(isNoIndexPath("/gallery/share-1")).toBe(true);
    expect(isNoIndexPath("/studio-105")).toBe(false);
    expect(isNoIndexPath("/login")).toBe(false);
    expect(isNoIndexPath("/gallery")).toBe(false);
    expect(isNoIndexPath("/invoice")).toBe(true);
    expect(isNoIndexPath("/invoice/inv-1")).toBe(true);
    expect(isNoIndexPath("/invoice/inv-1/")).toBe(true);
    expect(metaPlan("/portal").kind).toBe("noindex");
    expect(metaPlan("/invoice/inv-1").kind).toBe("noindex");
    expect(metaPlan("/about").kind).toBe("public");
    expect(metaPlan("/go").kind).toBe("preserve-title");
    expect(metaPlan("/present/abcdefghijklmnopqrstuv").kind).toBe("hands-off");
    expect(metaPlan("/agents").kind).toBe("generic");
  });

  it("matches the committed sitemap and robots files", () => {
    expect(readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8")).toBe(sitemapXml());
    expect(readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8")).toBe(robotsTxt());
    const robots = robotsTxt();
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /portal");
    expect(robots).toContain("Disallow: /owners");
    expect(robots).toContain("Disallow: /studio/");
    expect(robots).toContain("Disallow: /gallery/");
    expect(robots).toContain("Disallow: /api");
    expect(robots).toContain("Disallow: /invoice");
    expect(robots).toContain(`Sitemap: ${DEFAULT_SITE_ORIGIN}/sitemap.xml`);
    expect(robots).not.toContain("Disallow: /studio-105");
  });
});
