/**
 * Staff delivery queue.
 * Reads galleries and Iconic Studio editJobs. Does not create a second job
 * collection. Pending and Undelivered write the existing gallery status.
 * Delivered calls deliverGalleryToClient so the release hold and client
 * notice stay on that path.
 * Listing the queue also checks, in batches, that each linked listing
 * (project) and gallery still exists. Missing records are flagged. Nothing
 * is deleted or rewritten.
 */

import admin from "firebase-admin";
import { galleryStatusNeedsReleaseGate } from "../../shared/galleryRelease";
import {
  applyLinkedRecordPresence,
  buildMediaDeliveryQueue,
  collectLinkedRecordPresence,
  galleryStatusForDeliveryMove,
  isMediaDeliveryStatus,
  MEDIA_DELIVERY_LABELS,
  type DeliveryGallerySource,
  type DeliveryJobSource,
  type DeliveryListingSource,
  type LinkedRecordSnap,
  type MediaDeliveryRow,
  type MediaDeliveryStatus,
} from "../../shared/mediaDelivery";
import { deliverGalleryToClient } from "./galleryDeliver";
import { listingsForRole } from "./studioJobs";

const db = () => admin.firestore();

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function listMediaDeliveryQueue(input: { uid: string; role: string }): Promise<MediaDeliveryRow[]> {
  const listings = await listingsForRole(input.uid, input.role);
  const allowed = input.role === "photographer" ? new Set(listings.map((item) => item.id)) : null;
  const [gallerySnap, jobSnap] = await Promise.all([
    db().collection("galleries").orderBy("createdAt", "desc").limit(100).get(),
    db().collection("editJobs").limit(200).get(),
  ]);

  const galleries: DeliveryGallerySource[] = [];
  for (const doc of gallerySnap.docs) {
    const data = doc.data() || {};
    const listingId = asString(data.listingId);
    if (allowed && (!listingId || !allowed.has(listingId))) continue;
    galleries.push({
      id: doc.id,
      status: asString(data.status),
      listingId,
      orderId: asString(data.orderId),
      clientName: asString(data.clientName),
      address: data.address,
      addressLabel: data.addressLabel,
      title: data.title,
      mediaCount: Array.isArray(data.mediaItems) ? data.mediaItems.length : 0,
    });
  }

  const jobs: DeliveryJobSource[] = jobSnap.docs.flatMap((doc) => {
    const data = doc.data() || {};
    const listingId = asString(data.listingId);
    if (!listingId) return [];
    if (allowed && !allowed.has(listingId)) return [];
    return [{ id: doc.id, listingId, status: asString(data.status) }];
  });

  const listingSources: DeliveryListingSource[] = listings.map((item) => ({
    id: item.id,
    address: item.data.address,
    shootLocation: item.data.shootLocation,
    galleryId: asString(item.data.galleryId) || asString(item.data.playtestGalleryId),
  }));

  const rows = buildMediaDeliveryQueue({
    galleries,
    listings: listingSources,
    jobs,
  });
  const galleryIdByListing = new Map<string, string>();
  for (const listing of listingSources) {
    if (listing.galleryId) galleryIdByListing.set(listing.id, listing.galleryId);
  }
  const loadedListingIds = new Set(listingSources.map((listing) => listing.id));
  const loadedGalleryIds = new Set(galleries.map((gallery) => gallery.id));
  const [listingPresence, galleryPresence] = await Promise.all([
    collectLinkedRecordPresence(
      rows.map((row) => row.listingId),
      loadedListingIds,
      (ids) => readExistingDocuments("listings", ids),
    ),
    collectLinkedRecordPresence(
      [...rows.map((row) => row.galleryId), ...galleryIdByListing.values()],
      loadedGalleryIds,
      (ids) => readExistingDocuments("galleries", ids),
    ),
  ]);
  return applyLinkedRecordPresence(
    rows,
    { listings: listingPresence, galleries: galleryPresence },
    galleryIdByListing,
  );
}

/** One batched read for a chunk of document ids. Missing docs come back exists: false. */
async function readExistingDocuments(
  collectionName: "listings" | "galleries",
  ids: string[],
): Promise<LinkedRecordSnap[]> {
  if (ids.length === 0) return [];
  const snaps = await db().getAll(...ids.map((id) => db().collection(collectionName).doc(id)));
  return snaps.map((snap) => ({ id: snap.id, exists: snap.exists }));
}

export async function moveMediaDelivery(input: {
  galleryId: string;
  status: string;
  expiresInDays?: number;
}) {
  if (!isMediaDeliveryStatus(input.status)) {
    throw httpError(400, "Status must be pending, undelivered, or delivered.");
  }
  const galleryId = input.galleryId.trim();
  if (input.status === "delivered") {
    const delivered = await deliverGalleryToClient(galleryId, { expiresInDays: input.expiresInDays });
    return {
      galleryId,
      galleryStatus: delivered.galleryStatus,
      deliveryStatus: "delivered" satisfies MediaDeliveryStatus,
      label: MEDIA_DELIVERY_LABELS.delivered,
      deliveryUrl: delivered.deliveryUrl,
    };
  }

  const snap = await db().collection("galleries").doc(galleryId).get();
  if (!snap.exists) throw httpError(404, "Gallery not found.");
  const data = snap.data() || {};
  const hasMedia = Array.isArray(data.mediaItems) && data.mediaItems.length > 0;
  const next = galleryStatusForDeliveryMove(input.status, hasMedia);
  if (galleryStatusNeedsReleaseGate(next)) {
    throw httpError(400, "Delivered galleries go through gallery deliver.");
  }
  await snap.ref.update({
    status: next,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return {
    galleryId,
    galleryStatus: next,
    deliveryStatus: input.status,
    label: MEDIA_DELIVERY_LABELS[input.status],
  };
}
