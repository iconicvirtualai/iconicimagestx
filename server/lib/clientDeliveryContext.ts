/**
 * Read-only delivery lookup shared by the JSON API and the media function.
 * No sharp. The main API function can import this.
 */

import admin from "firebase-admin";
import {
  deliveryAssetsFromRecords,
  sampleDeliveryAssets,
  isClientDeliveryPreview,
  type DeliveryAsset,
} from "../../shared/clientDelivery";
import { clientGalleryDownloadsUnlocked } from "../../shared/paymentAccess";
import { readInvoiceDoc } from "./invoiceDoc";

export function deliveryTextId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function malformedDeliveryId(id: string): boolean {
  if (!id || id.length > 200) return true;
  if (id === "." || id === "..") return true;
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return true;
  return /[\u0000-\u001F\u007F]/.test(id);
}

export async function invoiceForDelivery(
  gallery: Record<string, unknown> | null,
  listing: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  if (!admin.apps.length) return null;
  const db = admin.firestore();
  const load = async (id: string) => db.collection("invoices").doc(id).get();
  const direct = deliveryTextId(gallery?.invoiceId) || deliveryTextId(listing?.invoiceId);
  if (direct) {
    const doc = await readInvoiceDoc(load, direct);
    if (doc) return { id: doc.id, ...doc.data };
  }
  const orderId = deliveryTextId(gallery?.orderId) || deliveryTextId(listing?.orderId);
  if (!orderId) return null;
  const snap = await db.collection("invoices").where("orderId", "==", orderId).limit(1).get();
  if (snap.empty) return null;
  const doc = await readInvoiceDoc(load, snap.docs[0].id);
  return doc ? { id: doc.id, ...doc.data } : null;
}

export async function loadDeliveryContext(id: string): Promise<{
  listing: Record<string, unknown> | null;
  gallery: Record<string, unknown> | null;
  invoice: Record<string, unknown> | null;
} | null> {
  if (!admin.apps.length) return null;
  const db = admin.firestore();
  const gallerySnap = await db.collection("galleries").doc(id).get();
  let gallery: Record<string, unknown> | null = gallerySnap.exists
    ? { id: gallerySnap.id, ...(gallerySnap.data() || {}) }
    : null;
  let listing: Record<string, unknown> | null = null;
  const listingId = deliveryTextId(gallery?.listingId);
  if (listingId) {
    const listingSnap = await db.collection("listings").doc(listingId).get();
    if (listingSnap.exists) listing = { id: listingSnap.id, ...(listingSnap.data() || {}) };
  }
  if (!gallery) {
    const listingSnap = await db.collection("listings").doc(id).get();
    if (!listingSnap.exists) return null;
    listing = { id: listingSnap.id, ...(listingSnap.data() || {}) };
    const found = await db.collection("galleries").where("listingId", "==", id).limit(1).get();
    if (!found.empty) gallery = { id: found.docs[0].id, ...(found.docs[0].data() || {}) };
  }
  const invoice = await invoiceForDelivery(gallery, listing);
  return { listing, gallery, invoice };
}

export function deliveryPaid(
  gallery: Record<string, unknown> | null,
  listing: Record<string, unknown> | null,
  invoice: Record<string, unknown> | null,
): boolean {
  return clientGalleryDownloadsUnlocked({
    invoice,
    downloadEnabled: gallery?.downloadEnabled,
    downloadsReleased: gallery?.downloadsReleased === true || listing?.downloadsReleased === true,
    lockDownloads: listing?.lockDownloads,
  });
}

export async function storageDownload(storagePath: string): Promise<Buffer | null> {
  if (!admin.apps.length) return null;
  try {
    const [bytes] = await admin.storage().bucket().file(storagePath).download();
    if (!bytes.length || bytes.length > 25_000_000) return null;
    return bytes;
  } catch {
    return null;
  }
}

export function assetsForDelivery(
  id: string,
  listing: Record<string, unknown> | null,
  gallery: Record<string, unknown> | null,
): DeliveryAsset[] {
  if (isClientDeliveryPreview(id)) return sampleDeliveryAssets();
  return deliveryAssetsFromRecords(listing, gallery);
}

export async function deliveryContextAssets(id: string): Promise<{ paid: boolean; assets: DeliveryAsset[] } | null> {
  if (isClientDeliveryPreview(id)) {
    return { paid: id === "preview-paid", assets: sampleDeliveryAssets() };
  }
  const context = await loadDeliveryContext(id);
  if (!context) return null;
  return {
    paid: deliveryPaid(context.gallery, context.listing, context.invoice),
    assets: assetsForDelivery(id, context.listing, context.gallery),
  };
}
