import * as React from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  ChevronRight,
  DollarSign,
  FileText,
  GripVertical,
  Images,
  LayoutGrid,
  List,
  Pencil,
  Search,
  Truck,
} from "lucide-react";
import { buildAdminOrderTile, ADMIN_STUDIOS, type AdminStudioId } from "@shared/adminOrderTile";
import {
  adminOrderDetailHref,
  adminOrderGalleryLabel,
  adminOrderPaymentLabel,
  adminOrderStatusLabel,
  buildAdminOrderListRow,
  filterAdminOrderRecords,
  type AdminOrderListRow,
  type AdminOrderListStaff,
} from "@shared/adminOrderList";
import { formatAdminMoney } from "@shared/listingPrice";
import {
  ADMIN_ORDER_BOARD_COLUMNS,
  bookedShootDay,
  computeOrderDeskKpis,
  DEFAULT_ORDER_DESK_PREFS,
  deliveryProgress,
  deskFilterCounts,
  orderDeskSection,
  orderDeskTriage,
  orderIsArchived,
  orderMatchesDeskFilter,
  parseOrderDeskPrefs,
  reorderDeskSections,
  shootWhen,
  shownKpiValue,
  type OrderDeskFilter,
  type OrderDeskPrefs,
  type OrderDeskSectionId,
} from "@shared/adminOrdersDesk";
import { DragGhost, dragDropClass, type DragGhostModel } from "@/components/drag/DragGhost";
import { cn } from "@/lib/utils";

const SANS = "Inter, system-ui, sans-serif";

const FILTERS: { id: OrderDeskFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "unscheduled", label: "Unscheduled" },
  { id: "nophoto", label: "No photographer" },
  { id: "progress", label: "In progress" },
];

const SECTION_META: Record<OrderDeskSectionId, { title: string; subdued: string }> = {
  action: { title: "Orders Requiring Action", subdued: "Triage queue · one-click next step" },
  active: { title: "All Orders", subdued: "Sorted by shoot date" },
  archived: { title: "Archives & Cancellations", subdued: "Archived and cancelled" },
};

type KpiKey = "today" | "unscheduled" | "progress" | "revenue";

const AVATAR_TONES = [
  "bg-[#e6f6f2] text-[#0e8a76]",
  "bg-[#eef1ff] text-[#4a5fd7]",
  "bg-[#fff4e5] text-[#b07a1a]",
  "bg-[#f1efff] text-[#5b4ed0]",
  "bg-[#e8f4fb] text-[#1c7aa8]",
  "bg-[#fdeeee] text-[#c0392b]",
  "bg-[#eef6e8] text-[#4a7c2a]",
  "bg-[#f8eef6] text-[#a14a8a]",
];

export function AdminOrdersBrowser({
  orders,
  staff,
  selection,
  storageKey,
  onToggleSelect,
  onSelectIds,
  onStudioChange,
  editRequests = [],
  now,
  prefs,
  onPrefsChange,
}: {
  orders: Record<string, unknown>[];
  staff: AdminOrderListStaff[];
  selection: Set<string>;
  storageKey: string;
  onToggleSelect: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onStudioChange: (orderId: string, studio: AdminStudioId) => void;
  editRequests?: Record<string, unknown>[];
  now?: Date;
  prefs?: OrderDeskPrefs;
  onPrefsChange?: (next: OrderDeskPrefs) => void;
}) {
  const [view, setView] = React.useState<"list" | "board">(() => readDeskView(storageKey));
  const [filter, setFilter] = React.useState<OrderDeskFilter>("all");
  const [query, setQuery] = React.useState("");
  const [menu, setMenu] = React.useState<KpiKey | null>(null);
  const [editing, setEditing] = React.useState<KpiKey | null>(null);
  const [draft, setDraft] = React.useState("");
  const [localPrefs, setLocalPrefs] = React.useState<OrderDeskPrefs>(() => prefs ?? DEFAULT_ORDER_DESK_PREFS);
  const [ghost, setGhost] = React.useState<DragGhostModel | null>(null);
  const [dropBefore, setDropBefore] = React.useState<OrderDeskSectionId | "end" | null>(null);
  const [ticking, setTicking] = React.useState(() => now ?? new Date());
  const dropRef = React.useRef<OrderDeskSectionId | "end" | null>(null);
  const controlled = onPrefsChange != null;
  const deskPrefs = controlled ? (prefs ?? DEFAULT_ORDER_DESK_PREFS) : localPrefs;
  const clock = now ?? ticking;

  React.useEffect(() => {
    setView(readDeskView(storageKey));
  }, [storageKey]);

  React.useEffect(() => {
    if (now) return undefined;
    const timer = window.setInterval(() => setTicking(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, [now]);

  React.useEffect(() => {
    if (!menu) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-kpi-popover]")) return;
      setMenu(null);
      setEditing(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const updatePrefs = (next: OrderDeskPrefs) => {
    const parsed = parseOrderDeskPrefs(next);
    if (controlled) onPrefsChange?.(parsed);
    else setLocalPrefs(parsed);
  };

  const chooseView = (next: "list" | "board") => {
    setView(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* The toggle still updates this view. */
    }
  };

  const searched = filterAdminOrderRecords(orders, query);
  const visible = searched.filter((order) => orderMatchesDeskFilter(order, filter, clock, staff));
  const kpis = computeOrderDeskKpis(orders, clock);
  const counts = deskFilterCounts(searched, clock, staff);
  const openCount = orders.filter((order) => !orderIsArchived(order)).length;
  const archivedCount = orders.length - openCount;
  const visibleIds = visible.map((order) => String(order.id || ""));

  const grouped = {
    action: sortAction(visible.filter((order) => orderDeskSection(order, staff, editRequests) === "action"), staff, editRequests),
    active: sortByShoot(visible.filter((order) => orderDeskSection(order, staff, editRequests) === "active")),
    archived: sortByShoot(visible.filter((order) => orderDeskSection(order, staff, editRequests) === "archived")),
  };

  const chooseFilter = (next: OrderDeskFilter) => {
    setFilter((current) => (current === next ? "all" : next));
  };

  const saveManual = (key: KpiKey) => {
    const trimmed = draft.trim();
    updatePrefs({ ...deskPrefs, kpi: { ...deskPrefs.kpi, [key]: trimmed || null } });
    setMenu(null);
    setEditing(null);
  };

  const resetManual = (key: KpiKey) => {
    updatePrefs({ ...deskPrefs, kpi: { ...deskPrefs.kpi, [key]: null } });
    setMenu(null);
    setEditing(null);
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, id: OrderDeskSectionId) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originY = event.clientY;
    let active = false;
    const move = (pointer: PointerEvent) => {
      if (!active && Math.hypot(pointer.clientX - originX, pointer.clientY - originY) < 6) return;
      active = true;
      const hit = document.elementFromPoint(pointer.clientX, pointer.clientY);
      const zone = hit instanceof Element ? hit.closest("[data-section-drop]") : null;
      const before = (zone?.getAttribute("data-section-drop") || null) as OrderDeskSectionId | "end" | null;
      dropRef.current = before;
      setDropBefore(before);
      setGhost({
        x: pointer.clientX,
        y: pointer.clientY,
        title: SECTION_META[id].title,
        subtitle: "Drop to reorder",
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      const before = dropRef.current;
      setGhost(null);
      setDropBefore(null);
      dropRef.current = null;
      if (!active || !before) return;
      updatePrefs({ ...deskPrefs, sectionOrder: reorderDeskSections(deskPrefs.sectionOrder, id, before) });
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  };

  const kpiCards: {
    key: KpiKey;
    filterId: OrderDeskFilter;
    label: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
    tone: string;
  }[] = [
    {
      key: "today",
      filterId: "today",
      label: "Today's shoots",
      value: shownKpiValue(String(kpis.todayCount), deskPrefs.kpi.today),
      hint: kpis.todayHint,
      icon: <Calendar className="h-4 w-4" />,
      tone: "bg-[#e6f6f2] text-[#0e8a76]",
    },
    {
      key: "unscheduled",
      filterId: "unscheduled",
      label: "Unscheduled",
      value: shownKpiValue(String(kpis.unscheduledCount), deskPrefs.kpi.unscheduled),
      hint: "No shoot date on file",
      icon: <Truck className="h-4 w-4" />,
      tone: "bg-[#fff4e5] text-[#d0891a]",
    },
    {
      key: "progress",
      filterId: "progress",
      label: "In progress",
      value: shownKpiValue(String(kpis.progressCount), deskPrefs.kpi.progress),
      hint: "Gallery / delivery status",
      icon: <Images className="h-4 w-4" />,
      tone: "bg-[#eef1ef] text-[#3d4442]",
    },
    {
      key: "revenue",
      filterId: "revenue",
      label: "Revenue this week",
      value: shownKpiValue(formatAdminMoney(kpis.revenueAmount), formatManualMoney(deskPrefs.kpi.revenue)),
      hint: kpis.revenueHint,
      icon: <DollarSign className="h-4 w-4" />,
      tone: "bg-[#eef1ff] text-[#5b7cfa]",
    },
  ];

  return (
    <div className="pb-28 text-[#1a1d1c]" data-orders-view={view} data-orders-filter={filter} style={{ fontFamily: SANS }}>
      <DragGhost ghost={ghost} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="text-[13px] font-medium text-[#7a8480]">
          <strong className="font-semibold text-[#3d4442]">{openCount}</strong> open ·{" "}
          <strong className="font-semibold text-[#3d4442]">{archivedCount}</strong> archived · week of {kpis.week.startLabel}
        </p>
        <div role="group" aria-label="Orders view" data-testid="orders-view-toggle" className="inline-flex rounded-xl bg-[#e7ebe9] p-[3px]">
          <ViewButton pressed={view === "list"} onClick={() => chooseView("list")} icon={<List className="h-3.5 w-3.5" />}>List</ViewButton>
          <ViewButton pressed={view === "board"} onClick={() => chooseView("board")} icon={<LayoutGrid className="h-3.5 w-3.5" />}>Board</ViewButton>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <KpiCard
            key={card.key}
            card={card}
            active={filter === card.filterId}
            manual={deskPrefs.kpi[card.key] != null}
            menuOpen={menu === card.key}
            editing={editing === card.key}
            draft={draft}
            onDraft={setDraft}
            onOpenMenu={() => {
              setMenu((current) => (current === card.key ? null : card.key));
              setEditing(null);
              setDraft(deskPrefs.kpi[card.key] || "");
            }}
            onEdit={() => {
              setEditing(card.key);
              setDraft(deskPrefs.kpi[card.key] || "");
            }}
            onSave={() => saveManual(card.key)}
            onReset={() => resetManual(card.key)}
            onFilter={() => chooseFilter(card.filterId)}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Order filters" className="flex flex-wrap gap-1 rounded-[14px] bg-[#e7ebe9] p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              data-testid={`orders-filter-${item.id}`}
              onClick={() => setFilter(item.id)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold",
                filter === item.id ? "bg-white text-[#1a1d1c] shadow-[0_1px_3px_rgba(0,0,0,.07)]" : "text-[#3d4442]",
              )}
            >
              {item.label}
              <span className={cn("rounded-full px-1.5 text-[11px] font-bold", filter === item.id ? "bg-[#e6f6f2] text-[#0e8a76]" : "text-[#7a8480]")}>
                {counts[item.id]}
              </span>
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#3d4442]">
          <input
            type="checkbox"
            data-testid="orders-select-all"
            checked={visibleIds.length > 0 && visibleIds.every((id) => selection.has(id))}
            onChange={() => onSelectIds(visibleIds)}
            className="h-4 w-4 rounded border-[#c5ccc9] text-[#14a08a] focus:ring-[#14a08a]"
          />
          Select all
        </label>
        <div className="ml-auto flex h-[38px] min-w-[220px] items-center gap-2 rounded-full border border-[#e6e9e7] bg-white px-3 text-[#7a8480]">
          <Search className="h-3.5 w-3.5" />
          <input
            type="text"
            aria-label="Search orders or clients"
            data-testid="orders-search"
            placeholder="Search orders or clients…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-[13px] text-[#1a1d1c] outline-none placeholder:text-[#a3aba8]"
          />
        </div>
      </div>

      {view === "board" ? (
        <Board
          orders={visible}
          staff={staff}
          now={clock}
          selection={selection}
          onToggleSelect={onToggleSelect}
        />
      ) : (
        <div className="relative">
          {deskPrefs.sectionOrder.map((section) => (
            <React.Fragment key={section}>
              {dropBefore === section && <DropSlot title={SECTION_META[ghostTitle(ghost) || section].title} />}
              <section
                data-section={section}
                data-section-drop={section}
                className={cn(
                  "mb-4 rounded-2xl border border-[#e6e9e7] bg-white shadow-[0_1px_2px_rgba(26,29,28,.03)]",
                  ghost?.title === SECTION_META[section].title && "opacity-60 ring-2 ring-[#14a08a]/40",
                )}
              >
                <div className="flex items-center gap-2 px-3.5 py-3">
                  <button
                    type="button"
                    data-drag-handle
                    aria-label={`Drag to reorder ${SECTION_META[section].title}`}
                    title="Drag to reorder"
                    onPointerDown={(event) => startDrag(event, section)}
                    className="grid h-8 w-8 shrink-0 cursor-grab touch-none select-none place-items-center rounded-lg text-[#7a8480] hover:border hover:border-[#e6e9e7] hover:bg-[#f4f6f5] active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-expanded={!deskPrefs.collapsed[section]}
                    aria-label={deskPrefs.collapsed[section] ? `Expand ${SECTION_META[section].title}` : `Collapse ${SECTION_META[section].title}`}
                    onClick={() => updatePrefs({
                      ...deskPrefs,
                      collapsed: { ...deskPrefs.collapsed, [section]: !deskPrefs.collapsed[section] },
                    })}
                    className="grid h-6 w-6 place-items-center text-[#7a8480]"
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !deskPrefs.collapsed[section] && "rotate-90")} />
                  </button>
                  <h2 className="text-[13.5px] font-bold tracking-tight">{SECTION_META[section].title}</h2>
                  <span className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[#eef1ef] px-1.5 text-[11.5px] font-bold tabular-nums text-[#3d4442]">
                    {grouped[section].length}
                  </span>
                  <span className="text-[12px] font-medium text-[#7a8480]">
                    {section === "archived" && deskPrefs.collapsed.archived ? "Collapsed" : SECTION_META[section].subdued}
                  </span>
                </div>
                {!deskPrefs.collapsed[section] && (
                  <div className="px-2.5 pb-3">
                    {grouped[section].length === 0 ? (
                      <EmptyOrders />
                    ) : section === "action" ? (
                      <TriageRows
                        orders={grouped.action}
                        staff={staff}
                        now={clock}
                        editRequests={editRequests}
                        selection={selection}
                        onToggleSelect={onToggleSelect}
                        onStudioChange={onStudioChange}
                      />
                    ) : (
                      <OrderTable
                        orders={grouped[section]}
                        staff={staff}
                        now={clock}
                        selection={selection}
                        onToggleSelect={onToggleSelect}
                        onStudioChange={onStudioChange}
                      />
                    )}
                  </div>
                )}
              </section>
            </React.Fragment>
          ))}
          <div data-section-drop="end" className="h-3">
            {dropBefore === "end" && <DropSlot title={SECTION_META[ghostTitle(ghost) || "action"].title} />}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  card,
  active,
  manual,
  menuOpen,
  editing,
  draft,
  onDraft,
  onOpenMenu,
  onEdit,
  onSave,
  onReset,
  onFilter,
}: {
  card: { key: KpiKey; label: string; value: string; hint: string; icon: React.ReactNode; tone: string };
  active: boolean;
  manual: boolean;
  menuOpen: boolean;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onOpenMenu: () => void;
  onEdit: () => void;
  onSave: () => void;
  onReset: () => void;
  onFilter: () => void;
}) {
  return (
    <div
      data-kpi={card.key}
      data-manual={manual ? "true" : "false"}
      data-kpi-popover
      className={cn(
        "relative flex flex-col gap-2.5 rounded-2xl border bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(26,29,28,.03)]",
        active ? "border-[#14a08a]" : "border-[#e6e9e7]",
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("grid h-9 w-9 place-items-center rounded-[11px]", card.tone)}>{card.icon}</div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={`Adjust ${card.label}`}
            aria-expanded={menuOpen}
            onClick={onOpenMenu}
            className={cn("grid h-[26px] w-[26px] place-items-center rounded-lg bg-[#f0f2f1] text-[#5c6562]", menuOpen && "text-[#3d4442]")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-[#c5ccc9]" />
        </div>
      </div>
      <button type="button" onClick={onFilter} className="text-left" title="Click to filter the list">
        <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">{card.value}</div>
        <div className="mt-1 text-[12.5px] font-semibold text-[#7a8480]">{card.label}</div>
        <div className="mt-0.5 text-[11.5px] font-medium text-[#7a8480]">{card.hint}</div>
      </button>
      {manual && (
        <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#3d4442]">
          <i className="h-[5px] w-[5px] rounded-full bg-[#c47a12]" />
          Manual ·{" "}
          <button type="button" onClick={onReset} className="font-bold text-[#0e8a76]">Reset</button>
        </div>
      )}
      {menuOpen && (
        <div className="absolute right-3 top-[calc(100%+8px)] z-40 w-44 rounded-xl border border-[#e6e9e7] bg-white p-1.5 text-left shadow-[0_10px_32px_rgba(26,29,28,.12)]">
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSave();
              }}
              className="space-y-1.5 p-1"
            >
              <label className="block text-[11px] font-semibold text-[#7a8480]" htmlFor={`kpi-manual-${card.key}`}>Manual value</label>
              <input
                id={`kpi-manual-${card.key}`}
                value={draft}
                onChange={(event) => onDraft(event.target.value)}
                className="h-8 w-full rounded-lg border border-[#e6e9e7] px-2 text-[13px] outline-none focus:border-[#14a08a]"
              />
              <button type="submit" className="w-full rounded-lg bg-[#1a1d1c] px-2 py-1.5 text-left text-[12.5px] font-semibold text-white">Save</button>
            </form>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold hover:bg-[#f4f6f5]">Set manual value</button>
              <button type="button" onClick={onReset} className="block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold hover:bg-[#f4f6f5]">Reset to auto</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ViewButton({ pressed, onClick, icon, children }: { pressed: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-semibold",
        pressed ? "bg-white text-[#1a1d1c] shadow-[0_1px_3px_rgba(0,0,0,.07)]" : "text-[#3d4442]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function DropSlot({ title }: { title: string }) {
  return (
    <div data-testid="section-drop-slot" className={cn("mb-4 flex min-h-[88px] items-start rounded-2xl px-4 py-3.5 text-[13px] font-semibold text-[#0e8a76]", dragDropClass(true))}>
      Drop {title} here
    </div>
  );
}

function TriageRows({
  orders,
  staff,
  now,
  editRequests,
  selection,
  onToggleSelect,
  onStudioChange,
}: {
  orders: Record<string, unknown>[];
  staff: AdminOrderListStaff[];
  now: Date;
  editRequests: Record<string, unknown>[];
  selection: Set<string>;
  onToggleSelect: (id: string) => void;
  onStudioChange: (orderId: string, studio: AdminStudioId) => void;
}) {
  return (
    <div className="flex flex-col">
      {orders.map((order) => {
        const id = String(order.id || "");
        const row = buildAdminOrderListRow(order, staff);
        const triage = orderDeskTriage(order, staff, editRequests);
            const when = shootWhen(order, now);
            const tile = buildAdminOrderTile(order);
            if (!triage) return null;
            return (
          <div key={id} data-order-id={id} className="flex flex-wrap items-center gap-3 rounded-xl px-1.5 py-2 hover:bg-[#f6f8f7]">
            <input
              type="checkbox"
              aria-label={`Select ${row.orderCode}`}
              checked={selection.has(id)}
              onChange={() => onToggleSelect(id)}
              className="h-4 w-4 rounded border-[#c5ccc9] text-[#14a08a]"
            />
            <span className="min-w-[168px] text-[12.5px] font-semibold text-[#3d4442]">{triage.label}</span>
            <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
              <span>
                <Link to={adminOrderDetailHref(id)} data-order-link={id} className="text-[13px] font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14a08a]">{row.orderCode}</Link>
                {row.calendarHoldFailed ? <span data-slot="calendar-hold" className="ml-2 text-[11px] font-semibold text-[#3d4442]">Calendar hold failed</span> : null}
              </span>
              <span className="text-[13px] font-semibold">{row.clientName}</span>
              <span className="truncate text-[12.5px] text-[#7a8480]">{streetLine(row.address)}</span>
            </div>
            <div className="min-w-[110px] text-right text-[12px] font-medium text-[#7a8480]">
              {when.day}{when.time ? ` · ${when.time}` : ""}
            </div>
            {tile.studio ? (
              <select
                aria-label={`Studio for ${row.orderCode}`}
                value={tile.studio}
                onChange={(event) => onStudioChange(id, event.target.value as AdminStudioId)}
                className="h-[30px] rounded-full border border-[#e6e9e7] bg-white px-2 text-[11px] font-semibold text-[#3d4442]"
              >
                {ADMIN_STUDIOS.map((studio) => <option key={studio.id} value={studio.id}>{studio.label}</option>)}
              </select>
            ) : null}
            <Link
              to={triageHref(id, order, triage.action)}
              className={cn(
                "inline-flex h-[30px] items-center rounded-full border px-3 text-[12px] font-semibold",
                triage.action === "Assign" && "border-[#14a08a] bg-[#14a08a] text-white",
                triage.action === "Open gallery" && "border-[#1a1d1c] bg-[#1a1d1c] text-white",
                triage.action !== "Assign" && triage.action !== "Open gallery" && "border-[#e6e9e7] bg-white text-[#3d4442]",
              )}
            >
              {triage.action}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function OrderTable({
  orders,
  staff,
  now,
  selection,
  onToggleSelect,
  onStudioChange,
}: {
  orders: Record<string, unknown>[];
  staff: AdminOrderListStaff[];
  now: Date;
  selection: Set<string>;
  onToggleSelect: (id: string) => void;
  onStudioChange: (orderId: string, studio: AdminStudioId) => void;
}) {
  return (
    <div className="overflow-x-auto" data-order-list>
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#7a8480]">
            {["Order", "Client", "Address", "Shoot date", "Package", "Status", "Total"].map((label) => (
              <th key={label} className={cn("border-b border-[#e6e9e7] bg-[#fafbfa] px-3 py-2", label === "Total" && "text-right")}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const id = String(order.id || "");
            const row = buildAdminOrderListRow(order, staff);
            const when = shootWhen(order, now);
            const parts = packageParts(row);
            const progress = deliveryProgress(order);
            const tile = buildAdminOrderTile(order);
            const address = splitAddress(row.address);
            return (
              <tr key={id} data-order-id={id} className="border-b border-[#eef1ef] last:border-0 hover:bg-[#f7faf8]">
                <td className="px-3 py-3.5 align-middle">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.orderCode}`}
                      checked={selection.has(id)}
                      onChange={() => onToggleSelect(id)}
                      className="mt-0.5 h-4 w-4 rounded border-[#c5ccc9] text-[#14a08a]"
                    />
                    <div>
                      <Link to={adminOrderDetailHref(id)} data-order-link={id} className="text-[13.5px] font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14a08a]">{row.orderCode}</Link>
                      {row.calendarHoldFailed && (
                        <div data-slot="calendar-hold" className="mt-1 max-w-[140px] text-[11px] font-semibold leading-snug text-[#3d4442]">Calendar hold failed</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <div className="flex min-w-[180px] items-center gap-2.5">
                    <Avatar name={row.clientName} />
                    <div>
                      <div className="text-[13px] font-semibold">{row.clientName}</div>
                      {orderEmail(order, row) ? <div className="text-[11.5px] text-[#7a8480]">{orderEmail(order, row)}</div> : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <div className="text-[13px] font-semibold">{address.street}</div>
                  {address.city ? <div className="text-[11.5px] text-[#7a8480]">{address.city}</div> : null}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <div className="text-[13px] font-semibold">{when.day}</div>
                  {when.time ? <div className="text-[11.5px] text-[#7a8480]">{when.time}</div> : null}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <div className="group relative inline-flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{parts[0]}</span>
                    {parts.length > 1 && (
                      <span tabIndex={0} className="rounded-full bg-[#eef1ef] px-1.5 py-0.5 text-[10.5px] font-bold text-[#3d4442]">+{parts.length - 1}</span>
                    )}
                    {parts.length > 1 && (
                      <div className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-20 hidden w-[230px] rounded-xl bg-[#1a1d1c] p-2.5 text-[12px] text-white shadow-lg group-hover:block group-focus-within:block">
                        <strong className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#9aa39f]">Package & services</strong>
                        <ul>{parts.map((part) => <li key={part} className="py-0.5 text-[#e8ecea]">{part}</li>)}</ul>
                      </div>
                    )}
                  </div>
                  {tile.studio && (
                    <select
                      aria-label={`Studio for ${row.orderCode}`}
                      value={tile.studio}
                      onChange={(event) => onStudioChange(id, event.target.value as AdminStudioId)}
                      className="mt-1 block max-w-[160px] rounded-lg border border-[#e6e9e7] bg-white px-2 py-1 text-[11px] font-semibold text-[#3d4442]"
                    >
                      {ADMIN_STUDIOS.map((studio) => <option key={studio.id} value={studio.id}>{studio.label}</option>)}
                    </select>
                  )}
                </td>
                <td className="min-w-[188px] px-3 py-3.5 align-middle">
                  <StatusStack order={order} row={row} />
                  <div className="mt-1.5 flex items-center gap-2">
                    <PhotographerMark name={row.photographer} />
                    {progress && (
                      <div className="min-w-[72px] max-w-[100px] flex-1">
                        <div className="mb-0.5 text-[10px] font-semibold text-[#7a8480]">{progress.delivered}/{progress.total} delivered</div>
                        <div className="h-[3px] overflow-hidden rounded-full bg-[#e6e9e7]">
                          <i className="block h-full rounded-full bg-[#14a08a]" style={{ width: `${Math.round((progress.delivered / progress.total) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    <NoteMark notes={row.notes} />
                  </div>
                </td>
                <td className="px-3 py-3.5 text-right align-middle">
                  <div data-slot="money" className="whitespace-nowrap text-[13.5px] font-semibold tabular-nums">{row.totalLabel}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusStack({ order, row }: { order: Record<string, unknown>; row: AdminOrderListRow }) {
  const gallery = adminOrderGalleryLabel(order);
  const payment = adminOrderPaymentLabel(order);
  return (
    <div className="flex flex-col gap-0.5">
      <StatusLine k="Order" v={row.statusLabel} dot />
      <StatusLine k="Payment" v={payment} />
      <StatusLine k="Gallery" v={gallery} />
    </div>
  );
}

function StatusLine({ k, v, dot = false }: { k: string; v: string; dot?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[58px] shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9aa39f]">{k}</span>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1a1d1c]">
        {dot ? <i className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#b4bbb8]" /> : null}
        {v}
      </span>
    </div>
  );
}

function Board({
  orders,
  staff,
  now,
  selection,
  onToggleSelect,
}: {
  orders: Record<string, unknown>[];
  staff: AdminOrderListStaff[];
  now: Date;
  selection: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const labels = orders.map((order) => adminOrderStatusLabel(order));
  const extras = [...new Set(labels.filter((label) => !ADMIN_ORDER_BOARD_COLUMNS.includes(label as typeof ADMIN_ORDER_BOARD_COLUMNS[number])))];
  const columns = [...ADMIN_ORDER_BOARD_COLUMNS, ...extras];
  return (
    <div data-testid="orders-board" className="flex gap-2 overflow-x-auto pb-4">
      {columns.map((label) => {
        const cards = orders.filter((order) => adminOrderStatusLabel(order) === label);
        return (
          <div key={label} data-board-column={label} className="w-[168px] shrink-0 rounded-[14px] bg-[#eef1ef] px-1.5 pb-2.5 pt-2">
            <div className="flex items-start gap-2 px-1.5 pb-2.5 pt-1">
              <h3 className="text-[11.5px] font-bold leading-tight">{label}</h3>
              <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#7a8480]">{cards.length}</span>
            </div>
            {cards.length === 0 ? <p className="px-2 py-4 text-center text-[11.5px] font-medium text-[#9aa39f]">None</p> : null}
            {cards.map((order) => {
              const id = String(order.id || "");
              const row = buildAdminOrderListRow(order, staff);
              const when = shootWhen(order, now);
              return (
                <article key={id} data-order-id={id} className={cn("mb-1.5 rounded-xl border bg-white px-2 py-2.5 shadow-[0_1px_2px_rgba(26,29,28,.03)]", selection.has(id) ? "border-[#14a08a]" : "border-[#e6e9e7]")}>
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <Link to={adminOrderDetailHref(id)} data-order-link={id} className="text-[12px] font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14a08a]">{row.orderCode}</Link>
                    <input type="checkbox" aria-label={`Select ${row.orderCode}`} checked={selection.has(id)} onChange={() => onToggleSelect(id)} className="h-3.5 w-3.5 rounded border-[#c5ccc9] text-[#14a08a]" />
                  </div>
                  <div className="text-[12px] font-semibold leading-snug">{row.clientName}</div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#3d4442]">{streetLine(row.address)}</div>
                  <div className="mt-1 text-[11px] text-[#7a8480]">{when.day}{when.time ? ` · ${when.time}` : ""}</div>
                  <div className="mt-1.5 text-[11px] font-medium text-[#3d4442]">{adminOrderPaymentLabel(order)} · {adminOrderGalleryLabel(order)}</div>
                  <div data-slot="money" className="mt-1 text-[12px] font-semibold tabular-nums">{row.totalLabel}</div>
                </article>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const letters = initials(name);
  return (
    <div className={cn("grid shrink-0 place-items-center rounded-[10px] text-[11px] font-bold", small ? "h-6 w-6 rounded-lg text-[9px]" : "h-[34px] w-[34px]", tone(name))}>
      {letters}
    </div>
  );
}

function PhotographerMark({ name }: { name: string }) {
  if (!name || name === "—") {
    return <div className="grid h-6 w-6 place-items-center rounded-lg border-[1.5px] border-dashed border-[#c5ccc9] text-[9px] font-bold text-[#a3aba8]" title="No photographer">?</div>;
  }
  return (
    <div title={name}>
      <Avatar name={name} small />
    </div>
  );
}

function NoteMark({ notes }: { notes: string }) {
  if (!notes) {
    return <span className="grid h-6 w-6 place-items-center text-[#c5ccc9]" aria-hidden><FileText className="h-3.5 w-3.5" /></span>;
  }
  return (
    <span className="group relative">
      <button type="button" aria-label="Order notes" className="grid h-6 w-6 place-items-center rounded-lg bg-[#eef1ef] text-[#3d4442]">
        <FileText className="h-3.5 w-3.5" />
      </button>
      <span data-notes-text role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] right-0 z-20 hidden w-[200px] rounded-xl bg-[#1a1d1c] p-2.5 text-left text-[12px] font-medium text-white shadow-lg group-hover:block group-focus-within:block">
        {notes}
      </span>
    </span>
  );
}

function EmptyOrders() {
  return (
    <div className="rounded-2xl border border-dashed border-[#e6e9e7] px-6 py-8 text-center">
      <p className="text-[12px] font-semibold text-[#7a8480]">No orders in this list</p>
    </div>
  );
}

function triageHref(id: string, order: Record<string, unknown>, action: string): string {
  if (action === "Schedule" || action === "Assign") return `${adminOrderDetailHref(id)}?desk=schedule`;
  if (action === "Open gallery") {
    const listingId = typeof order.listingId === "string" ? order.listingId.trim() : "";
    if (listingId) return `/admin/listing/${encodeURIComponent(listingId)}`;
  }
  return adminOrderDetailHref(id);
}

function sortByShoot(orders: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...orders].sort((left, right) => {
    const a = bookedShootDay(left);
    const b = bookedShootDay(right);
    if (a === b) return String(left.id || "").localeCompare(String(right.id || ""));
    if (!a) return 1;
    if (!b) return -1;
    return b.localeCompare(a);
  });
}

function sortAction(
  orders: Record<string, unknown>[],
  staff: AdminOrderListStaff[],
  editRequests: Record<string, unknown>[],
): Record<string, unknown>[] {
  const rank = { unscheduled: 0, nophoto: 1, edit: 2, review: 3 };
  return [...orders].sort((left, right) => {
    const a = orderDeskTriage(left, staff, editRequests)?.reason || "review";
    const b = orderDeskTriage(right, staff, editRequests)?.reason || "review";
    if (rank[a] !== rank[b]) return rank[a] - rank[b];
    const leftDay = bookedShootDay(left);
    const rightDay = bookedShootDay(right);
    if (leftDay === rightDay) return String(left.id || "").localeCompare(String(right.id || ""));
    if (!leftDay) return 1;
    if (!rightDay) return -1;
    return rightDay.localeCompare(leftDay);
  });
}

function packageParts(row: AdminOrderListRow): string[] {
  const fromItems = row.items.map((item) => item.name.trim()).filter(Boolean);
  if (fromItems.length > 0) return fromItems;
  if (!row.packageSummary || row.packageSummary === "—") return ["—"];
  return row.packageSummary.split(/\s+\+\s+/).filter(Boolean);
}

function splitAddress(value: string): { street: string; city: string } {
  if (!value || value === "—") return { street: "—", city: "" };
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { street: value, city: "" };
  return { street: parts[0], city: parts.slice(1).join(", ") };
}

function streetLine(value: string): string {
  return splitAddress(value).street;
}

function orderEmail(order: Record<string, unknown>, row: AdminOrderListRow): string {
  if (row.clientEmail) return row.clientEmail;
  return typeof order.clientEmail === "string" ? order.clientEmail.trim() : "";
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter((part) => part && part !== "—" && part !== "?");
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

function tone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash] || AVATAR_TONES[0];
}

function formatManualMoney(value: string | null): string | null {
  if (value == null) return null;
  if (!/^[\d$.,\s]+$/.test(value)) return value;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? formatAdminMoney(amount) : value;
}

function ghostTitle(ghost: DragGhostModel | null): OrderDeskSectionId | null {
  if (!ghost) return null;
  const match = (Object.keys(SECTION_META) as OrderDeskSectionId[]).find((id) => SECTION_META[id].title === ghost.title);
  return match || null;
}

function readDeskView(key: string): "list" | "board" {
  try {
    const value = window.localStorage.getItem(key);
    return value === "board" || value === "tile" ? "board" : "list";
  } catch {
    return "list";
  }
}
