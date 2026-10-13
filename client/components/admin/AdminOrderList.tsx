import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { MoneyAmount } from "@/components/MoneyAmount";
import { cn } from "@/lib/utils";
import {
  ADMIN_ORDER_LIST_COLUMNS,
  type AdminOrderListItem,
  type AdminOrderListRow,
  type AdminOrderListSort,
  type AdminOrderListSortField,
} from "@shared/adminOrderList";

const SANS = "Inter, system-ui, sans-serif";

const DESKTOP_COLUMNS =
  "sm:grid-cols-[minmax(0,1.05fr)_minmax(3.25rem,0.55fr)_minmax(0,1.05fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.15fr)_minmax(2.25rem,0.4fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(5.75rem,0.7fr)_minmax(2.25rem,0.4fr)_minmax(0,0.9fr)_minmax(3.5rem,0.5fr)]";

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
  const [notesPopup, setNotesPopup] = useState<string | null>(null);
  const [itemsPopup, setItemsPopup] = useState<AdminOrderListItem[] | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<ReadonlySet<string>>(() => new Set());

  const toggleNotes = (id: string) => {
    setExpandedNotes((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
              "relative flex min-w-0 items-stretch border-b border-[#e2e8f0] last:border-b-0",
              selected.has(row.id) && "bg-[#f0fdfa]",
            )}
          >
            <div className="relative z-20 flex w-10 shrink-0 items-start justify-center pt-3 sm:items-center sm:pt-0">
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
              aria-label={`Open order ${row.orderCode}`}
              style={{ fontFamily: SANS }}
              className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0d9488]"
            />
            <div
              className={cn(
                "pointer-events-none relative z-10 grid min-w-0 flex-1 grid-cols-1 gap-2 py-3 pr-3 sm:items-start sm:gap-x-3 sm:py-3",
                DESKTOP_COLUMNS,
                "[overflow-wrap:break-word] [word-break:normal] [&_*]:[overflow-wrap:break-word] [&_*]:[word-break:normal]",
              )}
            >
              <Field label="Order #">{row.orderCode}</Field>
              <Field label="Placed">{row.placedLabel}</Field>
              <Field label="Client name">
                <div>{row.clientName}</div>
                {row.clientEmail ? (
                  <div className="text-[10px] font-medium text-[#94a3b8]">{row.clientEmail}</div>
                ) : null}
              </Field>
              <Field label="Property address">{row.address}</Field>
              <Field label="Shoot date & time">{row.shootLabel}</Field>
              <Field label="Package / services">{row.packageSummary}</Field>
              <Field label="Items">
                <button
                  type="button"
                  data-items-button={row.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setItemsPopup(row.items);
                  }}
                  className="pointer-events-auto text-[13px] font-bold text-[#0d9488] hover:underline sm:text-xs"
                >
                  {row.itemsCount}
                </button>
              </Field>
              <Field label="Photographer">{row.photographer}</Field>
              <Field label="Order status">{row.statusLabel}</Field>
              <Field label="Payment status">{row.paymentLabel}</Field>
              <Field label="Total">
                <MoneyAmount className="text-[13px] font-bold text-[#0F172A]">{row.totalLabel}</MoneyAmount>
              </Field>
              <NotesField
                row={row}
                expanded={expandedNotes.has(row.id)}
                onToggle={() => toggleNotes(row.id)}
                onOpen={() => setNotesPopup(row.notes)}
              />
              <Field label="Gallery / delivery status">{row.deliveryLabel}</Field>
              <Field label="#">
                <span className="text-[#0d9488] sm:float-right">{row.docIdLabel}</span>
              </Field>
            </div>
          </div>
        ))}
      </div>
      {notesPopup != null && (
        <NotesDialog notes={notesPopup} onClose={() => setNotesPopup(null)} />
      )}
      {itemsPopup != null && (
        <ItemsDialog items={itemsPopup} onClose={() => setItemsPopup(null)} />
      )}
    </div>
  );
}

function notesNeedExpand(notes: string): boolean {
  return notes.includes("\n") || notes.length > 80;
}

function NotesField({
  row,
  expanded,
  onToggle,
  onOpen,
}: {
  row: AdminOrderListRow;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="min-w-0 [overflow-wrap:break-word] [word-break:normal]" data-field="Notes">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] sm:sr-only">Notes</div>
      <div className="text-[13px] font-semibold leading-snug text-[#0F172A] [overflow-wrap:break-word] [word-break:normal]">
        <div className="sm:hidden">
          {row.notes ? (
            <>
              <p
                data-notes-text={row.id}
                className={cn(
                  "whitespace-pre-wrap font-medium [overflow-wrap:break-word] [word-break:normal]",
                  !expanded && "line-clamp-3",
                )}
              >
                {row.notes}
              </p>
              {notesNeedExpand(row.notes) ? (
                <button
                  type="button"
                  data-notes-expand={row.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggle();
                  }}
                  className="pointer-events-auto mt-1 text-[11px] font-bold text-[#0d9488] hover:underline"
                >
                  {expanded ? "Show less" : "Expand"}
                </button>
              ) : null}
            </>
          ) : (
            <span className="text-[#cbd5e1]">—</span>
          )}
        </div>
        <div className="hidden text-center sm:block">
          {row.notes ? (
            <button
              type="button"
              data-notes-open={row.id}
              aria-label={`Order notes for ${row.orderCode}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpen();
              }}
              className="pointer-events-auto text-lg transition-transform hover:scale-110"
            >
              🗒️
            </button>
          ) : (
            <span className="text-[#cbd5e1]">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function NotesDialog({ notes, onClose }: { notes: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="Order Notes" wide>
      <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-black">{notes}</p>
      </div>
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-xl bg-black px-6 text-xs font-bold text-white">
          Close
        </button>
      </div>
    </Modal>
  );
}

function ItemsDialog({ items, onClose }: { items: AdminOrderListItem[]; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="Order Items">
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">No items listed.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex justify-between border-b border-gray-100 py-2 last:border-0">
              <span className="text-sm font-bold">{item.name}</span>
              {item.priceLabel != null && <span className="text-sm font-black">{item.priceLabel}</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Modal({
  title,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      style={{ fontFamily: SANS }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={title}
        className={cn("w-full rounded-2xl bg-white p-6 shadow-2xl", wide ? "max-w-md" : "max-w-sm")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#0d9488]">{title}</h3>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
            <X className="h-5 w-5 text-gray-400 hover:text-black" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
        "pointer-events-auto inline-flex max-w-full items-center gap-1 text-left text-[10px] font-bold uppercase tracking-wide text-[#64748b] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]",
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
