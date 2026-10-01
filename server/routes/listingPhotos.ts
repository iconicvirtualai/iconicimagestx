/**
 * Staff gallery photo upload.
 * Client Storage writes to listings/ and galleries/ are denied by the live
 * bucket rules (403), and preview temp-admin is not a Firebase Auth user.
 * The Admin SDK bypasses those rules. Requires the existing staff token
 * (preview temp-admin token only when TEMP_ADMIN_ENABLED).
 */

import { randomUUID } from "crypto";
import type { RequestHandler } from "express";
import admin from "firebase-admin";
import type { AuthenticatedRequest } from "../middleware/auth";

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.VITE_FIREBASE_STORAGE_BUCKET ||
  "iconic-images-aicon.firebasestorage.app";

const CONFIG_ERROR =
  "Gallery upload is not configured on this server. In the Vercel project, set FIREBASE_SERVICE_ACCOUNT to the iconic-images-aicon service account JSON (Preview environment is enough) and FIREBASE_STORAGE_BUCKET to iconic-images-aicon.firebasestorage.app. Redeploy the preview. Do not change Storage rules to public write.";

function safeFileName(raw: unknown): string {
  const name = typeof raw === "string" && raw.trim() ? raw.trim() : "photo.jpg";
  const base = name.split(/[/\\]/).pop() || "photo.jpg";
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "photo.jpg";
}

export const handleListingPhotoUpload: RequestHandler = async (req, res) => {
  const { id } = req.params;
  if (!id || !/^[A-Za-z0-9_-]{8,}$/.test(id)) {
    return res.status(400).json({ error: "A valid project id is required.", code: "invalid-project" });
  }

  if (!admin.apps.length) {
    return res.status(503).json({ error: CONFIG_ERROR, code: "storage/not-configured" });
  }

  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "No image data was received.", code: "empty-upload" });
  }
  if (body.length > 4_500_000) {
    return res.status(413).json({
      error: "This photo is too large for the preview upload limit. It should have been resized before upload.",
      code: "file-too-large",
    });
  }

  const contentType = (req.header("content-type") || "image/jpeg").split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
    return res.status(415).json({ error: "Upload a JPG, PNG, or WebP image.", code: "unsupported-type" });
  }

  const fileName = safeFileName(req.query.name);
  const objectPath = `listings/${id}/photos/${Date.now()}_${fileName.replace(/\.\w+$/, "")}.jpg`;
  const token = randomUUID();

  try {
    const file = admin.storage().bucket(BUCKET).file(objectPath);
    await file.save(body, {
      resumable: false,
      metadata: {
        contentType: "image/jpeg",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    const image = {
      id: randomUUID(),
      url,
      name: fileName,
      path: objectPath,
      contentType: "image/jpeg",
      size: body.length,
      folderId: null,
      uploadedAt: new Date().toISOString(),
      uploadedBy: (req as AuthenticatedRequest).user?.uid || "staff",
    };

    await admin.firestore().collection("listings").doc(id).update({
      images: admin.firestore.FieldValue.arrayUnion(image),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ image });
  } catch (err) {
    console.error("[listingPhotos] upload failed:", err);
    const message = err instanceof Error ? err.message : "Upload failed.";
    const missingBucket = /bucket|credential|app\/no-app|default/i.test(message);
    return res.status(missingBucket ? 503 : 500).json({
      error: missingBucket ? CONFIG_ERROR : `Gallery upload failed: ${message}`,
      code: missingBucket ? "storage/not-configured" : "storage/upload-failed",
    });
  }
};
