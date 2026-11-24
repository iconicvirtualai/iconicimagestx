import * as React from "react";
import { type AdminStudioId } from "@shared/adminOrderTile";
import {
  filterAdminOrderRecords,
  type AdminOrderListStaff,
} from "@shared/adminOrderList";
import {
  computeOrderDeskKpis,
  DEFAULT_ORDER_DESK_PREFS,
  deskFilterCounts,
  moveManualId,
  orderIsArchived,
  orderIsUnhandled,
  orderMatchesDeskFilter,
  ordersOnDesk,
  parseOrderDeskPrefs,
  parseOrderDeskSort,
  sortDeskOrders,
  summarizeOrderDesk,
  type OrderDeskFilter,
  type OrderDeskPrefs,
  type OrderDeskSort,
} from "@shared/adminOrdersDesk";
import { compactOrderLabel } from "@shared/orderNumber";
import { type DragGhostModel } from "@/components/drag/DragGhost";
import { OrdersDeskFace } from "@/components/admin/ordersDeskFace";

type KpiKey = "today" | "unscheduled" | "progress" | "revenue";

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
  const [rowDropBefore, setRowDropBefore] = React.useState<string | "end" | null>(null);
  const [sortMode, setSortMode] = React.useState<OrderDeskSort>(() => readSort(storageKey));
  const [manualIds, setManualIds] = React.useState<string[]>(() => readManual(storageKey));
  const [ticking, setTicking] = React.useState(() => now ?? new Date());
  const dropRef = React.useRef<string | "end" | null>(null);
  const controlled = onPrefsChange != null;
  const deskPrefs = controlled ? (prefs ?? DEFAULT_ORDER_DESK_PREFS) : localPrefs;
  const clock = now ?? ticking;

  React.useEffect(() => {
    setView(readDeskView(storageKey));
    setSortMode(readSort(storageKey));
    setManualIds(readManual(storageKey));
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

  const summary = summarizeOrderDesk(orders);
  const searched = ordersOnDesk(filterAdminOrderRecords(orders, query));
  const visible = searched.filter((order) => orderMatchesDeskFilter(order, filter, clock, staff));
  const kpis = computeOrderDeskKpis(orders, clock);
  const counts = deskFilterCounts(filterAdminOrderRecords(orders, query), clock, staff);
  const openRows = sortDeskOrders(visible.filter((order) => !orderIsArchived(order)), sortMode, manualIds);
  const archivedRows = sortDeskOrders(visible.filter((order) => orderIsArchived(order)), "newest");
  const visibleNewCount = openRows.filter(orderIsUnhandled).length;
  const visibleIds = [...openRows, ...archivedRows].map((order) => String(order.id || ""));

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

  const chooseSort = (mode: Exclude<OrderDeskSort, "custom">) => {
    setSortMode(mode);
    setManualIds([]);
    try {
      window.localStorage.setItem(sortStorageKey(storageKey), mode);
      window.localStorage.removeItem(manualStorageKey(storageKey));
    } catch {
      /* The buttons still update this view. */
    }
  };

  const startRowDrag = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originY = event.clientY;
    let active = false;
    const seed = sortMode === "custom" && manualIds.length > 0
      ? manualIds
      : openRows.map((order) => String(order.id || ""));
    const move = (pointer: PointerEvent) => {
      if (!active && Math.hypot(pointer.clientX - originX, pointer.clientY - originY) < 6) return;
      active = true;
      const hit = document.elementFromPoint(pointer.clientX, pointer.clientY);
      const zone = hit instanceof Element ? hit.closest("[data-order-drop]") : null;
      const before = zone?.getAttribute("data-order-drop") || null;
      dropRef.current = before;
      setRowDropBefore(before);
      const order = openRows.find((item) => String(item.id || "") === id);
      setGhost({
        x: pointer.clientX,
        y: pointer.clientY,
        title: order ? compactOrderLabel(order) || "Order" : "Order",
        subtitle: "Drop to reorder",
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      const before = dropRef.current;
      setGhost(null);
      setRowDropBefore(null);
      dropRef.current = null;
      if (!active || !before || before === id) return;
      const next = moveManualId(seed, id, before);
      setManualIds(next);
      setSortMode("custom");
      try {
        window.localStorage.setItem(sortStorageKey(storageKey), "custom");
        window.localStorage.setItem(manualStorageKey(storageKey), JSON.stringify(next));
      } catch {
        /* The list still keeps this order until reload. */
      }
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  };

  return (
    <OrdersDeskFace
      view={view}
      filter={filter}
      query={query}
      clock={clock}
      kpis={kpis}
      counts={counts}
      openCount={summary.openCount}
      archivedCount={summary.archivedCount}
      newCount={summary.newCount}
      visibleNewCount={visibleNewCount}
      sortMode={sortMode}
      openOrders={openRows}
      archivedOrders={archivedRows}
      boardOrders={[...openRows, ...archivedRows]}
      deskPrefs={deskPrefs}
      menu={menu}
      editing={editing !== null}
      draft={draft}
      selection={selection}
      staff={staff}
      editRequests={editRequests}
      ghost={ghost}
      rowDropBefore={rowDropBefore}
      visibleIds={visibleIds}
      onQuery={setQuery}
      onFilter={setFilter}
      onChooseFilter={chooseFilter}
      onView={chooseView}
      onSort={chooseSort}
      onDraft={setDraft}
      onOpenMenu={(key) => {
        setMenu((current) => (current === key ? null : key));
        setEditing(null);
        setDraft(deskPrefs.kpi[key] || "");
      }}
      onEdit={(key) => {
        setEditing(key);
        setDraft(deskPrefs.kpi[key] || "");
      }}
      onSave={saveManual}
      onReset={resetManual}
      onToggleSelect={onToggleSelect}
      onSelectIds={onSelectIds}
      onStudioChange={onStudioChange}
      onRowDragStart={startRowDrag}
      onToggleCollapsed={(section) => updatePrefs({
        ...deskPrefs,
        collapsed: { ...deskPrefs.collapsed, [section]: !deskPrefs.collapsed[section] },
      })}
    />
  );
}

function readDeskView(key: string): "list" | "board" {
  try {
    const value = window.localStorage.getItem(key);
    return value === "board" || value === "tile" ? "board" : "list";
  } catch {
    return "list";
  }
}

function sortStorageKey(key: string): string {
  return `${key}:sort`;
}

function manualStorageKey(key: string): string {
  return `${key}:manualOrder`;
}

function readSort(key: string): OrderDeskSort {
  try {
    return parseOrderDeskSort(window.localStorage.getItem(sortStorageKey(key)));
  } catch {
    return "newest";
  }
}

function readManual(key: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(manualStorageKey(key)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}
