import { useEffect, useState } from "react";
import { podcastCatalogFields } from "@shared/studio105";

/** Live Prices-catalog row for Podcast, with the seed used until the catalog answers. */
export function usePodcastCatalogOffer() {
  const [offer, setOffer] = useState(() => podcastCatalogFields([]));
  useEffect(() => {
    let cancelled = false;
    fetch("/api/bookings/catalog")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const packages = Array.isArray(data.packages) ? data.packages : [];
        const holds = Array.isArray(data.studioPriceHolds) ? data.studioPriceHolds : [];
        setOffer(podcastCatalogFields([...packages, ...holds]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return offer;
}
