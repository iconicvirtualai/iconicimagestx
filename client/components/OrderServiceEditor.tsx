import { PackageCatalogPicker } from "@/components/PackageCatalogPicker";
import type { StaffCatalogPackage } from "@shared/bookingCatalog";
import { adjustmentKind, isPromoInvoiceLine } from "@shared/invoiceFace";
import { staffServiceFromPackage, staffServiceUnitPrice, type StaffServiceLine } from "@shared/staffInvoice";
import { isTravelFeeLine } from "@shared/travelZones";

type ServiceRow = StaffServiceLine;

function asRow(value: unknown): ServiceRow {
  const row = value && typeof value === "object" ? value as ServiceRow : { name: "", price: 0 };
  return row;
}

function pricedRow(row: ServiceRow, raw: string): ServiceRow {
  const amount = raw.trim() === "" ? 0 : Number(raw);
  const next = Number.isFinite(amount) ? amount : 0;
  if (isPromoInvoiceLine(row) || isTravelFeeLine(row) || adjustmentKind(row)) {
    return { ...row, unitPrice: next, price: next, qty: row.qty || 1 };
  }
  return staffServiceUnitPrice(row, next);
}

/** Searchable catalog rows for Manage Order. Picking a package fills its name and price. */
export function OrderServiceEditor({
  catalog,
  lines,
  onChange,
}: {
  catalog: StaffCatalogPackage[];
  lines: unknown[];
  onChange: (lines: ServiceRow[]) => void;
}) {
  const rows = (Array.isArray(lines) ? lines : []).map(asRow);

  const update = (index: number, next: ServiceRow) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? next : row)));
  };

  return (
    <div data-testid="order-service-editor" className="space-y-3">
      {rows.map((row, index) => (
        <div key={`${row.id || "line"}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1" data-testid="order-service-picker">
            <PackageCatalogPicker
              catalog={catalog}
              selectedId={typeof row.id === "string" ? row.id : ""}
              fallbackName={row.name || ""}
              label={`Service ${index + 1}`}
              onSelect={(packageId) => {
                const chosen = catalog.find((item) => item.id === packageId || item.bookingId === packageId);
                if (chosen) update(index, staffServiceFromPackage(chosen));
              }}
            />
          </div>
          <label className="w-full sm:w-32 shrink-0">
            <span className="sr-only">Price</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              aria-label={`Price for service ${index + 1}`}
              value={row.price === 0 && !row.name ? "" : row.price}
              onChange={(event) => update(index, pricedRow(row, event.target.value))}
              placeholder="Price"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            className="shrink-0 rounded-xl px-3 py-3 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { name: "", price: 0, unitPrice: 0, qty: 1 }])}
        className="text-[#0d9488] text-xs font-bold"
      >
        + Add Service
      </button>
    </div>
  );
}
