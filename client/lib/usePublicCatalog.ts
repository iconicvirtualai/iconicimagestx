/**
 * Public pages read the same packages and pricingAdjustments the Prices tab writes.
 * The first paint is the seed, which is today's numbers. A failed read stays there.
 */
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { packagesForStaffEditor, type StaffCatalogPackage } from "@shared/bookingCatalog";
import {
  mergePricingAdjustments,
  PRICING_ADJUSTMENTS_COLLECTION,
  type PricingAdjustment,
} from "@shared/pricingSettings";

function devQueryPatch(name: string): Record<string, number> {
  if (!import.meta.env.DEV || typeof window === "undefined") return {};
  const raw = new URLSearchParams(window.location.search).get(name);
  if (!raw) return {};
  const patch: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [id, value] = part.split(":");
    const amount = Number(value);
    if (id && Number.isFinite(amount)) patch[id] = amount;
  }
  return patch;
}

function storedPatch(key: string): Record<string, number> {
  if (!import.meta.env.DEV || typeof sessionStorage === "undefined") return {};
  const raw = sessionStorage.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function devPackagePreview(packages: StaffCatalogPackage[]): StaffCatalogPackage[] {
  const patch = { ...storedPatch("iconic-price-preview"), ...devQueryPatch("pricePreview") };
  if (Object.keys(patch).length === 0) return packages;
  return packages.map((item) => (
    typeof patch[item.id] === "number" ? { ...item, price: patch[item.id] } : item
  ));
}

function devFeePreview(items: PricingAdjustment[]): PricingAdjustment[] {
  const patch = { ...storedPatch("iconic-fee-preview"), ...devQueryPatch("feePreview") };
  if (Object.keys(patch).length === 0) return items;
  return items.map((item) => (
    typeof patch[item.id] === "number" ? { ...item, amount: patch[item.id] } : item
  ));
}

export function usePublicCatalog(): StaffCatalogPackage[] {
  const [packages, setPackages] = useState<StaffCatalogPackage[]>(() => devPackagePreview(packagesForStaffEditor([])));
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, "packages"))
      .then((snap) => {
        if (cancelled) return;
        setPackages(devPackagePreview(packagesForStaffEditor(
          snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
          { includeInactive: true },
        )));
      })
      .catch(() => {
        if (!cancelled) setPackages(devPackagePreview(packagesForStaffEditor([])));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return packages;
}

export function usePricingAdjustments(): PricingAdjustment[] {
  const [items, setItems] = useState<PricingAdjustment[]>(() => devFeePreview(mergePricingAdjustments([])));
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, PRICING_ADJUSTMENTS_COLLECTION))
      .then((snap) => {
        if (cancelled) return;
        setItems(devFeePreview(mergePricingAdjustments(
          snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
        )));
      })
      .catch(() => {
        if (!cancelled) setItems(devFeePreview(mergePricingAdjustments([])));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}
