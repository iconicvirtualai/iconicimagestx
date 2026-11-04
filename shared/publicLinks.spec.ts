import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT } from "./businessContact";
import { PUBLIC_ALIASES } from "./publicAliases";
import { PUBLIC_PAGES } from "./siteSeo";
import {
  buildVercelRedirects,
  firstMatchingRewrite,
  matchingRedirect,
  redirectLocation,
  redirectStatus,
} from "./spaRouting";
import { WIX_URL_MAP, wixPathRedirects } from "./wixLaunch";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "iconicimagestx.vercel.app";

const SURFACE = [
  "client/App.tsx",
  "client/components/Header.tsx",
  "client/components/Footer.tsx",
  "client/components/LegalLinks.tsx",
  "client/components/PublicContactLine.tsx",
  "client/components/HeroSection.tsx",
  "client/components/FinalCTA.tsx",
  "client/components/StepsSection.tsx",
  "client/components/PartnershipCTA.tsx",
  "client/components/FeaturesSection.tsx",
  "client/components/FeaturedServices.tsx",
  "client/components/FAQSection.tsx",
  "client/components/BookingForm.tsx",
  "client/pages/About.tsx",
  "client/pages/AgentLandingPage.tsx",
  "client/pages/Book.tsx",
  "client/pages/Contact.tsx",
  "client/pages/Go.tsx",
  "client/pages/Headshots10.tsx",
  "client/pages/Insights.tsx",
  "client/pages/InsightPost.tsx",
  "client/pages/ListingPresentation.tsx",
  "client/pages/ListingSite.tsx",
  "client/pages/Portfolio.tsx",
  "client/pages/Pricing.tsx",
  "client/pages/Privacy.tsx",
  "client/pages/RealEstate75.tsx",
  "client/pages/SeniorLiving.tsx",
  "client/pages/Socials.tsx",
  "client/pages/Studio105.tsx",
  "client/pages/Terms.tsx",
  "client/pages/VirtualStaging.tsx",
  "client/pages/VirtualStagingSelection.tsx",
  "client/pages/VirtualStagingCheckout.tsx",
  "client/pages/VirtualStagingProOrder.tsx",
  "public/404.html",
  "public/thankful.html",
  "public/tis-the-season.html",
  "public/ordericonic.html",
  "public/sitemap.xml",
  "shared/siteEditorDefaults.ts",
];

const HOME_MEDIA = [
  "client/components/HeroSection.tsx",
  "client/components/MediaCarousel.tsx",
  "client/components/SolutionSection.tsx",
  "client/components/FeaturesSection.tsx",
  "client/components/SnapReelsStrip.tsx",
  "client/components/RaisingTheStandard.tsx",
  "client/components/ThisIsOurMarket.tsx",
  "client/components/TheNetwork.tsx",
  "client/components/AudienceDetails.tsx",
  "client/components/ResponsiveStill.tsx",
  "client/components/AudienceSection.tsx",
  "client/components/TestimonialsSection.tsx",
  "client/components/StepsSection.tsx",
  "client/lib/beforeAfter.ts",
  "client/lib/snapReels.ts",
  "shared/siteEditorDefaults.ts",
];

const ALLOWED_EXTERNAL = [
  "https://facebook.com/",
  "https://instagram.com/",
  "https://tiktok.com/",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://www.google.com/maps/",
  "https://iconicimagestx.vercel.app/thankful",
  "https://iconicimagestx.vercel.app/pay-at-close",
  "https://maps.google.com/",
  "https://my.matterport.com/",
  "https://doorsopentour.com",
  "http://www.sitemaps.org/",
];

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function extractedHrefs(): { file: string; href: string }[] {
  const found: { file: string; href: string }[] = [];
  const attr = /(?:\bhref|\bto)\s*=\s*(?:\{\s*)?["'`]([^"'`]+)["'`]/g;
  const fallback = /useSiteHref\(\s*"[^"]+"\s*,\s*"[^"]+"\s*,\s*"[^"]+"\s*,\s*"([^"]+)"/g;
  const linkItem = /linkItem\(\s*"[^"]+"\s*,\s*"[^"]+"\s*,\s*"([^"]+)"/g;
  for (const file of SURFACE) {
    const text = read(file);
    for (const pattern of [attr, fallback, linkItem]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        if (match[1].includes("${")) continue;
        found.push({ file, href: match[1] });
      }
    }
  }
  return found;
}

function pathOnly(href: string): string {
  const noHash = href.split("#")[0];
  return (noHash.split("?")[0] || "/");
}

function follow(pathname: string, host = HOST): { hops: string[]; status: number | null } {
  const hops = [pathname];
  let status: number | null = null;
  for (let i = 0; i < 4; i += 1) {
    const rule = matchingRedirect(hops[hops.length - 1], host);
    if (!rule) return { hops, status };
    status = redirectStatus(rule);
    const next = redirectLocation(rule, hops[hops.length - 1]).split("#")[0].split("?")[0] || "/";
    if (next.startsWith("http")) {
      const url = new URL(next);
      if (url.hostname === "iconicimagestx.vercel.app") {
        throw new Error(`${pathname} redirects the vercel.app host`);
      }
      hops.push(url.pathname || "/");
      continue;
    }
    if (hops.includes(next)) throw new Error(`redirect loop at ${pathname}: ${hops.join(" -> ")} -> ${next}`);
    hops.push(next);
  }
  throw new Error(`too many hops from ${pathname}`);
}

function lands(pathname: string): boolean {
  if (matchingRedirect(pathname, HOST)) return false;
  return Boolean(firstMatchingRewrite(pathname, undefined, HOST));
}

describe("public link check", () => {
  const hrefs = extractedHrefs();

  it("resolves every static public href in one hop to a live page", () => {
    const broken: string[] = [];
    for (const { file, href } of hrefs) {
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
      if (/^https?:/i.test(href)) {
        const allowed = ALLOWED_EXTERNAL.some((prefix) => href.startsWith(prefix));
        if (!allowed) broken.push(`${file} external ${href}`);
        if (/bit\.ly|tinyurl|lnk\.to|wix\.com|filesusr|doubleclick|utm_|facebook\.com\/tr/i.test(href)) {
          broken.push(`${file} tracking wrapper ${href}`);
        }
        continue;
      }
      if (!href.startsWith("/")) {
        broken.push(`${file} relative ${href}`);
        continue;
      }
      const start = pathOnly(href);
      if (start.startsWith("/api") || start.startsWith("/media") || start.startsWith("/holiday-2026")) continue;
      const { hops, status } = follow(start);
      const final = hops[hops.length - 1];
      if (hops.length > 2) broken.push(`${file} ${href} hops ${hops.join(" -> ")}`);
      if (hops.length === 2 && status !== 301 && status !== 302 && status !== 307) {
        broken.push(`${file} ${href} status ${status}`);
      }
      if (!lands(final)) broken.push(`${file} ${href} -> ${final || "(empty)"} is not a page`);
    }
    expect(broken).toEqual([]);
    expect(hrefs.length).toBeGreaterThan(40);
  });

  it("keeps map links on the studio address and does not send the public site to Wix", () => {
    const address = BUSINESS_CONTACT.address;
    expect(address).toBe("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
    expect(decodeURIComponent(BUSINESS_CONTACT.mapsHref)).toContain(address);
    expect(decodeURIComponent(BUSINESS_CONTACT.mapsEmbed)).toContain(address);
    const joined = SURFACE.map(read).join("\n");
    expect(joined).not.toMatch(/href=["']https?:\/\/(?:www\.)?iconicimagestx\.com/i);
    expect(joined).not.toMatch(/wix\.com|filesusr\.com/i);
    for (const file of ["public/thankful.html", "public/tis-the-season.html", "public/404.html"]) {
      const text = read(file);
      expect(text, file).toContain("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
      expect(text, file).toContain("google.com/maps/dir/");
    }
    expect(read("client/components/PublicContactLine.tsx")).toContain("BUSINESS_CONTACT.mapsHref");
    expect(read("client/pages/Headshots10.tsx")).toContain("BUSINESS_CONTACT.mapsHref");
    expect(read("client/pages/Headshots10.tsx")).toContain("BUSINESS_CONTACT.mapsEmbed");
    const studio = read("client/pages/Studio105.tsx");
    expect(studio).toContain("Get directions");
    expect(studio).toContain("BUSINESS_CONTACT.mapsHref");
    expect(studio).toContain("BUSINESS_CONTACT.mapsEmbed");
    expect(studio).toContain('loading="lazy"');
    expect(studio).toContain('title="Map of Studio 105, 26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380"');
    expect(studio).not.toMatch(/maps\.googleapis\.com|AIza/);
    expect(decodeURIComponent(BUSINESS_CONTACT.mapsHref)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380",
    );
  });

  it("sends the crawled 404s to the closest live page and leaves vercel.app and thankful alone", () => {
    expect(follow("/booking")).toEqual({ hops: ["/booking", "/book"], status: 301 });
    expect(follow("/holiday-event")).toEqual({ hops: ["/holiday-event", "/thankful"], status: 302 });
    expect(matchingRedirect("/forgot-password", HOST)).toBeUndefined();
    expect(matchingRedirect("/forgot-password/", HOST)).toBeUndefined();
    expect(matchingRedirect("/studios", HOST)).toBeUndefined();
    expect(matchingRedirect("/studios/", HOST)).toBeUndefined();
    const app = read("client/App.tsx");
    const vercel = read("vercel.json");
    const netlify = read("netlify.toml");
    for (const source of [app, vercel, netlify]) {
      expect(source).not.toContain('"/forgot-password"');
      expect(source).not.toContain('"/studios"');
      expect(source).not.toContain("path=\"/forgot-password\"");
      expect(source).not.toContain("path=\"/studios\"");
    }
    expect(follow("/services")).toEqual({ hops: ["/services", "/pricing"], status: 301 });
    expect(follow("/services/virtual-staging").hops).toEqual(["/services/virtual-staging"]);
    expect(follow("/gallery")).toEqual({ hops: ["/gallery", "/portal"], status: 307 });
    expect(follow("/gallery/share-1").hops).toEqual(["/gallery/share-1"]);
    expect(matchingRedirect("/", HOST)).toBeUndefined();
    expect(matchingRedirect("/thankful", HOST)).toBeUndefined();
    expect(matchingRedirect("/thankful/", "www.iconicimagestx.com")).toBeUndefined();
    expect(buildVercelRedirects().some((rule) => rule.has?.some((item) => item.value.includes("vercel.app")))).toBe(false);
    for (const alias of PUBLIC_ALIASES) {
      expect(lands(alias.destination.split("?")[0].split("#")[0]), alias.path).toBe(true);
    }
  });

  it("resolves every Wix redirect and sitemap URL in a single hop", () => {
    for (const rule of wixPathRedirects()) {
      if (rule.source.endsWith("/") && rule.source !== "/") continue;
      const { hops, status } = follow(rule.source);
      expect(status, rule.source).toBe(301);
      expect(hops, rule.source).toHaveLength(2);
      expect(lands(hops[1]), rule.source).toBe(true);
    }
    for (const entry of WIX_URL_MAP) {
      if (entry.status !== "exact") continue;
      expect(matchingRedirect(entry.path, HOST), entry.path).toBeUndefined();
      if (entry.path === "/") continue;
      expect(lands(entry.path), entry.path).toBe(true);
    }
    expect(follow("/order").hops).toEqual(["/order", "/book"]);
    expect(follow("/ordericonic").hops).toEqual(["/ordericonic", "/book"]);
    expect(follow("/virtual-staging").hops).toEqual(["/virtual-staging", "/services/virtual-staging"]);
    expect(follow("/senior-living").hops).toEqual(["/senior-living"]);
    expect(matchingRedirect("/thankful-rsvp", HOST)?.destination).toBe("/thankful#rsvp");
    expect(redirectLocation(matchingRedirect("/thankful-rsvp", HOST)!, "/thankful-rsvp", "/thankful-rsvp?guest=1")).toBe(
      "/thankful?guest=1#rsvp",
    );

    const sitemap = read("public/sitemap.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    expect(locs.length).toBe(PUBLIC_PAGES.length);
    for (const loc of locs) {
      expect(follow(loc).hops, loc).toEqual([loc]);
      expect(lands(loc), loc).toBe(true);
    }
  });

  it("keeps homepage media files on disk", () => {
    const missing: string[] = [];
    const media = /["'`](\/media\/[^"'`\s]+)["'`]/g;
    const seen = new Set<string>();
    for (const file of HOME_MEDIA) {
      const text = read(file);
      expect(text, file).not.toMatch(/unsplash|picsum|placeholder\.com|via\.placeholder|pravatar|pexels/i);
      media.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = media.exec(text))) {
        const url = match[1].split("?")[0];
        if (seen.has(url)) continue;
        seen.add(url);
        try {
          readFileSync(path.join(ROOT, "public", url));
        } catch {
          missing.push(`${url} from ${file}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(seen.size).toBeGreaterThan(20);
  });
});
