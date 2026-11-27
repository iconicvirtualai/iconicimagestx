import { describe, expect, it } from "vitest";
import { metaPlan, isNoIndexPath } from "./siteSeo";
import {
  BLACK_FRIDAY_BUSINESS_ENDS_AT,
  BLACK_FRIDAY_BUSINESS_ENDS_MS,
  BLACK_FRIDAY_BUSINESS_HEADLINE,
  BLACK_FRIDAY_BUSINESS_PACKAGES,
  BLACK_FRIDAY_BUSINESS_REFERRAL,
  BLACK_FRIDAY_BUSINESS_SEO_DESCRIPTION,
  BLACK_FRIDAY_BUSINESS_SEO_TITLE,
  BLACK_FRIDAY_BUSINESS_SHARED,
  blackFridayBusinessCheckoutPath,
  blackFridayBusinessOpen,
  formatBusinessCents,
  quoteBlackFridayBusiness,
} from "./blackFridayBusiness";

const FORBIDDEN = /\bA\.?\s*I\.?\b|artificial intelligence/i;

describe("black friday business packages", () => {
  it("prices the three packages in cents with a 0% processing fee", () => {
    const blitz = quoteBlackFridayBusiness("blitz");
    const growth = quoteBlackFridayBusiness("growth");
    const domination = quoteBlackFridayBusiness("domination");
    expect(blitz).toMatchObject({
      id: "blitz",
      subtotalCents: 200000,
      processingCents: 0,
      processingPercent: 0,
      totalCents: 200000,
    });
    expect(growth).toMatchObject({
      id: "growth",
      subtotalCents: 250000,
      processingCents: 0,
      processingPercent: 0,
      totalCents: 250000,
    });
    expect(domination).toMatchObject({
      id: "domination",
      subtotalCents: 600000,
      processingCents: 0,
      processingPercent: 0,
      totalCents: 600000,
    });
    expect(blitz!.totalCents).toBe(blitz!.subtotalCents);
    expect(growth!.totalCents).toBe(growth!.subtotalCents);
    expect(domination!.totalCents).toBe(domination!.subtotalCents);
    expect(formatBusinessCents(blitz!.totalCents)).toBe("$2,000");
    expect(formatBusinessCents(growth!.totalCents)).toBe("$2,500");
    expect(formatBusinessCents(domination!.totalCents)).toBe("$6,000");
    expect(quoteBlackFridayBusiness("BLITZ")?.totalCents).toBe(200000);
    expect(quoteBlackFridayBusiness("nope")).toBeNull();
    expect(blackFridayBusinessCheckoutPath("growth")).toBe("/black-friday-business?package=growth");
    expect(BLACK_FRIDAY_BUSINESS_PACKAGES.map((item) => item.priceCents)).toEqual([200000, 250000, 600000]);
    expect(BLACK_FRIDAY_BUSINESS_PACKAGES.find((item) => item.id === "growth")?.badge).toBe("BEST DEAL");
  });

  it("closes after 2026-11-27T23:59:59-06:00 and stays open through that second", () => {
    expect(BLACK_FRIDAY_BUSINESS_ENDS_AT).toBe("2026-11-27T23:59:59-06:00");
    expect(BLACK_FRIDAY_BUSINESS_ENDS_MS).toBe(Date.parse("2026-11-28T05:59:59Z"));
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h11",
    }).format(new Date(BLACK_FRIDAY_BUSINESS_ENDS_MS));
    expect(formatted).toContain("Friday");
    expect(formatted).toContain("Nov 27, 2026");
    expect(formatted).toContain("11:59:59");
    expect(blackFridayBusinessOpen(BLACK_FRIDAY_BUSINESS_ENDS_MS)).toBe(true);
    expect(blackFridayBusinessOpen(BLACK_FRIDAY_BUSINESS_ENDS_MS + 999)).toBe(true);
    expect(blackFridayBusinessOpen(BLACK_FRIDAY_BUSINESS_ENDS_MS + 1000)).toBe(false);
  });

  it("keeps the public offer copy free of an intelligence product mention", () => {
    const plan = metaPlan("/black-friday-business");
    expect(isNoIndexPath("/black-friday-business")).toBe(false);
    expect(plan).toMatchObject({
      kind: "public",
      title: BLACK_FRIDAY_BUSINESS_SEO_TITLE,
      description: BLACK_FRIDAY_BUSINESS_SEO_DESCRIPTION,
    });
    const copy = [
      BLACK_FRIDAY_BUSINESS_HEADLINE,
      BLACK_FRIDAY_BUSINESS_REFERRAL,
      BLACK_FRIDAY_BUSINESS_SEO_TITLE,
      BLACK_FRIDAY_BUSINESS_SEO_DESCRIPTION,
      ...BLACK_FRIDAY_BUSINESS_SHARED,
      ...BLACK_FRIDAY_BUSINESS_PACKAGES.flatMap((item) => [item.name, item.summary, ...item.features]),
      plan.kind === "public" ? plan.description : "",
    ].join("\n");
    expect(copy).not.toMatch(FORBIDDEN);
    expect(copy).toContain("HUMAN");
    expect(copy).toContain(BLACK_FRIDAY_BUSINESS_REFERRAL);
  });
});
