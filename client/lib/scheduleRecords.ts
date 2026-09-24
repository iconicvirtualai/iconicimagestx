import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

const GENERIC_ASSIGNEES = new Set([
  "iconic images team",
  "our team",
  "photographer",
  "your photographer",
  "assigned",
  "unassigned",
  "available",
  "available (auto-assign)",
  "auto-assign",
  "team",
  "photos@iconicimagestx.com",
  "iconicimagestx@gmail.com",
]);

const GENERIC_ASSIGNEE_KEYS = new Set(
  Array.from(GENERIC_ASSIGNEES).map((value) => value.replace(/[^a-z0-9]+/g, ""))
);

export function centralNoonDate(value: string) {
  return new Date(`${value}T12:00:00-06:00`);
}

export function scheduleDateTimestamp(value: string) {
  return Timestamp.fromDate(centralNoonDate(value));
}

export function toDate(value: any): Date | null {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-06:00` : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function chicagoDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function cleanName(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, "");
  if (!trimmed || GENERIC_ASSIGNEES.has(lower) || GENERIC_ASSIGNEE_KEYS.has(normalized)) return "";
  return trimmed;
}

export function staffDisplayName(staff: any) {
  return cleanName(staff?.name || `${staff?.firstName || ""} ${staff?.lastName || ""}`.trim() || staff?.email || staff?.id);
}

export function buildStaffLookup(staff: any[] = []) {
  const byKey = new Map<string, string>();
  staff.forEach((person) => {
    const name = staffDisplayName(person);
    if (!name) return;
    [
      person.id,
      person.email,
      person.googleCalendarId,
      person.calendarId,
      person.calendarEmail,
    ].filter(Boolean).forEach((key) => byKey.set(String(key).toLowerCase(), name));
  });
  return byKey;
}

export function providerAssignments(providerIds: string[], staff: any[]) {
  return providerIds.map((providerId) => {
    const person = staff.find((item) => item.id === providerId);
    const name = staffDisplayName(person) || providerId;
    return {
      providerId,
      name,
      role: person?.role || "photographer",
      email: person?.email || null,
      googleCalendarId: person?.googleCalendarId || person?.calendarId || person?.calendarEmail || null,
    };
  });
}

export function getAssignedNames(record: any, staff: any[] = []) {
  const names = new Set<string>();
  const staffLookup = buildStaffLookup(staff);
  const add = (value: unknown) => {
    const name = cleanName(value);
    if (name) names.add(name);
  };
  const resolve = (value: unknown) => {
    if (!value) return;
    const resolved = staffLookup.get(String(value).toLowerCase());
    if (resolved) add(resolved);
    else add(value);
  };

  if (Array.isArray(record?.photographerNames)) record.photographerNames.forEach(add);
  add(record?.photographerName);
  add(record?.assignedPhotographerName);
  (record?.assignedProviders || []).forEach((provider: any) => {
    add(provider?.name);
    resolve(provider?.providerId);
    resolve(provider?.id);
    resolve(provider?.email);
    resolve(provider?.googleCalendarId || provider?.calendarId);
  });

  [
    record?.photographerId,
    record?.assignedPhotographerId,
    record?.photographerEmail,
    record?.assignedPhotographerEmail,
    record?.googleCalendarId,
    record?.photographerCalendarId,
    record?.calendarId,
  ].forEach(resolve);

  return Array.from(names);
}

export function appointmentRevenue(record: any) {
  const lineItemTotal = orderLineItems(record).reduce((sum: number, item: any) => sum + (Number(item?.price) || Number(item?.amount) || 0), 0);
  return Number(record?.total) ||
    Number(record?.amount) ||
    Number(record?.pricing?.total) ||
    Number(record?.invoice?.amountDue) ||
    lineItemTotal ||
    0;
}

export function orderLineItems(order: any) {
  const raw = Array.isArray(order?.lineItems) && order.lineItems.length > 0
    ? order.lineItems
    : Array.isArray(order?.services)
      ? order.services
      : [];
  return raw.map((item: any) => typeof item === "string" ? { name: item, price: 0 } : item);
}

export function orderServices(order: any) {
  return orderLineItems(order).map((item: any) => item.name || String(item)).filter(Boolean);
}

export async function upsertScheduledAppointment({
  orderRequestId,
  order,
  date,
  time,
  providerIds,
  staff,
  status = "scheduled",
}: {
  orderRequestId: string;
  order: any;
  date: string;
  time?: string | null;
  providerIds: string[];
  staff: any[];
  status?: "scheduled" | "confirmed";
}) {
  const scheduledDate = scheduleDateTimestamp(date);
  const assignedProviders = providerAssignments(providerIds, staff);
  const photographerNames = assignedProviders.map((provider) => provider.name).filter(Boolean);
  const firstProvider = assignedProviders[0] || null;
  const total = appointmentRevenue(order);
  const clientName = order?.clientName || `${order?.firstName || ""} ${order?.lastName || ""}`.trim() || "Unknown Client";
  const address = order?.addressLabel || order?.address || order?.propertyAddress || order?.shootLocation || "";
  const services = orderLineItems(order);

  const sharedScheduleFields = {
    status,
    appointmentDate: date,
    appointmentTime: time || null,
    scheduledDate,
    scheduledTime: time || null,
    assignedProviders,
    photographerIds: providerIds,
    photographerNames,
    assignedPhotographerId: firstProvider?.providerId || null,
    assignedPhotographerName: firstProvider?.name || null,
    photographerId: firstProvider?.providerId || null,
    photographerName: firstProvider?.name || null,
    photographerEmail: firstProvider?.email || null,
    photographerCalendarId: firstProvider?.googleCalendarId || null,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.update(doc(db, "orderRequests", orderRequestId), sharedScheduleFields);

  if (order?.listingId) {
    batch.update(doc(db, "listings", order.listingId), {
      ...sharedScheduleFields,
      apptDate: scheduledDate,
      apptTime: time || null,
    });
  }

  if (order?.convertedToOrderId) {
    batch.update(doc(db, "orders", order.convertedToOrderId), sharedScheduleFields);
  }

  const appointmentData = {
    orderRequestId,
    orderId: order?.convertedToOrderId || null,
    listingId: order?.listingId || null,
    clientId: order?.clientId || null,
    clientName,
    clientEmail: order?.email || order?.clientEmail || "",
    clientPhone: order?.phone || order?.clientPhone || "",
    address,
    addressLabel: typeof address === "string" ? address : "",
    services,
    lineItems: services,
    total,
    notes: order?.vibeNote || order?.notes || "",
    internalNotes: order?.internalNotes || "",
    createdAt: serverTimestamp(),
    ...sharedScheduleFields,
  };

  const appointmentRefs = await getAppointmentRefs(orderRequestId, order?.convertedToOrderId);
  if (appointmentRefs.length === 0) {
    batch.set(doc(collection(db, "appointments")), appointmentData);
  } else {
    const { createdAt, ...appointmentUpdate } = appointmentData;
    appointmentRefs.forEach((ref) => batch.set(ref, appointmentUpdate, { merge: true }));
  }

  await batch.commit();
}

export async function markScheduledAppointmentConfirmed(orderRequestId: string, order: any) {
  const batch = writeBatch(db);
  const confirmedFields = {
    status: "confirmed",
    clientConfirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  batch.update(doc(db, "orderRequests", orderRequestId), confirmedFields);
  if (order?.convertedToOrderId) batch.update(doc(db, "orders", order.convertedToOrderId), confirmedFields);
  if (order?.listingId) batch.update(doc(db, "listings", order.listingId), confirmedFields);

  const appointmentRefs = await getAppointmentRefs(orderRequestId, order?.convertedToOrderId);
  appointmentRefs.forEach((ref) => batch.update(ref, confirmedFields));

  await batch.commit();
}

async function getAppointmentRefs(orderRequestId: string, orderId?: string | null) {
  const refs = new Map<string, any>();
  const byRequest = await getDocs(query(collection(db, "appointments"), where("orderRequestId", "==", orderRequestId)));
  byRequest.docs.forEach((item) => refs.set(item.ref.path, item.ref));

  if (orderId) {
    const byOrder = await getDocs(query(collection(db, "appointments"), where("orderId", "==", orderId)));
    byOrder.docs.forEach((item) => refs.set(item.ref.path, item.ref));
  }

  return Array.from(refs.values());
}
