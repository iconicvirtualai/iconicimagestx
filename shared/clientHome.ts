/**
 * Client home dashboard data.
 * Reads stored listings, invoices, and appointments. Does not price,
 * collect payment, or change a booking.
 */

import { brandedInvoicePdf, brandedInvoicePdfFilename, type BrandedInvoicePdfInput } from "./brandedInvoicePdf.ts";
import { iconicBusinessFooterLines } from "./iconicBusiness.ts";
import { invoiceFaceFromStored } from "./invoiceFace.ts";
import { presentInvoiceNumber } from "./orderProjectInvoice.ts";
import { addressText } from "./addressText.ts";
import {
  formatShootDateLabel,
  listingCardAddress,
  listingCardAmenities,
  resolveListingCardLook,
  type ListingCardLook,
} from "./listingCard.ts";

export { addressText };

const CHICAGO = "America/Chicago";

const SUBMITTED = new Set([
  "requested",
  "request",
  "new",
  "pending",
  "reviewed",
  "needs_scheduled",
  "unscheduled",
]);

const ACCEPTED = new Set([
  "confirmed",
  "scheduled",
  "accepted",
  "in_progress",
  "completed",
  "shot_complete",
  "appt_scheduled",
  "consult_scheduled",
  "delivered",
]);

const INACTIVE = new Set([
  "cancelled",
  "canceled",
  "declined",
  "archived",
  "no_show",
]);

export type AppointmentTone =
  | "past"
  | "submitted"
  | "accepted"
  | "change"
  | "inactive"
  | "unknown"
  | "undated";

export interface ClientListingCard {
  id: string;
  address: string;
  status: string;
  projectType: "" | "real_estate" | "business";
  imageCount: number;
  coverUrl: string | null;
  createdAt: string | null;
  appointmentDate: string | null;
  href: string;
  /** Package look. Null keeps the plain project tile. */
  look: ListingCardLook | null;
  street: string;
  locality: string;
  /** Shoot day printed MM.DD.YYYY. Empty when no date is stored. */
  shootDateLabel: string;
  beds: string;
  baths: string;
  garage: string;
  pool: string;
}

export interface ClientInvoiceLine {
  name: string;
  qty: number | null;
  amount: number | null;
  id?: string;
  category?: string;
  description?: string;
}

export interface ClientInvoiceStatement {
  id: string;
  invoiceNumber: string;
  status: string;
  clientName: string;
  address: string;
  createdAt: string | null;
  issuedOn: string | null;
  lineItems: ClientInvoiceLine[];
  subtotal: number | null;
  /** Null when the invoice has no stored processing amount. */
  processing: number | null;
  fees: number | null;
  travel: number | null;
  promoDiscount: number | null;
  promoCode: string;
  tax: number | null;
  total: number | null;
  amountPaid: number | null;
  amountDue: number | null;
}

export interface ClientAppointment {
  id: string;
  address: string;
  status: string;
  date: string | null;
  time: string;
  requestedDate: string | null;
  requestedTime: string;
  approved: boolean;
  createdAt: string | null;
}

export function statusKey(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function humanStatus(value: unknown): string {
  const key = statusKey(value);
  if (!key) return "";
  return key.replace(/_/g, " ");
}

/** Calendar day in America/Chicago. Date-only strings stay on that day. */
export function calendarDateKey(value: unknown, timeZone = CHICAGO): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return instantDateKey(new Date(value), timeZone);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : instantDateKey(value, timeZone);
  if (typeof value === "object") {
    const record = value as { seconds?: unknown; _seconds?: unknown };
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : null;
    if (seconds == null) return null;
    return instantDateKey(new Date(seconds * 1000), timeZone);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const textual = textualDateKey(trimmed);
  if (textual) return textual;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return instantDateKey(parsed, timeZone);
}

export function formatPortalDate(value: unknown): string | null {
  const key = calendarDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function clockTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^tbd$/i.test(trimmed)) return null;
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (!meridiem && hours > 23) return null;
  if (meridiem && hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function storedAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return roundMoney(parsed);
  }
  return null;
}

export function usd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function listingCoverUrl(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const record = image as { url?: unknown; thumbnailUrl?: unknown };
    const candidate = typeof record.url === "string" ? record.url : record.thumbnailUrl;
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) return candidate.trim();
  }
  return null;
}

export function sortNewestFirst<T extends { createdAt?: string | null; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    const aOk = Number.isFinite(aTime);
    const bOk = Number.isFinite(bTime);
    if (aOk && bOk && aTime !== bTime) return bTime - aTime;
    if (aOk !== bOk) return aOk ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

/** Bean's listing file. No tab query; the listing page chooses its own default. */
export function clientListingPath(listingId: string): string {
  return `/portal/listings/${encodeURIComponent(listingId.trim())}`;
}

export function buildClientListing(id: string, data: Record<string, unknown>): ClientListingCard {
  const images = data.images;
  const projectType = data.projectType === "business" || data.projectType === "real_estate" ? data.projectType : "";
  const status = typeof data.status === "string" && data.status.trim() ? data.status.trim() : "scheduled";
  const appointmentDate = calendarDateKey(data.shootDate || data.apptDate || data.appointmentDate || data.scheduledDate);
  const addressParts = listingCardAddress(data);
  const amenities = listingCardAmenities(data);
  return {
    id,
    address: addressText(data.propertyAddress || data.address || data.shootLocation) || "Listing",
    status,
    projectType,
    imageCount: Array.isArray(images) ? images.length : 0,
    coverUrl: listingCoverUrl(images),
    createdAt: isoStamp(data.createdAt),
    appointmentDate,
    href: clientListingPath(id),
    look: resolveListingCardLook(data),
    street: addressParts.street,
    locality: addressParts.locality,
    shootDateLabel: formatShootDateLabel(appointmentDate, data.shootDate),
    beds: amenities.beds,
    baths: amenities.baths,
    garage: amenities.garage,
    pool: amenities.pool,
  };
}

export function buildClientInvoice(id: string, data: Record<string, unknown>, now = new Date()): ClientInvoiceStatement {
  const createdAt = isoStamp(data.createdAt);
  const issuedAt = createdAt ? new Date(createdAt) : now;
  return {
    id,
    invoiceNumber: presentInvoiceNumber(data.invoiceNumber, id, Number.isNaN(issuedAt.getTime()) ? now : issuedAt),
    status: typeof data.status === "string" && data.status.trim() ? data.status.trim() : "",
    clientName: text(data.clientName),
    address: addressText(data.billToAddress || data.address || data.propertyAddress),
    createdAt,
    issuedOn: formatPortalDate(data.createdAt) || formatPortalDate(data.sentAt) || formatPortalDate(data.paidAt),
    lineItems: storedLines(data.lineItems, data.services),
    subtotal: storedAmount(data.subtotal),
    processing: storedAmount(data.processing),
    fees: storedAmount(data.fees),
    travel: storedAmount(data.travel),
    promoDiscount: storedAmount(data.promoDiscount),
    promoCode: text(data.promoCode),
    tax: storedAmount(data.tax),
    total: storedAmount(data.total),
    amountPaid: storedAmount(data.amountPaid),
    amountDue: storedAmount(data.amountDue),
  };
}

/**
 * Appointment fields the calendar can color.
 * A different accepted time is orange only when the stored ask and the
 * stored acceptance disagree and no approval stamp is on file.
 */
export function buildClientAppointment(
  id: string,
  data: Record<string, unknown>,
  orderRequest?: Record<string, unknown> | null,
): ClientAppointment {
  const scheduledDate = firstDate(data.scheduledDate, data.appointmentDate);
  const scheduledTime = firstTime(data.scheduledTime, data.appointmentTime, data.apptTime);
  let requestedDate = firstDate(data.requestedDate, data.originalScheduledDate, data.originalDate, orderRequest?.requestedDate, orderRequest?.originalScheduledDate);
  let requestedTime = firstTime(data.requestedTime, data.originalScheduledTime, data.originalTime, orderRequest?.requestedTime, orderRequest?.originalScheduledTime);

  const requestScheduledDate = firstDate(orderRequest?.scheduledDate, orderRequest?.appointmentDate);
  const requestScheduledTime = firstTime(orderRequest?.scheduledTime, orderRequest?.appointmentTime);
  if (!requestedDate && requestScheduledDate && scheduledDate && requestScheduledDate !== scheduledDate) {
    requestedDate = requestScheduledDate;
  }
  if (!requestedTime && requestScheduledTime && scheduledTime && clockTime(requestScheduledTime) !== clockTime(scheduledTime)) {
    requestedTime = requestScheduledTime;
  }

  const proposedDate = firstDate(data.proposedDate, data.alternateDate, data.counterDate);
  const proposedTime = firstTime(data.proposedTime, data.alternateTime, data.counterTime);
  const status = typeof data.status === "string" ? data.status.trim() : "";
  const iconicAccepted = ACCEPTED.has(statusKey(status)) || statusKey(status) === "pending_confirmation" || statusKey(status) === "rescheduled";

  let date = scheduledDate;
  let time = scheduledTime;
  if (proposedDate && iconicAccepted && proposedDate !== (requestedDate || scheduledDate)) {
    if (!requestedDate && scheduledDate) requestedDate = scheduledDate;
    date = proposedDate;
    if (proposedTime) time = proposedTime;
  }
  if (!date) date = requestedDate;
  if (!time) time = requestedTime;

  return {
    id,
    address: addressText(data.addressLabel || data.address) || "Appointment",
    status,
    date,
    time,
    requestedDate,
    requestedTime,
    approved: hasStamp(data.clientConfirmedAt) || hasStamp(data.changeApprovedAt) || hasStamp(data.agentApprovedAt) || hasStamp(orderRequest?.clientConfirmedAt) || hasStamp(orderRequest?.changeApprovedAt),
    createdAt: isoStamp(data.createdAt),
  };
}

/**
 * Past appointments are grey. Upcoming blue means the agent submitted it,
 * green means Iconic accepted it, orange means Iconic accepted a different
 * time or date and the agent has not approved that change.
 */
export function appointmentTone(
  appointment: Pick<ClientAppointment, "status" | "date" | "time" | "requestedDate" | "requestedTime" | "approved">,
  today: string,
): AppointmentTone {
  if (!appointment.date) return "undated";
  const todayKey = calendarDateKey(today) || today;
  if (appointment.date < todayKey) return "past";

  const status = statusKey(appointment.status);
  if (INACTIVE.has(status)) return "inactive";
  if (SUBMITTED.has(status)) return "submitted";

  const dateDiffers = Boolean(appointment.requestedDate && appointment.requestedDate !== appointment.date);
  const asked = clockTime(appointment.requestedTime);
  const accepted = clockTime(appointment.time);
  const timeDiffers = Boolean(asked && accepted && asked !== accepted);
  const differs = dateDiffers || timeDiffers;
  const waitingOnAgent = differs && !appointment.approved;

  if (status === "pending_confirmation" && !appointment.approved) return "change";
  if (ACCEPTED.has(status) || status === "rescheduled" || status === "pending_confirmation") {
    return waitingOnAgent ? "change" : "accepted";
  }
  return "unknown";
}

export function appointmentSummary(
  appointment: Pick<ClientAppointment, "status" | "date" | "time" | "requestedDate" | "requestedTime" | "approved">,
  today: string,
): string {
  const tone = appointmentTone(appointment, today);
  if (tone === "past") return "Past appointment.";
  if (tone === "submitted") return "You submitted this appointment.";
  if (tone === "accepted") return "Iconic accepted this appointment.";
  if (tone === "inactive") return `This appointment is ${humanStatus(appointment.status) || "closed"}.`;
  if (tone === "undated") return "No date is stored for this appointment.";
  if (tone === "change") {
    const asked = joinWhen(formatPortalDate(appointment.requestedDate), appointment.requestedTime);
    const accepted = joinWhen(formatPortalDate(appointment.date), appointment.time);
    if (asked && accepted && asked !== accepted) {
      return `Iconic accepted ${accepted} instead of ${asked}. Your approval is still open.`;
    }
    return "Iconic accepted a different time. Your approval is still open.";
  }
  return appointment.status
    ? `Status on file: ${humanStatus(appointment.status)}.`
    : "Status is not stored on this appointment.";
}

/** Same branded PDF the client invoice page downloads. */
export function clientInvoicePdfInput(statement: ClientInvoiceStatement): BrandedInvoicePdfInput {
  const face = invoiceFaceFromStored({
    lineItems: statement.lineItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      qty: item.qty ?? 1,
      price: item.amount ?? 0,
    })),
    subtotal: statement.subtotal,
    processing: statement.processing,
    fees: statement.fees,
    travel: statement.travel,
    promoDiscount: statement.promoDiscount,
    promoCode: statement.promoCode,
    tax: statement.tax,
    total: statement.total,
    amountPaid: statement.amountPaid,
    amountDue: statement.amountDue,
  });
  return {
    invoiceNumber: statement.invoiceNumber,
    clientName: statement.clientName,
    billToAddress: statement.address,
    status: humanStatus(statement.status),
    face,
    footerLines: iconicBusinessFooterLines(),
  };
}

export function invoicePdfFilename(invoiceNumber: string): string {
  return brandedInvoicePdfFilename(invoiceNumber);
}

export function invoicePdf(statement: ClientInvoiceStatement): Uint8Array {
  return brandedInvoicePdf(clientInvoicePdfInput(statement));
}

function storedLines(lineItems: unknown, services: unknown): ClientInvoiceLine[] {
  const raw = Array.isArray(lineItems) ? lineItems : Array.isArray(services) ? services : [];
  return raw.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ name: item.trim(), qty: null, amount: null }];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const named = text(record.name) || text(record.label);
    const description = text(record.description);
    const name = named || description;
    const qty = storedQty(record.qty ?? record.quantity);
    const amount = storedAmount(record.price ?? record.amount ?? record.total);
    if (!name && amount == null && qty == null) return [];
    const line: ClientInvoiceLine = { name: name || "Line item", qty, amount };
    const id = text(record.id);
    const category = text(record.category);
    if (id) line.id = id;
    if (category) line.category = category;
    if (named && description) line.description = description;
    return [line];
  });
}

function storedQty(value: unknown): number | null {
  const qty = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return Math.round(qty);
}

function firstDate(...values: unknown[]): string | null {
  for (const value of values) {
    const key = calendarDateKey(value);
    if (key) return key;
  }
  return null;
}

function firstTime(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() && !/^tbd$/i.test(value.trim())) return value.trim();
  }
  return "";
}

function hasStamp(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function isoStamp(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function joinWhen(date: string | null, time: string): string {
  return [date, time.trim()].filter(Boolean).join(" at ");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** Booking dates are often stored as "Saturday, October 3, 2026" with no time. */
function textualDateKey(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const long = value.match(/^(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (long) {
    const month = MONTHS[long[1].toLowerCase()];
    const day = Number(long[2]);
    const year = Number(long[3]);
    if (month && day >= 1 && day <= 31) return dateKey(year, month, day);
  }
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return dateKey(year, month, day);
  }
  return null;
}

/**
 * UTC midnight is how a date-only value becomes a timestamp.
 * A time of day is read in America/Chicago.
 */
function instantDateKey(date: Date, timeZone: string): string {
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  return formatZoned(date, timeZone);
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatZoned(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

