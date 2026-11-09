import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { addOns, photoOnlyPackages, publicPackageDeepLinkSelection } from "./bookingCatalog";
import {
  PRICING_ICONIC_FINISH_ID,
  PRICING_SERVICE_CTAS,
  pricingBasicsHref,
  pricingBookPackageIds,
  pricingConsultSubject,
  pricingServiceHref,
} from "./pricingBookingLinks";
import { studioRoomRequestHref } from "./studio105";
import Pricing from "../client/pages/Pricing";
import Contact from "../client/pages/Contact";

/**
 * Live `packages` docs from just before this change.
 * apprentice-25 is $85 now. photos-20, photos-35, and photos-50 are inactive.
 */
const LIVE_BEFORE = `
aerial-drone|99|True|addon
aerial-only|99|True|photography
aerial-premium|550|True|video
agent-intro|75|True|addon
agent-intro-video|59|True|photography
amenity-addon|50|True|addon
apprentice-25|75|True|photography
apprentice-50|125|True|photography
basic-reel|125|True|video
basic-video|300|True|video
branding-content-partner|999|True|marketing
branding-local-legend|2499|True|marketing
branding-refresh|349|True|marketing
business-baseline|500|True|marketing
business-growth-engine|850|True|marketing
essentials-aerial|89|True|photography
floorplan-2d|75|True|addon
grass-replacement|25|True|photography
hall-of-fame|299|True|photography
hollywood|199|True|photography
iconic-finish|75|True|addon
iconic-polish|75|True|photography
listing-essentials|249|True|photography
listing-legacy|899|True|photography
listing-market-leader|1599|True|photography
listing-showcase|549|True|photography
luxe-3d|785|True|photography
luxe-video|785|True|photography
matterport-3d|200|True|virtual_staging
photos-18|139|True|photography
photos-20|99|True|photography
photos-25-only|169|True|photography
photos-35|150|True|photography
photos-40|199|True|photography
photos-50|200|True|photography
red-carpet|599|True|photography
same-day|50|True|addon
specialized-both|125|True|addon
specialized-social|85|True|addon
studio-blanc|0|True|marketing
studio-noir|0|True|marketing
virtual-staging|35|True|virtual_staging
`.trim();

const RETIRED = new Set(["photos-20", "photos-35", "photos-50"]);

type LivePackage = { id: string; price: number; isActive: boolean; category: string };

function livePackages(): LivePackage[] {
  return LIVE_BEFORE.split("\n").map((line) => {
    const [id, price, active, category] = line.split("|");
    const row = { id, price: Number(price), isActive: active === "True", category };
    if (id === "apprentice-25") return { ...row, price: 85 };
    if (RETIRED.has(id)) return { ...row, isActive: false };
    return row;
  });
}

function liveBookable(id: string): boolean {
  const row = livePackages().find((item) => item.id === id);
  return Boolean(row && row.isActive && row.price > 0 && !RETIRED.has(id));
}

function pricingCtaHrefs(html: string): Array<{ id: string; href: string }> {
  const tags = html.match(/<a\b[^>]*>/g) || [];
  return tags.flatMap((tag) => {
    const id = tag.match(/data-testid="(pricing-cta-[^"]+)"/);
    const href = tag.match(/href="([^"]+)"/);
    if (!id || !href) return [];
    return [{ id: id[1], href: href[1].replace(/&amp;/g, "&") }];
  });
}

describe("pricing booking links", () => {
  const pricingHtml = renderToString(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
  const pricingSource = readFileSync(new URL("../client/pages/Pricing.tsx", import.meta.url), "utf8");
  const bookSource = readFileSync(new URL("../client/pages/Book.tsx", import.meta.url), "utf8");
  const formSource = readFileSync(new URL("../client/components/BookingForm.tsx", import.meta.url), "utf8");

  it("points every /pricing book button at an active priced package", () => {
    const bookCtas = PRICING_SERVICE_CTAS.filter((cta) => cta.kind === "book");
    expect(bookCtas.map((cta) => cta.packageId)).toEqual([
      "listing-essentials",
      "listing-showcase",
      "listing-legacy",
      "listing-market-leader",
      "branding-refresh",
      "branding-content-partner",
      "branding-local-legend",
      "business-baseline",
      "business-growth-engine",
    ]);

    for (const cta of bookCtas) {
      expect(cta.href).toBe(`/book?service=${cta.packageId}`);
      expect(pricingBookPackageIds(cta.href)).toEqual([cta.packageId]);
      expect(liveBookable(cta.packageId)).toBe(true);
      expect(publicPackageDeepLinkSelection(cta.packageId)).toEqual({
        selectedService: cta.packageId,
        selectedBasics: [],
        showBasics: false,
        hidden: false,
      });
      expect(pricingHtml).toContain(`data-testid="pricing-cta-${cta.packageId}"`);
      expect(pricingHtml).toContain(`href="${cta.href}"`);
    }

    const rendered = pricingCtaHrefs(pricingHtml);
    expect(rendered.map((item) => item.id).sort()).toEqual(
      PRICING_SERVICE_CTAS.map((cta) => `pricing-cta-${cta.packageId}`).sort(),
    );
    const bookHrefs = rendered.filter((item) => item.href === "/book" || item.href.startsWith("/book?"));
    expect(bookHrefs.map((item) => item.href).sort()).toEqual(bookCtas.map((cta) => cta.href).sort());
    for (const item of bookHrefs) {
      const ids = pricingBookPackageIds(item.href);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every(liveBookable)).toBe(true);
    }
    expect(rendered.some((item) => item.href === "/book")).toBe(false);
  });

  it("sends unpriced phase 2 and growth buttons to contact", () => {
    const consults = PRICING_SERVICE_CTAS.filter((cta) => cta.kind === "consult");
    expect(consults.map((cta) => [cta.label, cta.packageId, cta.href])).toEqual([
      ["SECURE MY SUITE", "business-professional-suite", "/contact?package=business-professional-suite"],
      ["ELEVATE MY BRAND", "business-signature-tier", "/contact?package=business-signature-tier"],
      ["PARTNER WITH ICONIC", "business-iconic-partnership", "/contact?package=business-iconic-partnership"],
      ["REACH MY DATABASE", "business-connected-core", "/contact?package=business-connected-core"],
      ["BECOME OMNIPRESENT", "business-authority-stack", "/contact?package=business-authority-stack"],
      ["START MY FOUNDATION →", "growth-foundation", "/contact?package=growth-foundation"],
      ["START MY EVOLUTION →", "growth-evolution", "/contact?package=growth-evolution"],
      ["LET'S CHAT", "growth-bundle", "/contact?package=growth-bundle"],
    ]);
    for (const cta of consults) {
      expect(livePackages().some((item) => item.id === cta.packageId && item.isActive && item.price > 0)).toBe(false);
      expect(pricingHtml).toContain(`href="${cta.href}"`);
      expect(cta.href.startsWith("/book")).toBe(false);
    }

    const contact = renderToString(
      <MemoryRouter initialEntries={["/contact?package=growth-foundation"]}>
        <Contact />
      </MemoryRouter>,
    );
    expect(pricingConsultSubject("growth-foundation")).toBe("Pricing: The Foundation");
    expect(contact).toContain("Pricing: The Foundation");
    expect(pricingConsultSubject("studio-noir")).toBe("");
    expect(pricingConsultSubject("listing-essentials")).toBe("");
  });

  it("sends Studio Noir and Studio Blanc to the Studio 105 request form", () => {
    const studios = PRICING_SERVICE_CTAS.filter((cta) => cta.kind === "studio-request");
    expect(studios.map((cta) => [cta.label, cta.href])).toEqual([
      ["Book Studio Noir", studioRoomRequestHref("studio-noir")],
      ["Book Studio Blanc", studioRoomRequestHref("studio-blanc")],
    ]);
    for (const cta of studios) {
      const row = livePackages().find((item) => item.id === cta.packageId);
      expect(row).toMatchObject({ isActive: true, price: 0 });
      expect(liveBookable(cta.packageId)).toBe(false);
      expect(cta.href).toBe(`/studio-105/book?room=${cta.packageId}`);
      expect(pricingHtml).toContain(`href="${cta.href}"`);
      expect(pricingServiceHref(cta.packageId)).toBe(cta.href);
    }
    expect(pricingHtml).not.toContain("/book?service=studio-noir");
    expect(pricingHtml).not.toContain("/book?service=studio-blanc");
    expect(pricingHtml).not.toContain("/book?package=studio-noir");
    expect(pricingHtml).not.toContain("/book?package=studio-blanc");
    expect(pricingHtml).not.toContain("/contact?package=studio-noir");
    expect(pricingHtml).not.toContain("/contact?package=studio-blanc");
  });

  it("keeps basics and add-on orders on the active 18, 25, and 40 photo packages", () => {
    expect(photoOnlyPackages.map((item) => item.id)).toEqual([
      "photos-18",
      "photos-25-only",
      "photos-40",
      "aerial-only",
    ]);
    for (const id of ["photos-18", "photos-25-only", "photos-40", "aerial-only", "apprentice-25", "apprentice-50"]) {
      const href = pricingBasicsHref([id]);
      expect(href).toBe(`/book?items=${id}`);
      expect(pricingBookPackageIds(href || "").every(liveBookable)).toBe(true);
    }

    const addonIds = [
      ...addOns.flatMap((group) => group.items.map((item) => item.id)),
      "specialized-social",
      "specialized-both",
    ];
    for (const id of addonIds) {
      expect(pricingBasicsHref([id])).toBeNull();
      expect(liveBookable(id)).toBe(true);
      const href = pricingBasicsHref(["photos-18", id]);
      expect(href).toBe(`/book?items=photos-18,${id}`);
      expect(pricingBookPackageIds(href || "").every(liveBookable)).toBe(true);
    }

    const polish = pricingBasicsHref(["photos-18"], true);
    expect(polish).toBe("/book?items=photos-18&premium=true");
    expect(pricingBookPackageIds(polish || "")).toEqual(["photos-18", PRICING_ICONIC_FINISH_ID]);
    expect(liveBookable(PRICING_ICONIC_FINISH_ID)).toBe(true);
    expect(pricingBasicsHref(["apprentice-25"], true)).toBe("/book?items=apprentice-25");
    expect(pricingBasicsHref([])).toBeNull();
    expect(pricingBasicsHref([null])).toBeNull();
    expect(pricingBasicsHref(["apprentice-25", "aerial-drone"])).toBeNull();
    for (const retired of RETIRED) {
      expect(pricingBasicsHref([retired])).toBeNull();
      expect(pricingServiceHref(retired).startsWith("/book")).toBe(false);
    }

    expect(pricingHtml).toContain("pricing-photo-photos-18");
    expect(pricingHtml).toContain("pricing-photo-photos-25-only");
    expect(pricingHtml).toContain("pricing-photo-photos-40");
    expect(pricingHtml).not.toContain("photos-20");
    expect(pricingHtml).not.toContain("photos-35");
    expect(pricingHtml).not.toContain("photos-50");
    expect(pricingCtaHrefs(pricingHtml).some((item) => item.href === "/book")).toBe(false);
    for (const source of [pricingSource, bookSource, formSource]) {
      expect(source).not.toContain("photos-20");
      expect(source).not.toContain("photos-35");
      expect(source).not.toContain("photos-50");
      expect(source).not.toContain("/book?service=${");
    }
  });
});
