/**
 * One portal listing per booking that already has an order, invoice, or appointment.
 * Home tiles read listings and open /portal/listings/:id. This only plans that
 * document. It does not price, send mail, or publish a payment.
 */

import { addressText, calendarDateKey } from "./clientHome.ts";
import { normalizeEmail } from "./listingAccess.ts";

export const PORTAL_LISTING_ID = /^[A-Za-z0-9_-]{4,128}$/;

export type BookingListingCollection = "orderRequests" | "orders" | "invoices" | "appointments" | "galleries";

export interface BookingListingDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface BookingListingIdentity {
  ids?: string[];
  email?: string | null;
}

export interface BookingListingGroup {
  stableId: string;
  preferredListingIds: string[];
  orderRequestIds: string[];
  orderIds: string[];
  invoiceIds: string[];
  appointmentIds: string[];
  galleryIds: string[];
  orderRequests: BookingListingDoc[];
  orders: BookingListingDoc[];
  invoices: BookingListingDoc[];
  appointments: BookingListingDoc[];
  galleries: BookingListingDoc[];
}

export interface BookingListingLink {
  collection: BookingListingCollection;
  id: string;
}

export interface BookingListingPlan {
  listingId: string;
  create: boolean;
  createFields: Record<string, unknown>;
  fillFields: Record<string, unknown>;
  links: BookingListingLink[];
}

export interface BookingListingRecords {
  identity?: BookingListingIdentity;
  orderRequests?: BookingListingDoc[];
  orders?: BookingListingDoc[];
  invoices?: BookingListingDoc[];
  appointments?: BookingListingDoc[];
  galleries?: BookingListingDoc[];
  existingListings?: BookingListingDoc[];
}

interface ClientMatch {
  ids: string[];
  emails: string[];
}

const NEVER_FILL = new Set(["images", "createdAt", "source", "id"]);

export function isPortalListingId(value: string): boolean {
  return PORTAL_LISTING_ID.test(value);
}

/** Stable listing id for one booking. A second ensure uses the same id. */
export function bookingListingDocId(kind: "req" | "ord" | "inv" | "apt", rawId: string): string | null {
  const safe = rawId.trim().replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!safe) return null;
  let id = `bklist_${kind}_${safe}`;
  if (id.length > 128) id = id.slice(0, 128).replace(/_+$/g, "");
  return isPortalListingId(id) ? id : null;
}

export function bookingListingGroups(input: BookingListingRecords): BookingListingGroup[] {
  const requests = cleanDocs(input.orderRequests);
  const orders = cleanDocs(input.orders);
  const invoices = cleanDocs(input.invoices);
  const appointments = cleanDocs(input.appointments);
  const galleries = cleanDocs(input.galleries);
  const uf = new UnionFind();

  for (const doc of requests) {
    const node = nodeId("orderRequests", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("listings", text(doc.data.listingId)));
    uf.link(node, nodeId("orders", text(doc.data.orderId) || text(doc.data.convertedToOrderId)));
    uf.link(node, nodeId("invoices", text(doc.data.invoiceId)));
    uf.link(node, nodeId("galleries", text(doc.data.galleryId)));
  }
  for (const doc of orders) {
    const node = nodeId("orders", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text(doc.data.orderRequestId)));
    uf.link(node, nodeId("listings", text(doc.data.listingId)));
    uf.link(node, nodeId("invoices", text(doc.data.invoiceId)));
    uf.link(node, nodeId("galleries", text(doc.data.galleryId)));
  }
  for (const doc of invoices) {
    const node = nodeId("invoices", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text(doc.data.orderRequestId)));
    uf.link(node, nodeId("orders", text(doc.data.orderId)));
    uf.link(node, nodeId("listings", text(doc.data.listingId)));
  }
  for (const doc of appointments) {
    const node = nodeId("appointments", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text(doc.data.orderRequestId)));
    uf.link(node, nodeId("orders", text(doc.data.orderId)));
    uf.link(node, nodeId("listings", text(doc.data.listingId)));
  }
  for (const doc of galleries) {
    const node = nodeId("galleries", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text(doc.data.orderRequestId)));
    uf.link(node, nodeId("orders", text(doc.data.orderId)));
    uf.link(node, nodeId("invoices", text(doc.data.invoiceId)));
    uf.link(node, nodeId("listings", text(doc.data.listingId)));
  }

  const groups: BookingListingGroup[] = [];
  for (const nodes of uf.components()) {
    const orderRequestIds = idsWithPrefix(nodes, "orderRequests");
    const orderIds = idsWithPrefix(nodes, "orders");
    const invoiceIds = idsWithPrefix(nodes, "invoices");
    const appointmentIds = idsWithPrefix(nodes, "appointments");
    const galleryIds = idsWithPrefix(nodes, "galleries");
    if (orderRequestIds.length + orderIds.length + invoiceIds.length + appointmentIds.length === 0) continue;
    const stableId = stableListingId(orderRequestIds, orderIds, invoiceIds, appointmentIds);
    if (!stableId) continue;
    const group: BookingListingGroup = {
      stableId,
      preferredListingIds: preferredListingIds({
        orderRequests: requests.filter((doc) => orderRequestIds.includes(doc.id)),
        orders: orders.filter((doc) => orderIds.includes(doc.id)),
        invoices: invoices.filter((doc) => invoiceIds.includes(doc.id)),
        appointments: appointments.filter((doc) => appointmentIds.includes(doc.id)),
        galleries: galleries.filter((doc) => galleryIds.includes(doc.id)),
      }),
      orderRequestIds,
      orderIds,
      invoiceIds,
      appointmentIds,
      galleryIds,
      orderRequests: requests.filter((doc) => orderRequestIds.includes(doc.id)),
      orders: orders.filter((doc) => orderIds.includes(doc.id)),
      invoices: invoices.filter((doc) => invoiceIds.includes(doc.id)),
      appointments: appointments.filter((doc) => appointmentIds.includes(doc.id)),
      galleries: galleries.filter((doc) => galleryIds.includes(doc.id)),
    };
    groups.push(group);
  }
  return groups.sort((a, b) => (a.stableId < b.stableId ? -1 : a.stableId > b.stableId ? 1 : 0));
}

export function planBookingListings(input: BookingListingRecords): BookingListingPlan[] {
  const listings = cleanDocs(input.existingListings);
  return bookingListingGroups(input)
    .map((group) => planBookingListingGroup(group, listings, input.identity))
    .filter((plan): plan is BookingListingPlan => Boolean(plan))
    .sort((a, b) => (a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0));
}

export function planBookingListingGroup(
  group: BookingListingGroup,
  existingListings: BookingListingDoc[],
  identity?: BookingListingIdentity,
): BookingListingPlan | null {
  const clients = clientsFor(group, identity);
  const existing = chooseListing(group, cleanDocs(existingListings), clients);
  const listingId = existing?.id || group.stableId;
  if (!isPortalListingId(listingId)) return null;
  const desired = desiredListingFields(group, identity);
  return {
    listingId,
    create: !existing,
    createFields: desired,
    fillFields: existing ? fillEmptyListingFields(existing.data, desired) : {},
    links: linksFor(group, listingId, cleanDocs(existingListings), clients),
  };
}

/** Copy booking fields onto a listing only where the listing is still blank. */
export function fillEmptyListingFields(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (NEVER_FILL.has(key) || !present(value) || !isEmpty(existing[key])) continue;
    patch[key] = value;
  }
  return patch;
}

export function clientOwnsListing(listing: Record<string, unknown>, clients: ClientMatch): boolean {
  const clientId = text(listing.clientId);
  const email = normalizeEmail(listing.clientEmail || listing.email);
  if (!clientId && !email) return true;
  if (clientId && clients.ids.includes(clientId)) return true;
  return Boolean(email && clients.emails.includes(email));
}

function desiredListingFields(group: BookingListingGroup, identity?: BookingListingIdentity): Record<string, unknown> {
  const fields: Record<string, unknown> = { images: [], source: "booking" };
  const address = bestAddress(group);
  const scheduleDate = firstScheduleDate(group);
  const scheduleTime = firstScheduleTime(group);
  const total = firstTotal(group);
  const squareFootage = firstScalar(group, ["squareFootage", "sqft"]);
  const names = serviceNames(group);
  assign(fields, "orderRequestId", chosenId(group.orderRequests, group.orderRequestIds));
  assign(fields, "orderId", chosenId(group.orders, group.orderIds, [...group.orderRequests, ...group.invoices], ["convertedToOrderId", "orderId"]));
  assign(fields, "invoiceId", chosenInvoiceId(group));
  assign(fields, "appointmentId", chosenId(group.appointments, group.appointmentIds));
  assign(fields, "galleryId", chosenId(group.galleries, group.galleryIds, [...group.orderRequests, ...group.orders], ["galleryId"]));
  assign(fields, "clientId", clientId(group, identity));
  assign(fields, "clientEmail", clientEmail(group, identity));
  assign(fields, "clientName", clientName(group));
  assign(fields, "clientPhone", firstText(group, ["clientPhone", "phone"]));
  if (address) {
    fields.address = address;
    fields.propertyAddress = address;
    const label = addressText(address);
    if (label) fields.addressLabel = label;
  }
  assign(fields, "projectType", projectType(group));
  assign(fields, "status", listingStatus(group, Boolean(scheduleDate)));
  assign(fields, "apptDate", scheduleDate);
  assign(fields, "appointmentDate", scheduleDate);
  assign(fields, "scheduledDate", scheduleDate);
  assign(fields, "apptTime", scheduleTime);
  assign(fields, "scheduledTime", scheduleTime);
  if (names.length) fields.services = names;
  if (total != null) fields.total = total;
  if (squareFootage != null) fields.squareFootage = squareFootage;
  assign(fields, "propertyStatus", firstText(group, ["propertyStatus"]));
  assign(fields, "furnishingStatus", firstText(group, ["furnishingStatus"]));
  assign(fields, "accessMethod", firstText(group, ["accessMethod"]));
  assign(fields, "accessInfo", accessInfo(group));
  assign(fields, "createdAt", groupCreatedAt(group));
  return fields;
}

function chooseListing(group: BookingListingGroup, listings: BookingListingDoc[], clients: ClientMatch): BookingListingDoc | null {
  const owned = listings.filter((doc) => isPortalListingId(doc.id) && clientOwnsListing(doc.data, clients) && listingMatches(doc, group));
  for (const id of group.preferredListingIds) {
    const found = owned.find((doc) => doc.id === id);
    if (found) return found;
  }
  const stable = owned.find((doc) => doc.id === group.stableId);
  if (stable) return stable;
  return owned.sort((a, b) => (a.id < b.id ? -1 : 1))[0] || null;
}

function listingMatches(doc: BookingListingDoc, group: BookingListingGroup): boolean {
  if (doc.id === group.stableId || group.preferredListingIds.includes(doc.id)) return true;
  const requestId = text(doc.data.orderRequestId);
  const orderId = text(doc.data.orderId);
  const invoiceId = text(doc.data.invoiceId);
  const appointmentId = text(doc.data.appointmentId);
  return Boolean(
    (requestId && group.orderRequestIds.includes(requestId))
    || (orderId && group.orderIds.includes(orderId))
    || (invoiceId && group.invoiceIds.includes(invoiceId))
    || (appointmentId && group.appointmentIds.includes(appointmentId)),
  );
}

function linksFor(
  group: BookingListingGroup,
  listingId: string,
  listings: BookingListingDoc[],
  clients: ClientMatch,
): BookingListingLink[] {
  const ownedIds = new Set(listings.filter((doc) => clientOwnsListing(doc.data, clients)).map((doc) => doc.id));
  const links: BookingListingLink[] = [];
  const push = (collection: BookingListingCollection, docs: BookingListingDoc[]) => {
    for (const doc of docs) {
      const current = text(doc.data.listingId);
      if (current === listingId) continue;
      if (current && isPortalListingId(current) && ownedIds.has(current)) continue;
      links.push({ collection, id: doc.id });
    }
  };
  push("orderRequests", group.orderRequests);
  push("orders", group.orders);
  push("invoices", group.invoices);
  push("appointments", group.appointments);
  push("galleries", group.galleries);
  return links.sort((a, b) => (a.collection === b.collection ? (a.id < b.id ? -1 : 1) : a.collection < b.collection ? -1 : 1));
}

function clientsFor(group: BookingListingGroup, identity?: BookingListingIdentity): ClientMatch {
  const ids = new Set<string>();
  const emails = new Set<string>();
  const addId = (value: unknown) => {
    const id = text(value);
    if (id) ids.add(id);
  };
  const addEmail = (value: unknown) => {
    const email = normalizeEmail(value);
    if (email) emails.add(email);
  };
  for (const id of identity?.ids || []) addId(id);
  addEmail(identity?.email);
  for (const doc of propertyDocs(group)) {
    addId(doc.data.clientId);
    addEmail(doc.data.clientEmail);
    addEmail(doc.data.email);
  }
  return { ids: [...ids], emails: [...emails] };
}

function preferredListingIds(group: Pick<BookingListingGroup, "orderRequests" | "orders" | "invoices" | "appointments" | "galleries">): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    const id = text(value);
    if (id && isPortalListingId(id) && !ids.includes(id)) ids.push(id);
  };
  for (const doc of [...group.orderRequests, ...group.orders, ...group.invoices, ...group.appointments, ...group.galleries]) {
    push(doc.data.listingId);
  }
  return ids;
}

function stableListingId(requestIds: string[], orderIds: string[], invoiceIds: string[], appointmentIds: string[]): string | null {
  const request = requestIds[0];
  if (request) return bookingListingDocId("req", request);
  const order = orderIds[0];
  if (order) return bookingListingDocId("ord", order);
  const invoice = invoiceIds[0];
  if (invoice) return bookingListingDocId("inv", invoice);
  const appointment = appointmentIds[0];
  if (appointment) return bookingListingDocId("apt", appointment);
  return null;
}

function bestAddress(group: BookingListingGroup): unknown {
  for (const doc of propertyDocs(group)) {
    for (const key of ["address", "propertyAddress", "shootLocation"]) {
      const value = doc.data[key];
      if (hasAddress(value) && typeof value === "object") return value;
    }
  }
  for (const doc of propertyDocs(group)) {
    for (const key of ["address", "propertyAddress", "shootLocation"]) {
      if (typeof doc.data[key] === "string" && text(doc.data[key])) return text(doc.data[key]);
    }
    if (text(doc.data.addressLabel)) return text(doc.data.addressLabel);
  }
  return null;
}

function firstScheduleDate(group: BookingListingGroup): string | null {
  for (const doc of [...group.appointments, ...group.orders, ...group.orderRequests, ...group.invoices]) {
    for (const key of ["scheduledDate", "appointmentDate", "apptDate", "requestedDate"]) {
      const day = calendarDateKey(doc.data[key]);
      if (day) return day;
    }
  }
  return null;
}

function firstScheduleTime(group: BookingListingGroup): string {
  for (const doc of [...group.appointments, ...group.orders, ...group.orderRequests]) {
    for (const key of ["scheduledTime", "appointmentTime", "apptTime", "requestedTime"]) {
      const value = text(doc.data[key]);
      if (value && !/^tbd$/i.test(value)) return value;
    }
  }
  return "";
}

function groupCreatedAt(group: BookingListingGroup): string | null {
  const fromRequest = earliestIso(group.orderRequests.map((doc) => doc.data.createdAt));
  if (fromRequest) return fromRequest;
  return earliestIso(propertyDocs(group).map((doc) => doc.data.createdAt));
}

function projectType(group: BookingListingGroup): "real_estate" | "business" {
  for (const doc of [...group.orderRequests, ...group.orders, ...group.invoices]) {
    if (doc.data.projectType === "business") return "business";
    if (doc.data.projectType === "real_estate") return "real_estate";
    const service = doc.data.selectedService;
    if (service && typeof service === "object") {
      const category = text((service as { category?: unknown }).category);
      if (category === "business" || category === "branding") return "business";
      if (category === "listings") return "real_estate";
    }
  }
  return "real_estate";
}

function listingStatus(group: BookingListingGroup, hasDate: boolean): string {
  const keys = [...group.orderRequests, ...group.orders, ...group.appointments].map((doc) => statusKey(doc.data.status));
  if (keys.some((key) => key === "cancelled" || key === "canceled" || key === "declined")) return "cancelled";
  if (keys.some((key) => key === "archived")) return "archived";
  return hasDate ? "scheduled" : "unscheduled";
}

function serviceNames(group: BookingListingGroup): string[] {
  for (const doc of [...group.orderRequests, ...group.orders, ...group.invoices]) {
    const names = namesFrom(doc.data.lineItems ?? doc.data.services);
    if (names.length) return names;
  }
  return [];
}

function namesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) names.push(item.trim());
    else if (item && typeof item === "object") {
      const name = text((item as { name?: unknown }).name);
      if (name) names.push(name);
    }
    if (names.length >= 40) break;
  }
  return names;
}

function firstTotal(group: BookingListingGroup): number | null {
  for (const doc of [...group.orders, ...group.invoices, ...group.orderRequests]) {
    if (doc.data.total != null && doc.data.total !== "") {
      const parsed = money(doc.data.total);
      if (parsed != null) return parsed;
    }
    const pricing = doc.data.pricing;
    if (pricing && typeof pricing === "object") {
      const parsed = money((pricing as { total?: unknown }).total);
      if ((pricing as { total?: unknown }).total != null && (pricing as { total?: unknown }).total !== "" && parsed != null) return parsed;
    }
  }
  return null;
}

function accessInfo(group: BookingListingGroup): string {
  return [firstText(group, ["accessMethod"]), firstText(group, ["lockboxCode"])].filter(Boolean).join(" - ");
}

function clientId(group: BookingListingGroup, identity?: BookingListingIdentity): string {
  const bookingIds = propertyDocs(group).map((doc) => text(doc.data.clientId)).filter(Boolean);
  const identityIds = (identity?.ids || []).map((id) => text(id)).filter(Boolean);
  return bookingIds.find((id) => identityIds.includes(id)) || bookingIds[0] || identityIds[0] || "";
}

function clientEmail(group: BookingListingGroup, identity?: BookingListingIdentity): string {
  const identityEmail = normalizeEmail(identity?.email);
  if (identityEmail) return identityEmail;
  for (const doc of propertyDocs(group)) {
    const email = normalizeEmail(doc.data.clientEmail || doc.data.email);
    if (email) return email;
  }
  return "";
}

function clientName(group: BookingListingGroup): string {
  for (const doc of propertyDocs(group)) {
    if (text(doc.data.clientName)) return text(doc.data.clientName);
    const joined = `${text(doc.data.firstName)} ${text(doc.data.lastName)}`.trim();
    if (joined) return joined;
  }
  return "";
}

function chosenInvoiceId(group: BookingListingGroup): string {
  const known = new Set(group.invoiceIds);
  for (const doc of [...group.orderRequests, ...group.orders]) {
    const id = text(doc.data.invoiceId);
    if (id && known.has(id)) return id;
  }
  return newestDoc(group.invoices)?.id || group.invoiceIds[0] || "";
}

function chosenId(
  docs: BookingListingDoc[],
  ids: string[],
  pointers: BookingListingDoc[] = [],
  keys: string[] = [],
): string {
  const known = new Set(ids);
  for (const doc of pointers) {
    for (const key of keys) {
      const id = text(doc.data[key]);
      if (id && known.has(id)) return id;
    }
  }
  return newestDoc(docs)?.id || ids[0] || "";
}

function propertyDocs(group: BookingListingGroup): BookingListingDoc[] {
  return [...group.orderRequests, ...group.orders, ...group.appointments, ...group.invoices, ...group.galleries];
}

function firstText(group: BookingListingGroup, keys: string[]): string {
  for (const doc of propertyDocs(group)) {
    for (const key of keys) {
      const value = text(doc.data[key]);
      if (value) return value;
    }
  }
  return "";
}

function firstScalar(group: BookingListingGroup, keys: string[]): string | number | null {
  for (const doc of propertyDocs(group)) {
    for (const key of keys) {
      const value = doc.data[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function newestDoc(docs: BookingListingDoc[]): BookingListingDoc | null {
  if (docs.length === 0) return null;
  return [...docs].sort((a, b) => {
    const left = readCreatedAt(a.data.createdAt) || "";
    const right = readCreatedAt(b.data.createdAt) || "";
    if (left !== right) return right.localeCompare(left);
    return a.id < b.id ? -1 : 1;
  })[0];
}

function earliestIso(values: unknown[]): string | null {
  let best: string | null = null;
  for (const value of values) {
    const iso = readCreatedAt(value);
    if (!iso) continue;
    if (!best || iso < best) best = iso;
  }
  return best;
}

function readCreatedAt(value: unknown): string | null {
  if (isSentinel(value)) return null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.trim());
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (value && typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof record.toDate === "function") {
      try {
        const date = record.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
      } catch {
        return null;
      }
    }
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : null;
    if (seconds != null) return new Date(seconds * 1000).toISOString();
  }
  return null;
}

function hasAddress(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ["formatted", "label", "street", "line1", "addressLine1", "city", "state", "zip"].some((key) => text(record[key]).length > 0);
}

function statusKey(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function money(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/[$,\s]/g, "")) : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function assign(fields: Record<string, unknown>, key: string, value: unknown) {
  if (!present(value)) return;
  fields[key] = value;
}

function present(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isEmpty(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    if (value instanceof Date) return Number.isNaN(value.getTime());
    if ("seconds" in value || "_seconds" in value || "toDate" in value) return false;
    return Object.keys(value).length === 0;
  }
  return false;
}

function isSentinel(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "_methodName" in value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanDocs(docs: BookingListingDoc[] | undefined): BookingListingDoc[] {
  const out: BookingListingDoc[] = [];
  const seen = new Set<string>();
  for (const doc of docs || []) {
    const id = text(doc?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, data: doc.data && typeof doc.data === "object" ? doc.data : {} });
  }
  return out;
}

function nodeId(prefix: string, id: string): string {
  return id ? `${prefix}:${id}` : "";
}

function idsWithPrefix(nodes: string[], prefix: string): string[] {
  const marker = `${prefix}:`;
  return nodes.filter((node) => node.startsWith(marker)).map((node) => node.slice(marker.length)).sort();
}

class UnionFind {
  private parent = new Map<string, string>();

  touch(id: string) {
    if (id) this.find(id);
  }

  link(left: string, right: string) {
    if (!left || !right) return;
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent.set(b, a);
  }

  components(): string[][] {
    const grouped = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const list = grouped.get(root) || [];
      list.push(key);
      grouped.set(root, list);
    }
    return [...grouped.values()];
  }

  private find(id: string): string {
    const current = this.parent.get(id);
    if (!current) {
      this.parent.set(id, id);
      return id;
    }
    if (current === id) return id;
    const root = this.find(current);
    this.parent.set(id, root);
    return root;
  }
}
