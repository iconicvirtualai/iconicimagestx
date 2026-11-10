import * as React from "react";
import { Link } from "react-router-dom";
import { buildAdminOrderTile, ADMIN_STUDIOS, type AdminStudioId } from "@shared/adminOrderTile";
import {
  adminOrderDetailHref,
  adminOrderGalleryLabel,
  adminOrderPaymentLabel,
  adminOrderStatusLabel,
  buildAdminOrderListRow,
  type AdminOrderListRow,
  type AdminOrderListStaff,
} from "@shared/adminOrderList";
import { formatAdminMoney } from "@shared/listingPrice";
import {
  ADMIN_ORDER_BOARD_COLUMNS,
  deliveryProgress,
  orderDeskTriage,
  shootWhen,
  shownKpiValue,
  type OrderDeskFilter,
  type OrderDeskKpis,
  type OrderDeskPrefs,
  type OrderDeskSectionId,
} from "@shared/adminOrdersDesk";
import { DragGhost, type DragGhostModel } from "@/components/drag/DragGhost";
import { cn } from "@/lib/utils";
import "./ordersDesk.css";

const SECTION_META: Record<OrderDeskSectionId, { title: string; subdued: string }> = {
  action: { title: "Orders Requiring Action", subdued: "Triage queue · one-click next step" },
  active: { title: "All Orders", subdued: "Sorted by shoot date" },
  archived: { title: "Archives & Cancellations", subdued: "Archived and cancelled" },
};

const FILTERS: { id: OrderDeskFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "unscheduled", label: "Unscheduled" },
  { id: "nophoto", label: "No photographer" },
  { id: "progress", label: "In progress" },
];

const TONES = ["ch", "cb", "jm", "aq", "je", "rb", "mb", "cn", "sp", "tb"];

type KpiKey = "today" | "unscheduled" | "progress" | "revenue";

export function OrdersDeskFace({
  view,
  filter,
  query,
  clock,
  kpis,
  counts,
  openCount,
  archivedCount,
  grouped,
  deskPrefs,
  menu,
  editing,
  draft,
  selection,
  staff,
  editRequests,
  ghost,
  dropBefore,
  onQuery,
  onFilter,
  onChooseFilter,
  onView,
  onDraft,
  onOpenMenu,
  onEdit,
  onSave,
  onReset,
  onToggleSelect,
  onSelectIds,
  onStudioChange,
  visibleIds,
  onDragStart,
  onToggleCollapsed,
}: {
  view: "list" | "board";
  filter: OrderDeskFilter;
  query: string;
  clock: Date;
  kpis: OrderDeskKpis;
  counts: Record<OrderDeskFilter, number>;
  openCount: number;
  archivedCount: number;
  grouped: Record<OrderDeskSectionId, Record<string, unknown>[]>;
  deskPrefs: OrderDeskPrefs;
  menu: KpiKey | null;
  editing: boolean;
  draft: string;
  selection: Set<string>;
  staff: AdminOrderListStaff[];
  editRequests: Record<string, unknown>[];
  ghost: DragGhostModel | null;
  dropBefore: OrderDeskSectionId | "end" | null;
  onQuery: (value: string) => void;
  onFilter: (filter: OrderDeskFilter) => void;
  onChooseFilter: (filter: OrderDeskFilter) => void;
  onView: (view: "list" | "board") => void;
  onDraft: (value: string) => void;
  onOpenMenu: (key: KpiKey) => void;
  onEdit: (key: KpiKey) => void;
  onSave: (key: KpiKey) => void;
  onReset: (key: KpiKey) => void;
  onToggleSelect: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onStudioChange: (orderId: string, studio: AdminStudioId) => void;
  visibleIds: string[];
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>, id: OrderDeskSectionId) => void;
  onToggleCollapsed: (section: OrderDeskSectionId) => void;
}) {
  const cards: { key: KpiKey; filterId: OrderDeskFilter; label: string; value: string; hint: string; icon: React.ReactNode; tone: string }[] = [
    { key: "today", filterId: "today", label: "Today's shoots", value: shownKpiValue(String(kpis.todayCount), deskPrefs.kpi.today), hint: kpis.todayHint, icon: <CalendarIcon />, tone: "teal" },
    { key: "unscheduled", filterId: "unscheduled", label: "Unscheduled", value: shownKpiValue(String(kpis.unscheduledCount), deskPrefs.kpi.unscheduled), hint: "No shoot date on file", icon: <TruckIcon />, tone: "amber" },
    { key: "progress", filterId: "progress", label: "In progress", value: shownKpiValue(String(kpis.progressCount), deskPrefs.kpi.progress), hint: "Gallery / delivery status", icon: <GalleryIcon />, tone: "slate" },
    { key: "revenue", filterId: "revenue", label: "Revenue this week", value: shownKpiValue(formatAdminMoney(kpis.revenueAmount), formatManualMoney(deskPrefs.kpi.revenue)), hint: kpis.revenueHint, icon: <DollarIcon />, tone: "blue" },
  ];

  return (
    <div className="orders-desk main" data-orders-view={view} data-orders-filter={filter}>
      <DragGhost ghost={ghost} />
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <div className="sub">
            <strong>{openCount}</strong> open this period · <strong>{archivedCount}</strong> archived · week of {kpis.week.startLabel}
          </div>
        </div>
        <div className="view-toggle" role="group" aria-label="Orders view" data-testid="orders-view-toggle">
          <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => onView("list")}>
            <ListIcon /> List
          </button>
          <button type="button" className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => onView("board")}>
            <BoardIcon /> Board
          </button>
        </div>
      </div>

      <div className="kpis">
        {cards.map((card) => (
          <div key={card.key} className="kpi" data-kpi={card.key} data-manual={deskPrefs.kpi[card.key] != null ? "true" : "false"} data-kpi-popover>
            <div className="kpi-top">
              <div className={`kpi-ico ${card.tone}`}>{card.icon}</div>
              <div className="kpi-tools">
                <button type="button" className={cn("kpi-adj", menu === card.key && "is-open")} aria-label={`Adjust ${card.label}`} aria-expanded={menu === card.key} onClick={() => onOpenMenu(card.key)}>
                  <PencilIcon />
                </button>
                <span className="chev"><ChevronIcon /></span>
              </div>
            </div>
            <button type="button" className="kpi-hit" title="Click to filter the list" onClick={() => onChooseFilter(card.filterId)}>
              <div className="n">{card.value}</div>
              <div className="l">{card.label}</div>
              <div className="hint">{card.hint}</div>
            </button>
            {deskPrefs.kpi[card.key] != null && (
              <div className="manual-flag"><i className="dot" /> Manual · <button type="button" className="reset" onClick={() => onReset(card.key)}>Reset</button></div>
            )}
            {menu === card.key && (
              <div className="kpi-menu is-open">
                {editing ? (
                  <form onSubmit={(event) => { event.preventDefault(); onSave(card.key); }}>
                    <label htmlFor={`kpi-manual-${card.key}`}>Manual value</label>
                    <input id={`kpi-manual-${card.key}`} value={draft} onChange={(event) => onDraft(event.target.value)} />
                    <button type="submit">Save</button>
                  </form>
                ) : (
                  <>
                    <button type="button" onClick={() => onEdit(card.key)}>Set manual value</button>
                    <button type="button" onClick={() => onReset(card.key)}>Reset to auto</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="toolbar">
        <nav className="filters" role="tablist" aria-label="Order filters">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" role="tab" className={filter === item.id ? "active" : ""} aria-selected={filter === item.id} data-testid={`orders-filter-${item.id}`} onClick={() => onFilter(item.id)}>
              {item.label}<span className="count">{counts[item.id]}</span>
            </button>
          ))}
        </nav>
        <label className="select-all">
          <input
            type="checkbox"
            data-testid="orders-select-all"
            checked={visibleIds.length > 0 && visibleIds.every((id) => selection.has(id))}
            onChange={() => onSelectIds(visibleIds)}
          />
          Select all
        </label>
        <div className="search">
          <SearchIcon />
          <input aria-label="Search orders or clients" data-testid="orders-search" placeholder="Search orders or clients…" value={query} onChange={(event) => onQuery(event.target.value)} />
        </div>
      </div>

      {view === "board" ? (
        <Board orders={grouped.action.concat(grouped.active, grouped.archived)} staff={staff} now={clock} selection={selection} onToggleSelect={onToggleSelect} />
      ) : (
        <div className="stack">
          {deskPrefs.sectionOrder.map((section) => (
            <React.Fragment key={section}>
              {dropBefore === section && <DropSlot title={SECTION_META[sectionTitle(ghost) || section].title} />}
              <section
                data-section={section}
                data-section-drop={section}
                className={cn("block", deskPrefs.collapsed[section] && "is-collapsed", ghost?.title === SECTION_META[section].title && "is-dragging")}
              >
                <div className="block-head">
                  <button type="button" className="drag-handle" data-drag-handle aria-label={`Drag to reorder ${SECTION_META[section].title}`} title="Drag to reorder" onPointerDown={(event) => onDragStart(event, section)}>
                    <GripIcon />
                  </button>
                  <button
                    type="button"
                    className="fold"
                    aria-expanded={!deskPrefs.collapsed[section]}
                    aria-label={deskPrefs.collapsed[section] ? `Expand ${SECTION_META[section].title}` : `Collapse ${SECTION_META[section].title}`}
                    onClick={() => onToggleCollapsed(section)}
                  >
                    <FoldIcon />
                  </button>
                  <h2>{SECTION_META[section].title}</h2>
                  <span className="count-calm">{grouped[section].length}</span>
                  <span className="subdued">{section === "archived" && deskPrefs.collapsed.archived ? "Collapsed" : SECTION_META[section].subdued}</span>
                </div>
                {!deskPrefs.collapsed[section] && (
                <div className="block-body">
                  {grouped[section].length === 0 ? <div className="empty-note">No orders in this list</div> : section === "action" ? (
                    <Triage orders={grouped.action} staff={staff} now={clock} editRequests={editRequests} selection={selection} onToggleSelect={onToggleSelect} onStudioChange={onStudioChange} />
                  ) : (
                    <OrderTable orders={grouped[section]} staff={staff} now={clock} selection={selection} onToggleSelect={onToggleSelect} onStudioChange={onStudioChange} />
                  )}
                </div>
                )}
              </section>
            </React.Fragment>
          ))}
          <div data-section-drop="end">
            {dropBefore === "end" && <DropSlot title={SECTION_META[sectionTitle(ghost) || "action"].title} />}
          </div>
        </div>
      )}
    </div>
  );
}

function DropSlot({ title }: { title: string }) {
  return <div className="ghost-section-slot" data-testid="section-drop-slot">Drop {title} here</div>;
}

function Triage({
  orders, staff, now, editRequests, selection, onToggleSelect, onStudioChange,
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
    <div className="triage">
      {orders.map((order) => {
        const id = String(order.id || "");
        const row = buildAdminOrderListRow(order, staff);
        const triage = orderDeskTriage(order, staff, editRequests);
        const when = shootWhen(order, now);
        const tile = buildAdminOrderTile(order);
        if (!triage) return null;
        return (
          <div key={id} className="t-row" data-order-id={id}>
            <input className="pick" type="checkbox" aria-label={`Select ${row.orderCode}`} checked={selection.has(id)} onChange={() => onToggleSelect(id)} />
            <span className="reason">{triage.label}</span>
            <div className="t-main">
              <span>
                <Link className="oid" to={adminOrderDetailHref(id)} data-order-link={id}>{row.orderCode}</Link>
                {row.calendarHoldFailed ? <span data-slot="calendar-hold" className="subdued"> Calendar hold failed</span> : null}
              </span>
              <span className="who">{row.clientName}</span>
              <span className="where">{streetLine(row.address)}</span>
            </div>
            <div className="t-when">{when.day}{when.time ? ` · ${when.time}` : ""}</div>
            {tile.studio ? (
              <select className="studio-pick" aria-label={`Studio for ${row.orderCode}`} value={tile.studio} onChange={(event) => onStudioChange(id, event.target.value as AdminStudioId)}>
                {ADMIN_STUDIOS.map((studio) => <option key={studio.id} value={studio.id}>{studio.label}</option>)}
              </select>
            ) : null}
            <Link className={cn("btn", triage.action === "Assign" && "btn-teal", triage.action === "Open gallery" && "btn-dark")} to={triageHref(id, order, triage.action)}>
              {triage.action}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function OrderTable({
  orders, staff, now, selection, onToggleSelect, onStudioChange,
}: {
  orders: Record<string, unknown>[];
  staff: AdminOrderListStaff[];
  now: Date;
  selection: Set<string>;
  onToggleSelect: (id: string) => void;
  onStudioChange: (orderId: string, studio: AdminStudioId) => void;
}) {
  return (
    <div className="table-wrap" data-order-list>
      <table className="orders">
        <thead>
          <tr>
            {["Order", "Client", "Address", "Shoot date", "Package", "Status", "Total"].map((label) => <th key={label}>{label}</th>)}
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
              <tr key={id} data-order-id={id}>
                <td>
                  <div className="oid-line">
                    <input className="pick" type="checkbox" aria-label={`Select ${row.orderCode}`} checked={selection.has(id)} onChange={() => onToggleSelect(id)} />
                    <div>
                      <Link className="oid" to={adminOrderDetailHref(id)} data-order-link={id}>{row.orderCode}</Link>
                      {row.calendarHoldFailed ? <div data-slot="calendar-hold" className="subdued">Calendar hold failed</div> : null}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="client">
                    <div className={`av ${toneClass(row.clientName)}`}>{initials(row.clientName)}</div>
                    <div>
                      <div className="nm">{row.clientName}</div>
                      {orderEmail(order, row) ? <div className="em">{orderEmail(order, row)}</div> : null}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="addr"><div className="st">{address.street}</div>{address.city ? <div className="ct">{address.city}</div> : null}</div>
                </td>
                <td>
                  <div className="when"><div className="d">{when.day}</div>{when.time ? <div className="t">{when.time}</div> : null}</div>
                </td>
                <td>
                  <div className="pkg">
                    <span className="name">{parts[0]}</span>
                    {parts.length > 1 ? <span className="plus" tabIndex={0}>+{parts.length - 1}</span> : null}
                    {parts.length > 1 ? (
                      <div className="pkg-tip">
                        <strong>Package & services</strong>
                        <ul>{parts.map((part) => <li key={part}>{part}</li>)}</ul>
                      </div>
                    ) : null}
                  </div>
                  {tile.studio ? (
                    <select className="studio-pick" aria-label={`Studio for ${row.orderCode}`} value={tile.studio} onChange={(event) => onStudioChange(id, event.target.value as AdminStudioId)}>
                      {ADMIN_STUDIOS.map((studio) => <option key={studio.id} value={studio.id}>{studio.label}</option>)}
                    </select>
                  ) : null}
                </td>
                <td className="status-cell">
                  <div className="statii">
                    <div className="st-line"><span className="st-k">Order</span><span className="st-v"><i className="ndot" />{row.statusLabel}</span></div>
                    <div className="st-line"><span className="st-k">Payment</span><span className="st-v">{adminOrderPaymentLabel(order)}</span></div>
                    <div className="st-line"><span className="st-k">Gallery</span><span className="st-v">{adminOrderGalleryLabel(order)}</span></div>
                  </div>
                  <div className="meta-row">
                    <Photographer name={row.photographer} />
                    {progress ? (
                      <div className="prog">
                        <div className="lab">{progress.delivered}/{progress.total} delivered</div>
                        <div className="track"><i style={{ width: `${Math.round((progress.delivered / progress.total) * 100)}%` }} /></div>
                      </div>
                    ) : null}
                    <Note notes={row.notes} />
                  </div>
                </td>
                <td><div className="total" data-slot="money">{row.totalLabel}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Board({
  orders, staff, now, selection, onToggleSelect,
}: {
  orders: Record<string, unknown>[];
  staff: AdminOrderListStaff[];
  now: Date;
  selection: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const labels = orders.map((order) => adminOrderStatusLabel(order));
  const extras = [...new Set(labels.filter((label) => !(ADMIN_ORDER_BOARD_COLUMNS as readonly string[]).includes(label)))];
  const columns = [...ADMIN_ORDER_BOARD_COLUMNS, ...extras];
  return (
    <div className="board" data-testid="orders-board">
      {columns.map((label) => {
        const cards = orders.filter((order) => adminOrderStatusLabel(order) === label);
        return (
          <div key={label} className="col" data-board-column={label}>
            <div className="col-head">
              <h3>{label}</h3>
              <span className="count">{cards.length}</span>
            </div>
            {cards.length === 0 ? <div className="col-empty">None</div> : null}
            {cards.map((order) => {
              const id = String(order.id || "");
              const row = buildAdminOrderListRow(order, staff);
              const when = shootWhen(order, now);
              const address = splitAddress(row.address);
              const progress = deliveryProgress(order);
              return (
                <article key={id} className="ocard" data-order-id={id}>
                  <div className="top">
                    <Link className="oid" to={adminOrderDetailHref(id)} data-order-link={id}>{row.orderCode}</Link>
                    <input className="pick" type="checkbox" aria-label={`Select ${row.orderCode}`} checked={selection.has(id)} onChange={() => onToggleSelect(id)} />
                  </div>
                  <div className="addr">{address.street}</div>
                  {address.city ? <div className="city">{address.city}</div> : null}
                  <div className="date">{when.day}{when.time ? ` · ${when.time}` : ""}</div>
                  {row.photographer === "—" ? <div className="fact">No photographer assigned</div> : null}
                  <div className="st-quiet">
                    <div className="st-pair"><span className="st-k">Payment</span><span className="st-val">{adminOrderPaymentLabel(order)}</span></div>
                    <div className="st-pair"><span className="st-k">Gallery</span><span className="st-val">{adminOrderGalleryLabel(order)}</span></div>
                  </div>
                  <div className="foot">
                    <Photographer name={row.photographer} />
                    <div className="who">{row.clientName}</div>
                  </div>
                  {progress ? (
                    <div className="prog" style={{ marginTop: 8, maxWidth: "none" }}>
                      <div className="lab">{progress.delivered}/{progress.total} delivered</div>
                      <div className="track"><i style={{ width: `${Math.round((progress.delivered / progress.total) * 100)}%` }} /></div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Photographer({ name }: { name: string }) {
  if (!name || name === "—") return <div className="av sm un" title="No photographer">?</div>;
  return <div className={`av sm ${toneClass(name)}`} title={name}>{initials(name)}</div>;
}

function Note({ notes }: { notes: string }) {
  if (!notes) {
    return <span className="note" aria-hidden><NoteIcon /></span>;
  }
  return (
    <span className="note has">
      <button type="button" aria-label="Order notes"><NoteIcon /></button>
      <span className="note-tip" data-notes-text role="tooltip">{notes}</span>
    </span>
  );
}

function sectionTitle(ghost: DragGhostModel | null): OrderDeskSectionId | null {
  if (!ghost) return null;
  return (Object.keys(SECTION_META) as OrderDeskSectionId[]).find((id) => SECTION_META[id].title === ghost.title) || null;
}

function triageHref(id: string, order: Record<string, unknown>, action: string): string {
  if (action === "Schedule" || action === "Assign") return `${adminOrderDetailHref(id)}?desk=schedule`;
  const listingId = typeof order.listingId === "string" ? order.listingId.trim() : "";
  if (action === "Open gallery" && listingId) return `/admin/listing/${encodeURIComponent(listingId)}`;
  return adminOrderDetailHref(id);
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

function toneClass(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % TONES.length;
  return TONES[hash] || TONES[0];
}

function formatManualMoney(value: string | null): string | null {
  if (value == null) return null;
  if (!/^[\d$.,\s]+$/.test(value)) return value;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? formatAdminMoney(amount) : value;
}

function CalendarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
}
function TruckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7h11v10H3z" /><path d="M14 11h4l3 3v3h-7" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></svg>;
}
function GalleryIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>;
}
function DollarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3v18" /><path d="M17 8c0-2-2-3.5-5-3.5S7 6 7 8s2 3 5 3.5 5 1.5 5 3.5-2 3.5-5 3.5-5-1.5-5-3.5" /></svg>;
}
function PencilIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
}
function ChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>;
}
function ListIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
}
function BoardIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></svg>;
}
function GripIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6.5" r="1.4" /><circle cx="15" cy="6.5" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="17.5" r="1.4" /><circle cx="15" cy="17.5" r="1.4" /></svg>;
}
function FoldIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
}
function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function NoteIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 4h8l4 4v12H4V4h4z" /><path d="M16 4v5h5M8 13h8M8 17h5" /></svg>;
}
