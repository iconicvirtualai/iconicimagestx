import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { buildAdminOrderTile, type AdminStudioId } from "@shared/adminOrderTile";
import { exclusiveOrderBuckets } from "@shared/orderPackageLines";
import { recordAddressText } from "@shared/addressText";
import {
  DEFAULT_ADMIN_ORDER_LIST_SORT,
  adminOrderQueue,
  adminOrderUnifiedStatus,
  buildAdminOrderListRow,
  cycleAdminOrderListSort,
  filterAdminOrderRecords,
  readAdminOrdersView,
  sortAdminOrderRows,
  writeAdminOrdersView,
  type AdminOrderListSort,
  type AdminOrderListSortField,
  type AdminOrderListStaff,
  type AdminOrdersViewMode,
} from "@shared/adminOrderList";
import { AdminOrderTile } from "@/components/admin/AdminOrderTile";
import { AdminOrderList } from "@/components/admin/AdminOrderList";
import { cn } from "@/lib/utils";

const SANS = "Inter, system-ui, sans-serif";

type SectionId = "action" | "active" | "archived";

function safe(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const getName = (order: any) => safe(order.clientName || order.customerName || order.name || ((order.firstName || "") + " " + (order.lastName || "")).trim());
const getAddr = (order: any) => recordAddressText(order) || "—";
const getTotal = (order: any) => Number(order.total) || Number(order.amount) || Number(order.pricing?.total) || 0;

function sortOrders(list: any[], field: string, order: "asc" | "desc") {
  return [...list].sort((a, b) => {
    let va: any, vb: any;
    if (field === "createdAt") {
      va = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      vb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    } else if (field === "id") {
      va = a.id || ""; vb = b.id || "";
    } else if (field === "customer") {
      va = getName(a).toLowerCase(); vb = getName(b).toLowerCase();
    } else if (field === "total") {
      va = getTotal(a); vb = getTotal(b);
    } else if (field === "appointment") {
      va = (a.appointmentDate?.toDate ? a.appointmentDate.toDate().getTime() : (a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0));
      vb = (b.appointmentDate?.toDate ? b.appointmentDate.toDate().getTime() : (b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0));
    } else if (field === "status") {
      va = adminOrderUnifiedStatus(a); vb = adminOrderUnifiedStatus(b);
    }
    if (va < vb) return order === "asc" ? -1 : 1;
    if (va > vb) return order === "asc" ? 1 : -1;
    return 0;
  });
}

export function AdminOrdersBrowser({
  orders,
  staff,
  selection,
  storageKey,
  onToggleSelect,
  onSelectIds,
  onStudioChange,
}: {
  orders: any[];
  staff: AdminOrderListStaff[];
  selection: Set<string>;
  storageKey: string;
  onToggleSelect: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onStudioChange: (orderId: string, studio: AdminStudioId) => void;
}) {
  const navigate = useNavigate();
  const [view, setView] = React.useState<AdminOrdersViewMode>(() => readAdminOrdersView(window.localStorage, storageKey));
  const [sect1, setSect1] = React.useState({ perPage: 20, sort: "newest", search: "", collapsed: false });
  const [sect2, setSect2] = React.useState({ perPage: 20, sortField: "createdAt", sortOrder: "desc" as "asc" | "desc", search: "", collapsed: false });
  const [sect3, setSect3] = React.useState({ perPage: 20, sort: "newest", search: "", collapsed: true });
  const [listSort, setListSort] = React.useState<Record<SectionId, AdminOrderListSort>>({
    action: DEFAULT_ADMIN_ORDER_LIST_SORT,
    active: DEFAULT_ADMIN_ORDER_LIST_SORT,
    archived: DEFAULT_ADMIN_ORDER_LIST_SORT,
  });

  React.useEffect(() => {
    setView(readAdminOrdersView(window.localStorage, storageKey));
  }, [storageKey]);

  const chooseView = (next: AdminOrdersViewMode) => {
    setView(next);
    writeAdminOrdersView(window.localStorage, storageKey, next);
  };

  const sortList = (section: SectionId, field: AdminOrderListSortField) => {
    setListSort((prev) => ({ ...prev, [section]: cycleAdminOrderListSort(prev[section], field) }));
  };

  const buckets = exclusiveOrderBuckets(orders, adminOrderQueue);
  const actionSearched = filterAdminOrderRecords(buckets.action, sect1.search);
  const activeSearched = filterAdminOrderRecords(buckets.active, sect2.search);
  const archivedSearched = filterAdminOrderRecords(buckets.archived, sect3.search);

  const actionTiles = sortOrders(actionSearched, "createdAt", sect1.sort === "newest" ? "desc" : "asc");
  const activeTiles = sortOrders(activeSearched, sect2.sortField, sect2.sortOrder);
  const archivedTiles = sortOrders(archivedSearched, "createdAt", sect3.sort === "newest" ? "desc" : "asc");

  const actionList = sortAdminOrderRows(actionSearched.map((order) => buildAdminOrderListRow(order, staff)), listSort.action.field, listSort.action.order);
  const activeList = sortAdminOrderRows(activeSearched.map((order) => buildAdminOrderListRow(order, staff)), listSort.active.field, listSort.active.order);
  const archivedList = sortAdminOrderRows(archivedSearched.map((order) => buildAdminOrderListRow(order, staff)), listSort.archived.field, listSort.archived.order);

  function renderTiles(list: any[]) {
    if (list.length === 0) return <EmptyOrders />;
    return (
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {list.map((order) => {
          const tile = buildAdminOrderTile(order);
          return (
            <AdminOrderTile
              key={order.id}
              order={tile}
              selected={selection.has(order.id)}
              onOpen={() => navigate("/admin/order-request/" + order.id)}
              onToggleSelect={() => onToggleSelect(order.id)}
              onStudioChange={tile.studio ? (studio) => onStudioChange(order.id, studio) : undefined}
            />
          );
        })}
      </div>
    );
  }

  function renderList(section: SectionId, rows: ReturnType<typeof sortAdminOrderRows>) {
    if (rows.length === 0) return <EmptyOrders />;
    return (
      <AdminOrderList
        rows={rows}
        sort={listSort[section]}
        onSort={(field) => sortList(section, field)}
        selected={selection}
        onToggleSelect={onToggleSelect}
      />
    );
  }

  const actionShown = (view === "list" ? actionList : actionTiles).slice(0, sect1.perPage);
  const activeShown = (view === "list" ? activeList : activeTiles).slice(0, sect2.perPage);
  const archivedShown = (view === "list" ? archivedList : archivedTiles).slice(0, sect3.perPage);
  const idsOf = (list: { id: string }[]) => list.map((order) => order.id);

  return (
    <div className="space-y-12 pb-24" data-orders-view={view} style={{ fontFamily: SANS }}>
      <div className="flex justify-end">
        <div role="group" aria-label="Orders view" data-testid="orders-view-toggle" className="inline-flex rounded-xl border border-[#cbd5e1] bg-white p-1">
          <ViewButton pressed={view === "tile"} onClick={() => chooseView("tile")}>Tile view</ViewButton>
          <ViewButton pressed={view === "list"} onClick={() => chooseView("list")}>List view</ViewButton>
        </div>
      </div>

      <section data-section="action">
        <SectionHeader
          title="Orders Requiring Action"
          count={buckets.action.length}
          countClass="bg-red-500 text-white"
          collapsed={sect1.collapsed}
          onToggle={() => setSect1({ ...sect1, collapsed: !sect1.collapsed })}
          chevronClass="text-[#0d9488]"
        >
          <SearchBox label="Search orders requiring action" value={sect1.search} onChange={(search) => setSect1({ ...sect1, search })} />
          {view === "tile" && (
            <select value={sect1.sort} onChange={(event) => setSect1({ ...sect1, sort: event.target.value })} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold" aria-label="Sort orders requiring action">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          )}
          <PerPage value={sect1.perPage} onChange={(perPage) => setSect1({ ...sect1, perPage })} />
          <SelectVisible
            ids={idsOf(actionShown)}
            selection={selection}
            onSelectIds={onSelectIds}
          />
        </SectionHeader>
        {!sect1.collapsed && (view === "list" ? renderList("action", actionShown as any) : renderTiles(actionShown))}
      </section>

      <section data-section="active">
        <SectionHeader
          title="All Orders"
          count={buckets.active.length}
          countClass="bg-black text-white"
          collapsed={sect2.collapsed}
          onToggle={() => setSect2({ ...sect2, collapsed: !sect2.collapsed })}
          chevronClass="text-black"
        >
          <SearchBox label="Search all orders" value={sect2.search} onChange={(search) => setSect2({ ...sect2, search })} testId="orders-search-active" />
          {view === "tile" && (
            <>
              <select value={sect2.sortField} onChange={(event) => setSect2({ ...sect2, sortField: event.target.value })} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold" aria-label="Sort all orders">
                <option value="createdAt">Placed</option>
                <option value="customer">Customer</option>
                <option value="total">Total</option>
                <option value="appointment">Appointment</option>
                <option value="status">Status</option>
                <option value="id">Order</option>
              </select>
              <button type="button" onClick={() => setSect2({ ...sect2, sortOrder: sect2.sortOrder === "asc" ? "desc" : "asc" })} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                {sect2.sortOrder === "asc" ? "Asc" : "Desc"}
              </button>
            </>
          )}
          <PerPage value={sect2.perPage} onChange={(perPage) => setSect2({ ...sect2, perPage })} />
          <SelectVisible ids={idsOf(activeShown)} selection={selection} onSelectIds={onSelectIds} />
        </SectionHeader>
        {!sect2.collapsed && (view === "list" ? renderList("active", activeShown as any) : renderTiles(activeShown))}
      </section>

      <section data-section="archived">
        <SectionHeader
          title="Archives & Cancellations"
          count={buckets.archived.length}
          countClass="bg-gray-200 text-gray-500"
          collapsed={sect3.collapsed}
          onToggle={() => setSect3({ ...sect3, collapsed: !sect3.collapsed })}
          chevronClass="text-gray-400"
          titleClass="text-gray-400"
        >
          <SearchBox label="Search archives" value={sect3.search} onChange={(search) => setSect3({ ...sect3, search })} />
          <PerPage value={sect3.perPage} onChange={(perPage) => setSect3({ ...sect3, perPage })} />
          <SelectVisible ids={idsOf(archivedShown)} selection={selection} onSelectIds={onSelectIds} />
        </SectionHeader>
        {!sect3.collapsed && (
          <div className="opacity-70">
            {view === "list" ? renderList("archived", archivedShown as any) : renderTiles(archivedShown)}
          </div>
        )}
      </section>
    </div>
  );
}

function ViewButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      style={{ fontFamily: SANS }}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]",
        pressed ? "bg-[#0d9488] text-white" : "text-[#64748b] hover:text-black",
      )}
    >
      {children}
    </button>
  );
}

function SectionHeader({
  title,
  count,
  countClass,
  collapsed,
  onToggle,
  chevronClass,
  titleClass,
  children,
}: {
  title: string;
  count: number;
  countClass: string;
  collapsed: boolean;
  onToggle: () => void;
  chevronClass: string;
  titleClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
      <h2
        className={cn("flex cursor-pointer select-none items-center gap-2 text-sm font-black uppercase tracking-widest transition-opacity hover:opacity-70", titleClass)}
        onClick={onToggle}
      >
        {collapsed ? <ChevronDown className={cn("h-4 w-4", chevronClass)} /> : <ChevronUp className={cn("h-4 w-4", chevronClass)} />}
        {title} <span className={cn("rounded-full px-2 py-0.5 text-[10px]", countClass)}>{count}</span>
      </h2>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function SearchBox({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        aria-label={label}
        data-testid={testId}
        placeholder="Search..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-[#0d9488]"
      />
    </div>
  );
}

function PerPage({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-8 rounded-lg border border-gray-200 px-2 text-[10px] font-bold" aria-label="Orders per page">
      <option value={10}>10</option>
      <option value={20}>20</option>
      <option value={50}>50</option>
    </select>
  );
}

function SelectVisible({
  ids,
  selection,
  onSelectIds,
}: {
  ids: string[];
  selection: Set<string>;
  onSelectIds: (ids: string[]) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
      <input
        type="checkbox"
        onChange={() => onSelectIds(ids)}
        checked={ids.length > 0 && ids.every((id) => selection.has(id))}
        className="h-4 w-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]"
      />
      Select
    </label>
  );
}

function EmptyOrders() {
  return (
    <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-6 py-10 text-center">
      <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">No orders in this list</p>
    </div>
  );
}
