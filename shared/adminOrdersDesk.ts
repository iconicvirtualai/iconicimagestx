/**
 * Orders desk: the four KPI cards, the single filter, and the three sections.
 *
 * Counts come from the order request documents already on the page.
 * This module does not read Firestore and does not send email or texts.
 *
 * Today's shoots
 *   A booked shoot day equals today in America/Chicago.
 *   The day is appointmentDate, apptDate, scheduledDate, or shootDate.
 *   requestedDate is a request, not a shoot, so it does not count.
 *   Archived and cancelled orders are left out.
 *
 * Unscheduled
 *   The same booked-shoot fields are all empty, and the order is not
 *   archived or cancelled. The card means "no shoot date on file."
 *   adminOrderUnifiedStatus can still say Unscheduled when a date exists
 *   and the status string is unrecognized. That order is not this card.
 *
 * In progress
 *   galleryStatus, deliveryStatus, gallery.status, or gallery.galleryStatus
 *   is exactly "in_progress".
 *   A scheduled or pending order with none of those fields is not in progress.
 *   The tile used to label that order "In progress", and the badge followed
 *   the tile, so every booked shoot raised the count.
 *   Archived, cancelled, playtest, and qa-only orders are left out.
 *
 * Badges
 *   Documents that share an order number, or point at each other, count once.
 *   Playtest and qa-only rows are left out of the open badges.
 *   Unscheduled means a new or unhandled request with no shoot date.
 *   A delivered order, or one already scheduled, confirmed, or in review,
 *   is not unscheduled and is not "no photographer" just because a name is blank.
 *   The new-request badge is intake only: new, request, submitted,
 *   awaiting payment, awaiting deposit, or pending confirmation.
 *
 * Revenue this week
 *   Money collected whose payment day falls in the current America/Chicago
 *   week, Monday through Sunday.
 *   Collected amount is invoice.amountPaid, then order.amountPaid.
 *   When the payment label is Paid and both of those are empty, the
 *   invoice total is used, then the order total.
 *   The payment day is invoice.paidAt, order.paidAt, invoice.paymentDate,
 *   order.paymentDate, or the latest payments[].paidAt / createdAt.
 *   A paid order with no payment timestamp is omitted. The shoot date is
 *   not used as a stand-in.
 *   Playtest and qaOnly orders are omitted.
 *   countsTowardRevenue is not required. The old card summed only invoices
 *   with that flag, which is why a week of collected payments showed $0.
 *
 * Orders Requiring Action and All Orders do not share an order.
 * Archives & Cancellations is archived or cancelled only.
 * One reason is shown, in this order: Unscheduled, No photographer assigned,
 * Open edit request, Ready for review.
 */

import { buildAdminOrderListRow, adminOrderGalleryLabel, adminOrderPaymentLabel, adminOrderPhotographer, adminOrderPlaced, adminOrderShoot, adminOrderStatusLabel, type AdminOrderListStaff } from "./adminOrderList.ts";
import { calendarDateKey, formatChicagoDate } from "./clientHome.ts";
import { compactOrderLabel } from "./orderNumber.ts";
import { isPlaytestRecord, isQaOnlyRecord } from "./revenueCount.ts";

const CHICAGO = "America/Chicago";

export const ORDER_DESK_SECTIONS = ["action", "active", "archived"] as const;
export type OrderDeskSectionId = (typeof ORDER_DESK_SECTIONS)[number];

export const ORDER_DESK_FILTERS = ["all", "today", "week", "unscheduled", "nophoto", "progress", "revenue"] as const;
export type OrderDeskFilter = (typeof ORDER_DESK_FILTERS)[number];

export const ORDER_DESK_TRIAGE = ["unscheduled", "nophoto", "edit", "review"] as const;
export type OrderDeskTriageReason = (typeof ORDER_DESK_TRIAGE)[number];

/** Pipeline order of adminOrderStatusLabel. Terminals last. */
export const ADMIN_ORDER_BOARD_COLUMNS = [
  "Unscheduled",
  "Confirmed",
  "Scheduled",
  "Pending",
  "In Review",
  "Delivered — Unpaid",
  "Delivered — Paid",
  "Cancelled",
  "Archived",
] as const;

export interface OrderDeskKpiOverrides {
  today: string | null;
  unscheduled: string | null;
  progress: string | null;
  revenue: string | null;
}

export interface OrderDeskCollapsed {
  action: boolean;
  active: boolean;
  archived: boolean;
}

export interface OrderDeskPrefs {
  kpi: OrderDeskKpiOverrides;
  sectionOrder: OrderDeskSectionId[];
  collapsed: OrderDeskCollapsed;
}

export const DEFAULT_ORDER_DESK_PREFS: OrderDeskPrefs = {
  kpi: { today: null, unscheduled: null, progress: null, revenue: null },
  sectionOrder: ["action", "active", "archived"],
  collapsed: { action: false, active: false, archived: true },
};

export interface OrderDeskWeek {
  startKey: string;
  endKey: string;
  keys: string[];
  label: string;
  startLabel: string;
}

export interface OrderDeskKpis {
  todayCount: number;
  todayHint: string;
  unscheduledCount: number;
  progressCount: number;
  revenueAmount: number;
  revenueCount: number;
  revenueHint: string;
  week: OrderDeskWeek;
}

export interface OrderDeskTriage {
  reason: OrderDeskTriageReason;
  label: string;
  action: string;
}

const CLOSED_EDIT = new Set(["done", "completed", "resolved", "closed", "cancelled", "canceled", "received_back"]);
const OPEN_EDIT = new Set(["open", "requested", "pending", "sent_out", "in_progress", "needs_edit", "pending_edit"]);
const INTAKE_STATUS = new Set(["new", "request", "submitted", "awaiting_payment", "awaiting_deposit", "pending_confirmation"]);
const WORKED_STATUS = new Set([
  "scheduled", "confirmed", "consult_scheduled", "appt_scheduled", "in_progress", "pending",
  "pending_edit", "in_review", "delivered", "delivered_paid", "paid", "complete", "completed", "done",
]);
const LINK_FIELDS = ["orderId", "convertedToOrderId", "orderRequestId", "twinOrderId", "duplicateOf", "sourceRequestId", "pairedOrderId"] as const;

export const ORDER_DESK_SORTS = ["newest", "oldest", "status", "custom"] as const;
export type OrderDeskSort = (typeof ORDER_DESK_SORTS)[number];

const FROM_MONDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function chicagoDayKey(now: Date): string {
  return calendarDateKey(now) || "";
}

export function addDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Monday–Sunday week that contains `now` in America/Chicago. */
export function chicagoWeek(now: Date): OrderDeskWeek {
  const today = chicagoDayKey(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, weekday: "short" }).format(now);
  const startKey = addDateKey(today, -(FROM_MONDAY[weekday] ?? 0));
  const keys = Array.from({ length: 7 }, (_, index) => addDateKey(startKey, index));
  const endKey = keys[6] || startKey;
  return {
    startKey,
    endKey,
    keys,
    label: weekSpanLabel(startKey, endKey),
    startLabel: formatChicagoDate(startKey, "short") || startKey,
  };
}

export function bookedShootDay(order: Record<string, unknown>): string | null {
  return calendarDateKey(order.appointmentDate ?? order.apptDate ?? order.scheduledDate ?? order.shootDate);
}

export function orderIsArchived(order: Record<string, unknown>): boolean {
  const status = adminOrderStatusLabel(order);
  return status === "Archived" || status === "Cancelled";
}

/** Playtest and qa-only rows stay out of the open badges and the open list. */
export function orderCountsOnDesk(order: Record<string, unknown>): boolean {
  return !isPlaytestRecord(order) && !isQaOnlyRecord(order);
}

export function orderIsDelivered(order: Record<string, unknown>): boolean {
  const status = normalize(order.status);
  if (status.includes("delivered")) return true;
  const gallery = explicitGalleryState(order);
  return gallery === "delivered" || gallery === "approved";
}

/**
 * One row per real order. Same document id, the same sequential order number,
 * or an id stored on orderId / convertedToOrderId / orderRequestId collapses.
 * The newest non-test copy is kept. Document ids are not rewritten.
 */
export function dedupeOrderRecords<T extends Record<string, unknown>>(orders: readonly T[]): T[] {
  const noId: T[] = [];
  const byId = new Map<string, T>();
  for (const order of orders) {
    const id = text(order.id);
    if (!id) {
      noId.push(order);
      continue;
    }
    byId.set(id, preferOrder(byId.get(id), order));
  }
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root) as string;
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const id of byId.keys()) parent.set(id, id);
  const byNumber = new Map<string, string>();
  for (const [id, order] of byId) {
    const key = sequentialKey(order);
    if (!key) continue;
    const previous = byNumber.get(key);
    if (previous) union(previous, id);
    else byNumber.set(key, id);
  }
  for (const [id, order] of byId) {
    for (const field of LINK_FIELDS) {
      const link = text(order[field]);
      if (link && link !== id && byId.has(link)) union(id, link);
    }
  }
  const groups = new Map<string, T>();
  for (const [id, order] of byId) {
    const root = find(id);
    groups.set(root, preferOrder(groups.get(root), order));
  }
  return [...groups.values(), ...noId];
}

/** Open rows plus archives, with duplicate copies removed. */
export function ordersOnDesk(orders: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return dedupeOrderRecords(orders).filter((order) => orderIsArchived(order) || orderCountsOnDesk(order));
}

export function summarizeOrderDesk(orders: readonly Record<string, unknown>[]): {
  openCount: number;
  archivedCount: number;
  newCount: number;
} {
  const rows = ordersOnDesk(orders);
  const archivedCount = rows.filter(orderIsArchived).length;
  const open = rows.filter((order) => !orderIsArchived(order));
  return { openCount: open.length, archivedCount, newCount: open.filter(orderIsUnhandled).length };
}

/** Intake that still needs a first response. Worked, delivered, and test rows do not count. */
export function orderIsUnhandled(order: Record<string, unknown>): boolean {
  if (orderIsArchived(order) || !orderCountsOnDesk(order) || orderIsDelivered(order)) return false;
  const status = normalize(order.status);
  if (INTAKE_STATUS.has(status)) return true;
  return !status && !bookedShootDay(order);
}

export function actionableOrderCount(orders: readonly Record<string, unknown>[]): number {
  return summarizeOrderDesk(orders).newCount;
}

export function orderIsTodayShoot(order: Record<string, unknown>, now: Date): boolean {
  if (orderIsArchived(order)) return false;
  const day = bookedShootDay(order);
  return Boolean(day) && day === chicagoDayKey(now);
}

export function orderIsUnscheduled(order: Record<string, unknown>): boolean {
  if (orderIsArchived(order) || !orderCountsOnDesk(order) || orderIsDelivered(order)) return false;
  if (bookedShootDay(order)) return false;
  const status = normalize(order.status);
  if (status && WORKED_STATUS.has(status)) return false;
  return true;
}

export function orderIsThisWeek(order: Record<string, unknown>, now: Date): boolean {
  if (orderIsArchived(order)) return false;
  const day = bookedShootDay(order);
  return Boolean(day) && chicagoWeek(now).keys.includes(day as string);
}

export function orderHasNoPhotographer(order: Record<string, unknown>, staff: AdminOrderListStaff[] = []): boolean {
  if (orderIsArchived(order) || !orderCountsOnDesk(order) || orderIsDelivered(order)) return false;
  if (!bookedShootDay(order)) return false;
  return adminOrderPhotographer(order, staff) === "—";
}

export function explicitGalleryState(order: Record<string, unknown>): string {
  const gallery = nested(order.gallery);
  const explicit = text(order.galleryStatus) || text(order.deliveryStatus) || text(gallery.status) || text(gallery.galleryStatus);
  return normalize(explicit);
}

export function orderGalleryInProgress(order: Record<string, unknown>): boolean {
  if (orderIsArchived(order) || !orderCountsOnDesk(order)) return false;
  return explicitGalleryState(order) === "in_progress";
}

export function orderPaidThisWeek(order: Record<string, unknown>, now: Date): boolean {
  return paidThisWeekAmount(order, now) != null;
}

export function computeOrderDeskKpis(
  orders: readonly Record<string, unknown>[],
  now: Date,
): OrderDeskKpis {
  const rows = ordersOnDesk(orders);
  const week = chicagoWeek(now);
  const todayOrders = rows.filter((order) => orderIsTodayShoot(order, now));
  const revenueOrders = rows
    .map((order) => ({ order, amount: paidThisWeekAmount(order, now) }))
    .filter((entry): entry is { order: Record<string, unknown>; amount: number } => entry.amount != null);
  const revenueAmount = revenueOrders.reduce((sum, entry) => sum + entry.amount, 0);
  return {
    todayCount: todayOrders.length,
    todayHint: todayShootsHint(todayOrders, now),
    unscheduledCount: rows.filter(orderIsUnscheduled).length,
    progressCount: rows.filter(orderGalleryInProgress).length,
    revenueAmount,
    revenueCount: revenueOrders.length,
    revenueHint: `${revenueOrders.length} ${revenueOrders.length === 1 ? "order" : "orders"} · ${week.label}`,
    week,
  };
}

export function orderMatchesDeskFilter(
  order: Record<string, unknown>,
  filter: OrderDeskFilter,
  now: Date,
  staff: AdminOrderListStaff[] = [],
): boolean {
  if (filter === "all") return true;
  if (filter === "today") return orderIsTodayShoot(order, now);
  if (filter === "week") return orderIsThisWeek(order, now);
  if (filter === "unscheduled") return orderIsUnscheduled(order);
  if (filter === "nophoto") return orderHasNoPhotographer(order, staff);
  if (filter === "progress") return orderGalleryInProgress(order);
  return orderPaidThisWeek(order, now);
}

export function deskFilterCounts(
  orders: readonly Record<string, unknown>[],
  now: Date,
  staff: AdminOrderListStaff[] = [],
): Record<OrderDeskFilter, number> {
  const rows = ordersOnDesk(orders);
  const open = rows.filter((order) => !orderIsArchived(order)).length;
  return {
    all: open,
    today: rows.filter((order) => orderIsTodayShoot(order, now)).length,
    week: rows.filter((order) => orderIsThisWeek(order, now)).length,
    unscheduled: rows.filter(orderIsUnscheduled).length,
    nophoto: rows.filter((order) => orderHasNoPhotographer(order, staff)).length,
    progress: rows.filter(orderGalleryInProgress).length,
    revenue: rows.filter((order) => orderPaidThisWeek(order, now)).length,
  };
}

/**
 * First matching reason, or null when the order belongs in All Orders
 * or Archives. Archived and cancelled orders are never triaged.
 */
export function orderDeskTriage(
  order: Record<string, unknown>,
  staff: AdminOrderListStaff[] = [],
  editRequests: readonly Record<string, unknown>[] = [],
): OrderDeskTriage | null {
  if (orderIsArchived(order) || !orderCountsOnDesk(order) || orderIsDelivered(order)) return null;
  if (orderIsUnscheduled(order)) return { reason: "unscheduled", label: "Unscheduled", action: "Schedule" };
  if (orderHasNoPhotographer(order, staff)) return { reason: "nophoto", label: "No photographer assigned", action: "Assign" };
  if (orderHasOpenEdit(order, editRequests)) return { reason: "edit", label: "Open edit request", action: "Open request" };
  if (adminOrderGalleryLabel(order) === "Ready for review") return { reason: "review", label: "Ready for review", action: "Open gallery" };
  return null;
}

export function orderDeskSection(
  order: Record<string, unknown>,
  staff: AdminOrderListStaff[] = [],
  editRequests: readonly Record<string, unknown>[] = [],
): OrderDeskSectionId {
  if (orderIsArchived(order)) return "archived";
  if (orderDeskTriage(order, staff, editRequests)) return "action";
  return "active";
}

export function orderHasOpenEdit(
  order: Record<string, unknown>,
  editRequests: readonly Record<string, unknown>[] = [],
): boolean {
  const status = normalize(order.status);
  if (status === "pending_edit") return true;
  for (const key of ["editRequestStatus", "editStatus"] as const) {
    const value = normalize(order[key]);
    if (value && OPEN_EDIT.has(value) && !CLOSED_EDIT.has(value)) return true;
  }
  for (const key of ["editRequests", "photoEditRequests"] as const) {
    if (Array.isArray(order[key]) && order[key].some((entry) => editEntryOpen(entry))) return true;
  }
  const id = text(order.id);
  const listingId = text(order.listingId);
  const orderId = text(order.orderId) || text(order.convertedToOrderId);
  return editRequests.some((edit) => {
    if (!editEntryOpen(edit)) return false;
    const links = [text(edit.orderRequestId), text(edit.orderId), text(edit.requestId)];
    if (id && links.includes(id)) return true;
    if (orderId && links.includes(orderId)) return true;
    return Boolean(listingId) && text(edit.listingId) === listingId;
  });
}

export function deliveryProgress(order: Record<string, unknown>): { delivered: number; total: number } | null {
  const gallery = nested(order.gallery);
  const images = firstArray(order.images, order.photos, gallery.images, gallery.photos);
  if (images && images.length > 0) {
    const delivered = images.filter(imageIsDelivered).length;
    return { delivered, total: images.length };
  }
  const total = firstNumber(order.photoCount, order.expectedPhotoCount, gallery.photoCount, gallery.imageCount);
  const delivered = firstNumber(order.deliveredCount, order.deliveredPhotoCount, gallery.deliveredCount);
  if (total != null && total > 0 && delivered != null && delivered >= 0) {
    return { delivered: Math.min(delivered, total), total };
  }
  return null;
}

export function shootWhen(order: Record<string, unknown>, now: Date): { day: string; time: string } {
  const booked = bookedShootDay(order);
  if (!booked) return { day: "Date TBD", time: "" };
  const formatted = formatChicagoDate(booked, "compact") || booked;
  const day = booked === chicagoDayKey(now) ? formatted.replace(/^\w+,/, "Today,") : formatted;
  const timeMatch = adminOrderShoot(order).label.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
  return { day, time: timeMatch ? timeMatch[1].toUpperCase() : "" };
}

export function reorderDeskSections(
  order: readonly OrderDeskSectionId[],
  moving: OrderDeskSectionId,
  before: OrderDeskSectionId | "end",
): OrderDeskSectionId[] {
  const rest = order.filter((id) => id !== moving);
  if (before === "end") return [...rest, moving];
  const index = rest.indexOf(before);
  if (index < 0) return [...order];
  const next = [...rest];
  next.splice(index, 0, moving);
  return next;
}

export function parseOrderDeskPrefs(value: unknown): OrderDeskPrefs {
  const row = nested(value);
  const kpi = nested(row.kpi);
  const collapsed = nested(row.collapsed);
  return {
    kpi: {
      today: manualText(kpi.today),
      unscheduled: manualText(kpi.unscheduled),
      progress: manualText(kpi.progress),
      revenue: manualText(kpi.revenue),
    },
    sectionOrder: sectionOrder(row.sectionOrder),
    collapsed: {
      action: collapsed.action === true,
      active: collapsed.active === true,
      archived: collapsed.archived !== false,
    },
  };
}

export function orderDeskPrefsFields(prefs: OrderDeskPrefs): Record<string, unknown> {
  return {
    kpi: prefs.kpi,
    sectionOrder: prefs.sectionOrder,
    collapsed: prefs.collapsed,
  };
}

export function shownKpiValue(auto: string, manual: string | null): string {
  return manual == null ? auto : manual;
}

function todayShootsHint(orders: readonly Record<string, unknown>[], now: Date): string {
  const day = formatChicagoDate(chicagoDayKey(now), "compact") || "Today";
  if (orders.length === 0) return `${day} · none on the calendar`;
  const times = orders
    .map((order) => shootWhen(order, now).time)
    .filter(Boolean)
    .sort(compareClock);
  const unique = [...new Set(times)];
  if (unique.length === 0) return day;
  const shown = unique.slice(0, 3).join(" & ");
  const extra = unique.length > 3 ? ` +${unique.length - 3}` : "";
  return `${day} · ${shown}${extra}`;
}

function paidThisWeekAmount(order: Record<string, unknown>, now: Date): number | null {
  if (isPlaytestRecord(order) || isQaOnlyRecord(order)) return null;
  const amount = collectedAmount(order);
  if (amount == null || amount <= 0) return null;
  const day = calendarDateKey(paymentStamp(order));
  if (!day || !chicagoWeek(now).keys.includes(day)) return null;
  return amount;
}

function collectedAmount(order: Record<string, unknown>): number | null {
  const invoice = nested(order.invoice);
  const paid = money(invoice.amountPaid ?? invoice.paid ?? order.amountPaid);
  if (paid != null && paid > 0) return paid;
  if (adminOrderPaymentLabel(order) !== "Paid") return null;
  const total = money(invoice.total ?? order.total ?? order.amount);
  return total != null && total > 0 ? total : null;
}

function paymentStamp(order: Record<string, unknown>): unknown {
  const invoice = nested(order.invoice);
  return invoice.paidAt
    ?? order.paidAt
    ?? invoice.paymentDate
    ?? order.paymentDate
    ?? latestPaymentStamp(invoice.payments)
    ?? latestPaymentStamp(order.payments);
}

function latestPaymentStamp(value: unknown): unknown {
  if (!Array.isArray(value)) return null;
  let best: string | null = null;
  let bestRaw: unknown = null;
  for (const entry of value) {
    const row = nested(entry);
    const raw = row.paidAt ?? row.createdAt ?? row.date;
    const key = calendarDateKey(raw);
    if (!key) continue;
    const sort = `${key}T${typeof raw === "string" ? raw : ""}`;
    if (best == null || sort > best) {
      best = sort;
      bestRaw = raw;
    }
  }
  return bestRaw;
}

function editEntryOpen(value: unknown): boolean {
  const row = nested(value);
  if (!Object.keys(row).length && typeof value !== "object") return false;
  const status = normalize(row.status);
  if (!status) return false;
  if (CLOSED_EDIT.has(status)) return false;
  return OPEN_EDIT.has(status) || status.length > 0;
}

function imageIsDelivered(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.delivered === true || row.deliveredAt) return true;
  const status = normalize(row.status || row.galleryStatus);
  return status === "delivered" || status === "approved";
}

function weekSpanLabel(startKey: string, endKey: string): string {
  const start = monthDay(startKey);
  const end = monthDay(endKey);
  if (!start || !end) return `${startKey}–${endKey}`;
  if (start.month === end.month) return `${start.month} ${start.day}–${end.day}`;
  return `${start.month} ${start.day}–${end.month} ${end.day}`;
}

function monthDay(key: string): { month: string; day: number } | null {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
    day,
  };
}

function compareClock(left: string, right: string): number {
  return clockMinutes(left) - clockMinutes(right);
}

function clockMinutes(label: string): number {
  const match = label.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return 0;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(match[2]);
}

function sectionOrder(value: unknown): OrderDeskSectionId[] {
  const next: OrderDeskSectionId[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (ORDER_DESK_SECTIONS.includes(entry as OrderDeskSectionId) && !next.includes(entry as OrderDeskSectionId)) {
        next.push(entry as OrderDeskSectionId);
      }
    }
  }
  for (const id of ORDER_DESK_SECTIONS) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

function manualText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstArray(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const amount = money(value);
    if (amount != null) return amount;
  }
  return null;
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nested(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function preferOrder<T extends Record<string, unknown>>(current: T | undefined, next: T): T {
  if (!current) return next;
  const currentTest = !orderCountsOnDesk(current);
  const nextTest = !orderCountsOnDesk(next);
  if (currentTest !== nextTest) return currentTest ? next : current;
  const currentStamp = placedMillis(current);
  const nextStamp = placedMillis(next);
  if (nextStamp !== currentStamp) return nextStamp > currentStamp ? next : current;
  return text(next.id) < text(current.id) ? next : current;
}

function placedMillis(order: Record<string, unknown>): number {
  const key = adminOrderPlaced(order).sortKey;
  if (!key) return 0;
  const time = Date.parse(key);
  return Number.isFinite(time) ? time : 0;
}

function sequentialKey(order: Record<string, unknown>): string | null {
  const value = order.orderNumber;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const hashed = trimmed.match(/^#(\d+)$/);
  const digits = hashed ? hashed[1] : (/^\d+$/.test(trimmed) ? trimmed : "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isInteger(n) || n < 1) return null;
  return String(n);
}

export function parseOrderDeskSort(value: unknown): OrderDeskSort {
  return ORDER_DESK_SORTS.includes(value as OrderDeskSort) ? value as OrderDeskSort : "newest";
}

export const ORDER_LINE_SORT_FIELDS = ["order", "agent", "address", "package", "status", "date"] as const;
export type OrderLineSortField = (typeof ORDER_LINE_SORT_FIELDS)[number];
export type OrderLineSort = { field: OrderLineSortField; order: "asc" | "desc" };

/** First click picks a useful direction. The next click on the same column flips it. */
export function cycleOrderLineSort(current: OrderLineSort | null, field: OrderLineSortField): OrderLineSort {
  if (current?.field === field) return { field, order: current.order === "asc" ? "desc" : "asc" };
  return { field, order: field === "date" || field === "order" ? "desc" : "asc" };
}

/** Column sort for the incoming-request line table. Empty values stay at the bottom. */
export function sortOrderLineItems(
  orders: readonly Record<string, unknown>[],
  sort: OrderLineSort,
  staff: AdminOrderListStaff[] = [],
): Record<string, unknown>[] {
  const direction = sort.order === "asc" ? 1 : -1;
  return [...orders].sort((left, right) => {
    const leftKey = lineSortKey(left, sort.field, staff);
    const rightKey = lineSortKey(right, sort.field, staff);
    const leftEmpty = leftKey == null;
    const rightEmpty = rightKey == null;
    if (leftEmpty || rightEmpty) {
      if (leftEmpty && rightEmpty) return text(left.id).localeCompare(text(right.id));
      return leftEmpty ? 1 : -1;
    }
    const ranked = typeof leftKey === "number" && typeof rightKey === "number"
      ? leftKey - rightKey
      : String(leftKey).localeCompare(String(rightKey), undefined, { sensitivity: "base", numeric: true });
    if (ranked !== 0) return ranked * direction;
    return text(left.id).localeCompare(text(right.id));
  });
}

function lineSortKey(
  order: Record<string, unknown>,
  field: OrderLineSortField,
  staff: AdminOrderListStaff[],
): string | number | null {
  const row = buildAdminOrderListRow(order, staff);
  if (field === "order") {
    const digits = (compactOrderLabel(order) || row.orderCode).replace(/\D/g, "");
    if (!digits) return null;
    const amount = Number(digits);
    return Number.isFinite(amount) ? amount : null;
  }
  if (field === "agent") return filled(row.clientName);
  if (field === "address") return filled(row.address);
  if (field === "package") return filled(row.packageSummary);
  if (field === "status") return filled(row.statusLabel);
  return row.shootSort || row.placedSort;
}

function filled(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && trimmed !== "—" ? trimmed : null;
}

export function sortDeskOrders(
  orders: readonly Record<string, unknown>[],
  mode: OrderDeskSort,
  manualIds: readonly string[] = [],
): Record<string, unknown>[] {
  if (mode === "custom") return applyManualOrder(orders, manualIds);
  if (mode === "status") return [...orders].sort(compareStatus);
  if (mode === "oldest") return [...orders].sort((left, right) => comparePlaced(left, right, "asc"));
  return [...orders].sort((left, right) => comparePlaced(left, right, "desc"));
}

/** Saved ids keep their order. Orders that are not saved yet stay at the top, newest first. */
export function applyManualOrder(
  orders: readonly Record<string, unknown>[],
  manualIds: readonly string[],
): Record<string, unknown>[] {
  const index = new Map(manualIds.map((id, position) => [id, position]));
  return [...orders].sort((left, right) => {
    const leftIndex = index.has(text(left.id)) ? index.get(text(left.id)) as number : -1;
    const rightIndex = index.has(text(right.id)) ? index.get(text(right.id)) as number : -1;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return comparePlaced(left, right, "desc");
  });
}

export function moveManualId(ids: readonly string[], moving: string, before: string | "end"): string[] {
  const known = ids.includes(moving) ? [...ids] : [moving, ...ids];
  const rest = known.filter((id) => id !== moving);
  if (before === "end" || before === moving) return [...rest, moving];
  const index = rest.indexOf(before);
  if (index < 0) return [moving, ...rest];
  rest.splice(index, 0, moving);
  return rest;
}

function comparePlaced(left: Record<string, unknown>, right: Record<string, unknown>, direction: "asc" | "desc"): number {
  const leftKey = adminOrderPlaced(left).sortKey || "";
  const rightKey = adminOrderPlaced(right).sortKey || "";
  if (!leftKey && !rightKey) return text(left.id).localeCompare(text(right.id));
  if (!leftKey) return 1;
  if (!rightKey) return -1;
  if (leftKey !== rightKey) {
    const ranked = leftKey < rightKey ? -1 : 1;
    return direction === "asc" ? ranked : -ranked;
  }
  return text(left.id).localeCompare(text(right.id));
}

function compareStatus(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftLabel = adminOrderStatusLabel(left);
  const rightLabel = adminOrderStatusLabel(right);
  const leftRank = ADMIN_ORDER_BOARD_COLUMNS.indexOf(leftLabel as (typeof ADMIN_ORDER_BOARD_COLUMNS)[number]);
  const rightRank = ADMIN_ORDER_BOARD_COLUMNS.indexOf(rightLabel as (typeof ADMIN_ORDER_BOARD_COLUMNS)[number]);
  const leftOrder = leftRank < 0 ? ADMIN_ORDER_BOARD_COLUMNS.length : leftRank;
  const rightOrder = rightRank < 0 ? ADMIN_ORDER_BOARD_COLUMNS.length : rightRank;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return comparePlaced(left, right, "desc");
}
