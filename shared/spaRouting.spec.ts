import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildVercelHeaders,
  buildVercelRedirects,
  buildVercelRewrites,
  compileVercelSource,
  firstMatchingRewrite,
  htmlFileForRequestPath,
  routeCovered,
  routerPathsFromAppSource,
} from "./spaRouting";

const appSource = readFileSync(new URL("../client/App.tsx", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  rewrites: { source: string; destination: string }[];
  redirects: { source: string; destination: string; permanent?: boolean; statusCode?: number }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const footer = readFileSync(new URL("../client/components/Footer.tsx", import.meta.url), "utf8");
const notFound = readFileSync(new URL("../public/404.html", import.meta.url), "utf8");

describe("vercel function split", () => {
  it("keeps sharp out of the main API function", () => {
    const index = readFileSync(new URL("../api/index.mjs", import.meta.url), "utf8");
    const media = readFileSync(new URL("../api/media-display.mjs", import.meta.url), "utf8");
    expect(index).not.toMatch(/from ["']sharp["']/);
    expect(index).not.toContain("handleMediaDisplay");
    expect(index).not.toContain("@img/sharp");
    expect(media).toMatch(/from ["']sharp["']/);
    expect(media).toMatch(/from ["']firebase-admin["']/);
    expect(media).not.toMatch(/from ["']googleapis["']/);
    expect(media).not.toMatch(/from ["']express["']/);
    expect(media).not.toMatch(/from ["']stripe["']/);
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
      functions: Record<string, { includeFiles?: string | string[]; excludeFiles?: string }>;
    };
    expect(vercel.functions["api/index.mjs"].excludeFiles).toContain("sharp");
    expect(typeof vercel.functions["api/index.mjs"].includeFiles).toBe("string");
    expect(typeof vercel.functions["api/media-display.mjs"].includeFiles).toBe("string");
    expect(vercel.functions["api/index.mjs"].includeFiles).not.toContain("sharp");
    expect(JSON.stringify(vercel.functions["api/media-display.mjs"].includeFiles)).toContain("sharp-libvips");
    expect(vercel.functions["api/media-display.mjs"].excludeFiles).toContain("public/media");
  });
});

describe("vercel source patterns", () => {
  it("matches exact paths, one segment, and prefixes without swallowing studio 105", () => {
    expect(compileVercelSource("/about").test("/about")).toBe(true);
    expect(compileVercelSource("/about").test("/about/")).toBe(false);
    expect(compileVercelSource("/about/").test("/about/")).toBe(true);
    expect(compileVercelSource("/studio/:listingId").test("/studio/abc")).toBe(true);
    expect(compileVercelSource("/studio/:listingId").test("/studio")).toBe(false);
    expect(compileVercelSource("/studio/:listingId").test("/studio/a/b")).toBe(false);
    expect(compileVercelSource("/studio/:listingId").test("/studio-105")).toBe(false);
    expect(compileVercelSource("/admin/(.*)").test("/admin/dashboard")).toBe(true);
    expect(compileVercelSource("/admin/(.*)").test("/admin/a/b")).toBe(true);
    expect(compileVercelSource("/admin/(.*)").test("/admin")).toBe(false);
    expect(compileVercelSource("/admin").test("/admin")).toBe(true);
    expect(compileVercelSource("/studio/(.*)").test("/studio/abc")).toBe(true);
    expect(compileVercelSource("/studio/(.*)").test("/studio-105")).toBe(false);
    expect(compileVercelSource("/api/(.*)").test("/api/ping")).toBe(true);
  });
});

describe("spa rewrite coverage", () => {
  it("keeps vercel.json in lockstep with the route table", () => {
    expect(vercel.rewrites).toEqual(buildVercelRewrites());
    expect(vercel.redirects).toEqual(buildVercelRedirects());
    expect(vercel.headers).toEqual(buildVercelHeaders());
  });

  it("covers every router path and leaves unknown urls unmatched", () => {
    const paths = routerPathsFromAppSource(appSource).filter((path) => path !== "*");
    expect(paths.length).toBeGreaterThan(40);
    const uncovered = paths.filter((path) => !routeCovered(path, vercel.rewrites, vercel.redirects));
    expect(uncovered).toEqual([]);
    expect(vercel.rewrites.some((rule) => rule.source === "/(.*)" || rule.source === "/:path*")).toBe(false);

    const unknown = ["/this-page-is-not-real", "/pricing/not-a-package", "/studio-105/extra", "/services/nope", "/owners/extra"];
    for (const path of unknown) {
      expect(firstMatchingRewrite(path, vercel.rewrites), path).toBeUndefined();
    }

    expect(firstMatchingRewrite("/about", vercel.rewrites)?.destination).toBe("/seo/about.html");
    expect(firstMatchingRewrite("/", vercel.rewrites)?.destination).toBe("/index.html");
    expect(firstMatchingRewrite("/studio/listing-1", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/gallery/share-1", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/portal/home", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/admin/dashboard", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/go", vercel.rewrites)?.destination).toBe("/seo/app.html");
    expect(firstMatchingRewrite("/book/", vercel.rewrites)?.destination).toBe("/seo/book.html");
    expect(htmlFileForRequestPath("/pricing/ai-assistant")).toBe("seo/app.html");
    expect(htmlFileForRequestPath("/not-real")).toBeNull();
  });

  it("sends owner pages to the API before the admin shell", () => {
    const owners = vercel.rewrites.findIndex((rule) => rule.source === "/admin/owners");
    const adminPrefix = vercel.rewrites.findIndex((rule) => rule.source === "/admin/(.*)");
    expect(owners).toBeGreaterThanOrEqual(0);
    expect(adminPrefix).toBeGreaterThan(owners);
    expect(firstMatchingRewrite("/admin/owners", vercel.rewrites)?.destination).toBe("/api/index");
    expect(firstMatchingRewrite("/owners", vercel.rewrites)?.destination).toBe("/api/index");
    expect(firstMatchingRewrite("/owners/", vercel.rewrites)?.destination).toBe("/api/index");
    expect(htmlFileForRequestPath("/admin/owners")).toBeNull();
    expect(htmlFileForRequestPath("/owners")).toBeNull();
  });

  it("keeps the merged launch routes in front of the SEO shells", () => {
    const present = vercel.rewrites.findIndex((rule) => rule.source === "/present/:token");
    const home = vercel.rewrites.findIndex((rule) => rule.destination === "/index.html");
    expect(present).toBeGreaterThanOrEqual(0);
    expect(home).toBeGreaterThan(present);
    expect(vercel.rewrites[present]?.destination).toBe("/api/index");
    expect(vercel.rewrites.some((rule) => rule.destination.includes("/api/presentations/shell"))).toBe(false);
    expect(vercel.rewrites.some((rule) => rule.source === "/pricing-v1" || rule.source === "/pricing-v1/")).toBe(false);
    expect(vercel.redirects.filter((rule) => rule.source.startsWith("/pricing-v1"))).toEqual([
      { source: "/pricing-v1", destination: "/pricing", statusCode: 301 },
      { source: "/pricing-v1/", destination: "/pricing", statusCode: 301 },
    ]);

    expect(firstMatchingRewrite("/studio/listing-9", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/gallery/share-9", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/portal/listings/listing-9", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/admin/schedule", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/owners", vercel.rewrites)?.destination).toBe("/api/index");
    expect(firstMatchingRewrite("/present/preview", vercel.rewrites)?.destination).toBe("/api/index");
    expect(firstMatchingRewrite("/podcast-guest-prep", vercel.rewrites)?.destination).toBe("/podcast-guest-prep.html");
    expect(firstMatchingRewrite("/book", vercel.rewrites)?.destination).toBe("/seo/book.html");
    expect(firstMatchingRewrite("/api/media/display/listingid1/0", vercel.rewrites)?.destination).toBe("/api/media-display");
    expect(firstMatchingRewrite("/api/calendar/roster", vercel.rewrites)?.destination).toBe("/api/index");
    const displayRule = vercel.rewrites.findIndex((rule) => rule.source === "/api/media/display/(.*)");
    const apiCatchAll = vercel.rewrites.findIndex((rule) => rule.source === "/api/(.*)");
    expect(displayRule).toBeGreaterThanOrEqual(0);
    expect(apiCatchAll).toBeGreaterThan(displayRule);
    expect(firstMatchingRewrite("/this-page-does-not-exist", vercel.rewrites)).toBeUndefined();
    expect(vercel.redirects.some((rule) => rule.source === "/pricing-v1" && rule.destination === "/pricing" && rule.statusCode === 301)).toBe(true);
  });

  it("noindexes private prefixes and not the public studio page", () => {
    const sources = vercel.headers.map((rule) => rule.source);
    expect(sources).toEqual([
      "/admin",
      "/admin/(.*)",
      "/portal",
      "/portal/(.*)",
      "/owners",
      "/owners/(.*)",
      "/studio/(.*)",
      "/gallery/(.*)",
      "/seo/(.*)",
      "/invoice",
      "/invoice/(.*)",
      "/podcast-guest-prep",
      "/podcast-guest-prep/",
    ]);
    for (const rule of vercel.headers) {
      expect(rule.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    }
    const headerMatches = (path: string) =>
      vercel.headers.some((rule) => compileVercelSource(rule.source).test(path));
    expect(headerMatches("/admin/login")).toBe(true);
    expect(headerMatches("/portal")).toBe(true);
    expect(headerMatches("/owners")).toBe(true);
    expect(headerMatches("/studio/abc")).toBe(true);
    expect(headerMatches("/gallery/abc")).toBe(true);
    expect(headerMatches("/studio-105")).toBe(false);
    expect(headerMatches("/login")).toBe(false);
    expect(headerMatches("/pricing")).toBe(false);
    expect(headerMatches("/present/preview")).toBe(false);
  });

  it("noindexes invoice urls and the podcast guest prep sheet", () => {
    const headerMatches = (path: string) =>
      vercel.headers.some((rule) => compileVercelSource(rule.source).test(path));
    expect(headerMatches("/invoice")).toBe(true);
    expect(headerMatches("/invoice/inv-1")).toBe(true);
    expect(headerMatches("/invoice/inv-1/")).toBe(true);
    expect(headerMatches("/podcast-guest-prep")).toBe(true);
    expect(headerMatches("/podcast-guest-prep/")).toBe(true);
    expect(headerMatches("/login")).toBe(false);
    expect(headerMatches("/pricing")).toBe(false);
    expect(headerMatches("/pricing-v1")).toBe(false);
    expect(headerMatches("/studio-105")).toBe(false);
    expect(headerMatches("/present/preview")).toBe(false);
    for (const source of ["/invoice", "/invoice/(.*)", "/podcast-guest-prep", "/podcast-guest-prep/"]) {
      const rule = vercel.headers.find((item) => item.source === source);
      expect(rule?.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    }
    expect(firstMatchingRewrite("/invoice/inv-1", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/invoice/inv-1/", vercel.rewrites)?.destination).toBe("/seo/private.html");
    expect(firstMatchingRewrite("/podcast-guest-prep", vercel.rewrites)?.destination).toBe("/podcast-guest-prep.html");
    expect(firstMatchingRewrite("/podcast-guest-prep/", vercel.rewrites)?.destination).toBe("/podcast-guest-prep.html");
    expect(firstMatchingRewrite("/login", vercel.rewrites)?.destination).toBe("/seo/login.html");
    expect(firstMatchingRewrite("/present/preview", vercel.rewrites)?.destination).toBe("/api/index");
  });

  it("removes the public admin login link and serves a real not-found page", () => {
    expect(footer).not.toContain("Admin Login");
    expect(footer).not.toContain("/admin/login");
    expect(footer).toContain("Client Login");
    expect(notFound).toContain("Oops! Page not found");
    expect(notFound).toContain("Return to Home");
    expect(notFound).toContain('content="noindex, nofollow"');
    expect(notFound).not.toContain("Admin Login");
    expect(notFound).not.toContain("/client/main.tsx");
  });
});
