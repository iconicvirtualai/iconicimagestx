/**
 * Iconic Studio staff API.
 * Default edits come from the order (package line items + Iconic Polish).
 * POST /ai-edit is a staff override for one frame and calls OpenAI Images.
 * POST /order-edits writes those order jobs and runs the next photo.
 * Approve copies a finished JPEG/PNG/WebP onto the listing finals path.
 * It does not send the gallery or client email. Gallery release waits until
 * the order is complete, which this route does not decide.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { parseAiEditRequest, resolveStudioApprovePath } from "../../shared/iconicStudio";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import {
  approveStudioFinal,
  assertStudioAccess,
  enqueueAiEdit,
  loadStudioWorkspace,
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
    return res.json(payload);
  } catch (err) {
    return sendKnownError(res, err, "Failed to load Iconic Studio.");
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
