/**
 * Iconic Images — Galleries Routes
 * Media upload, delivery, and client gallery access.
 * Place at: server/routes/galleries.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, requirePhotographer, requireStaff, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { sendEmail } from "../services/email";
import { sendSMS, SMS_TEMPLATES } from "../services/sms";
import { invoiceAllowsDownload, publicMediaItem } from "../../shared/paymentAccess";
import { galleryStatusNeedsReleaseGate } from "../../shared/galleryRelease";
import { loadGalleryReleaseForGallery } from "../services/galleryReleaseGate";
import { handlePublicGalleryLink } from "./galleryLink";

const router = Router();
const db = () => admin.firestore();
const storage = () => admin.storage().bucket();

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

function addressLabel(address: unknown): string {
  if (!address) return "the property";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address as Record<string, unknown>;
    if (typeof a.formatted === "string" && a.formatted) return a.formatted;
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "the property";
  }
  return String(address);
}

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

// ─── GET /api/galleries/public/:id — Public delivery link ───────────────────

router.get("/public/:id", async (req, res) => {
  try {
    const doc = await db().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });

    const gallery = doc.data()!;
    const invoice = await invoiceForGallery(gallery);
    const invoiceStatus = (invoice as any)?.status || null;
    const paid = invoiceAllowsDownload(invoice);
    const canDownload = paid;

    return res.json({
      id: doc.id,
      title: gallery.title,
      address: gallery.address,
      clientName: gallery.clientName,
      status: gallery.status,
      deliveredAt: gallery.deliveredAt || null,
      expiresAt: gallery.expiresAt || null,
      downloadEnabled: canDownload,
      paymentRequired: !paid,
      invoiceId: (invoice as any)?.id || null,
      invoiceStatus,
      mediaItems: ["delivered", "approved"].includes(gallery.status)
        ? [
            ...(gallery.mediaItems || []),
            ...(gallery.videoLinks || []),
            ...(gallery.tourLinks || []),
          ].map((item: any) => publicMediaItem(item, canDownload))
        : [],
    });
  } catch (err) {
    console.error("[Galleries] Public fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch gallery." });
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

    // Clients can only access delivered galleries that belong to them
    const staffDoc = await db().collection("staff").doc(req.user!.uid).get();
    if (!staffDoc.exists) {
      if (gallery.clientId !== req.user!.uid) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (!["delivered", "approved"].includes(gallery.status)) {
        return res.status(403).json({ error: "Gallery not yet available." });
      }
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
    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    if (await holdIfOrderIncomplete(res, req.params.id)) return;

    const gallery = galleryDoc.data()!;
    const linkedInvoice = await invoiceForGallery(gallery);
    const paid = invoiceAllowsDownload(linkedInvoice);
    const downloadEnabled = paid;
    const expiresInDays = Number(req.body?.expiresInDays) > 0 ? Number(req.body.expiresInDays) : 30;

    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    );

    // Build delivery URL (client portal)
    const deliveryUrl = `${appUrl()}/gallery/${req.params.id}`;

    await galleryDoc.ref.update({
      status: "delivered",
      deliveryUrl,
      downloadEnabled,
      expiresAt,
      deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update order status
    if (gallery.orderId) {
      await db().collection("orders").doc(gallery.orderId).update({
        status: "delivered",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Get client info for email
    const clientDoc = await db().collection("clients").doc(gallery.clientId).get();
    const client = clientDoc.data();

    if (client?.email) {
      // Get invoice for payment link
      const invoiceSnap = await db()
        .collection("invoices")
        .where("orderId", "==", gallery.orderId)
        .limit(1)
        .get();
      const invoice = invoiceSnap.empty ? null : invoiceSnap.docs[0].data();

      await sendEmail({
        to: client.email,
        template: "gallery_delivery",
        variables: {
          clientName: gallery.clientName,
          address: gallery.addressLabel || addressLabel(gallery.address),
          galleryUrl: deliveryUrl,
          invoiceAmount: invoice ? `$${invoice.total.toFixed(2)}` : "",
          paymentUrl: invoice ? `${appUrl()}/invoice/${invoiceSnap.docs[0].id}` : "",
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

    return res.json({ success: true, deliveryUrl });
  } catch (err) {
    console.error("[Galleries] Deliver error:", err);
    return res.status(500).json({ error: "Failed to deliver gallery." });
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
