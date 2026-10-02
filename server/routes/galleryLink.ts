/**
 * Public resolver for staff-shared /studio/:id links.
 * Reads galleries and listings with the Admin SDK. Does not send email or SMS.
 */

import { RequestHandler } from "express";
import admin from "firebase-admin";
import {
  decideClientGalleryLink,
  invalidGalleryLinkMessage,
  type ClientGalleryLinkResult,
  type GalleryLinkDoc,
} from "../../shared/clientGalleryLink";

const db = () => admin.firestore();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function docRecord(snap: FirebaseFirestore.DocumentSnapshot): GalleryLinkDoc | null {
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

async function galleriesWhere(field: "listingId" | "orderId", id: string): Promise<GalleryLinkDoc[]> {
  try {
    const snap = await db().collection("galleries").where(field, "==", id).limit(8).get();
    return snap.docs.map((doc) => docRecord(doc)).filter((doc): doc is GalleryLinkDoc => Boolean(doc));
  } catch (err) {
    console.error(`[Galleries] ${field} lookup failed:`, err);
    return [];
  }
}

async function galleryById(id: string): Promise<GalleryLinkDoc | null> {
  if (!id) return null;
  return docRecord(await db().collection("galleries").doc(id).get());
}

async function relatedForListing(listing: GalleryLinkDoc): Promise<GalleryLinkDoc[]> {
  const related = await galleriesWhere("listingId", listing.id);
  const extras = [text(listing.galleryId), text(listing.playtestGalleryId)];
  for (const galleryId of extras) {
    if (!galleryId || related.some((doc) => doc.id === galleryId)) continue;
    const extra = await galleryById(galleryId);
    if (extra) related.push(extra);
  }
  return related;
}

export async function resolveClientGalleryLink(id: string): Promise<ClientGalleryLinkResult> {
  const [gallerySnap, listingSnap] = await Promise.all([
    db().collection("galleries").doc(id).get(),
    db().collection("listings").doc(id).get(),
  ]);
  const gallery = docRecord(gallerySnap);
  const listing = docRecord(listingSnap);

  if (gallery) {
    return decideClientGalleryLink({
      id,
      gallery,
      listing: null,
      relatedGalleries: [],
      order: null,
      orderRequest: null,
      pointedGallery: null,
      pointedListing: null,
      galleriesByOrderId: [],
    });
  }

  if (listing) {
    return decideClientGalleryLink({
      id,
      gallery: null,
      listing,
      relatedGalleries: await relatedForListing(listing),
      order: null,
      orderRequest: null,
      pointedGallery: null,
      pointedListing: null,
      galleriesByOrderId: [],
    });
  }

  const relatedGalleries = await galleriesWhere("listingId", id);
  const [orderSnap, requestSnap] = await Promise.all([
    db().collection("orders").doc(id).get(),
    db().collection("orderRequests").doc(id).get(),
  ]);
  const order = docRecord(orderSnap);
  const orderRequest = docRecord(requestSnap);
  const galleriesByOrderId = order ? await galleriesWhere("orderId", id) : [];
  const pointedGalleryId = text(orderRequest?.galleryId) || text(order?.galleryId);
  const pointedListingId = text(orderRequest?.listingId) || text(order?.listingId);
  const pointedGallery = pointedGalleryId ? await galleryById(pointedGalleryId) : null;
  let pointedListing: GalleryLinkDoc | null = null;
  let pointedRelated = relatedGalleries;
  if (!pointedGallery && pointedListingId) {
    pointedListing = docRecord(await db().collection("listings").doc(pointedListingId).get());
    if (pointedListing) pointedRelated = await relatedForListing(pointedListing);
  }

  return decideClientGalleryLink({
    id,
    gallery: null,
    listing: null,
    relatedGalleries: pointedRelated,
    order,
    orderRequest,
    pointedGallery,
    pointedListing,
    galleriesByOrderId,
  });
}

export const handlePublicGalleryLink: RequestHandler = async (req, res) => {
  const id = String(req.params.id || "");
  const invalid = invalidGalleryLinkMessage(id);
  if (invalid) {
    return res.status(400).json({ code: "invalid_id", error: invalid, message: invalid });
  }
  if (!admin.apps.length) {
    const message = "Gallery lookup is not configured on this server (Firebase Admin). This is not a missing gallery id.";
    return res.status(503).json({ code: "lookup_unavailable", error: message, message });
  }

  try {
    const result = await resolveClientGalleryLink(id);
    if (result.ok === false) {
      return res.status(result.httpStatus).json({
        code: result.code,
        error: result.message,
        message: result.message,
      });
    }
    return res.json(result);
  } catch (err) {
    console.error("[Galleries] Link resolve error:", err);
    const message = "Could not resolve this gallery link.";
    return res.status(500).json({ code: "lookup_failed", error: message, message });
  }
};
