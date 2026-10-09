/**
 * Create the portal listing for a booking when it is missing, and point the
 * order, invoice, and appointment at that same id. A second call reuses it.
 * Does not send mail or publish a payment.
 */

import admin from "firebase-admin";
import { normalizeEmail } from "../../shared/listingAccess";
import { visibleToPortalClient } from "../../shared/listingWrite";
import {
  bookingListingGroups,
  fillEmptyListingFields,
  isPortalListingId,
  planBookingListingGroup,
  type BookingListingCollection,
  type BookingListingDoc,
  type BookingListingGroup,
  type BookingListingPlan,
} from "../../shared/bookingListing";

const db = () => admin.firestore();

const LINK_COLLECTIONS = new Set<BookingListingCollection>([
  "orderRequests",
  "orders",
  "invoices",
  "appointments",
  "galleries",
]);

const BLOCKED_FIELDS = new Set([
  "id",
  "createdAt",
  "paymentUrl",
  "studioToken",
  "lockboxCode",
  "notifications",
  "passwordSetupLink",
]);

/** Written on a new booking project. Fill of an existing project skips these. */
const LOCK_FIELDS = new Set(["lockDownloads", "requirePayment", "lockStudio"]);

export async function ensureBookingListingForRequest(orderRequestId: string): Promise<{ listingId: string; created: boolean } | null> {
  const id = orderRequestId.trim();
  if (!id) return null;
  const snap = await db().collection("orderRequests").doc(id).get();
  if (!snap.exists) return null;
  const request = asDoc(snap.id, snap.data());
  const bundle = await hydrateBundle({
    orderRequests: [request],
    orders: [],
    invoices: [],
    appointments: [],
    galleries: [],
  });
  const identity = {
    ids: text(request.data.clientId) ? [text(request.data.clientId)] : [],
    email: normalizeEmail(request.data.clientEmail || request.data.email),
  };
  const plans = await plansFor(bundle, identity);
  const primary = plans.find((plan) => plan.createFields.orderRequestId === id) || plans[0];
  if (!primary) return null;
  let created = false;
  let listingId = primary.listingId;
  for (const plan of plans) {
    const result = await applyBookingListingPlan(plan);
    if (plan.listingId === primary.listingId) {
      listingId = result.listingId;
      created = result.created;
    }
  }
  return { listingId, created };
}

/** Backfill listings for bookings this client can already see. Idempotent. */
export async function ensurePortalListingsForClient(identity: { ids: string[]; email?: string | null }): Promise<{ created: number }> {
  const ids = [...new Set(identity.ids.map((id) => id.trim()).filter(Boolean))];
  const email = normalizeEmail(identity.email);
  if (ids.length === 0 && !email) return { created: 0 };
  const portal = { ids, email };
  const seeds = await loadVisibleSeeds(portal);
  const bundle = await hydrateBundle(seeds);
  const plans = await plansFor(bundle, portal);
  const results = await Promise.allSettled(plans.map((plan) => applyBookingListingPlan(plan)));
  let created = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value.created) created += 1;
      return;
    }
    console.error(`[Listings] Ensure failed for ${plans[index]?.listingId || "booking"}:`, result.reason);
  });
  return { created };
}

async function plansFor(
  bundle: Bundle,
  identity: { ids: string[]; email?: string | null },
): Promise<BookingListingPlan[]> {
  const groups = bookingListingGroups(bundle);
  const listings = await loadListingsForGroups(identity, groups);
  return groups
    .map((group) => planBookingListingGroup(group, listings, identity))
    .filter((plan): plan is BookingListingPlan => Boolean(plan));
}

async function applyBookingListingPlan(plan: BookingListingPlan): Promise<{ listingId: string; created: boolean }> {
  if (!isPortalListingId(plan.listingId)) throw new Error("Listing id is not valid.");
  const ref = db().collection("listings").doc(plan.listingId);
  let created = false;
  if (plan.create) {
    try {
      await ref.create({
        ...plainFields(plan.createFields),
        createdAt: timestampOrNow(plan.createFields.createdAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created = true;
      console.info(`[Listings] Created ${plan.listingId} for booking ${text(plan.createFields.orderRequestId) || text(plan.createFields.orderId) || text(plan.createFields.invoiceId)}`);
    } catch (err) {
      if (!alreadyExists(err)) throw err;
      await fillListing(ref, plan.createFields);
    }
  } else if (Object.keys(plan.fillFields).length > 0) {
    await fillListing(ref, plan.fillFields);
  }

  for (const link of plan.links) {
    try {
      await linkRecord(link.collection, link.id, plan.listingId);
    } catch (err) {
      console.error(`[Listings] Could not link ${link.collection}/${link.id} to ${plan.listingId}:`, err);
    }
  }
  return { listingId: plan.listingId, created };
}

async function fillListing(
  ref: FirebaseFirestore.DocumentReference,
  desired: Record<string, unknown>,
) {
  const snap = await ref.get();
  if (!snap.exists) return;
  const patch = plainFields(fillEmptyListingFields(snap.data() || {}, desired));
  if (Object.keys(patch).length === 0) return;
  await ref.update({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

async function linkRecord(collectionName: BookingListingCollection, id: string, listingId: string) {
  if (!LINK_COLLECTIONS.has(collectionName) || !id) return;
  const ref = db().collection(collectionName).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (text(snap.data()?.listingId) === listingId) return;
  await ref.update({
    listingId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

interface Bundle {
  orderRequests: BookingListingDoc[];
  orders: BookingListingDoc[];
  invoices: BookingListingDoc[];
  appointments: BookingListingDoc[];
  galleries: BookingListingDoc[];
}

async function loadVisibleSeeds(identity: { ids: string[]; email: string }): Promise<Bundle> {
  const requests = new Map<string, BookingListingDoc>();
  const orders = new Map<string, BookingListingDoc>();
  const invoices = new Map<string, BookingListingDoc>();
  const appointments = new Map<string, BookingListingDoc>();
  const keep = (map: Map<string, BookingListingDoc>, docs: BookingListingDoc[]) => {
    for (const doc of docs) {
      if (!visibleToPortalClient({
        clientId: text(doc.data.clientId),
        email: text(doc.data.email),
        clientEmail: text(doc.data.clientEmail),
      }, identity)) continue;
      if (!map.has(doc.id)) map.set(doc.id, doc);
    }
  };
  const jobs: Array<Promise<void>> = [];
  const track = (job: Promise<BookingListingDoc[]>, map: Map<string, BookingListingDoc>) => {
    jobs.push(job.then((docs) => keep(map, docs)));
  };
  if (identity.ids.length) {
    track(queryIn("orderRequests", "clientId", identity.ids), requests);
    track(queryIn("orders", "clientId", identity.ids), orders);
    track(queryIn("invoices", "clientId", identity.ids), invoices);
    track(queryIn("appointments", "clientId", identity.ids), appointments);
  }
  if (identity.email) {
    track(queryEqual("orderRequests", "email", identity.email), requests);
    track(queryEqual("orderRequests", "clientEmail", identity.email), requests);
    track(queryEqual("orders", "clientEmail", identity.email), orders);
    track(queryEqual("invoices", "clientEmail", identity.email), invoices);
    track(queryEqual("appointments", "clientEmail", identity.email), appointments);
  }
  await Promise.all(jobs);
  return {
    orderRequests: [...requests.values()],
    orders: [...orders.values()],
    invoices: [...invoices.values()],
    appointments: [...appointments.values()],
    galleries: [],
  };
}

async function hydrateBundle(seed: Bundle): Promise<Bundle> {
  const requests = mapDocs(seed.orderRequests);
  const orders = mapDocs(seed.orders);
  const invoices = mapDocs(seed.invoices);
  const appointments = mapDocs(seed.appointments);
  const galleries = mapDocs(seed.galleries);

  const requestIds = new Set<string>(requests.keys());
  for (const doc of [...orders.values(), ...invoices.values(), ...appointments.values()]) {
    const id = text(doc.data.orderRequestId);
    if (id) requestIds.add(id);
  }
  await readMissing("orderRequests", requestIds, requests);

  const orderIds = new Set<string>(orders.keys());
  for (const doc of requests.values()) {
    const id = text(doc.data.convertedToOrderId) || text(doc.data.orderId);
    if (id) orderIds.add(id);
  }
  for (const doc of [...invoices.values(), ...appointments.values()]) {
    const id = text(doc.data.orderId);
    if (id) orderIds.add(id);
  }
  await readMissing("orders", orderIds, orders);

  const invoiceIds = new Set<string>(invoices.keys());
  for (const doc of [...requests.values(), ...orders.values()]) {
    const id = text(doc.data.invoiceId);
    if (id) invoiceIds.add(id);
  }
  await readMissing("invoices", invoiceIds, invoices);
  mergeDocs(invoices, await queryIn("invoices", "orderRequestId", [...requests.keys()]));
  mergeDocs(invoices, await queryIn("invoices", "orderId", [...orders.keys()]));

  mergeDocs(appointments, await queryIn("appointments", "orderRequestId", [...requests.keys()]));
  mergeDocs(appointments, await queryIn("appointments", "orderId", [...orders.keys()]));

  const galleryIds = new Set<string>(galleries.keys());
  for (const doc of [...requests.values(), ...orders.values()]) {
    const id = text(doc.data.galleryId);
    if (id) galleryIds.add(id);
  }
  await readMissing("galleries", galleryIds, galleries);
  mergeDocs(galleries, await queryIn("galleries", "orderId", [...orders.keys()]));
  mergeDocs(galleries, await queryIn("galleries", "orderRequestId", [...requests.keys()]));

  return {
    orderRequests: [...requests.values()],
    orders: [...orders.values()],
    invoices: [...invoices.values()],
    appointments: [...appointments.values()],
    galleries: [...galleries.values()],
  };
}

async function loadListingsForGroups(
  identity: { ids: string[]; email?: string | null },
  groups: BookingListingGroup[],
): Promise<BookingListingDoc[]> {
  const found = new Map<string, BookingListingDoc>();
  const email = normalizeEmail(identity.email);
  if (identity.ids.length) mergeDocs(found, await queryIn("listings", "clientId", identity.ids));
  if (email) mergeDocs(found, await queryEqual("listings", "clientEmail", email));

  const directIds = new Set<string>();
  const requestIds = new Set<string>();
  const orderIds = new Set<string>();
  const invoiceIds = new Set<string>();
  for (const group of groups) {
    if (isPortalListingId(group.stableId)) directIds.add(group.stableId);
    group.preferredListingIds.forEach((id) => {
      if (isPortalListingId(id)) directIds.add(id);
    });
    group.orderRequestIds.forEach((id) => requestIds.add(id));
    group.orderIds.forEach((id) => orderIds.add(id));
    group.invoiceIds.forEach((id) => invoiceIds.add(id));
  }
  await readMissing("listings", directIds, found);
  mergeDocs(found, await queryIn("listings", "orderRequestId", [...requestIds]));
  mergeDocs(found, await queryIn("listings", "orderId", [...orderIds]));
  mergeDocs(found, await queryIn("listings", "invoiceId", [...invoiceIds]));
  return [...found.values()];
}

async function readMissing(collectionName: string, ids: Set<string>, into: Map<string, BookingListingDoc>) {
  const missing = [...ids].filter((id) => id && !into.has(id)).slice(0, 100);
  if (missing.length === 0) return;
  const snaps = await db().getAll(...missing.map((id) => db().collection(collectionName).doc(id)));
  snaps.forEach((snap) => {
    if (!snap.exists || into.has(snap.id)) return;
    into.set(snap.id, asDoc(snap.id, snap.data()));
  });
}

async function queryIn(collectionName: string, field: string, values: string[]): Promise<BookingListingDoc[]> {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  const docs: BookingListingDoc[] = [];
  for (const part of chunk(unique, 30)) {
    const snap = await db().collection(collectionName).where(field, "in", part).limit(100).get();
    snap.docs.forEach((doc) => docs.push(asDoc(doc.id, doc.data())));
  }
  return docs;
}

async function queryEqual(collectionName: string, field: string, value: string): Promise<BookingListingDoc[]> {
  if (!value) return [];
  const snap = await db().collection(collectionName).where(field, "==", value).limit(100).get();
  return snap.docs.map((doc) => asDoc(doc.id, doc.data()));
}

function mergeDocs(into: Map<string, BookingListingDoc>, docs: BookingListingDoc[]) {
  for (const doc of docs) {
    if (doc.id && !into.has(doc.id)) into.set(doc.id, doc);
  }
}

function mapDocs(docs: BookingListingDoc[]): Map<string, BookingListingDoc> {
  const map = new Map<string, BookingListingDoc>();
  mergeDocs(map, docs);
  return map;
}

function asDoc(id: string, data: FirebaseFirestore.DocumentData | undefined): BookingListingDoc {
  return { id, data: data || {} };
}

function plainFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!allowedField(key) || value == null || value === "") continue;
    const plain = plainValue(value);
    if (plain == null) continue;
    out[key] = plain;
  }
  return out;
}

function plainValue(value: unknown): unknown {
  if (isSentinel(value)) return null;
  if (Array.isArray(value)) return value.map((item) => plainValue(item));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const nested: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined || isSentinel(item)) continue;
      nested[key] = plainValue(item);
    }
    return nested;
  }
  return value;
}

function allowedField(key: string): boolean {
  if (LOCK_FIELDS.has(key)) return true;
  if (BLOCKED_FIELDS.has(key)) return false;
  if (/cubicasa/i.test(key) || /payment/i.test(key)) return false;
  if (/^square/i.test(key) && key !== "squareFootage") return false;
  return true;
}

function timestampOrNow(value: unknown): FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return admin.firestore.Timestamp.fromDate(date);
  }
  return admin.firestore.FieldValue.serverTimestamp();
}

function alreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown }).code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

function isSentinel(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "_methodName" in value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
