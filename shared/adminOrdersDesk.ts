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
 *   adminOrderGalleryLabel is exactly "In progress".
 *   That helper reads galleryStatus, deliveryStatus, gallery.status, and
 *   gallery.galleryStatus through GALLERY_LABEL. With none of those, and
 *   no deliveredAt, it uses the tile delivery label the list already prints.
 *   Archived and cancelled orders are left out.
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

import { adminOrderGalleryLabel, adminOrderPaymentLabel, adminOrderPhotographer, adminOrderShoot, adminOrderStatusLabel, type AdminOrderListStaff } from "./adminOrderList.ts";
import { calendarDateKey, formatChicagoDate } from "./clientHome.ts";
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

export function orderIsTodayShoot(order: Record<string, unknown>, now: Date): boolean {
  if (orderIsArchived(order)) return false;
  const day = bookedShootDay(order);
  return Boolean(day) && day === chicagoDayKey(now);
}

export function orderIsUnscheduled(order: Record<string, unknown>): boolean {
  if (orderIsArchived(order)) return false;
  return !bookedShootDay(order);
}

export function orderIsThisWeek(order: Record<string, unknown>, now: Date): boolean {
  if (orderIsArchived(order)) return false;
  const day = bookedShootDay(order);
  return Boolean(day) && chicagoWeek(now).keys.includes(day as string);
}

export function orderHasNoPhotographer(order: Record<string, unknown>, staff: AdminOrderListStaff[] = []): boolean {
  if (orderIsArchived(order)) return false;
  return adminOrderPhotographer(order, staff) === "—";
}

export function orderGalleryInProgress(order: Record<string, unknown>): boolean {
  if (orderIsArchived(order)) return false;
  return adminOrderGalleryLabel(order) === "In progress";
}

export function orderPaidThisWeek(order: Record<string, unknown>, now: Date): boolean {
  return paidThisWeekAmount(order, now) != null;
}

export function computeOrderDeskKpis(
  orders: readonly Record<string, unknown>[],
  now: Date,
): OrderDeskKpis {
  const week = chicagoWeek(now);
  const todayOrders = orders.filter((order) => orderIsTodayShoot(order, now));
  const revenueOrders = orders
    .map((order) => ({ order, amount: paidThisWeekAmount(order, now) }))
    .filter((entry): entry is { order: Record<string, unknown>; amount: number } => entry.amount != null);
  const revenueAmount = revenueOrders.reduce((sum, entry) => sum + entry.amount, 0);
  return {
    todayCount: todayOrders.length,
    todayHint: todayShootsHint(todayOrders, now),
    unscheduledCount: orders.filter(orderIsUnscheduled).length,
    progressCount: orders.filter(orderGalleryInProgress).length,
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
  const open = orders.filter((order) => !orderIsArchived(order)).length;
  return {
    all: open,
    today: orders.filter((order) => orderIsTodayShoot(order, now)).length,
    week: orders.filter((order) => orderIsThisWeek(order, now)).length,
    unscheduled: orders.filter(orderIsUnscheduled).length,
    nophoto: orders.filter((order) => orderHasNoPhotographer(order, staff)).length,
    progress: orders.filter(orderGalleryInProgress).length,
    revenue: orders.filter((order) => orderPaidThisWeek(order, now)).length,
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
  if (orderIsArchived(order)) return null;
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
  if (!status) return Boolean(text(row.id) || text(row.note) || text(row.photoId));
  return !CLOSED_EDIT.has(status);
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
