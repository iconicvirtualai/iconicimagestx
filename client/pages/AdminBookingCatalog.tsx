import { Navigate } from "react-router-dom";
import { isPubliclyBookable, type StaffCatalogPackage } from "@shared/bookingCatalog";

/** Kept for the booking catalog tests. The screen itself is Prices. */
export function AdminCatalogPackageTitle({ item }: { item: StaffCatalogPackage }) {
  return (
    <span className="block text-sm font-black text-slate-900">
      {item.name}
      {!item.isActive && <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Hidden</span>}
      {!isPubliclyBookable(item) && (
        <span data-testid={`catalog-unpriced-${item.id}`} className="ml-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">
          Unpriced, hidden from /book
        </span>
      )}
    </span>
  );
}

export default function AdminBookingCatalog() {
  return <Navigate to="/admin/pricing" replace />;
}
