/**
 * Studio video editor API.
 * Staff only. Jobs stay queued until Cloud Tasks and the render worker exist.
 * Gallery attach writes the video section and does not notify the client.
 */

import { Router, type Response } from "express";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { listTemplateSummaries, templateById } from "../../shared/studioVideoTemplates";
import { resolveExport, type ExportFps, type ExportQuality } from "../../shared/videoExportPresets";
import { videoEditorEnabled, videoTemplatesEnabled } from "../../shared/videoEditorFlags";
import { dispatchVideoJob, rendererConfigured } from "../services/studioVideoDispatch";
import {
  assertTemplateRequest,
  attachVideoToGallery,
  createQueuedJob,
  getJob,
  listJobs,
  queueMessage,
  saveJob,
  searchOrders,
  updateJob,
} from "../services/studioVideoJobs";

const router = Router();

function editorOff(res: Response): boolean {
  if (videoEditorEnabled(process.env)) return false;
  res.status(403).json({ error: "Video editor is off in this environment.", code: "video_editor_disabled" });
  return true;
}

function allowStaff(req: AuthenticatedRequest, res: Response, next: () => void) {
  if (process.env.NODE_ENV === "test" && req.header("x-test-staff")) {
    const parsed = JSON.parse(req.header("x-test-staff") || "{}") as { uid?: string; role?: string };
    const role = parsed.role || "";
    if (!["admin", "coordinator", "photographer", "editor"].includes(role)) {
      res.status(403).json({ error: "Staff access required." });
      return;
    }
    req.user = { uid: parsed.uid || "test-staff" } as AuthenticatedRequest["user"];
    req.staffRole = role;
    next();
    return;
  }
  void requireStaff(req, res, next);
}

router.post("/template-jobs/:id/progress", async (req, res) => {
  const token = process.env.VIDEO_WORKER_TOKEN;
  if (!token || req.header("x-video-worker-token") !== token) {
    return res.status(404).json({ error: "Not found." });
  }
  const progress = Number(req.body?.progress);
  const status = req.body?.status;
  const allowed = ["queued", "rendering", "ready", "failed"];
  const job = await updateJob(req.params.id, {
    ...(Number.isFinite(progress) ? { progress: Math.max(0, Math.min(1, progress)) } : {}),
    ...(typeof status === "string" && allowed.includes(status) ? { status: status as "queued" | "rendering" | "ready" | "failed" } : {}),
    ...(typeof req.body?.message === "string" ? { message: req.body.message } : {}),
    ...(typeof req.body?.outputPath === "string" ? { outputPath: req.body.outputPath } : {}),
    ...(typeof req.body?.outputUrl === "string" ? { outputUrl: req.body.outputUrl } : {}),
    ...(typeof req.body?.manifestPath === "string" ? { manifestPath: req.body.manifestPath } : {}),
    ...(typeof req.body?.posterPath === "string" ? { posterPath: req.body.posterPath } : {}),
    ...(typeof req.body?.error === "string" ? { error: req.body.error } : {}),
  });
  if (!job) return res.status(404).json({ error: "Job not found." });
  return res.json({ job });
});

router.use((req: AuthenticatedRequest, res, next) => {
  allowStaff(req, res, () => {
    if (editorOff(res)) return;
    next();
  });
});

router.get("/templates", (_req, res) => {
  if (!videoTemplatesEnabled(process.env)) {
    return res.status(403).json({ error: "Video templates are off in this environment.", code: "video_templates_disabled" });
  }
  const connected = rendererConfigured();
  return res.json({
    templates: listTemplateSummaries(),
    rendererConnected: connected,
    message: connected ? "Render worker is configured." : "Renderer not connected yet",
  });
});

router.post("/analyze", (req, res) => {
  const storagePath = typeof req.body?.storagePath === "string" ? req.body.storagePath : "";
  if (!storagePath.startsWith("studio-video/")) {
    return res.status(400).json({ error: "storagePath must be under studio-video/." });
  }
  return res.json({ pending: true, storagePath, message: "Renderer not connected yet" });
});

router.post("/template-jobs", async (req: AuthenticatedRequest, res) => {
  if (!videoTemplatesEnabled(process.env)) {
    return res.status(403).json({ error: "Video templates are off in this environment.", code: "video_templates_disabled" });
  }
  try {
    const request = assertTemplateRequest(req.body);
    if (!templateById(request.templateId)) return res.status(400).json({ error: "Unknown template." });
    const job = createQueuedJob({
      kind: "template",
      request,
      listingId: request.listingId,
      createdBy: req.user?.uid || "staff",
      rendererConnected: false,
      message: queueMessage(false),
    });
    const dispatch = await dispatchVideoJob(job);
    job.rendererConnected = dispatch.connected;
    job.message = queueMessage(dispatch.connected);
    await saveJob(job);
    return res.status(201).json({ job, message: job.message });
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    const message = error instanceof Error ? error.message : "Could not queue the template.";
    return res.status(status).json({ error: message });
  }
});

router.post("/timeline-jobs", async (req: AuthenticatedRequest, res) => {
  const listingId = typeof req.body?.listingId === "string" ? req.body.listingId : "";
  const project = req.body?.project;
  const exportSettings = req.body?.export;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(listingId)) return res.status(400).json({ error: "listingId is required." });
  if (!project || typeof project !== "object") return res.status(400).json({ error: "A timeline project is required." });
  const resolved = resolveExport({
    presetId: String(exportSettings?.presetId || "instagram_reel"),
    width: Number(exportSettings?.width || 1080),
    height: Number(exportSettings?.height || 1920),
    fps: Number(exportSettings?.fps || 30) as ExportFps,
    quality: (exportSettings?.quality || "high") as ExportQuality,
    durationSec: Number(exportSettings?.durationSec || project.duration || 0),
  });
  if ("error" in resolved) return res.status(400).json({ error: resolved.error });
  const sources = req.body?.sources && typeof req.body.sources === "object" ? req.body.sources : {};
  const request = { project, export: resolved, warnings: resolved.warnings, sources };
  const job = createQueuedJob({
    kind: "timeline",
    request,
    listingId,
    createdBy: req.user?.uid || "staff",
    rendererConnected: false,
    message: queueMessage(false),
  });
  const dispatch = await dispatchVideoJob(job);
  job.rendererConnected = dispatch.connected;
  job.message = queueMessage(dispatch.connected);
  await saveJob(job);
  return res.status(201).json({ job, warnings: resolved.warnings, message: job.message });
});

router.get("/template-jobs", async (req, res) => {
  const listingId = typeof req.query.listingId === "string" ? req.query.listingId : "";
  if (!listingId) return res.status(400).json({ error: "listingId is required." });
  const jobs = await listJobs(listingId);
  return res.json({ jobs });
});

router.get("/template-jobs/:id", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  return res.json({ job });
});

router.get("/template-jobs/:id/download", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status !== "ready" || !job.outputUrl) {
    return res.status(409).json({ error: "Render is not ready.", message: job.message });
  }
  return res.json({
    url: job.outputUrl,
    manifestUrl: job.manifestPath,
    posterUrl: job.posterPath,
    expiresIn: 3600,
  });
});

router.get("/orders/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (q.trim().length < 2) return res.status(400).json({ error: "Enter an address or order number." });
  const hits = await searchOrders(q);
  return res.json({
    hits,
    notifyClient: false,
    note: "Adding a video does not email or text the client.",
  });
});

router.post("/gallery", async (req, res) => {
  const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : "";
  const url = typeof req.body?.url === "string" ? req.body.url : "";
  const storagePath = typeof req.body?.storagePath === "string" ? req.body.storagePath : "";
  const fileName = typeof req.body?.fileName === "string" ? req.body.fileName : "";
  if (!orderId || !url || !storagePath || !fileName) {
    return res.status(400).json({ error: "orderId, url, storagePath, and fileName are required." });
  }
  if (req.body?.notifyClient === true) {
    return res.status(400).json({ error: "Client notification is not available from the video editor." });
  }
  try {
    const attached = await attachVideoToGallery({
      orderId,
      query: typeof req.body?.query === "string" ? req.body.query : orderId,
      url,
      storagePath,
      fileName,
      presetId: typeof req.body?.presetId === "string" ? req.body.presetId : "custom",
      jobId: typeof req.body?.jobId === "string" ? req.body.jobId : orderId,
      width: Number(req.body?.width || 1080),
      height: Number(req.body?.height || 1920),
      fps: Number(req.body?.fps || 30),
      poster: typeof req.body?.poster === "string" ? req.body.poster : null,
    });
    return res.status(201).json({ ...attached, notifyClient: false });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Could not add the video.";
    return res.status(status).json({ error: message });
  }
});

export default router;
