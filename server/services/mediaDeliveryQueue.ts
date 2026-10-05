/**
 * Staff delivery queue.
 * Reads galleries and Iconic Studio editJobs. Does not create a second job
 * collection. Pending and Undelivered write the existing gallery status.
 * Delivered calls deliverGalleryToClient so the release hold and client
 * notice stay on that path.
 */

import admin from "firebase-admin";
import { galleryStatusNeedsReleaseGate } from "../../shared/galleryRelease";
import {
  buildMediaDeliveryQueue,
  galleryStatusForDeliveryMove,
  isMediaDeliveryStatus,
  MEDIA_DELIVERY_LABELS,
  type DeliveryGallerySource,
  type DeliveryJobSource,
  type DeliveryListingSource,
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

  return buildMediaDeliveryQueue({
    galleries,
    listings: listingSources,
    jobs,
  });
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
