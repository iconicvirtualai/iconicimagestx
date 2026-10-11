/**
 * Admin orders list rows.
 * Reads fields already on the order list. Does not write and does not fetch.
 * Totals go through resolveListingPriceLabel, the same fallback the listings
 * grid uses (tile price, then stored totals, invoice, then catalog).
 */

import { recordAddressText } from "./addressText.ts";
import { calendarDateKey, clockTime, formatChicagoDate } from "./clientHome.ts";
import { buildAdminOrderTile } from "./adminOrderTile.ts";
import { LISTING_PRICE_MISSING, resolveListingPriceLabel } from "./listingPrice.ts";
import { cleanPackageName, orderServiceLines } from "./orderPackageLines.ts";

const CHICAGO = "America/Chicago";

export type AdminOrdersViewMode = "tile" | "list";

export type AdminOrderListSortField =
  | "orderCode"
  | "client"
  | "address"
  | "shoot"
  | "package"
  | "photographer"
  | "status"
  | "payment"
  | "total"
  | "delivery";

export type AdminOrderListSortOrder = "asc" | "desc";

export interface AdminOrderListSort {
  field: AdminOrderListSortField;
  order: AdminOrderListSortOrder;
}

/** Shoot date, newest first. Tile sections keep their own placed-date sort. */
export const DEFAULT_ADMIN_ORDER_LIST_SORT: AdminOrderListSort = {
  field: "shoot",
  order: "desc",
};

export interface AdminOrderListColumn {
  id: AdminOrderListSortField;
  label: string;
  kind: "text" | "date" | "number";
}

export const ADMIN_ORDER_LIST_COLUMNS: readonly AdminOrderListColumn[] = [
  { id: "orderCode", label: "Order #", kind: "text" },
  { id: "client", label: "Client name", kind: "text" },
  { id: "address", label: "Property address", kind: "text" },
  { id: "shoot", label: "Shoot date & time", kind: "date" },
  { id: "package", label: "Package / services", kind: "text" },
  { id: "photographer", label: "Photographer", kind: "text" },
  { id: "status", label: "Order status", kind: "text" },
  { id: "payment", label: "Payment status", kind: "text" },
  { id: "total", label: "Total", kind: "number" },
  { id: "delivery", label: "Gallery / delivery status", kind: "text" },
];

export interface AdminOrderListStaff {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface AdminOrderListRow {
  id: string;
  href: string;
  orderCode: string;
  clientName: string;
  address: string;
  shootLabel: string;
  shootSort: string | null;
  packageSummary: string;
  photographer: string;
  statusLabel: string;
  paymentLabel: string;
  totalLabel: string;
  totalSort: number | null;
  deliveryLabel: string;
}

/**
 * Fields the order list payload does not carry.
 * The list shows — for these instead of issuing another read.
 */
export const ADMIN_ORDER_LIST_GAPS = [
  "Payment is Paid, Unpaid, or No invoice when order.invoice is on the row. An invoiceId with no invoice object shows — because paid or unpaid is not on the list payload.",
  "Photographer uses an assigned name on the order, or a provider id matched to staff already loaded for this page. photographerPreference is not an assignment. An id that is not in that staff list shows —.",
  "Gallery / delivery reads galleryStatus, deliveryStatus, gallery.status, or deliveredAt on the order. Gallery documents are not joined. When those fields are missing, the column uses the same delivery label as the order tile.",
] as const;

const STATUS_LABEL: Record<string, string> = {
  archived: "Archived",
  cancelled: "Cancelled",
  delivered_paid: "Delivered — Paid",
  delivered_unpaid: "Delivered — Unpaid",
  in_review: "In Review",
  pending: "Pending",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  unscheduled: "Unscheduled",
};

const GALLERY_LABEL: Record<string, string> = {
  delivered: "Delivered",
  approved: "Delivered",
  in_progress: "In progress",
  not_delivered: "Not delivered",
  undelivered: "Not delivered",
  ready_for_review: "Ready for review",
  editing: "Editing",
  pending: "Pending",
  pending_upload: "Pending upload",
};

export function adminOrdersViewStorageKey(
  identity: { uid?: string | null; email?: string | null } | null | undefined,
): string {
  const uid = identity?.uid?.trim();
  if (uid) return `adminOrdersView:${uid}`;
  const email = identity?.email?.trim().toLowerCase();
  if (email) return `adminOrdersView:${email}`;
  return "adminOrdersView:anonymous";
}

export function parseAdminOrdersView(value: string | null | undefined): AdminOrdersViewMode {
  return value === "list" ? "list" : "tile";
}

export function readAdminOrdersView(storage: Pick<Storage, "getItem">, key: string): AdminOrdersViewMode {
  try {
    return parseAdminOrdersView(storage.getItem(key));
  } catch {
    return "tile";
  }
}

export function writeAdminOrdersView(
  storage: Pick<Storage, "setItem">,
  key: string,
  view: AdminOrdersViewMode,
): void {
  try {
    storage.setItem(key, view);
  } catch {
    /* Ignore private-mode storage failures. The toggle still updates this view. */
  }
}

/** Same status buckets the orders page already uses to split the three sections. */
export function adminOrderUnifiedStatus(order: Record<string, unknown>): string {
  const status = typeof order.status === "string" ? order.status.toLowerCase().replace(/\s+/g, "_") : "";
  if (status === "archived") return "archived";
  if (status === "cancelled") return "cancelled";

  const invoice = order.invoice && typeof order.invoice === "object" ? order.invoice as Record<string, unknown> : {};
  const paid = Number(invoice.amountPaid) > 0 || invoice.status === "paid" || status === "paid" || status === "delivered_paid";
  if (paid && (status.includes("delivered") || status === "paid")) return "delivered_paid";
  if (status.includes("delivered")) return "delivered_unpaid";
  if (status === "in_review") return "in_review";
  if (status === "pending" || status === "pending_edit" || status === "in_progress") return "pending";
  if (status === "confirmed") return "confirmed";
  if (status === "scheduled" || status === "appt_scheduled" || status === "consult_scheduled") return "scheduled";
  return "unscheduled";
}

export function adminOrderQueue(order: Record<string, unknown>): "action" | "active" | "archived" {
  const status = adminOrderUnifiedStatus(order);
  if (status === "archived" || status === "cancelled") return "archived";
  if (status === "unscheduled") return "action";
  return "active";
}

export function adminOrderStatusLabel(order: Record<string, unknown>): string {
  const key = adminOrderUnifiedStatus(order);
  return STATUS_LABEL[key] || humanize(key);
}

export function adminOrderDetailHref(id: string): string {
  return `/admin/orders/${encodeURIComponent(id)}`;
}

export function adminOrderTotalLabel(record: Record<string, unknown>): string {
  return resolveListingPriceLabel({ listing: record });
}

/** Numeric reading of the label resolveListingPriceLabel already produced. */
export function adminOrderTotalSortValue(label: string): number | null {
  if (!label || label === LISTING_PRICE_MISSING) return null;
  const match = label.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

export function adminOrderPaymentLabel(record: Record<string, unknown>): "Paid" | "Unpaid" | "No invoice" | "—" {
  const invoice = nestedRecord(record.invoice);
  const invoiceId = text(record.invoiceId);
  if (!invoice && !invoiceId) return "No invoice";
  if (!invoice) return "—";
  return invoiceIsPaid(invoice) ? "Paid" : "Unpaid";
}

export function adminOrderPhotographer(
  record: Record<string, unknown>,
  staff: AdminOrderListStaff[] = [],
): string {
  const direct = text(record.assignedPhotographerName) || text(record.photographerName);
  if (direct) return direct;
  const assigned = providerEntries(record).filter((provider) => !provider.role || /photo/i.test(provider.role));
  const names = assigned
    .map((provider) => provider.name || staffNameById(staff, provider.id))
    .filter(Boolean);
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique.join(", ") : "—";
}

export function adminOrderGalleryLabel(record: Record<string, unknown>): string {
  const gallery = nestedRecord(record.gallery);
  const explicit = text(record.galleryStatus) || text(record.deliveryStatus) || text(gallery?.status) || text(gallery?.galleryStatus);
  if (explicit) return GALLERY_LABEL[normalize(explicit)] || humanize(explicit);
  if (record.deliveredAt || record.galleryDeliveredAt || gallery?.deliveredAt) return "Delivered";
  return buildAdminOrderTile(record).deliveryLabel;
}

export function adminOrderPackageSummary(record: Record<string, unknown>): string {
  const packageName = buildAdminOrderTile(record).packageName || "—";
  const extras: string[] = [];
  const seen = new Set<string>([packageName.toLowerCase()]);
  const add = (value: string) => {
    const clean = cleanPackageName(value).trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    extras.push(clean);
  };
  for (const line of orderServiceLines(record)) add(line.name);
  for (const value of stringList(record.selectedAddOns)) add(value);
  for (const value of stringList(record.addOns)) add(value);
  if (extras.length === 0) return packageName;
  return `${packageName} + ${extras.join(", ")}`;
}

export function adminOrderShoot(record: Record<string, unknown>): { label: string; sortKey: string | null } {
  const raw = record.appointmentDate ?? record.apptDate ?? record.scheduledDate ?? record.shootDate ?? record.requestedDate;
  const day = calendarDateKey(raw);
  const timeRaw = record.scheduledTime ?? record.appointmentTime ?? record.apptTime ?? record.requestedTime;
  let hhmm = clockTime(timeRaw);
  let timeLabel = hhmm ? formatClockLabel(hhmm) : "";
  if (!hhmm && isTimedInstant(raw)) {
    const date = coerceDate(raw);
    if (date) {
      hhmm = chicagoHourMinute(date);
      timeLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: CHICAGO,
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    }
  }
  if (!day && !timeLabel) return { label: "—", sortKey: null };
  const dateLabel = day ? formatChicagoDate(raw, "short") || "" : "";
  const label = [dateLabel, timeLabel].filter(Boolean).join(", ") || "—";
  return { label, sortKey: day ? `${day}T${hhmm || "00:00"}` : null };
}

export function buildAdminOrderListRow(
  record: Record<string, unknown>,
  staff: AdminOrderListStaff[] = [],
): AdminOrderListRow {
  const tile = buildAdminOrderTile(record);
  const id = text(record.id) || tile.id;
  const shoot = adminOrderShoot(record);
  const totalLabel = adminOrderTotalLabel(record);
  const named = tile.clientName !== "—" ? tile.clientName : text(record.name);
  return {
    id,
    href: adminOrderDetailHref(id),
    orderCode: tile.orderCode,
    clientName: named || "—",
    address: recordAddressText(record) || "—",
    shootLabel: shoot.label,
    shootSort: shoot.sortKey,
    packageSummary: adminOrderPackageSummary(record),
    photographer: adminOrderPhotographer(record, staff),
    statusLabel: adminOrderStatusLabel(record),
    paymentLabel: adminOrderPaymentLabel(record),
    totalLabel,
    totalSort: adminOrderTotalSortValue(totalLabel),
    deliveryLabel: adminOrderGalleryLabel(record),
  };
}

export function cycleAdminOrderListSort(
  current: AdminOrderListSort,
  field: AdminOrderListSortField,
): AdminOrderListSort {
  if (current.field === field) {
    return { field, order: current.order === "asc" ? "desc" : "asc" };
  }
  const kind = ADMIN_ORDER_LIST_COLUMNS.find((column) => column.id === field)?.kind;
  return { field, order: kind === "text" ? "asc" : "desc" };
}

export function sortAdminOrderRows(
  rows: AdminOrderListRow[],
  field: AdminOrderListSortField,
  order: AdminOrderListSortOrder,
): AdminOrderListRow[] {
  const direction = order === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const ranked = compareRows(left, right, field, direction);
    if (ranked !== 0) return ranked;
    return left.orderCode.localeCompare(right.orderCode, undefined, { sensitivity: "base" });
  });
}

export function filterAdminOrderRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((order) => adminOrderSearchText(order).includes(needle));
}

export function adminOrderSearchText(order: Record<string, unknown>): string {
  const tile = buildAdminOrderTile(order);
  const name = text(order.clientName)
    || text(order.customerName)
    || text(order.name)
    || [text(order.firstName), text(order.lastName)].filter(Boolean).join(" ");
  const id = order.id == null ? "" : String(order.id);
  return [name || "—", recordAddressText(order) || "—", id, tile.packageName, tile.skinLabel, tile.orderCode, tile.clientName, tile.channel]
    .join(" ")
    .toLowerCase();
}

export function sampleAdminOrderStaff(): AdminOrderListStaff[] {
  return [{ id: "staff-riley", name: "Sample Photographer Riley Moss" }];
}

/** Clearly fake orders for tests and the local preview. Not client data. */
export function sampleAdminOrderRecords(): Record<string, unknown>[] {
  return [
    {
      id: "fixture-maple",
      orderCode: "ORD - L - 10482",
      projectType: "real_estate",
      serviceIds: ["listing-showcase"],
      lineItems: [
        { name: "The Showcase", price: 549 },
        { name: "Twilight photos", price: 75 },
      ],
      selectedAddOns: ["Twilight photos"],
      status: "scheduled",
      invoice: { status: "paid", amountPaid: 624, total: 624 },
      clientName: "Sample Client Avery North",
      appointmentDate: "2026-04-12",
      appointmentTime: "10:30 AM",
      address: "100 Sample Maple Lane, Conroe, TX 77301",
      assignedPhotographerName: "Sample Photographer Jordan Hale",
      galleryStatus: "editing",
      total: 624,
      createdAt: stamp("2026-04-02T15:00:00Z"),
    },
    {
      id: "fixture-oak",
      orderCode: "ORD - B - 22017",
      projectType: "business",
      status: "consult_scheduled",
      clientName: "Sample Client Blair Quinn",
      services: ["Consult"],
      lineItems: [{ name: "Consult", price: 0, amount: 350 }],
      total: 0,
      invoice: { status: "sent", amountPaid: 0, total: 350 },
      appointmentDate: "2026-06-02",
      appointmentTime: "3:00 PM",
      address: "200 Sample Oak Court, Spring, TX 77380",
      createdAt: stamp("2026-03-01T15:00:00Z"),
    },
    {
      id: "fixture-pine",
      orderCode: "ORD - L - 33018",
      projectType: "real_estate",
      status: "confirmed",
      clientName: "Sample Client Casey Drew",
      selectedService: "Hollywood",
      services: ["Hollywood"],
      total: 0,
      appointmentDate: "2026-02-20",
      appointmentTime: "9:00 AM",
      address: "300 Sample Pine Road, The Woodlands, TX 77381",
      assignedProviders: [{ providerId: "staff-riley", role: "photographer" }],
      createdAt: stamp("2026-02-01T15:00:00Z"),
    },
    {
      id: "fixture-cedar",
      orderCode: "ORD - L - 44019",
      projectType: "real_estate",
      serviceIds: ["listing-essentials"],
      status: "confirmed",
      clientName: "Sample Client Drew Ellis",
      invoice: { status: "paid", amountPaid: 249, total: 249 },
      appointmentDate: "2026-05-01",
      appointmentTime: "1:15 PM",
      address: "400 Sample Cedar Street, Houston, TX 77002",
      assignedProviders: [{ name: "Sample Photographer Alex Kim", role: "photographer" }],
      galleryStatus: "delivered",
      total: 249,
      createdAt: stamp("2026-05-02T15:00:00Z"),
    },
    {
      id: "fixture-birch",
      orderCode: "ORD - L - 55020",
      projectType: "real_estate",
      status: "request",
      clientName: "Sample Client Quinn Blake",
      selectedService: "Sample walkthrough",
      services: ["Sample walkthrough"],
      address: "500 Sample Birch Avenue, Katy, TX 77494",
      createdAt: stamp("2026-01-15T15:00:00Z"),
    },
    {
      id: "fixture-elm",
      orderCode: "ORD - L - 66021",
      projectType: "real_estate",
      serviceIds: ["listing-legacy"],
      status: "archived",
      clientName: "Sample Client Eden Frost",
      invoice: { status: "paid", amountPaid: 899, total: 899 },
      appointmentDate: "2026-01-08",
      appointmentTime: "11:00 AM",
      address: "600 Sample Elm Drive, Cypress, TX 77429",
      assignedPhotographerName: "Sample Photographer Jordan Hale",
      galleryStatus: "delivered",
      total: 899,
      createdAt: stamp("2026-01-04T15:00:00Z"),
    },
  ];
}

function compareRows(
  left: AdminOrderListRow,
  right: AdminOrderListRow,
  field: AdminOrderListSortField,
  direction: number,
): number {
  if (field === "shoot") return compareMissingLast(left.shootSort, right.shootSort, direction);
  if (field === "total") return compareMissingLast(left.totalSort, right.totalSort, direction);
  const ranked = textValue(left, field).localeCompare(textValue(right, field), undefined, { sensitivity: "base" });
  return ranked * direction;
}

function compareMissingLast(left: string | number | null, right: string | number | null, direction: number): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (left < right) return -1 * direction;
  if (left > right) return 1 * direction;
  return 0;
}

function textValue(row: AdminOrderListRow, field: AdminOrderListSortField): string {
  switch (field) {
    case "orderCode":
      return row.orderCode;
    case "client":
      return row.clientName;
    case "address":
      return row.address;
    case "package":
      return row.packageSummary;
    case "photographer":
      return row.photographer;
    case "status":
      return row.statusLabel;
    case "payment":
      return row.paymentLabel;
    case "delivery":
      return row.deliveryLabel;
    default:
      return "";
  }
}

function invoiceIsPaid(invoice: Record<string, unknown>): boolean {
  const status = normalize(invoice.status);
  if (status === "paid" || status === "paid_in_full" || status === "succeeded") return true;
  const total = money(invoice.total);
  const paid = money(invoice.amountPaid ?? invoice.paid);
  if (total != null && total > 0 && paid != null && paid + 0.009 >= total) return true;
  return false;
}

function providerEntries(record: Record<string, unknown>): { id: string; name: string; role: string }[] {
  if (!Array.isArray(record.assignedProviders)) return [];
  return record.assignedProviders.map((entry) => {
    if (typeof entry === "string") return { id: entry.trim(), name: "", role: "" };
    if (!entry || typeof entry !== "object") return { id: "", name: "", role: "" };
    const row = entry as Record<string, unknown>;
    return {
      id: text(row.providerId) || text(row.id) || text(row.staffId) || text(row.uid),
      name: text(row.name) || text(row.providerName) || text(row.photographerName),
      role: text(row.role),
    };
  });
}

function staffNameById(staff: AdminOrderListStaff[], id: string): string {
  if (!id) return "";
  const match = staff.find((person) => person.id === id);
  if (!match) return "";
  return text(match.name) || [text(match.firstName), text(match.lastName)].filter(Boolean).join(" ");
}

function formatClockLabel(hhmm: string): string {
  const [hourRaw, minuteRaw] = hhmm.split(":");
  const hours = Number(hourRaw);
  const minutes = Number(minuteRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function chicagoHourMinute(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const normalizedHour = hour === "24" ? "00" : hour;
  return `${normalizedHour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function isTimedInstant(value: unknown): boolean {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const date = coerceDate(value);
  if (!date) return false;
  return !(
    date.getUTCHours() === 0
    && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0
    && date.getUTCMilliseconds() === 0
  );
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { seconds?: unknown; _seconds?: unknown; toDate?: () => Date };
  if (typeof record.toDate === "function") {
    const date = record.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  const seconds = typeof record.seconds === "number"
    ? record.seconds
    : typeof record._seconds === "number"
      ? record._seconds
      : null;
  if (seconds == null) return null;
  return new Date(seconds * 1000);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter(Boolean);
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function humanize(value: string): string {
  const key = normalize(value);
  if (!key) return "—";
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stamp(iso: string): { toDate: () => Date; seconds: number } {
  const date = new Date(iso);
  return { toDate: () => date, seconds: Math.floor(date.getTime() / 1000) };
}
