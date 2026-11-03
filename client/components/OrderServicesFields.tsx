import * as React from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePricingRates } from "@/lib/usePricingRates";
import { packagesForStaffEditor, type StaffCatalogPackage } from "@shared/bookingCatalog";
import type { OrderServiceSavePatch } from "@shared/orderRequestServices";
import { OrderServiceEditor } from "@/components/OrderServiceEditor";

export interface OrderServiceRecord {
  lineItems?: unknown;
  promoDiscount?: unknown;
  promoCode?: unknown;
  tax?: unknown;
  fees?: unknown;
  travel?: unknown;
  processing?: unknown;
  pricing?: { tax?: unknown } | null;
}

/**
 * The one service editor for an order or project.
 * Loads the catalog and the office rates. Saving stays with the page, and this does not email.
 */
export function OrderServicesFields({
  record,
  resetKey,
  onChange,
}: {
  record: OrderServiceRecord;
  resetKey: string;
  onChange: (patch: OrderServiceSavePatch) => void;
}) {
  const rates = usePricingRates();
  const [catalog, setCatalog] = React.useState<StaffCatalogPackage[]>(() => packagesForStaffEditor([]));

  React.useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, "packages"))
      .then((snap) => {
        if (cancelled) return;
        setCatalog(packagesForStaffEditor(
          snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
          { includeInactive: true },
        ));
      })
      .catch(() => {
        if (!cancelled) setCatalog(packagesForStaffEditor([], { includeInactive: true }));
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <OrderServiceEditor
      catalog={catalog}
      rates={rates}
      initialLines={record.lineItems}
      resetKey={resetKey}
      promoDiscount={record.promoDiscount}
      promoCode={record.promoCode}
      tax={record.pricing?.tax ?? record.tax}
      fees={record.fees}
      travel={record.travel}
      processing={record.processing}
      onChange={onChange}
    />
  );
}
