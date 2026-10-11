/**
 * Client gallery delivery.
 * Shared by POST /api/galleries/:id/deliver and the staff delivery queue.
 * Holds the gallery until the order plan is complete, then writes status
 * delivered and sends the existing gallery notice. Does not edit photos.
 */

import admin from "firebase-admin";
import { recordAddressText } from "../../shared/addressText";
import {
  galleryDeliveredHistoryEntry,
  galleryDeliveryPayUrl,
  galleryDeliverySubject,
  galleryDeliveryUrl,
  type GalleryEmailDelivery,
} from "../../shared/galleryDelivery";
import { readInvoiceDoc } from "../lib/invoiceDoc";
import { clientPresentationLinkFor } from "../../shared/clientPresentation";
import { clientGalleryDownloadsUnlocked, type GalleryDownloadGate } from "../../shared/paymentAccess";
import { loadGalleryReleaseForGallery } from "./galleryReleaseGate";
import { builtinEmailHtml, sendEmail } from "./email";
import { sendSMS, SMS_TEMPLATES } from "./sms";

const db = () => admin.firestore();

function httpError(status: number, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, ...extra });
}

export interface GalleryDeliverActor {
  email?: string | null;
  name?: string | null;
  uid?: string | null;
}

async function invoiceForGallery(gallery: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const load = (id: string) => db().collection("invoices").doc(id).get();
  if (typeof gallery.invoiceId === "string" && gallery.invoiceId) {
    const doc = await readInvoiceDoc(load, gallery.invoiceId);
    if (doc) return { id: doc.id, ...doc.data };
  }
  if (typeof gallery.orderId === "string" && gallery.orderId) {
    const snap = await db().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
    if (!snap.empty) {
      const doc = await readInvoiceDoc(load, snap.docs[0].id);
      if (doc) return { id: doc.id, ...doc.data };
    }
  }
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (listingId) {
    const listing = await db().collection("listings").doc(listingId).get();
    const invoiceId = listing.exists && typeof listing.data()?.invoiceId === "string"
      ? listing.data()?.invoiceId.trim()
      : "";
    if (invoiceId) {
      const doc = await readInvoiceDoc(load, invoiceId);
      if (doc) return { id: doc.id, ...doc.data };
    }
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

export async function deliverGalleryToClient(
  galleryId: string,
  options?: { expiresInDays?: number; actor?: GalleryDeliverActor; now?: Date },
) {
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
  const deliveryUrl = galleryDeliveryUrl(galleryId);
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  const presentationUrl = clientPresentationLinkFor({ id: listingId, listingId }) || "";

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
  const address = recordAddressText(gallery) || "the property";
  const invoice = await invoiceForGallery(gallery);
  const payUrl = galleryDeliveryPayUrl(invoice);
  const recipients = typeof client?.email === "string" && client.email.trim()
    ? client.email.split(/[,;]/).map((item: string) => item.trim()).filter(Boolean)
    : [];
  let emailDelivery: GalleryEmailDelivery = "suppressed";

  try {
    if (recipients.length > 0) {
      const variables = {
        clientName: String(gallery.clientName || client?.name || ""),
        address,
        presentationUrl,
        galleryUrl: deliveryUrl,
        invoiceAmount: invoice ? `$${Number((invoice as { total?: unknown }).total || 0).toFixed(2)}` : "",
        paymentUrl: payUrl || "",
        expiresAt: `${expiresInDays} days`,
      };
      const result = await sendEmail({
        to: recipients.join(", "),
        template: "gallery_delivery",
        subject: galleryDeliverySubject(address),
        html: builtinEmailHtml("gallery_delivery", variables),
        variables,
      });
      emailDelivery = result.delivery;
    }
  } catch (err) {
    await recordGalleryDelivered(gallery, {
      at: (options?.now || new Date()).toISOString(),
      actor: options?.actor,
      recipients,
      email: "suppressed",
      failed: true,
    });
    throw err;
  }

  await recordGalleryDelivered(gallery, {
    at: (options?.now || new Date()).toISOString(),
    actor: options?.actor,
    recipients,
    email: emailDelivery,
  });

  if (client?.phone) {
    await sendSMS({
      to: client.phone,
      body: SMS_TEMPLATES.photosDelivered(gallery.clientName || client.name || "there", deliveryUrl),
    }).catch((err) => console.error("[Galleries] Delivery SMS failed:", err));
  }

  return { deliveryUrl, galleryStatus: "delivered" as const };
}

async function recordGalleryDelivered(
  gallery: Record<string, unknown>,
  input: {
    at: string;
    actor?: GalleryDeliverActor;
    recipients: string[];
    email: GalleryEmailDelivery;
    failed?: boolean;
  },
) {
  const entry = galleryDeliveredHistoryEntry({
    at: input.at,
    actor: input.actor,
    recipients: input.recipients,
    email: input.email,
  });
  if (input.failed) {
    entry.details = `Recipients: ${input.recipients.join(", ") || "none"}. Email send failed.`;
  } else if (input.recipients.length === 0) {
    entry.details = "Recipients: none. Email was not sent.";
  }
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const orderId = await orderIdForGallery(gallery);
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (!orderId && !listingId) {
    console.warn("[Galleries] Gallery delivered with no order or listing to attach history to.");
    return;
  }
  if (orderId) {
    await db().collection("orders").doc(orderId).update({
      history: admin.firestore.FieldValue.arrayUnion(entry),
      updatedAt: stamp,
    });
  } else {
    console.warn("[Galleries] Gallery delivered with no order to attach history to.");
  }
  if (!listingId) return;
  await db().collection("listings").doc(listingId).update({
    auditLog: admin.firestore.FieldValue.arrayUnion(entry),
    updatedAt: stamp,
  }).catch((err) => console.error("[Galleries] Project history was not saved:", err));
}

async function orderIdForGallery(gallery: Record<string, unknown>): Promise<string> {
  if (typeof gallery.orderId === "string" && gallery.orderId.trim()) return gallery.orderId.trim();
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (!listingId) return "";
  const listing = await db().collection("listings").doc(listingId).get();
  const orderId = listing.exists ? listing.data()?.orderId : "";
  return typeof orderId === "string" ? orderId.trim() : "";
}
