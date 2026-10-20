/**
 * Pure helpers for admin listing creates.
 * Client pages write listings directly; these keep dates and client ids valid.
 */

import { bookingListingDocId } from "./bookingListing";
import { calendarDateKey } from "./clientHome";
import { normalizeEmail } from "./listingAccess";
import { storedRecordPin } from "./serviceLocation";

export interface ClientCandidate {
  id: string;
  email?: string | null;
  firebaseUid?: string | null;
  portalAccess?: boolean | null;
}

export interface PortalIdentity {
  ids: string[];
  email?: string | null;
}

/** A Firestore Timestamp, a date-only string, or a Date. Never an Invalid Date. */
export function listingAppointmentDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : null;
    if (seconds != null) {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Date-only values need a local noon time. Anything else must be parsed as-is:
    // appending "T12:00:00" turns a Timestamp string or a long date into Invalid Date,
    // and Firestore rejects that write.
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Prefer the portal login document (id === firebaseUid) over a second clients
 * doc that only shares the email. Orders and projects then use the Auth uid
 * the client signs in with.
 */
export function choosePortalClient(
  clients: ClientCandidate[],
  hint: { clientId?: string | null; email?: string | null } = {},
): ClientCandidate | null {
  const email = normalizeEmail(hint.email);
  const hinted = hint.clientId ? clients.find((client) => client.id === hint.clientId) : undefined;
  const hintedEmail = normalizeEmail(hinted?.email);
  // A typed email wins when it no longer matches the client that was selected.
  const targetEmail = email && hintedEmail && email !== hintedEmail ? email : hintedEmail || email;
  const pool = targetEmail
    ? clients.filter((client) => normalizeEmail(client.email) === targetEmail)
    : hinted
      ? [hinted]
      : [];
  if (hinted && (!targetEmail || hintedEmail === targetEmail) && !pool.some((client) => client.id === hinted.id)) {
    pool.unshift(hinted);
  }
  if (pool.length === 0) return null;

  return pool.find((client) => client.firebaseUid && client.id === client.firebaseUid)
    || pool.find((client) => client.portalAccess === true && client.firebaseUid)
    || pool.find((client) => Boolean(client.firebaseUid))
    || pool.find((client) => client.portalAccess === true)
    || hinted
    || pool[0];
}

/** Order requests and listings the signed-in client should see. */
export function visibleToPortalClient(
  record: { clientId?: string | null; email?: string | null; clientEmail?: string | null } | null | undefined,
  identity: PortalIdentity,
): boolean {
  if (!record) return false;
  if (record.clientId && identity.ids.includes(String(record.clientId))) return true;
  const email = normalizeEmail(identity.email);
  if (!email) return false;
  return [record.email, record.clientEmail].some((value) => normalizeEmail(value) === email);
}

const SCHEDULE_DATE_KEYS = ["scheduledDate", "appointmentDate", "requestedDate"] as const;
const SCHEDULE_TIME_KEYS = ["scheduledTime", "appointmentTime", "requestedTime", "apptTime"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** First booked day. /book stores scheduledDate; older admin edits store appointmentDate. */
export function orderScheduleSource(record: Record<string, unknown> | null | undefined): unknown {
  if (!record) return null;
  for (const key of SCHEDULE_DATE_KEYS) {
    if (calendarDateKey(record[key])) return record[key];
  }
  return null;
}

/** First booked clock time. "TBD" is treated as unset. */
export function orderScheduleTime(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null;
  for (const key of SCHEDULE_TIME_KEYS) {
    const value = text(record[key]);
    if (value && !/^tbd$/i.test(value)) return value;
  }
  return null;
}

/** YYYY-MM-DD for an <input type="date">. */
export function scheduleDateInputValue(record: Record<string, unknown> | null | undefined): string {
  return calendarDateKey(orderScheduleSource(record)) || "";
}

/** HH:MM for an <input type="time">. Accepts "11:00 AM" and "11:00". */
export function scheduleTimeInputValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = match[3]?.toLowerCase();
  if (!Number.isInteger(hours) || hours > 23) return "";
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  if (hours > 23) return "";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

/** Stable listing id written at booking time. A second create must reuse it. */
export function stableOrderRequestListingId(orderRequestId: string): string | null {
  const id = orderRequestId.trim();
  if (!id) return null;
  return bookingListingDocId("req", id);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

/**
 * The photographer portal looks up listings by staff uid.
 * A public booking slug such as steven-banda is not that uid.
 */
function carriedPhotographer(order: Record<string, unknown>): {
  uid: string | null;
  ids: string[];
  names: string[];
} {
  const bookingId = text(order.bookingPhotographerId);
  const uidCandidate = text(order.photographerUid) || text(order.assignedPhotographerId);
  const uid = uidCandidate && uidCandidate !== bookingId ? uidCandidate : null;
  const ids = stringList(order.photographerIds).filter((id) => id !== bookingId);
  if (uid && !ids.includes(uid)) ids.unshift(uid);
  const names = stringList(order.photographerNames);
  const assigned = text(order.assignedPhotographerName) || text(order.photographerName);
  if (assigned && !names.includes(assigned)) names.unshift(assigned);
  return { uid, ids, names };
}

function serviceNames(record: Record<string, unknown>): string[] {
  const source = Array.isArray(record.lineItems) && record.lineItems.length > 0
    ? record.lineItems
    : Array.isArray(record.services)
      ? record.services
      : [];
  const names: string[] = [];
  for (const item of source) {
    if (typeof item === "string" && item.trim()) names.push(item.trim());
    else if (item && typeof item === "object" && "name" in item) {
      const name = text((item as { name?: unknown }).name);
      if (name) names.push(name);
    }
  }
  return names;
}

export interface ProjectCarryFields {
  apptDate: Date | null;
  appointmentDate: string | null;
  scheduledDate: string | null;
  apptTime: string | null;
  scheduledTime: string | null;
  status: "scheduled" | "unscheduled";
  services: string[];
  lineItems: unknown[];
  notes: string;
  orderNumber: string | null;
  assignedPhotographerName: string | null;
  bookingPhotographerId: string | null;
  photographerUid: string | null;
  photographerIds: string[];
  photographerNames: string[];
  photographerPreference: string | null;
  accessMethod: string | null;
  lockboxCode: string | null;
  accessInfo: string;
  appointmentDuration: number | null;
  calendarEventId: string | null;
  packageName: string | null;
  selectedAddOns: unknown[];
  selectedService: unknown;
  squareFootage: unknown;
  furnishingStatus: string | null;
  propertyStatus: string | null;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

/**
 * Fields a new project keeps from the order request.
 * Copies stored money lines. Does not reprice, and does not copy calendar emails.
 */
export function projectCarryFromOrder(order: Record<string, unknown>): ProjectCarryFields {
  const source = orderScheduleSource(order);
  const day = calendarDateKey(source);
  const apptDate = listingAppointmentDate(source);
  const time = orderScheduleTime(order);
  const lineItems = Array.isArray(order.lineItems) ? [...order.lineItems] : [];
  const accessMethod = text(order.accessMethod);
  const lockboxCode = text(order.lockboxCode);
  const pin = storedRecordPin(order);
  const placeId = text(order.placeId);
  const duration = typeof order.appointmentDuration === "number" && Number.isFinite(order.appointmentDuration)
    ? order.appointmentDuration
    : null;
  const photographer = carriedPhotographer(order);
  return {
    apptDate,
    appointmentDate: day,
    scheduledDate: day,
    apptTime: time,
    scheduledTime: time,
    status: apptDate ? "scheduled" : "unscheduled",
    services: serviceNames(order),
    lineItems,
    notes: text(order.vibeNote) || text(order.notes),
    orderNumber: text(order.orderNumber) || null,
    assignedPhotographerName: text(order.assignedPhotographerName) || text(order.photographerName) || null,
    bookingPhotographerId: text(order.bookingPhotographerId) || null,
    photographerUid: photographer.uid,
    photographerIds: photographer.ids,
    photographerNames: photographer.names,
    photographerPreference: text(order.photographerPreference) || null,
    accessMethod: accessMethod || null,
    lockboxCode: lockboxCode || null,
    accessInfo: [accessMethod, lockboxCode].filter(Boolean).join(" - "),
    appointmentDuration: duration,
    calendarEventId: text(order.calendarEventId) || null,
    packageName: text(order.packageName) || null,
    selectedAddOns: Array.isArray(order.selectedAddOns) ? [...order.selectedAddOns] : [],
    selectedService: order.selectedService ?? null,
    squareFootage: order.squareFootage ?? null,
    furnishingStatus: text(order.furnishingStatus) || null,
    propertyStatus: text(order.propertyStatus) || null,
    ...(pin ? { lat: pin.lat, lng: pin.lng, latitude: pin.lat, longitude: pin.lng } : {}),
    ...(placeId ? { placeId } : {}),
  };
}
