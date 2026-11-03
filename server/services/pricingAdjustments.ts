/**
 * Firestore `pricingAdjustments`, with the seed when the read fails or a doc is missing.
 * Admin SDK. The booking page also reads this collection in the browser.
 */
import admin from "firebase-admin";
import {
  mergePricingAdjustments,
  PRICING_ADJUSTMENTS_COLLECTION,
  pricingRates,
  type PricingRates,
} from "../../shared/pricingSettings.ts";

export async function loadPricingRates(): Promise<PricingRates> {
  try {
    const snap = await admin.firestore().collection(PRICING_ADJUSTMENTS_COLLECTION).get();
    return pricingRates(mergePricingAdjustments(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
  } catch (err) {
    console.error("[Pricing] Settings read failed — using the seeded rates", err);
    return pricingRates(mergePricingAdjustments([]));
  }
}
