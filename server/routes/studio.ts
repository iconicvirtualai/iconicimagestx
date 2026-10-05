/**
 * Iconic Studio staff API.
 * Default edits come from the order (package line items + Iconic Polish).
 * POST /ai-edit is a staff override for one frame and calls OpenAI Images.
 * POST /order-edits writes those order jobs and runs the next photo.
 * POST /order-queue/tick runs one queued photo and can chain the next tick.
 * Approve copies a finished JPEG/PNG/WebP onto the listing finals path.
 * It does not send the gallery or client email. Delivery stays held until
 * the order plan is 100% complete.
 * GET /delivery-queue lists galleries with Iconic labels Pending,
 * Undelivered, and Delivered. POST /delivery-queue/move writes those
 * labels through the gallery status or the gallery deliver path.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { parseAiEditRequest, resolveStudioApprovePath } from "../../shared/iconicStudio";
import { isMediaDeliveryStatus } from "../../shared/mediaDelivery";
import { requireCoordinator, requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { loadGalleryReleaseReport } from "../services/galleryReleaseGate";
import { listMediaDeliveryQueue, moveMediaDelivery } from "../services/mediaDeliveryQueue";
import { kickStudioQueue } from "../services/studioQueueKick";
import {
  advanceOrderEditQueue,
  approveStudioFinal,
  assertStudioAccess,
  enqueueAiEdit,
  loadStudioWorkspace,
  nextOrderEditListingId,
  queueOrderEdits,
  rejectStudioJob,
  saveAdjustedJpeg,
  setIconicPolish,
} from "../services/studioJobs";

const router = Router();

function adminReady(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET.",
  });
  return false;
}

function cronAuthorized(req: { headers: { authorization?: string } }) {
  const secret = typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

function requireStaffOrQueueCron(req: AuthenticatedRequest, res: Parameters<typeof requireStaff>[1], next: Parameters<typeof requireStaff>[2]) {
  if (cronAuthorized(req)) {
    req.user = { uid: "studio-queue" } as AuthenticatedRequest["user"];
    req.staffRole = "admin";
    return next();
  }
  return requireStaff(req, res, next);
}

function sendKnownError(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  err: unknown,
  fallback: string,
) {
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Studio]", err);
  return res.status(500).json({ error: fallback });
}

router.get("/workspace", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = typeof req.query.listingId === "string" ? req.query.listingId : "";
    const payload = await loadStudioWorkspace({
      uid: req.user!.uid,
      role: req.staffRole || "",
      listingId: listingId || undefined,
    });
    if (payload.listing && typeof payload.listing.id === "string") {
      try {
        payload.listing.release = await loadGalleryReleaseReport(payload.listing.id);
      } catch (err) {
        console.error("[Studio] Gallery gate failed:", err instanceof Error ? err.message : err);
        payload.listing.release = null;
      }
    }
    return res.json(payload);
  } catch (err) {
    return sendKnownError(res, err, "Failed to load Iconic Studio.");
  }
});

router.get("/delivery-queue", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const rows = await listMediaDeliveryQueue({
      uid: req.user!.uid,
      role: req.staffRole || "",
    });
    return res.json({ rows });
  } catch (err) {
    return sendKnownError(res, err, "Failed to load the delivery queue.");
  }
});

router.post("/delivery-queue/move", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  const galleryId = String(req.body?.galleryId || "").trim();
  const status = String(req.body?.status || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(galleryId)) {
    return res.status(400).json({ error: "A valid gallery id is required." });
  }
  if (!isMediaDeliveryStatus(status)) {
    return res.status(400).json({ error: "Status must be pending, undelivered, or delivered." });
  }
  if (!adminReady(res)) return;
  try {
    const result = await moveMediaDelivery({
      galleryId,
      status,
      expiresInDays: Number(req.body?.expiresInDays),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    const code = (err as { status?: number }).status;
    const report = (err as { report?: { galleryRelease?: string; percent?: number; gaps?: unknown[] } }).report;
    if (code === 409 && report) {
      return res.status(409).json({
        error: err instanceof Error ? err.message : "Gallery stays held.",
        galleryRelease: report.galleryRelease,
        complete: false,
        percent: report.percent,
        gaps: report.gaps,
      });
    }
    return sendKnownError(res, err, "Failed to update delivery.");
  }
});

router.post("/order-edits", requireStaff, async (req: AuthenticatedRequest, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!adminReady(res)) return;
  try {
    await assertStudioAccess(req.user!.uid, req.staffRole || "", listingId);
    const result = await queueOrderEdits({ listingId, createdBy: req.user!.uid });
    return res.status(201).json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to queue the order edits.");
  }
});

router.post("/order-queue/tick", requireStaffOrQueueCron, async (req: AuthenticatedRequest, res) => {
  let listingId = String(req.body?.listingId || "").trim();
  if (listingId && !/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!listingId && req.user?.uid !== "studio-queue") {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!adminReady(res)) return;
  try {
    if (!listingId) {
      const found = await nextOrderEditListingId();
      if (!found) {
        return res.json({ prepared: 0, ran: null, remaining: 0, waiting: 0, shouldFollowUp: false });
      }
      listingId = found;
    } else if (req.user?.uid !== "studio-queue") {
      await assertStudioAccess(req.user!.uid, req.staffRole || "", listingId);
    }
    const result = await advanceOrderEditQueue({
      listingId,
      createdBy: req.user!.uid,
      retryFailed: false,
    });
    if (req.body?.chain === true && result.shouldFollowUp) kickStudioQueue(listingId);
    return res.json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to advance the order edit queue.");
  }
});

router.post("/iconic-polish", requireStaff, async (req: AuthenticatedRequest, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (typeof req.body?.iconicPolish !== "boolean") {
    return res.status(400).json({ error: "iconicPolish must be true or false." });
  }
  if (!adminReady(res)) return;
  try {
    await assertStudioAccess(req.user!.uid, req.staffRole || "", listingId);
    const result = await setIconicPolish({ listingId, iconicPolish: req.body.iconicPolish });
    return res.json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to save Iconic Polish.");
  }
});

router.post("/ai-edit", requireStaff, async (req: AuthenticatedRequest, res) => {
  const parsed = parseAiEditRequest(req.body);
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
  if (!adminReady(res)) return;
  try {
    await assertStudioAccess(req.user!.uid, req.staffRole || "", parsed.value.listingId);
    const job = await enqueueAiEdit({ ...parsed.value, createdBy: req.user!.uid });
    return res.status(201).json({
      jobId: job.id,
      status: job.status,
      provider: job.provider,
      beforeUrl: job.beforeUrl,
      afterUrl: job.afterUrl,
      placeholder: job.placeholder,
      note: job.note,
    });
  } catch (err) {
    return sendKnownError(res, err, "Failed to enqueue the AI edit.");
  }
});

router.post("/adjust", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const sourcePath = String(req.body?.sourcePath || "");
    const fileName = String(req.body?.fileName || "adjusted.jpg");
    const dataBase64 = String(req.body?.dataBase64 || "");
    if (!dataBase64) return res.status(400).json({ error: "Adjusted JPEG data is required." });
    await assertStudioAccess(req.user!.uid, req.staffRole || "", listingId);
    const bytes = Buffer.from(dataBase64, "base64");
    const saved = await saveAdjustedJpeg({
      listingId,
      sourcePath,
      fileName,
      adjustments: req.body?.adjustments || {},
      bytes,
      uploadedBy: req.user!.uid,
    });
    return res.status(201).json({ success: true, ...saved });
  } catch (err) {
    return sendKnownError(res, err, "Failed to save the adjustment.");
  }
});

router.post("/reject", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const jobId = String(req.body?.jobId || "");
    if (!jobId) return res.status(400).json({ error: "jobId is required." });
    await assertStudioAccess(req.user!.uid, req.staffRole || "", listingId);
    const result = await rejectStudioJob({
      listingId,
      jobId,
      rejectedBy: req.user!.uid,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return sendKnownError(res, err, "Failed to reject the edit.");
  }
});

router.post("/approve", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
    let sourcePath = String(req.body?.sourcePath || "");
    let fileName = typeof req.body?.fileName === "string" ? req.body.fileName : "";
    await assertStudioAccess(req.user!.uid, req.staffRole || "", listingId);
    if (jobId) {
      const jobSnap = await admin.firestore().collection("editJobs").doc(jobId).get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Edit job not found." });
      const job = jobSnap.data() || {};
      if (job.listingId !== listingId) return res.status(400).json({ error: "That job is for a different listing." });
      const resolved = resolveStudioApprovePath(job, sourcePath);
      if (resolved.ok === false) return res.status(400).json({ error: resolved.error });
      sourcePath = resolved.sourcePath;
      if (!fileName) fileName = sourcePath.split("/").pop() || "final.jpg";
    }
    if (!sourcePath) return res.status(400).json({ error: "sourcePath is required." });
    const result = await approveStudioFinal({
      listingId,
      sourcePath,
      fileName,
      uploadedBy: req.user!.uid,
      jobId: jobId || undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return sendKnownError(res, err, "Failed to approve the final.");
  }
});

export default router;
