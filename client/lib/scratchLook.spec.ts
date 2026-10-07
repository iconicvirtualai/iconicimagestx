import { describe, expect, it } from "vitest";
import { applyLookPixel, lookCss, lookIsNeutral, NEUTRAL_LOOK } from "./scratchLook";

describe("scratch look", () => {
  it("leaves a neutral pixel unchanged and brightens exposure", () => {
    expect(lookIsNeutral(NEUTRAL_LOOK)).toBe(true);
    expect(applyLookPixel(80, 90, 100, NEUTRAL_LOOK)).toEqual([80, 90, 100]);
    const brighter = applyLookPixel(80, 90, 100, { ...NEUTRAL_LOOK, exposure: 50 });
    expect(brighter[0]).toBeGreaterThan(80);
    expect(lookCss({ ...NEUTRAL_LOOK, hue: 20 })).toContain("hue-rotate");
  });
});
