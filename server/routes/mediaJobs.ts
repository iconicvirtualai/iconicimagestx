/**
 * Iconic Images — Media Jobs Routes
 * Provider-neutral queue for aICON photo/media processing.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, requireStaff, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

router.get("/", requireStaff, async (req, res) => {
  try {
    const { status, listingId, orderId, limit = "100" } = req.query;
    let q = db().collection("mediaJobs").orderBy("createdAt", "desc");

    if (status) q = q.where("status", "==", status) as typeof q;
    if (listingId) q = q.where("listingId", "==", listingId) as typeof q;
    if (orderId) q = q.where("orderId", "==", orderId) as typeof q;

    const snapshot = await q.limit(Math.min(Number(limit), 200)).get();
    return res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.error("[MediaJobs] List error:", err);
    return res.status(500).json({ error: "Failed to fetch media jobs." });
  }
});

router.post("/", requireStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      listingId,
      orderId,
      galleryId,
      provider = process.env.AI_PHOTO_PROVIDER || "aicon",
      preset = "real_estate_standard",
      notes = "",
      mediaItems = [],
      requirements = {},
    } = req.body;

    if (!listingId && !orderId && !galleryId) {
      return res.status(400).json({ error: "listingId, orderId, or galleryId required." });
    }

    if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
      return res.status(400).json({ error: "At least one media item is required." });
    }

    const ref = await db().collection("mediaJobs").add({
      listingId: listingId || null,
      orderId: orderId || null,
      galleryId: galleryId || null,
      provider,
      preset,
      notes,
      requirements,
      mediaItems: mediaItems.map((item: any, index: number) => ({
        id: item.id || item.path || item.name || `media_${index + 1}`,
        name: item.name || item.fileName || `Media ${index + 1}`,
        url: item.url || null,
        storagePath: item.path || item.storagePath || null,
        type: item.type || "photo",
        status: "queued",
      })),
      status: "queued",
      priority: requirements.priority || "normal",
      attempts: 0,
      createdBy: req.user?.uid || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db().collection("agentLogs").add({
      agent: "aicon-editor",
      action: "Media job queued",
      summary: `${mediaItems.length} item(s) queued for ${provider}`,
      status: "queued",
      relatedId: ref.id,
      relatedType: "mediaJob",
      priority: requirements.priority || "normal",
      requiresHumanReview: true,
      details: notes,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, jobId: ref.id });
  } catch (err) {
    console.error("[MediaJobs] Create error:", err);
    return res.status(500).json({ error: "Failed to create media job." });
  }
});

router.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, resultItems = [], error = "", requiresHumanReview } = req.body;
    const valid = ["queued", "processing", "ready_for_review", "completed", "failed", "cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status." });

    await db().collection("mediaJobs").doc(req.params.id).update({
      status,
      resultItems,
      error,
      requiresHumanReview: requiresHumanReview ?? status !== "completed",
      completedAt: status === "completed" ? admin.firestore.FieldValue.serverTimestamp() : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[MediaJobs] Status update error:", err);
    return res.status(500).json({ error: "Failed to update media job." });
  }
});

export default router;
