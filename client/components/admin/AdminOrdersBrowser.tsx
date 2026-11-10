import * as React from "react";
import { type AdminStudioId } from "@shared/adminOrderTile";
import {
  filterAdminOrderRecords,
  type AdminOrderListStaff,
} from "@shared/adminOrderList";
import {
  bookedShootDay,
  computeOrderDeskKpis,
  DEFAULT_ORDER_DESK_PREFS,
  deskFilterCounts,
  orderDeskSection,
  orderDeskTriage,
  orderIsArchived,
  orderMatchesDeskFilter,
  parseOrderDeskPrefs,
  reorderDeskSections,
  type OrderDeskFilter,
  type OrderDeskPrefs,
  type OrderDeskSectionId,
} from "@shared/adminOrdersDesk";
import { type DragGhostModel } from "@/components/drag/DragGhost";
import { OrdersDeskFace } from "@/components/admin/ordersDeskFace";

const SECTION_META: Record<OrderDeskSectionId, { title: string; subdued: string }> = {
  action: { title: "Orders Requiring Action", subdued: "Triage queue · one-click next step" },
  active: { title: "All Orders", subdued: "Sorted by shoot date" },
  archived: { title: "Archives & Cancellations", subdued: "Archived and cancelled" },
};

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

  return (
    <OrdersDeskFace
      view={view}
      filter={filter}
      query={query}
      clock={clock}
      kpis={kpis}
      counts={counts}
      openCount={openCount}
      archivedCount={archivedCount}
      grouped={grouped}
      deskPrefs={deskPrefs}
      menu={menu}
      editing={editing !== null}
      draft={draft}
      selection={selection}
      staff={staff}
      editRequests={editRequests}
      ghost={ghost}
      dropBefore={dropBefore}
      visibleIds={visibleIds}
      onQuery={setQuery}
      onFilter={setFilter}
      onChooseFilter={chooseFilter}
      onView={chooseView}
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
      onDragStart={startDrag}
      onToggleCollapsed={(section) => updatePrefs({
        ...deskPrefs,
        collapsed: { ...deskPrefs.collapsed, [section]: !deskPrefs.collapsed[section] },
      })}
    />
  );
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

function readDeskView(key: string): "list" | "board" {
  try {
    const value = window.localStorage.getItem(key);
    return value === "board" || value === "tile" ? "board" : "list";
  } catch {
    return "list";
  }
}
