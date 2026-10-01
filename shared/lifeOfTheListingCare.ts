/**
 * Life of the Listing Care — draft order add-on.
 * No SKU and no dollar amount until Cadi/Leo greenlight a price.
 * Do not mention this add-on in client email or SMS.
 */

export const LIFE_OF_THE_LISTING_CARE_CHECKBOX_LABEL =
  "Add Life of the Listing Care — Details will be emailed to you";

export const LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL =
  "Life of the Listing Care — Details will be emailed to you";

export const LIFE_OF_THE_LISTING_CARE_PRICE_LABEL = "Details emailed";

export const LIFE_OF_THE_LISTING_CARE_BLURB =
  "After we shoot, we stay with the listing — launch push, mid-DOM refreshes, pivots when it’s quiet, and sold follow-up — so exposure doesn’t die after delivery. Select this add-on and we’ll email full details, pricing options, and what happens next.";

/** Persist only an explicit boolean. Missing or other values stay off. */
export function lifeOfTheListingCareSelected(value: unknown): boolean {
  return value === true;
}
