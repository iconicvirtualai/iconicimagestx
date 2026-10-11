import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MoneyAmount } from "@/components/MoneyAmount";
import { cn } from "@/lib/utils";
import {
  ADMIN_ORDER_LIST_COLUMNS,
  type AdminOrderListRow,
  type AdminOrderListSort,
  type AdminOrderListSortField,
} from "@shared/adminOrderList";

const SANS = "Inter, system-ui, sans-serif";

const DESKTOP_COLUMNS =
  "sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,1.3fr)_minmax(0,1.15fr)_minmax(0,1.3fr)_minmax(0,0.95fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(5.75rem,0.8fr)_minmax(0,1fr)]";

export function AdminOrderList({
  rows,
  sort,
  onSort,
  selected,
  onToggleSelect,
}: {
  rows: AdminOrderListRow[];
  sort: AdminOrderListSort;
  onSort: (field: AdminOrderListSortField) => void;
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div
      data-order-list=""
      data-sort-field={sort.field}
      data-sort-order={sort.order}
      style={{ fontFamily: SANS }}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#cbd5e1] bg-white [overflow-wrap:break-word] [word-break:normal]"
    >
      <div className="flex flex-wrap gap-1.5 border-b border-[#e2e8f0] px-3 py-2 sm:hidden" aria-label="Sort orders">
        {ADMIN_ORDER_LIST_COLUMNS.map((column) => (
          <SortButton key={column.id} columnId={column.id} label={column.label} sort={sort} onSort={onSort} chip />
        ))}
      </div>
      <div className="hidden border-b border-[#e2e8f0] bg-[#f8fafc] sm:flex" role="row">
        <div className="w-10 shrink-0" aria-hidden="true" />
        <div className={cn("grid min-w-0 flex-1 gap-x-3 py-2 pr-3", DESKTOP_COLUMNS)} role="row">
          {ADMIN_ORDER_LIST_COLUMNS.map((column) => (
            <SortButton key={column.id} columnId={column.id} label={column.label} sort={sort} onSort={onSort} />
          ))}
        </div>
      </div>
      <div>
        {rows.map((row) => (
          <div
            key={row.id}
            data-order-id={row.id}
            className={cn(
              "flex min-w-0 items-stretch border-b border-[#e2e8f0] last:border-b-0",
              selected.has(row.id) && "bg-[#f0fdfa]",
            )}
          >
            <div className="flex w-10 shrink-0 items-start justify-center pt-3 sm:items-center sm:pt-0">
              <input
                type="checkbox"
                aria-label={`Select ${row.orderCode}`}
                checked={selected.has(row.id)}
                onChange={() => onToggleSelect(row.id)}
                className="h-4 w-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]"
              />
            </div>
            <Link
              to={row.href}
              data-order-link={row.id}
              style={{ fontFamily: SANS }}
              className={cn(
                "grid min-w-0 flex-1 grid-cols-1 gap-2 py-3 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0d9488] sm:items-start sm:gap-x-3 sm:py-3",
                DESKTOP_COLUMNS,
                "[overflow-wrap:break-word] [word-break:normal] [&_*]:[overflow-wrap:break-word] [&_*]:[word-break:normal]",
              )}
            >
              <Field label="Order #">{row.orderCode}</Field>
              <Field label="Client name">{row.clientName}</Field>
              <Field label="Property address">{row.address}</Field>
              <Field label="Shoot date & time">{row.shootLabel}</Field>
              <Field label="Package / services">{row.packageSummary}</Field>
              <Field label="Photographer">{row.photographer}</Field>
              <Field label="Order status">{row.statusLabel}</Field>
              <Field label="Payment status">{row.paymentLabel}</Field>
              <Field label="Total">
                <MoneyAmount className="text-[13px] font-bold text-[#0F172A]">{row.totalLabel}</MoneyAmount>
              </Field>
              <Field label="Gallery / delivery status">{row.deliveryLabel}</Field>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortButton({
  columnId,
  label,
  sort,
  onSort,
  chip = false,
}: {
  columnId: AdminOrderListSortField;
  label: string;
  sort: AdminOrderListSort;
  onSort: (field: AdminOrderListSortField) => void;
  chip?: boolean;
}) {
  const active = sort.field === columnId;
  return (
    <button
      type="button"
      onClick={() => onSort(columnId)}
      aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}
      style={{ fontFamily: SANS }}
      className={cn(
        "inline-flex max-w-full items-center gap-1 text-left text-[10px] font-bold uppercase tracking-wide text-[#64748b] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]",
        chip && "rounded-full border border-[#e2e8f0] px-2 py-1",
        active && "text-black",
        chip && active && "border-[#0d9488] bg-[#f0fdfa] text-[#0f766e]",
        "[overflow-wrap:break-word] [word-break:normal]",
      )}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="shrink-0">{active ? (sort.order === "asc" ? "↑" : "↓") : ""}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 [overflow-wrap:break-word] [word-break:normal]" data-field={label}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] sm:sr-only">{label}</div>
      <div className="text-[13px] font-semibold leading-snug text-[#0F172A] [overflow-wrap:break-word] [word-break:normal]">
        {children}
      </div>
    </div>
  );
}
