import { describe, expect, it } from "vitest";
import { PROMO_DISCOUNTS } from "./bookingCatalog";
import { APPRENTICESHIP_BOOKING_FEE } from "./apprenticeship";
import { HEADSHOTS_BOOKING_FEE, HEADSHOTS_UNIT_PRICE } from "./headshots10";
import { PROCESSING_FEE_RATE, processingFee } from "./invoiceProcessing";
import {
  defaultPricingAdjustments,
  mergePricingAdjustments,
  missingSeedDocs,
  percentOfDollars,
  pricingAdjustmentSaveData,
  pricingRates,
} from "./pricingSettings";
import {
  SENIOR_FACILITY_RATE_PER_SQFT,
  SENIOR_LIVING_DEPOSIT_PERCENT,
  SENIOR_ROOM_RATES,
  SENIOR_TOUR_PRICE,
} from "./seniorLiving";
import { TRAVEL_ZONES } from "./travelZones";

describe("pricing settings seed", () => {
  it("keeps today's prices until someone edits them", () => {
    const rates = pricingRates(mergePricingAdjustments([]));
    expect(rates.processingPercent).toBe(2.8);
    expect(Math.round(rates.processingPercent * 10)).toBe(Math.round(PROCESSING_FEE_RATE * 1000));
    expect(rates.processingActive).toBe(true);
    expect(rates.taxActive).toBe(false);
    expect(rates.taxPercent).toBe(0);
    expect(rates.travelZones.map((zone) => [zone.zone, zone.outerMiles, zone.feeCents])).toEqual(
      TRAVEL_ZONES.map((zone) => [zone.zone, zone.outerMiles, zone.feeCents]),
    );
    expect(rates.promos).toEqual(expect.arrayContaining([
      { code: "ICONICAI", discount: PROMO_DISCOUNTS.ICONICAI, mode: "flat", active: true },
      { code: "NEWYEAR", discount: PROMO_DISCOUNTS.NEWYEAR, mode: "flat", active: true },
    ]));
    expect(rates.apprenticeshipBookingFee).toBe(APPRENTICESHIP_BOOKING_FEE);
    expect(rates.headshotsUnitPrice).toBe(HEADSHOTS_UNIT_PRICE);
    expect(rates.headshotsBookingFee).toBe(HEADSHOTS_BOOKING_FEE);
    expect(rates.seniorTourPrice).toBe(SENIOR_TOUR_PRICE);
    expect(rates.seniorFacilityRatePerSqft).toBe(SENIOR_FACILITY_RATE_PER_SQFT);
    expect(rates.seniorDepositPercent).toBe(SENIOR_LIVING_DEPOSIT_PERCENT);
    expect(rates.seniorRoomRates.map((band) => [band.minCount, band.maxCount, band.each])).toEqual(
      SENIOR_ROOM_RATES.map((band) => [band.minCount, band.maxCount, band.each]),
    );
    expect(percentOfDollars(549, rates.processingPercent)).toBe(processingFee(549));
  });

  it("lets a saved doc replace the seed and a removal stay gone", () => {
    const merged = mergePricingAdjustments([
      { id: "processing-fee", amount: 3.5 },
      { id: "sales-tax", amount: 8.25, active: true },
      { id: "travel-zone-2", removed: true },
      { id: "promo-ICONICAI", removed: true },
      { id: "promo-SPRING", kind: "promo", name: "Spring", mode: "flat", amount: 20, code: "SPRING", active: true },
    ]);
    const rates = pricingRates(merged);
    expect(rates.processingPercent).toBe(3.5);
    expect(rates.taxActive).toBe(true);
    expect(rates.taxPercent).toBe(8.25);
    expect(rates.travelZones.some((zone) => zone.zone === 2)).toBe(false);
    expect(rates.travelZones.some((zone) => zone.zone === 3)).toBe(true);
    expect(rates.promos.map((promo) => promo.code)).toEqual(["NEWYEAR", "SPRING"]);
    expect(merged.some((item) => item.id === "promo-ICONICAI")).toBe(false);
  });

  it("seeds only missing docs", () => {
    const docs = defaultPricingAdjustments();
    const missing = missingSeedDocs(["processing-fee", "sales-tax"], docs);
    expect(missing.some((item) => item.id === "processing-fee")).toBe(false);
    expect(missing.some((item) => item.id === "promo-ICONICAI")).toBe(true);
    expect(missingSeedDocs(docs.map((item) => item.id), docs)).toEqual([]);
  });

  it("rejects a promo without a code", () => {
    const saved = pricingAdjustmentSaveData({ kind: "promo", name: "Friends", mode: "flat", amount: 10 });
    expect(saved.ok).toBe(false);
    const ok = pricingAdjustmentSaveData({ kind: "promo", name: "Friends", mode: "flat", amount: 10, code: "friends" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.code).toBe("FRIENDS");
  });
});
