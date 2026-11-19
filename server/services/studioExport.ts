/**
 * One-click export from Studio onto the order's client gallery.
 * Writes the selected photos in order and moves the order to ready for review.
 * Does not email or text the client.
 */

import admin from "firebase-admin";
import { recordAddressText } from "../../shared/addressText";
import { galleryStatusAfterStudioAdd } from "../../shared/iconicStudio";
import { galleryDeliveryUrl } from "../../shared/galleryDelivery";
import type { StudioExportFrameInput } from "../../shared/studioPipeline";
import { galleryMediaItem, registerListingPhoto, saveListingBytes } from "./listingMedia";
import { advanceStudioPipeline } from "./studioPipeline";

const db = () => admin.firestore();

function galleryDocId(listingId: string, existing: unknown): string {
  const current = typeof existing === "string" ? existing.trim() : "";
  if (/^[A-Za-z0-9_-]{8,128}$/.test(current)) return current;
  const compact = `gal${listingId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);
  return compact.length >= 8 ? compact : `gallery${listingId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);
}

function imageRow(listingImages: Array<Record<string, unknown>>, frame: StudioExportFrameInput) {
  const path = frame.path || "";
  return listingImages.find((item) => item.path === path || item.id === path || item.id === frame.id) || null;
}

export async function exportStudioGallery(input: {
  listingId: string;
  uploadedBy: string;
  frames: StudioExportFrameInput[];
}) {
  const listingRef = db().collection("listings").doc(input.listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) {
    throw Object.assign(new Error("Listing not found."), { status: 404 });
  }
  const listing = listingSnap.data() || {};
  let images = (Array.isArray(listing.images) ? listing.images : []) as Array<Record<string, unknown>>;

  const exported: Array<Record<string, unknown>> = [];
  for (const frame of input.frames) {
    if (frame.bytesBase64) {
      const bytes = Buffer.from(frame.bytesBase64, "base64");
      if (!bytes.length) throw Object.assign(new Error("An edited photo was empty."), { status: 400 });
      const name = frame.name || "studio-edit.jpg";
      const saved = await saveListingBytes(input.listingId, name, "image/jpeg", "photos", bytes);
      const registered = await registerListingPhoto({
        listingId: input.listingId,
        storagePath: saved.storagePath,
        fileName: name,
        contentType: "image/jpeg",
        uploadedBy: input.uploadedBy,
        existingUrl: saved.url,
      });
      exported.push(registered.image as Record<string, unknown>);
      continue;
    }
    const found = imageRow(images, frame);
    if (!found || typeof found.url !== "string" || typeof found.path !== "string") {
      throw Object.assign(new Error("A selected photo is no longer on this order."), { status: 400 });
    }
    exported.push(found);
  }

  const fresh = await listingRef.get();
  images = (Array.isArray(fresh.data()?.images) ? fresh.data()!.images : images) as Array<Record<string, unknown>>;
  const exportedPaths = new Set(exported.map((item) => String(item.path || "")));
  const rest = images.filter((item) => !exportedPaths.has(String(item.path || "")));
  const orderedImages = [...exported, ...rest].map((item, index) => ({ ...item, sortOrder: index + 1, culled: false }));
  await listingRef.update({
    images: orderedImages,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const galleryId = galleryDocId(input.listingId, listing.galleryId || listing.playtestGalleryId);
  const galleryRef = db().collection("galleries").doc(galleryId);
  const gallerySnap = await galleryRef.get();
  const previous = gallerySnap.exists ? gallerySnap.data() || {} : {};
  const currentItems = Array.isArray(previous.mediaItems) ? previous.mediaItems : [];
  const extras = currentItems.filter((item: { storagePath?: string; type?: string }) => {
    const path = typeof item?.storagePath === "string" ? item.storagePath : "";
    if (path && exportedPaths.has(path)) return false;
    const type = String(item?.type || "photo").toLowerCase();
    return type !== "photo" && type !== "image" && type !== "mls" && type !== "aerial";
  });
  const now = new Date().toISOString();
  const mediaItems = [
    ...exported.map((image, index) => galleryMediaItem({
      url: String(image.url),
      name: String(image.name || `photo-${index + 1}.jpg`),
      path: String(image.path),
      contentType: typeof image.contentType === "string" ? image.contentType : "image/jpeg",
      uploadedAt: typeof image.uploadedAt === "string" ? image.uploadedAt : now,
      uploadedBy: typeof image.uploadedBy === "string" ? image.uploadedBy : input.uploadedBy,
      sortOrder: index + 1,
    })),
    ...extras,
  ];
  const address = recordAddressText(listing) || recordAddressText(previous) || "Listing";
  const status = galleryStatusAfterStudioAdd(typeof previous.status === "string" ? previous.status : "pending_upload");
  const downloadsReleased = previous.downloadsReleased === true || listing.downloadsReleased === true;
  await galleryRef.set({
    ...previous,
    listingId: input.listingId,
    orderId: typeof listing.orderId === "string" ? listing.orderId : previous.orderId || "",
    clientId: listing.clientId || previous.clientId || "",
    clientName: listing.clientName || previous.clientName || "",
    orderNumber: listing.orderNumber || previous.orderNumber || "",
    address: listing.address || previous.address || address,
    title: address,
    status,
    mediaItems,
    downloadsReleased,
    downloadEnabled: downloadsReleased || previous.downloadEnabled === true || listing.downloadEnabled === true,
    lockDownloads: listing.lockDownloads === false ? false : previous.lockDownloads,
    testOrder: listing.testOrder === true || previous.testOrder === true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(gallerySnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
  }, { merge: true });

  if (listing.galleryId !== galleryId) {
    await listingRef.update({
      galleryId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const pipeline = await advanceStudioPipeline(input.listingId, "export");
  return {
    galleryId,
    galleryStatus: status,
    orderStatus: pipeline.orderStatus,
    listingStatus: pipeline.listingStatus,
    deliveryUrl: galleryDeliveryUrl(galleryId),
    count: exported.length,
    note: `${exported.length} photo${exported.length === 1 ? "" : "s"} exported to the gallery. No client email was sent.`,
  };
}
