import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildVercelRewrites,
  firstMatchingRewrite,
  matchingRedirect,
  redirectLocation,
} from "./spaRouting";
import { WIX_CONFIRMED_ABSENT, WIX_URL_MAP, wixPathRedirects, wixUrlMapMarkdown } from "./wixLaunch";

describe("wix launch map", () => {
  it("matches the committed URL map", () => {
    const doc = readFileSync(new URL("../docs/wix-url-map.md", import.meta.url), "utf8");
    expect(doc).toBe(wixUrlMapMarkdown());
  });

  it("redirects old paths and leaves the live thankful URL alone", () => {
    const wixSources = new Set(wixPathRedirects().map((rule) => rule.source));
    for (const entry of WIX_URL_MAP) {
      if (entry.status !== "exact") continue;
      expect(wixSources.has(entry.path), entry.path).toBe(false);
      expect(wixSources.has(`${entry.path === "/" ? "" : entry.path}/`), entry.path).toBe(false);
    }
    expect(wixSources.has("/thankful")).toBe(false);
    expect(wixSources.has("/studio")).toBe(false);
    expect(wixSources.has("/gallery")).toBe(false);
    expect(matchingRedirect("/about", "iconicimagestx.vercel.app")).toBeUndefined();
    expect(matchingRedirect("/email/senior-hero.png", "iconicimagestx.vercel.app")).toBeUndefined();
    expect(matchingRedirect("/thankful", "iconicimagestx.vercel.app")).toBeUndefined();
    expect(matchingRedirect("/thankful/", "www.iconicimagestx.com")).toBeUndefined();
    expect(matchingRedirect("/thankful", "preview-name.vercel.app")).toBeUndefined();

    const rsvp = matchingRedirect("/thankful-rsvp", "iconicimagestx.vercel.app");
    expect(rsvp?.destination).toBe("/thankful#rsvp");
    expect(rsvp?.statusCode).toBe(301);
    expect(matchingRedirect("/thankful-rsvp/", "www.iconicimagestx.com")?.destination).toBe("/thankful#rsvp");

    const apexHome = matchingRedirect("/", "iconicimagestx.com");
    expect(apexHome?.destination).toBe("https://www.iconicimagestx.com/");
    expect(apexHome?.has).toEqual([{ type: "host", value: "iconicimagestx.com" }]);
    const apexAbout = matchingRedirect("/about", "IconicImagesTX.com");
    expect(redirectLocation(apexAbout!, "/about", "/about?ref=wix")).toBe("https://www.iconicimagestx.com/about?ref=wix");
    expect(matchingRedirect("/about", "www.iconicimagestx.com")).toBeUndefined();
    expect(matchingRedirect("/thankful", "iconicimagestx.com")?.destination).toBe("https://www.iconicimagestx.com/:path*");
    expect(redirectLocation(matchingRedirect("/thankful", "iconicimagestx.com")!, "/thankful", "/thankful")).toBe(
      "https://www.iconicimagestx.com/thankful",
    );
    expect(redirectLocation(matchingRedirect("/thankful-rsvp", "iconicimagestx.vercel.app")!, "/thankful-rsvp", "/thankful-rsvp?guest=1")).toBe(
      "/thankful?guest=1#rsvp",
    );
  });

  it("flags gaps and still points them at an existing page", () => {
    const paths = new Set(WIX_URL_MAP.map((entry) => entry.path));
    expect(paths.size).toBe(WIX_URL_MAP.length);
    for (const absent of WIX_CONFIRMED_ABSENT) expect(paths.has(absent)).toBe(false);
    const gaps = WIX_URL_MAP.filter((entry) => entry.status === "gap");
    expect(gaps.length).toBeGreaterThan(10);
    for (const gap of gaps) {
      expect(gap.vercel.startsWith("/"), gap.path).toBe(true);
      expect(gap.note.toLowerCase()).not.toContain("new page");
      const rule = matchingRedirect(gap.path, "iconicimagestx.vercel.app");
      expect(rule?.destination, gap.path).toBe(gap.vercel);
      expect(rule?.statusCode).toBe(301);
    }
  });

  it("serves www shells only on the custom domain", () => {
    const rules = buildVercelRewrites();
    expect(firstMatchingRewrite("/about", rules)?.destination).toBe("/seo/about.html");
    expect(firstMatchingRewrite("/about", rules, "iconicimagestx.vercel.app")?.destination).toBe("/seo/about.html");
    expect(firstMatchingRewrite("/about", rules, "www.iconicimagestx.com")?.destination).toBe("/seo/www/about.html");
    expect(firstMatchingRewrite("/about", rules, "iconicimagestx.com")?.destination).toBe("/seo/www/about.html");
    expect(firstMatchingRewrite("/", rules, "preview.vercel.app")?.destination).toBe("/index.html");
    expect(firstMatchingRewrite("/", rules, "www.iconicimagestx.com")?.destination).toBe("/seo/www/index.html");
    expect(firstMatchingRewrite("/thankful", rules)?.destination).toBe("/thankful.html");
    expect(firstMatchingRewrite("/thankful", rules, "www.iconicimagestx.com")?.destination).toBe("/seo/www/thankful.html");
    expect(firstMatchingRewrite("/thankful", rules, "iconicimagestx.vercel.app")?.destination).toBe("/thankful.html");
    expect(firstMatchingRewrite("/sitemap.xml", rules)?.destination).toBe("/api/index");
    expect(firstMatchingRewrite("/robots.txt", rules)?.destination).toBe("/api/index");
  });
});
