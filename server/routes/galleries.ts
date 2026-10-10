/**
 * Iconic Images — Galleries Routes
 * Media upload, delivery, and client gallery access.
 * Place at: server/routes/galleries.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, requirePhotographer, requireStaff, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import {
  ICONIC_DOWNLOAD_LOCK,
  clientGalleryDownloadsUnlocked,
  publicMediaItem,
  type GalleryDownloadGate,
} from "../../shared/paymentAccess";
import { recordAddressText } from "../../shared/addressText";
import { galleryStatusNeedsReleaseGate } from "../../shared/galleryRelease";
import { deliverGalleryToClient } from "../services/galleryDeliver";
import { loadGalleryReleaseForGallery } from "../services/galleryReleaseGate";
import { handlePublicGalleryLink } from "./galleryLink";

const router = Router();
const db = () => admin.firestore();
const storage = () => admin.storage().bucket();

function adminReady(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET.",
  });
  return false;
}

async function holdIfOrderIncomplete(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  galleryId: string,
) {
  const report = await loadGalleryReleaseForGallery(galleryId);
  if (report.complete) return false;
  res.status(409).json({
    error: report.message,
    galleryRelease: report.galleryRelease,
    complete: false,
    percent: report.percent,
    gaps: report.gaps,
  });
  return true;
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

async function downloadGateForGallery(gallery: Record<string, unknown>): Promise<GalleryDownloadGate & { invoice: Record<string, unknown> | null }> {
  const invoice = await invoiceForGallery(gallery);
  const listing = await listingDownloadFlags(gallery);
  return {
    invoice,
    downloadEnabled: gallery.downloadEnabled,
    downloadsReleased: gallery.downloadsReleased === true || listing.downloadsReleased,
    lockDownloads: listing.lockDownloads,
  };
}

function clientGalleryPayload(id: string, gallery: Record<string, unknown>, gate: GalleryDownloadGate & { invoice: Record<string, unknown> | null }) {
  const unlocked = clientGalleryDownloadsUnlocked(gate);
  const invoice = gate.invoice;
  const showMedia = ["delivered", "approved"].includes(String(gallery.status || ""));
  const media = [
    ...(Array.isArray(gallery.mediaItems) ? gallery.mediaItems : []),
    ...(Array.isArray(gallery.videoLinks) ? gallery.videoLinks : []),
    ...(Array.isArray(gallery.tourLinks) ? gallery.tourLinks : []),
  ];
  return {
    id,
    title: gallery.title,
    address: recordAddressText(gallery),
    status: gallery.status,
    deliveredAt: gallery.deliveredAt || null,
    expiresAt: gallery.expiresAt || null,
    downloadEnabled: unlocked,
    paymentRequired: !unlocked,
    invoiceId: invoice?.id || null,
    invoiceStatus: invoice?.status || null,
    lockTitle: unlocked ? null : ICONIC_DOWNLOAD_LOCK.title,
    lockMessage: unlocked ? null : ICONIC_DOWNLOAD_LOCK.message,
    mediaItems: showMedia
      ? media.map((item) => publicMediaItem(
        item && typeof item === "object" ? item as Record<string, unknown> : {},
        unlocked,
      ))
      : [],
  };
}

// ─── GET /api/galleries — List galleries ─────────────────────────────────────

router.get("/", requireStaff, async (req, res) => {
  try {
    const { status, orderId } = req.query;
    let query = db().collection("galleries").orderBy("createdAt", "desc");

    if (status) query = query.where("status", "==", status) as typeof query;
    if (orderId) query = query.where("orderId", "==", orderId) as typeof query;

    const snapshot = await query.limit(100).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch galleries." });
  }
});

// Client-facing copy only. Staff detail stays in the server log.
const PUBLIC_GALLERY_NOT_FOUND = "We couldn't find this gallery.";

function publicGalleryNotFound(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  return res.status(404).json({ error: PUBLIC_GALLERY_NOT_FOUND });
}

/** Ids Firestore will not store. Real gallery ids still go through the lookup. */
function malformedPublicGalleryId(id: string): boolean {
  if (!id || id.length > 1500) return true;
  if (id === "." || id === "..") return true;
  if (id.includes("/") || id.includes("\\")) return true;
  if (/^__.*__$/.test(id)) return true;
  return /[\u0000-\u001F\u007F]/.test(id);
}

// ─── GET /api/galleries/public/:id — Public delivery link ───────────────────

router.get("/public/:id", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (malformedPublicGalleryId(id)) {
    console.warn("[Galleries] Public gallery id rejected.");
    return publicGalleryNotFound(res);
  }
  if (!admin.apps.length) {
    console.error("[Galleries] Public gallery lookup skipped: Firebase Admin is not configured.");
    return publicGalleryNotFound(res);
  }
  try {
    const doc = await db().collection("galleries").doc(id).get();
    if (!doc.exists) {
      console.info("[Galleries] Public gallery not found.", id);
      return publicGalleryNotFound(res);
    }

    const gallery = doc.data()!;
    const gate = await downloadGateForGallery(gallery);
    return res.json(clientGalleryPayload(doc.id, gallery, gate));
  } catch (err) {
    console.error("[Galleries] Public fetch error:", err);
    const code = (err as { code?: unknown }).code;
    if (code === "not-found" || code === "invalid-argument" || code === 5 || code === 3) {
      return publicGalleryNotFound(res);
    }
    return res.status(500).json({ error: "We couldn't open this gallery." });
  }
});

// ─── GET /api/galleries/link/:id — Staff-shared /studio/:id resolver ────────
// Registered before /:id so "link" is not treated as a gallery id.

router.get("/link/:id", handlePublicGalleryLink);

// ─── GET /api/galleries/:id — Get single gallery ──────────────────────────────

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const doc = await db().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });

    const gallery = doc.data()!;

    // Clients can only access delivered galleries that belong to them.
    // Staff still receive the stored document. Clients get the same
    // download lock as the public delivery link.
    const staffDoc = await db().collection("staff").doc(req.user!.uid).get();
    if (!staffDoc.exists) {
      if (gallery.clientId !== req.user!.uid) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (!["delivered", "approved"].includes(gallery.status)) {
        return res.status(403).json({ error: "Gallery not yet available." });
      }
      const gate = await downloadGateForGallery(gallery);
      return res.json({
        ...clientGalleryPayload(doc.id, gallery, gate),
        clientName: gallery.clientName || null,
      });
    }

    return res.json({ id: doc.id, ...gallery });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch gallery." });
  }
});

// ─── POST /api/galleries/:id/upload-url — Get signed upload URL ──────────────
// Photographers use this to get a pre-signed URL to upload directly to Firebase Storage

router.post("/:id/upload-url", requirePhotographer, async (req, res) => {
  try {
    const { fileName, fileType, isRaw = false } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: "fileName and fileType required." });
    }

    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });

    const folder = isRaw ? "raw" : "edited";
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `galleries/${req.params.id}/${folder}/${Date.now()}_${safeName}`;

    const file = storage().file(path);
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: fileType,
    });

    return res.json({ uploadUrl, path, fileName: safeName });
  } catch (err) {
    console.error("[Galleries] Upload URL error:", err);
    return res.status(500).json({ error: "Failed to generate upload URL." });
  }
});

// ─── POST /api/galleries/:id/media — Register uploaded media item ─────────────

router.post("/:id/media", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      storagePath, fileName, type = "photo",
      width, height, fileSize, isRaw = false
    } = req.body;

    if (!storagePath || !fileName) {
      return res.status(400).json({ error: "storagePath and fileName required." });
    }

    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });

    // Generate signed read URL (7 days)
    const file = storage().file(storagePath);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    const mediaItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url,
      storagePath,
      fileName,
      type,
      width: width || null,
      height: height || null,
      fileSize: fileSize || null,
      isRaw,
      isEdited: !isRaw,
      uploadedBy: req.user!.uid,
      uploadedAt: admin.firestore.Timestamp.now(),
    };

    await galleryDoc.ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(mediaItem),
      status: isRaw ? "raw_uploaded" : "editing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, mediaItem });
  } catch (err) {
    console.error("[Galleries] Media register error:", err);
    return res.status(500).json({ error: "Failed to register media." });
  }
});

// ─── POST /api/galleries/:id/media-link — Register hosted video/tour link ───

router.post("/:id/media-link", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const { url, title, type = "video", embedUrl, thumbnailUrl, downloadable = false } = req.body;
    if (!url) return res.status(400).json({ error: "url required." });

    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });

    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      url,
      shareUrl: url,
      embedUrl: embedUrl || url,
      thumbnailUrl: thumbnailUrl || null,
      title: title || (type === "tour" ? "3D Tour" : "Video"),
      fileName: title || url,
      type,
      downloadable,
      uploadedBy: req.user!.uid,
      uploadedAt: admin.firestore.Timestamp.now(),
    };

    await galleryDoc.ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(item),
      status: "ready_for_review",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, mediaItem: item });
  } catch (err) {
    console.error("[Galleries] Media link register error:", err);
    return res.status(500).json({ error: "Failed to register media link." });
  }
});

// ─── PATCH /api/galleries/:id/status ─────────────────────────────────────────

router.get("/:id/release", requireCoordinator, async (req, res) => {
  if (!adminReady(res)) return;
  try {
    const report = await loadGalleryReleaseForGallery(req.params.id);
    return res.json(report);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return res.status(404).json({ error: "Gallery not found." });
    console.error("[Galleries] Release check error:", err);
    return res.status(500).json({ error: "Failed to check gallery release." });
  }
});

router.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending_upload","raw_uploaded","editing","ready_for_review","approved","delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    if (galleryStatusNeedsReleaseGate(status)) {
      if (!adminReady(res)) return;
      if (await holdIfOrderIncomplete(res, req.params.id)) return;
    }

    await db().collection("galleries").doc(req.params.id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true });
  } catch (err) {
    const code = (err as { status?: number }).status;
    if (code === 404) return res.status(404).json({ error: "Gallery not found." });
    return res.status(500).json({ error: "Failed to update gallery status." });
  }
});

// ─── POST /api/galleries/:id/deliver — Deliver gallery to client ──────────────

router.post("/:id/deliver", requireCoordinator, async (req, res) => {
  try {
    if (!adminReady(res)) return;
    // Ignore body.downloadEnabled. The order screen always sends true, and
    // that must not skip the invoice. Unlock is paid, comped, zero-dollar,
    // or an existing staff release. Booking still does not collect up front.
    const result = await deliverGalleryToClient(req.params.id, {
      expiresInDays: Number(req.body?.expiresInDays),
    });
    return res.json({ success: true, deliveryUrl: result.deliveryUrl });
  } catch (err) {
    const code = (err as { status?: number }).status;
    const report = (err as { report?: { galleryRelease?: string; percent?: number; gaps?: unknown[] } }).report;
    if (code === 404) return res.status(404).json({ error: "Gallery not found." });
    if (code === 409 && report) {
      return res.status(409).json({
        error: err instanceof Error ? err.message : "Gallery stays held.",
        galleryRelease: report.galleryRelease,
        complete: false,
        percent: report.percent,
        gaps: report.gaps,
      });
    }
    console.error("[Galleries] Deliver error:", err);
    return res.status(500).json({ error: "Failed to deliver gallery." });
  }
});

// ─── PATCH /api/galleries/:id/downloads — Staff release or re-lock ───────────
// Does not create or publish a Square invoice. Billing stays after the shoot.

router.patch("/:id/downloads", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    if (typeof req.body?.released !== "boolean") {
      return res.status(400).json({ error: "released must be true or false." });
    }
    const released = req.body.released === true;
    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });

    const gallery = galleryDoc.data() || {};
    const invoice = await invoiceForGallery(gallery);
    const listing = await listingDownloadFlags(gallery);
    const downloadEnabled = clientGalleryDownloadsUnlocked({
      invoice,
      downloadEnabled: false,
      downloadsReleased: released,
      lockDownloads: listing.lockDownloads,
    });

    await galleryDoc.ref.update({
      downloadsReleased: released,
      downloadEnabled,
      downloadsReleasedAt: released ? admin.firestore.FieldValue.serverTimestamp() : null,
      downloadsReleasedBy: released ? req.user?.uid || null : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      downloadsReleased: released,
      downloadEnabled,
      lockTitle: downloadEnabled ? null : ICONIC_DOWNLOAD_LOCK.title,
      lockMessage: downloadEnabled ? null : ICONIC_DOWNLOAD_LOCK.message,
    });
  } catch (err) {
    console.error("[Galleries] Download release error:", err);
    return res.status(500).json({ error: "Failed to update gallery downloads." });
  }
});

// ─── DELETE /api/galleries/:id/media/:mediaId ─────────────────────────────────

router.delete("/:id/media/:mediaId", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });

    const gallery = galleryDoc.data()!;
    const mediaItems = (gallery.mediaItems || []).filter(
      (item: { id: string }) => item.id !== req.params.mediaId
    );

    await galleryDoc.ref.update({
      mediaItems,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to remove media item." });
  }
});

export default router;
