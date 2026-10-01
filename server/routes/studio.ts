/**
 * Iconic Studio staff API.
 * AI edits enqueue editJobs. Without OPENAI_API_KEY (not in this app's env)
 * the handler stubs a review job and does not call OpenAI.
 * Approve copies a JPEG/PNG/WebP onto the listing finals path and gallery.
 * It does not send client email.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { parseAiEditRequest } from "../../shared/iconicStudio";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import {
  approveStudioFinal,
  assertStudioAccess,
  enqueueAiEdit,
  loadStudioWorkspace,
  saveAdjustedJpeg,
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
      sourcePath = String(job.resultPath || job.sourcePath || sourcePath);
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
