/**
 * Client listing file inside the portal.
 * Reads the listing, order, gallery, and invoice draft already saved at booking.
 * Hide/unhide and site style write portalMedia / portalWebsite on that listing.
 * Data-tab edits write portalData. Coordinates already on the listing stay put.
 */

import type { RequestHandler } from "express";
import admin from "firebase-admin";
import type { AuthenticatedRequest } from "../middleware/auth";
import { clientCanViewListing } from "../../shared/listingAccess";
import {
  applyPortalMediaChange,
  buildPortalListingDetail,
  portalListingFactsWrite,
  portalListingId,
  readMediaStore,
  sanitizeWebsiteSettings,
  visitorPortalListingDetail,
  type PortalListingSources,
  type PortalMediaChange,
  type PortalMediaKind,
} from "../../shared/portalListingDetail";
import { jsonSafe } from "../lib/firestoreJson";
import { resolveClientIdentity } from "../services/clientAccounts";
import { filePhotoEditRequest, PhotoEditRequestError } from "../services/photoEditRequests";

const db = () => admin.firestore();

const KINDS = new Set<PortalMediaKind>(["photo", "video", "floorplan", "tour"]);

function adminReady(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (admin.apps.length) return true;
  res.status(503).json({ error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT." });
  return false;
}

function listingIdFrom(value: unknown): string {
  return portalListingId(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sendKnownError(res: { status: (code: number) => { json: (body: unknown) => unknown } }, err: unknown, fallback: string) {
  const status = err instanceof PhotoEditRequestError ? err.status : (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Portal listing]", err);
  return res.status(500).json({ error: fallback });
}

async function readDoc(collectionName: string, id: string): Promise<Record<string, unknown> | null> {
  if (!id) return null;
  try {
    const snap = await db().collection(collectionName).doc(id).get();
    if (!snap.exists) return null;
    return jsonSafe({ id: snap.id, ...(snap.data() || {}) }) as Record<string, unknown>;
  } catch (err) {
    console.error(`[Portal listing] ${collectionName}/${id} read failed:`, err);
    return null;
  }
}

async function readWhere(collectionName: string, field: string, value: string): Promise<Array<Record<string, unknown>>> {
  if (!value) return [];
  try {
    const snap = await db().collection(collectionName).where(field, "==", value).limit(10).get();
    return snap.docs.map((doc) => jsonSafe({ id: doc.id, ...(doc.data() || {}) }) as Record<string, unknown>);
  } catch (err) {
    console.error(`[Portal listing] ${collectionName}.${field} lookup failed:`, err);
    return [];
  }
}

function unique(records: Array<Record<string, unknown> | null | undefined>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  for (const record of records) {
    if (!record) continue;
    const id = text(record.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(record);
  }
  return out;
}

async function loadSources(listingId: string, listing: Record<string, unknown>): Promise<PortalListingSources> {
  const requestId = text(listing.orderRequestId);
  const requests = unique([
    await readDoc("orderRequests", requestId),
    ...(await readWhere("orderRequests", "listingId", listingId)),
  ]);
  const orderRequest = requests.find((record) => record.id === requestId) || requests[0] || null;
  const orderId = text(listing.orderId) || text(orderRequest?.convertedToOrderId) || text(orderRequest?.orderId);
  const orders = unique([
    await readDoc("orders", orderId),
    ...(await readWhere("orders", "listingId", listingId)),
  ]);
  const order = orders.find((record) => record.id === orderId) || orders[0] || null;
  const invoiceIds = [text(listing.invoiceId), text(order?.invoiceId), text(orderRequest?.invoiceId)].filter(Boolean);
  const galleryId = text(listing.galleryId) || text(orderRequest?.galleryId) || text(order?.galleryId);
  const [invoiceDocs, invoicesByListing, invoicesByOrder, invoicesByRequest, galleryDoc, galleriesByListing, galleriesByOrder, appointmentsByRequest, appointmentsByOrder, appointmentsByListing] = await Promise.all([
    Promise.all(invoiceIds.map((id) => readDoc("invoices", id))),
    readWhere("invoices", "listingId", listingId),
    readWhere("invoices", "orderId", text(order?.id)),
    readWhere("invoices", "orderRequestId", text(orderRequest?.id)),
    readDoc("galleries", galleryId),
    readWhere("galleries", "listingId", listingId),
    readWhere("galleries", "orderId", text(order?.id)),
    readWhere("appointments", "orderRequestId", text(orderRequest?.id)),
    readWhere("appointments", "orderId", text(order?.id)),
    readWhere("appointments", "listingId", listingId),
  ]);

  return {
    listing,
    orderRequest,
    order,
    invoices: unique([...invoiceDocs, ...invoicesByListing, ...invoicesByOrder, ...invoicesByRequest]),
    galleries: unique([galleryDoc, ...galleriesByListing, ...galleriesByOrder]),
    appointments: unique([...appointmentsByRequest, ...appointmentsByOrder, ...appointmentsByListing]),
  };
}

async function authorizedListing(req: AuthenticatedRequest, listingId: string) {
  const snap = await db().collection("listings").doc(listingId).get();
  if (!snap.exists) {
    throw Object.assign(new Error("Listing not found."), { status: 404 });
  }
  const listing = jsonSafe({ id: snap.id, ...(snap.data() || {}) }) as Record<string, unknown>;
  const identity = await resolveClientIdentity(req.user!.uid, req.user!.email);
  if (!clientCanViewListing(listing, { uid: req.user!.uid, email: identity.email, ids: identity.ids })) {
    throw Object.assign(new Error("You do not have access to this listing."), { status: 403 });
  }
  return listing;
}

function mediaChange(body: unknown): PortalMediaChange | null {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const kind = text(row.kind);
  const id = text(row.id);
  if (!KINDS.has(kind as PortalMediaKind) || !id) return null;
  if (typeof row.hidden === "boolean") return { kind: kind as PortalMediaKind, id, hidden: row.hidden };
  if (row.move === "earlier" || row.move === "later") return { kind: kind as PortalMediaKind, id, move: row.move };
  return null;
}

async function appendPortalWrite(listingId: string, patch: { portalMedia?: unknown; portalWebsite?: unknown; portalData?: unknown; activity: { id: string; at: string; kind: string; summary: string } }) {
  const ref = db().collection("listings").doc(listingId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const existing = Array.isArray(data.portalActivity) ? data.portalActivity : [];
    const activity = [...existing, patch.activity].slice(-200);
    const update: Record<string, unknown> = {
      portalActivity: activity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (patch.portalMedia) update.portalMedia = patch.portalMedia;
    if (patch.portalWebsite) update.portalWebsite = patch.portalWebsite;
    if (patch.portalData) update.portalData = patch.portalData;
    tx.update(ref, update);
  });
}

/** Link read. No session. Writes stay on the authenticated client routes. */
export const handleGetPublicPortalListing: RequestHandler = async (req, res) => {
  const listingId = portalListingId(req.params.id);
  if (!listingId) return res.status(404).json({ error: "Listing not found." });
  if (!adminReady(res)) return;
  try {
    const snap = await db().collection("listings").doc(listingId).get();
    if (!snap.exists) return res.status(404).json({ error: "Listing not found." });
    const listing = jsonSafe({ id: snap.id, ...(snap.data() || {}) }) as Record<string, unknown>;
    const detail = visitorPortalListingDetail(buildPortalListingDetail(await loadSources(listingId, listing)));
    return res.json(detail);
  } catch (err) {
    return sendKnownError(res, err, "Failed to load this listing.");
  }
};

export const handleGetPortalListing: RequestHandler = async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  try {
    const listing = await authorizedListing(req, listingId);
    const detail = buildPortalListingDetail(await loadSources(listingId, listing));
    return res.json(detail);
  } catch (err) {
    return sendKnownError(res, err, "Failed to load this listing.");
  }
};

export const handlePatchPortalMedia: RequestHandler = async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  const change = mediaChange(req.body);
  if (!change) return res.status(400).json({ error: "Say which file to hide, show, or move." });
  try {
    const listing = await authorizedListing(req, listingId);
    const sources = await loadSources(listingId, listing);
    const detail = buildPortalListingDetail(sources);
    const items = [...detail.photos, ...detail.videos, ...detail.floorplans, ...detail.tours];
    const result = applyPortalMediaChange(readMediaStore(listing.portalMedia), items, change, new Date().toISOString());
    if (result.ok === false) return res.status(400).json({ error: result.error });
    if (result.activity) {
      await appendPortalWrite(listingId, { portalMedia: result.store, activity: result.activity });
    }
    const refreshed = await authorizedListing(req, listingId);
    return res.json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError(res, err, "Could not update that file.");
  }
};

export const handlePatchPortalData: RequestHandler = async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  try {
    const listing = await authorizedListing(req, listingId);
    const detail = buildPortalListingDetail(await loadSources(listingId, listing));
    const write = portalListingFactsWrite(detail, req.body, new Date().toISOString());
    if (write.ok === false) return res.status(400).json({ error: write.error });
    if (write.changed) {
      await appendPortalWrite(listingId, { portalData: write.portalData, activity: write.activity });
    }
    const refreshed = await authorizedListing(req, listingId);
    return res.json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError(res, err, "Could not save listing facts.");
  }
};

/** Owner files a note on one photo already shown on this listing. */
export const handleCreatePhotoEditRequest: RequestHandler = async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const photoId = text(body.photoId);
  const note = typeof body.note === "string" ? body.note : "";
  if (!photoId) return res.status(400).json({ error: "Choose one photo." });
  try {
    const listing = await authorizedListing(req, listingId);
    const detail = buildPortalListingDetail(await loadSources(listingId, listing));
    const photo = detail.photos.find((item) => item.id === photoId);
    if (!photo) return res.status(400).json({ error: "That photo is not on this listing." });
    await filePhotoEditRequest({
      listingId,
      photoId,
      photoName: photo.name,
      photoUrl: photo.url,
      note,
      clientId: req.user!.uid,
      knownPhotoIds: detail.photos.map((item) => item.id),
      at: new Date().toISOString(),
    });
    const refreshed = await authorizedListing(req, listingId);
    return res.status(201).json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError(res, err, "Could not save that edit request.");
  }
};

export const handlePatchPortalWebsite: RequestHandler = async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  try {
    const listing = await authorizedListing(req, listingId);
    const current = sanitizeWebsiteSettings(listing.portalWebsite);
    const next = sanitizeWebsiteSettings(req.body, current);
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    if (changed) {
      await appendPortalWrite(listingId, {
        portalWebsite: next,
        activity: {
          id: `portal-website-${new Date().toISOString()}`,
          at: new Date().toISOString(),
          kind: "website",
          summary: "Listing site updated",
        },
      });
    }
    const refreshed = await authorizedListing(req, listingId);
    return res.json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError(res, err, "Could not save the listing site.");
  }
};
