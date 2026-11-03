/**
 * Browser read of `pricingAdjustments`. A failed read keeps the seed.
 * Does not write and does not email.
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  mergePricingAdjustments,
  PRICING_ADJUSTMENTS_COLLECTION,
  pricingRates,
  type PricingAdjustment,
  type PricingRates,
} from "@shared/pricingSettings";

export async function readPricingAdjustments(): Promise<PricingAdjustment[]> {
  try {
    const snap = await getDocs(collection(db, PRICING_ADJUSTMENTS_COLLECTION));
    return mergePricingAdjustments(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  } catch (err) {
    console.warn("[Pricing] Settings read failed — using the seeded rates", err);
    return mergePricingAdjustments([]);
  }
}

export async function readPricingRates(): Promise<PricingRates | null> {
  try {
    const snap = await getDocs(collection(db, PRICING_ADJUSTMENTS_COLLECTION));
    return pricingRates(mergePricingAdjustments(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
  } catch (err) {
    console.warn("[Pricing] Settings read failed — using the seeded rates", err);
    return null;
  }
}

export function seedPricingRates(): PricingRates {
  return pricingRates(mergePricingAdjustments([]));
}
