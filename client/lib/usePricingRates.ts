import * as React from "react";
import type { PricingRates } from "@shared/pricingSettings";
import { readPricingRates, seedPricingRates } from "@/lib/pricingAdjustments";

/** Seed rates on the first paint. Firestore replaces them when the read succeeds. */
export function usePricingRates(): PricingRates {
  const [rates, setRates] = React.useState<PricingRates>(() => seedPricingRates());
  React.useEffect(() => {
    let cancelled = false;
    readPricingRates()
      .then((next) => {
        if (!cancelled && next) setRates(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return rates;
}
