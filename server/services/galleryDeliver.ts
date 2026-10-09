/**
 * Client gallery delivery.
 * Shared by POST /api/galleries/:id/deliver and the staff delivery queue.
 * Holds the gallery until the order plan is complete, then writes status
 * delivered and sends the existing gallery notice. Does not edit photos.
 */

import admin from "firebase-admin";
import { recordAddressText } from "../../shared/addressText";
import { clientGalleryDownloadsUnlocked, type GalleryDownloadGate } from "../../shared/paymentAccess";
import { loadGalleryReleaseForGallery } from "./galleryReleaseGate";
import { sendEmail } from "./email";
import { sendSMS, SMS_TEMPLATES } from "./sms";

const db = () => admin.firestore();

function httpError(status: number, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, ...extra });
}

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

async function invoiceForGallery(gallery: Record<string, unknown>) {
  if (typeof gallery.invoiceId === "string" && gallery.invoiceId) {
    const doc = await db().collection("invoices").doc(gallery.invoiceId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
  }
  if (typeof gallery.orderId === "string" && gallery.orderId) {
    const snap = await db().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}

async function listingDownloadFlags(gallery: Record<string, unknown>) {
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (!listingId) return { lockDownloads: undefined as unknown, downloadsReleased: false };
  const listing = await db().collection("listings").doc(listingId).get();
  if (!listing.exists) return { lockDownloads: undefined as unknown, downloadsReleased: false };
  const data = listing.data() || {};
  return {
    lockDownloads: data.lockDownloads,
    downloadsReleased: data.downloadsReleased === true,
  };
}

async function downloadGateForGallery(gallery: Record<string, unknown>): Promise<GalleryDownloadGate> {
  const invoice = await invoiceForGallery(gallery);
  const listing = await listingDownloadFlags(gallery);
  return {
    invoice,
    downloadEnabled: gallery.downloadEnabled,
    downloadsReleased: gallery.downloadsReleased === true || listing.downloadsReleased,
    lockDownloads: listing.lockDownloads,
  };
}

export async function deliverGalleryToClient(galleryId: string, options?: { expiresInDays?: number }) {
  const galleryDoc = await db().collection("galleries").doc(galleryId).get();
  if (!galleryDoc.exists) throw httpError(404, "Gallery not found.");

  const report = await loadGalleryReleaseForGallery(galleryId);
  if (!report.complete) {
    throw httpError(409, report.message, { report });
  }

  const gallery = galleryDoc.data() || {};
  // Ignore any request download flag. Unlock is paid, comped, zero-dollar,
  // or an existing staff release. Booking still does not collect up front.
  const gate = await downloadGateForGallery(gallery);
  const downloadEnabled = clientGalleryDownloadsUnlocked(gate);
  const expiresInDays = Number(options?.expiresInDays) > 0 ? Number(options?.expiresInDays) : 30;
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
  );
  const deliveryUrl = `${appUrl()}/gallery/${galleryId}`;

  await galleryDoc.ref.update({
    status: "delivered",
    deliveryUrl,
    downloadEnabled,
    expiresAt,
    deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (gallery.orderId) {
    await db().collection("orders").doc(String(gallery.orderId)).update({
      status: "delivered",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const clientId = typeof gallery.clientId === "string" ? gallery.clientId : "";
  const clientDoc = clientId ? await db().collection("clients").doc(clientId).get() : null;
  const client = clientDoc?.data();

  if (client?.email) {
    const invoiceSnap = gallery.orderId
      ? await db().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get()
      : null;
    const invoice = invoiceSnap && !invoiceSnap.empty ? invoiceSnap.docs[0].data() : null;
    await sendEmail({
      to: client.email,
      template: "gallery_delivery",
      variables: {
        clientName: gallery.clientName,
        address: recordAddressText(gallery) || "the property",
        galleryUrl: deliveryUrl,
        invoiceAmount: invoice ? `$${invoice.total.toFixed(2)}` : "",
        paymentUrl: invoice && invoiceSnap ? `${appUrl()}/invoice/${invoiceSnap.docs[0].id}` : "",
        expiresAt: `${expiresInDays} days`,
      },
    });
  }

  if (client?.phone) {
    await sendSMS({
      to: client.phone,
      body: SMS_TEMPLATES.photosDelivered(gallery.clientName || client.name || "there", deliveryUrl),
    }).catch((err) => console.error("[Galleries] Delivery SMS failed:", err));
  }

  return { deliveryUrl, galleryStatus: "delivered" as const };
}
