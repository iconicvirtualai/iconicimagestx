import { describe, expect, it } from "vitest";
import {
  LIFE_OF_THE_LISTING_CARE_CHECKBOX_LABEL,
  LIFE_OF_THE_LISTING_CARE_PRICE_LABEL,
  LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL,
  lifeOfTheListingCareSelected,
} from "./lifeOfTheListingCare";

describe("Life of the Listing Care add-on", () => {
  it("uses the draft checkbox, summary, and unpriced label", () => {
    expect(LIFE_OF_THE_LISTING_CARE_CHECKBOX_LABEL).toBe(
      "Add Life of the Listing Care — Details will be emailed to you",
    );
    expect(LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL).toBe(
      "Life of the Listing Care — Details will be emailed to you",
    );
    expect(LIFE_OF_THE_LISTING_CARE_PRICE_LABEL).toBe("Details emailed");
    expect(LIFE_OF_THE_LISTING_CARE_PRICE_LABEL).not.toMatch(/\$\d/);
  });

  it("stores only an explicit true selection", () => {
    expect(lifeOfTheListingCareSelected(true)).toBe(true);
    expect(lifeOfTheListingCareSelected(false)).toBe(false);
    expect(lifeOfTheListingCareSelected(undefined)).toBe(false);
    expect(lifeOfTheListingCareSelected("true")).toBe(false);
    expect(lifeOfTheListingCareSelected(1)).toBe(false);
  });
});
