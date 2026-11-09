/**
 * POST /api/virtual-staging-pro/order
 * Public professional staging request. Saves an order, uploads go straight
 * to Firebase Storage, and the office is notified. No payment, and no client
 * email or SMS.
 */

import { randomBytes, randomUUID } from "crypto";
import { Router } from "express";
import admin from "firebase-admin";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import { placedRevenueFields } from "../../shared/revenueCount";
import {
  VIRTUAL_STAGING_PRO_LEAD,
  VIRTUAL_STAGING_PRO_LINE_NAME,
  VIRTUAL_STAGING_PRO_ORDER_SOURCE,
  VIRTUAL_STAGING_PRO_SERVICE,
  VIRTUAL_STAGING_PRO_STATUS,
  isVirtualStagingProStoragePath,
  parseVirtualStagingProOrder,
  quoteVirtualStagingPro,
  virtualStagingProQaFlags,
  virtualStagingProStoragePath,
  type VirtualStagingProPhotoInput,
} from "../../shared/virtualStagingPro";
import { clientIp } from "../lib/clientIp";
import { secretsMatch } from "../lib/playtestPolicy";
import { createRateLimiter } from "../lib/rateLimit";
import { ensureBucketCors, firebaseDownloadUrl } from "../services/listingMedia";
import { notifyOfficeOfOrder } from "../services/officeOrderNotify";
import { nextOrderNumber } from "../services/orderNumbers";

const router = Router();

export const VIRTUAL_STAGING_PRO_RATE_WINDOW_MS = 15 * 60 * 1000;
export const VIRTUAL_STAGING_PRO_RATE_MAX = 5;

const orderLimiter = createRateLimiter({
  windowMs: VIRTUAL_STAGING_PRO_RATE_WINDOW_MS,
  max: VIRTUAL_STAGING_PRO_RATE_MAX,
});
const confirmLimiter = createRateLimiter({
  windowMs: VIRTUAL_STAGING_PRO_RATE_WINDOW_MS,
  max: 20,
});

export function resetVirtualStagingProRateLimit() {
  orderLimiter.reset();
  confirmLimiter.reset();
}

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

function officeError(message: string): string {
  const phone = BUSINESS_CONTACT.phoneDisplay;
  if (message.includes(phone)) return message;
  return `${message} Please call ${phone}.`;
}

const db = () => admin.firestore();
const bucket = () => admin.storage().bucket();

interface StoredPhoto {
  fileName: string;
  contentType: string;
  roomType: string;
  byteSize: number;
  storagePath: string;
  url: string;
  status: "pending" | "received";
}

function storedPhotos(value: VirtualStagingProPhotoInput[], orderId: string): StoredPhoto[] {
  return value.map((photo, index) => ({
    fileName: photo.fileName,
    contentType: photo.contentType,
    roomType: photo.roomType,
    byteSize: photo.byteSize,
    storagePath: virtualStagingProStoragePath(orderId, photo.fileName, index),
    url: "",
    status: "pending" as const,
  }));
}

function vibeNote(input: {
  style: string;
  instructions: string;
  photos: StoredPhoto[];
  total: number;
}): string {
  const rooms = input.photos.map((photo) => `${photo.roomType} (${photo.fileName})`).join(", ");
  return [
    `Style: ${input.style}`,
    `Rooms: ${rooms}`,
    input.instructions,
    `Quoted total: ${input.total}. No payment taken. Invoice after review.`,
  ].filter(Boolean).join("\n");
}

router.post("/order", async (req, res) => {
  const limit = orderLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many orders. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const parsed = parseVirtualStagingProOrder(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot === true) return res.json({ success: true, message: "Order received." });
    return res.status(400).json({ error: parsed.error });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: officeError("Orders are not available on this server yet."),
    });
  }

  const { value } = parsed;
  const quote = quoteVirtualStagingPro(value.photos.length);
  if (!quote) {
    return res.status(400).json({ error: "Add at least one photo." });
  }

  let orderNumber = "";
  try {
    orderNumber = await nextOrderNumber();
  } catch (error) {
    console.error("[VirtualStagingPro] Order number failed:", error);
    return res.status(500).json({
      error: officeError("We could not save that order."),
    });
  }

  const orderRef = db().collection("orders").doc();
  const requestRef = db().collection("orderRequests").doc();
  const photos = storedPhotos(value.photos, orderRef.id);
  const photoToken = randomBytes(24).toString("base64url");
  const note = vibeNote({
    style: value.style,
    instructions: value.instructions,
    photos,
    total: quote.total,
  });
  const qa = virtualStagingProQaFlags({
    name: value.name,
    email: value.email,
    notes: value.instructions,
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  const shared = {
    clientName: value.name,
    email: value.email,
    clientEmail: value.email,
    phone: value.phone,
    clientPhone: value.phone,
    address: value.address,
    propertyAddress: value.address,
    lineItems: quote.lineItems,
    services: quote.lineItems,
    selectedService: VIRTUAL_STAGING_PRO_SERVICE,
    packageName: VIRTUAL_STAGING_PRO_LINE_NAME,
    stylePreference: value.style,
    instructions: value.instructions,
    notes: value.instructions,
    vibeNote: note,
    photos,
    photoCount: quote.qty,
    subtotal: quote.subtotal,
    total: quote.total,
    pricing: { subtotal: quote.subtotal, tax: 0, processing: 0, total: quote.total },
    balanceDue: quote.total,
    depositPaid: 0,
    paymentStatus: "invoice_after_review",
    status: VIRTUAL_STAGING_PRO_STATUS,
    source: VIRTUAL_STAGING_PRO_ORDER_SOURCE,
    leadSource: VIRTUAL_STAGING_PRO_LEAD,
    orderNumber,
    projectType: "real_estate",
    ...placedRevenueFields(),
    ...qa,
  };

  let uploads: Array<{ storagePath: string; uploadUrl: string; contentType: string; roomType: string; fileName: string }> = [];
  try {
    await ensureBucketCors();
    const storage = bucket();
    uploads = await Promise.all(photos.map(async (photo) => {
      const [uploadUrl] = await storage.file(photo.storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 30 * 60 * 1000,
        contentType: photo.contentType,
      });
      return {
        storagePath: photo.storagePath,
        uploadUrl,
        contentType: photo.contentType,
        roomType: photo.roomType,
        fileName: photo.fileName,
      };
    }));
  } catch (error) {
    console.error("[VirtualStagingPro] Upload URL failed:", error);
    return res.status(503).json({
      error: officeError("Photo upload is not available on this server yet."),
    });
  }

  try {
    await orderRef.set({
      ...shared,
      orderRequestId: requestRef.id,
      photoToken,
      createdAt: now,
      updatedAt: now,
    });
    await requestRef.set({
      ...shared,
      orderId: orderRef.id,
      convertedToOrderId: orderRef.id,
      photoToken,
      createdAt: now,
      submittedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("[VirtualStagingPro] Order save failed:", error);
    return res.status(500).json({
      error: officeError("We could not save that order."),
    });
  }

  try {
    await notifyOfficeOfOrder({
      isNewOrder: true,
      saved: {
        id: orderRef.id,
        orderNumber,
        clientName: value.name,
        email: value.email,
        clientEmail: value.email,
        phone: value.phone,
        clientPhone: value.phone,
        address: value.address,
        propertyAddress: value.address,
        lineItems: quote.lineItems,
        services: quote.lineItems,
        selectedService: VIRTUAL_STAGING_PRO_SERVICE,
        packageName: VIRTUAL_STAGING_PRO_LINE_NAME,
        total: quote.total,
        source: VIRTUAL_STAGING_PRO_ORDER_SOURCE,
        leadSource: VIRTUAL_STAGING_PRO_LEAD,
        notes: value.instructions,
        vibeNote: note,
        stylePreference: value.style,
        photos,
      },
      adminUrl: `${appUrl()}/admin/orders`,
    });
  } catch (error) {
    console.error("[VirtualStagingPro] Office notify failed:", error);
  }

  return res.status(201).json({
    success: true,
    orderId: orderRef.id,
    orderRequestId: requestRef.id,
    orderNumber,
    total: quote.total,
    photoToken,
    uploads,
  });
});

router.post("/orders/:orderId/photos", async (req, res) => {
  const limit = confirmLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many uploads. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const orderId = String(req.params.orderId || "");
  if (!/^[A-Za-z0-9_-]{4,}$/.test(orderId)) {
    return res.status(404).json({ error: officeError("That order was not found.") });
  }
  const token = typeof req.body?.photoToken === "string" ? req.body.photoToken : "";
  const posted = Array.isArray(req.body?.photos) ? req.body.photos : null;
  if (!token || !posted) {
    return res.status(400).json({ error: officeError("That upload could not be read.") });
  }
  if (!admin.apps.length) {
    return res.status(503).json({ error: officeError("Photo upload is not available on this server yet.") });
  }

  try {
    const orderRef = db().collection("orders").doc(orderId);
    const snap = await orderRef.get();
    const order = snap.data();
    if (!snap.exists || !order || order.source !== VIRTUAL_STAGING_PRO_ORDER_SOURCE) {
      return res.status(404).json({ error: officeError("That order was not found.") });
    }
    if (!secretsMatch(token, order.photoToken)) {
      return res.status(404).json({ error: officeError("That order was not found.") });
    }

    const photos = Array.isArray(order.photos) ? order.photos as StoredPhoto[] : [];
    if (photos.length === 0) {
      return res.status(400).json({ error: officeError("That order has no photos.") });
    }
    if (photos.every((photo) => photo.status === "received" && photo.url)) {
      return res.json({ success: true, orderNumber: order.orderNumber, total: order.total });
    }

    const paths = new Set(posted.map((entry: { storagePath?: unknown }) => (
      typeof entry?.storagePath === "string" ? entry.storagePath : ""
    )));
    if (photos.some((photo) => !paths.has(photo.storagePath))) {
      return res.status(400).json({ error: officeError("Upload every photo, then submit again.") });
    }

    const storage = bucket();
    const received: StoredPhoto[] = [];
    for (const photo of photos) {
      if (!isVirtualStagingProStoragePath(orderId, photo.storagePath)) {
        return res.status(400).json({ error: officeError("A photo could not be saved.") });
      }
      const file = storage.file(photo.storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(400).json({ error: officeError("A photo did not finish uploading.") });
      }
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size || 0);
      const rawType = String(metadata.contentType || "").toLowerCase();
      if (!Number.isFinite(size) || size < 1 || size > photo.byteSize) {
        await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        return res.status(413).json({ error: officeError("A photo is larger than the 12 MB limit.") });
      }
      if (rawType && rawType !== "application/octet-stream" && rawType !== photo.contentType) {
        await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        return res.status(415).json({ error: officeError("Upload a JPG, PNG, or WebP photo.") });
      }
      const downloadToken = randomUUID();
      await file.setMetadata({
        contentType: photo.contentType,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      });
      received.push({
        ...photo,
        url: firebaseDownloadUrl(storage.name, photo.storagePath, downloadToken),
        status: "received",
      });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await orderRef.update({ photos: received, updatedAt: now });
    const requestId = typeof order.orderRequestId === "string" ? order.orderRequestId : "";
    if (requestId) {
      await db().collection("orderRequests").doc(requestId).update({ photos: received, updatedAt: now });
    }
    return res.json({ success: true, orderNumber: order.orderNumber, total: order.total });
  } catch (error) {
    console.error("[VirtualStagingPro] Photo confirm failed:", error);
    return res.status(500).json({ error: officeError("We could not save those photos.") });
  }
});

export default router;
