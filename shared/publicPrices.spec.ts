import { describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "./bookingCatalog.ts";
import { APPRENTICESHIP_OVERAGE_LABEL } from "./bookingCatalog.ts";
import { mergePricingAdjustments } from "./pricingSettings.ts";
import {
  apprenticeshipOverageLabel,
  dollars,
  dollarsFixed,
  feeAmount,
  livePackageCardPrice,
  packageAmount,
  priceDigits,
  withCurrentDollars,
} from "./publicPrices.ts";
import { packageSkin } from "./packageSkins.ts";

describe("public price display", () => {
  const catalog = packagesForStaffEditor([]);
  const adjustments = mergePricingAdjustments([]);

  it("keeps today's wording when the saved amount has not changed", () => {
    expect(packageAmount(catalog, "listing-showcase", 1)).toBe(549);
    expect(priceDigits(549)).toBe("549");
    expect(priceDigits(1599)).toBe("1,599");
    expect(dollars(75)).toBe("$75");
    expect(dollarsFixed(5)).toBe("$5.00");
    expect(feeAmount(adjustments, "business-professional-suite", 1)).toBe(1500);
    expect(feeAmount(adjustments, "display-floorplan-card", 1)).toBe(99);
    expect(feeAmount(adjustments, "display-video-from", 1)).toBe(350);
    expect(feeAmount(adjustments, "display-video-to", 1)).toBe(500);
    expect(feeAmount(adjustments, "display-referral", 1)).toBe(50);
    expect(feeAmount(adjustments, "display-vs-ai-unit", 1)).toBe(5);
    expect(feeAmount(adjustments, "display-vs-fullres", 1)).toBe(15);
    expect(apprenticeshipOverageLabel(25)).toBe(APPRENTICESHIP_OVERAGE_LABEL);
    expect(withCurrentDollars("Headshots are $10 each. Buy as many as you like.", 10, 10)).toBe(
      "Headshots are $10 each. Buy as many as you like.",
    );
    expect(livePackageCardPrice(packageSkin("showcase"), catalog, adjustments)).toEqual({
      price: "$549",
      priceDisplay: "$549",
    });
    expect(livePackageCardPrice(packageSkin("content-partner"), catalog, adjustments).priceDisplay).toBe("$999/mo");
    expect(livePackageCardPrice(packageSkin("just-photos"), catalog, adjustments).price).toBe("Basics");
  });

  it("follows a saved package price and a saved fee", () => {
    const changed = packagesForStaffEditor([{
      id: "listing-showcase",
      name: "The Showcase",
      price: 4242,
      description: "A complete visual deep-dive.",
      isActive: true,
    }]);
    const fees = mergePricingAdjustments([{ id: "display-referral", amount: 80 }]);
    expect(packageAmount(changed, "listing-showcase", 549)).toBe(4242);
    expect(priceDigits(4242)).toBe("4,242");
    expect(feeAmount(fees, "display-referral", 50)).toBe(80);
    expect(dollars(80)).toBe("$80");
    expect(apprenticeshipOverageLabel(40)).toBe("$40 per 15-minute increment");
    expect(withCurrentDollars("$10 per headshot", 10, 12)).toBe("$12 per headshot");
    expect(livePackageCardPrice(packageSkin("showcase"), changed, adjustments).price).toBe("$4,242");
  });
});
