/**
 * Iconic Images — Galleries Routes
 * Media upload, delivery, and client gallery access.
 * Place at: server/routes/galleries.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import sharp from "sharp";
import { requireCoordinator, requirePhotographer, requireStaff, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { sendEmail } from "../services/email";
import { sendSMS, SMS_TEMPLATES } from "../services/sms";

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

function timestampDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function signedReadUrl(path: string, minutes = 30) {
  const [url] = await storage().file(path).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + minutes * 60 * 1000,
  });
  return url;
}

async function createWatermarkedPreview(storagePath: string, galleryId: string, mediaId: string) {
  const [source] = await storage().file(storagePath).download();
  const resized = await sharp(source)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const width = resized.info.width;
  const height = resized.info.height;
  const fontSize = Math.max(28, Math.round(width / 18));
  const watermark = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${width / 2} ${height / 2}) rotate(-28)">
        <text x="0" y="0" text-anchor="middle" fill="white" fill-opacity="0.52"
          stroke="black" stroke-opacity="0.28" stroke-width="2"
          font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700"
          letter-spacing="8">ICONIC IMAGES • PREVIEW</text>
      </g>
    </svg>`);
  const preview = await sharp(resized.data)
    .composite([{ input: watermark, gravity: "center" }])
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  const previewStoragePath = `galleries/${galleryId}/previews/${mediaId}.jpg`;
  await storage().file(previewStoragePath).save(preview, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: { cacheControl: "private, max-age=1800" },
  });
  return previewStoragePath;
}

async function publicMediaItem(item: any, canDownload: boolean, galleryId: string) {
  const isHostedLink = ["video", "reel", "tour", "matterport"].includes(item.type);
  const previewPath = item.previewStoragePath || (canDownload ? item.storagePath : null);
  const displayUrl = previewPath
    ? await signedReadUrl(previewPath)
    : isHostedLink
      ? item.shareUrl || item.embedUrl || item.url
      : canDownload
        ? item.url
        : null;
  return {
    id: item.id,
    url: displayUrl,
    shareUrl: isHostedLink ? item.shareUrl || item.url || item.embedUrl || null : null,
    embedUrl: isHostedLink ? item.embedUrl || item.url || null : null,
    fileName: item.fileName || item.title || "Media",
    title: item.title || item.fileName || "Media",
    type: item.type || "photo",
    width: item.width || null,
    height: item.height || null,
    canDownload: Boolean(canDownload && item.downloadable !== false),
    downloadUrl: canDownload && item.storagePath && item.downloadable !== false
      ? `/api/galleries/public/${galleryId}/media/${item.id}/download`
      : null,
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

// ─── GET /api/galleries/public/:id — Public delivery link ───────────────────

router.get("/public/:id", async (req, res) => {
  try {
    const doc = await db().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });

    const gallery = doc.data()!;
    const invoiceSnap = gallery.orderId
      ? await db().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get()
      : null;
    const invoice = invoiceSnap && !invoiceSnap.empty
      ? { id: invoiceSnap.docs[0].id, ...invoiceSnap.docs[0].data() }
      : null;
    const invoiceStatus = (invoice as any)?.status || null;
    const paid = invoiceStatus === "paid" || Number((invoice as any)?.amountDue || 0) <= 0;
    const expiry = timestampDate(gallery.expiresAt);
    const expired = Boolean(expiry && expiry.getTime() < Date.now());
    const canDownload = Boolean(gallery.downloadEnabled) && paid && !expired;
    const items = ["delivered", "approved"].includes(gallery.status) && !expired
      ? [
          ...(gallery.mediaItems || []),
          ...(gallery.videoLinks || []),
          ...(gallery.tourLinks || []),
        ]
      : [];

    return res.json({
      id: doc.id,
      title: gallery.title,
      address: gallery.address,
      clientName: gallery.clientName,
      status: gallery.status,
      deliveredAt: gallery.deliveredAt || null,
      expiresAt: gallery.expiresAt || null,
      expired,
      downloadEnabled: canDownload,
      paymentRequired: !paid,
      invoiceId: (invoice as any)?.id || null,
      invoiceStatus,
      mediaItems: await Promise.all(items.map((item: any) => publicMediaItem(item, canDownload, doc.id))),
    });
  } catch (err) {
    console.error("[Galleries] Public fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch gallery." });
  }
});

// Originals are only issued after gallery, expiry, and payment checks pass.
router.get("/public/:id/media/:mediaId/download", async (req, res) => {
  try {
    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = galleryDoc.data()!;
    if (!["delivered", "approved"].includes(gallery.status)) {
      return res.status(403).json({ error: "Gallery has not been released." });
    }
    const expiry = timestampDate(gallery.expiresAt);
    if (expiry && expiry.getTime() < Date.now()) {
      return res.status(410).json({ error: "This gallery delivery link has expired." });
    }
    const invoiceSnap = gallery.orderId
      ? await db().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get()
      : null;
    const invoice = invoiceSnap && !invoiceSnap.empty ? invoiceSnap.docs[0].data() : null;
    const paid = !invoice || invoice.status === "paid" || Number(invoice.amountDue || 0) <= 0;
    if (!gallery.downloadEnabled || !paid) {
      return res.status(402).json({ error: "Payment is required before downloading." });
    }
    const item = (gallery.mediaItems || []).find((media: any) => media.id === req.params.mediaId);
    if (!item?.storagePath || item.downloadable === false) {
      return res.status(404).json({ error: "Download not available." });
    }
    const safeFileName = String(item.fileName || "iconic-media").replace(/["\\]/g, "_");
    const [downloadUrl] = await storage().file(item.storagePath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
      responseDisposition: `attachment; filename="${safeFileName}"`,
    });
    return res.redirect(302, downloadUrl);
  } catch (err) {
    console.error("[Galleries] Download error:", err);
    return res.status(500).json({ error: "Failed to prepare download." });
  }
});

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
      storagePath, fileName, fileType, type = "photo",
      width, height, fileSize, isRaw = false
    } = req.body;

    if (!storagePath || !fileName) {
      return res.status(400).json({ error: "storagePath and fileName required." });
    }

    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });

    const mediaId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isPhoto = type === "photo" && !isRaw && String(fileType || "").startsWith("image/");
    let previewStoragePath: string | null = null;
    if (isPhoto) {
      previewStoragePath = await createWatermarkedPreview(storagePath, req.params.id, mediaId);
    }
    const mediaItem = {
      id: mediaId,
      storagePath,
      previewStoragePath,
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

router.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending_upload","raw_uploaded","editing","ready_for_review","approved","delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    await db().collection("galleries").doc(req.params.id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update gallery status." });
  }
});

// ─── POST /api/galleries/:id/deliver — Deliver gallery to client ──────────────

router.post("/:id/deliver", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });

    const gallery = galleryDoc.data()!;
    const { downloadEnabled = true, expiresInDays = 30 } = req.body;

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
