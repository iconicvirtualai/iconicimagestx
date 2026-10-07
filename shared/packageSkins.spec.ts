import { describe, expect, it } from "vitest";
import { listingCardLookFromValue, resolveListingCardLook } from "./listingCard.ts";
import {
  PACKAGE_SKINS,
  clientSkinLabel,
  isTopTierPackage,
  packageIdentity,
  packagePriceDisplay,
  packageSkinsCoverEveryLook,
  packageSkinsInDisplayOrder,
  resolvePackageSkin,
  resolvePackageSkinFromOrder,
} from "./packageSkins.ts";

describe("shared package skins", () => {
  it("is the one catalog of sixteen skins", () => {
    expect(packageSkinsCoverEveryLook()).toBe(true);
    expect(packageSkinsInDisplayOrder().map((item) => item.look)).toEqual([
      "apprenticeship",
      "just-photos",
      "essentials",
      "showcase",
      "legacy",
      "market-leader",
      "refresh",
      "content-partner",
      "local-legend",
      "baseline",
      "growth-engine",
      "professional-suite",
      "signature-tier",
      "iconic-partnership",
      "connected-core",
      "authority-stack",
    ]);
    expect(PACKAGE_SKINS.map((item) => item.look)).toHaveLength(16);
    expect(PACKAGE_SKINS.map((item) => item.skinLabel)).not.toContain("Foundation");
    expect(PACKAGE_SKINS.map((item) => item.skinLabel)).not.toContain("Evolution");
    expect(PACKAGE_SKINS.map((item) => item.skinLabel)).not.toContain("Bundle");
  });

  it("gives client tiles and admin order tiles the same identity", () => {
    const showcase = resolvePackageSkin("listing-showcase");
    const partner = resolvePackageSkin({ id: "branding-content-partner", name: "The Content Partner" });
    expect(showcase?.title).toBe("The Showcase");
    expect(clientSkinLabel(showcase!)).toBe("Client skin: Showcase");
    expect(packagePriceDisplay(showcase!)).toBe("$549");
    expect(partner?.title).toBe("Content Partner");
    expect(clientSkinLabel(partner!)).toBe("Client skin: Content Partner");
    expect(packagePriceDisplay(partner!)).toBe("$999/mo");
    expect(packageIdentity("local-legend")).toMatchObject({
      title: "The Local Legend",
      clientSkinLabel: "Client skin: Local Legend",
      priceDisplay: "$2,499",
      tier: "top",
    });
    expect(listingCardLookFromValue("The Showcase")).toBe(showcase?.look);
    expect(resolveListingCardLook({ package: "The Content Partner" })).toBe(partner?.look);
    expect(resolvePackageSkinFromOrder({ selectedService: "business-authority-stack" })?.priceDisplay).toBe("$3,200/mo");
  });

  it("keeps gold on the five top tiers and leaves strategic packages off the catalog", () => {
    expect(PACKAGE_SKINS.filter((item) => item.tier === "top").map((item) => item.look)).toEqual([
      "legacy",
      "market-leader",
      "local-legend",
      "authority-stack",
      "iconic-partnership",
    ]);
    expect(isTopTierPackage("showcase")).toBe(false);
    expect(isTopTierPackage("legacy")).toBe(true);
    expect(resolvePackageSkin("The Foundation")).toBeNull();
    expect(resolvePackageSkin("growth-evolution")).toBeNull();
    expect(resolvePackageSkin("The Bundle")).toBeNull();
  });
});
