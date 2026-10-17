/**
 * Studio project jobs.
 * POST render keeps running when the editor unmounts and updates the job doc.
 * GET file sends the output only to the owner.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { normalizeStudioJob, type StudioProjectJob } from "../../shared/studioProjects";
import { scratchDownloadName } from "../../shared/studioScratch";
import { appFirestore } from "../lib/appFirestore";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { editScratchPhoto } from "../services/studioScratch";
import {
  readMemoryStudioObject,
  renderStudioProjectJob,
  studioProjectObjectsEnabled,
  writeMemoryStudioObject,
} from "../services/studioProjectRender";

const router = Router();

function jobRef(projectId: string, jobId: string) {
  return appFirestore().collection(`projects/${projectId}/jobs`).doc(jobId);
}

async function readObject(path: string): Promise<Buffer> {
  if (studioProjectObjectsEnabled()) return readMemoryStudioObject(path);
  const [bytes] = await admin.storage().bucket().file(path).download();
  return bytes;
}

async function writeObject(path: string, bytes: Buffer): Promise<void> {
  if (studioProjectObjectsEnabled()) {
    writeMemoryStudioObject(path, bytes);
    return;
  }
  await admin.storage().bucket().file(path).save(bytes, { contentType: "image/jpeg", resumable: false });
}

async function stageWithVsai(input: {
  job: StudioProjectJob;
  bytes: Buffer;
  onProgress: (progress: number) => void;
}): Promise<Buffer> {
  const apiKey = process.env.VSAI_API_KEY || process.env.VIRTUAL_STAGING_AI_API_KEY || "";
  if (!apiKey) throw new Error("Virtual staging is not configured.");
  let imageUrl = "";
  if (studioProjectObjectsEnabled()) {
    imageUrl = "https://example.test/studio-input.jpg";
  } else {
    const [url] = await admin.storage().bucket().file(input.job.inputRef).getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    imageUrl = url;
  }
  input.onProgress(36);
  const created = await fetch("https://api.virtualstagingai.app/v1/render/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Api-Key ${apiKey}` },
    body: JSON.stringify({
      image_url: imageUrl,
      room_type: input.job.roomType || "living",
      style: input.job.style || "modern",
      wait_for_completion: false,
      add_virtually_staged_watermark: false,
    }),
  });
  const createdText = await created.text();
  if (!created.ok) throw new Error(`Virtual staging did not start. ${createdText}`.slice(0, 400));
  const createdData = JSON.parse(createdText) as { id?: string; render_id?: string; renderId?: string };
  const renderId = createdData.id || createdData.render_id || createdData.renderId || "";
  if (!renderId) throw new Error("Virtual staging returned no render id.");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    input.onProgress(Math.min(88, 40 + attempt * 2));
    const poll = await fetch(`https://api.virtualstagingai.app/v1/render?render_id=${encodeURIComponent(renderId)}`, {
      headers: { Authorization: `Api-Key ${apiKey}` },
    });
    const pollText = await poll.text();
    if (!poll.ok) throw new Error(`Virtual staging check failed. ${pollText}`.slice(0, 400));
    const data = JSON.parse(pollText) as { status?: string; outputs?: string[]; error?: string; message?: string };
    const status = (data.status || "").toLowerCase();
    const output = data.outputs?.[0];
    if ((status === "done" || status === "completed") && output) {
      const image = await fetch(output);
      if (!image.ok) throw new Error("The staged photo could not be saved.");
      return Buffer.from(await image.arrayBuffer());
    }
    if (status === "error" || status === "failed") {
      throw new Error(data.error || data.message || "Virtual staging failed.");
    }
    if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error("Virtual staging is still rendering. It will stay on this project.");
}

router.post("/:projectId/jobs/:jobId/render", requireStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const snap = await jobRef(req.params.projectId, req.params.jobId).get();
    if (!snap.exists) return res.status(404).json({ error: "Project job not found." });
    const stored = normalizeStudioJob({ ...(snap.data() as Partial<StudioProjectJob>), id: snap.id }, snap.id);
    if (!stored) return res.status(404).json({ error: "Project job not found." });
    if (stored.ownerUid !== req.user?.uid) {
      return res.status(403).json({ error: "That project belongs to someone else." });
    }
    const body = (req.body || {}) as Partial<StudioProjectJob>;
    const job: StudioProjectJob = {
      ...stored,
      kind: body.kind === "edit" || body.kind === "staging" ? body.kind : stored.kind,
      action: typeof body.action === "string" ? body.action : stored.action,
      prompt: typeof body.prompt === "string" ? body.prompt : stored.prompt,
      steps: Array.isArray(body.steps) ? body.steps : stored.steps,
      roomType: typeof body.roomType === "string" ? body.roomType : stored.roomType,
      style: typeof body.style === "string" ? body.style : stored.style,
      label: typeof body.label === "string" ? body.label : stored.label,
    };
    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
    });
    const updated = await renderStudioProjectJob({
      job,
      disconnected: () => clientGone,
      readInput: () => readObject(job.inputRef),
      writeOutput: writeObject,
      edit: (edit) => editScratchPhoto(edit),
      stage: (stage) => stageWithVsai(stage),
      update: async (patch) => {
        await jobRef(job.projectId, job.id).update(patch);
      },
    });
    return res.json({ job: updated });
  } catch (err) {
    console.error("[Studio projects]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "The render failed." });
  }
});

router.get("/:projectId/jobs/:jobId/file", requireStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const snap = await jobRef(req.params.projectId, req.params.jobId).get();
    if (!snap.exists) return res.status(404).json({ error: "Project job not found." });
    const job = normalizeStudioJob({ ...(snap.data() as Partial<StudioProjectJob>), id: snap.id }, snap.id);
    if (!job) return res.status(404).json({ error: "Project job not found." });
    if (job.ownerUid !== req.user?.uid) {
      return res.status(403).json({ error: "That project belongs to someone else." });
    }
    if (!job.outputRef || job.status !== "done") {
      return res.status(404).json({ error: "That render is not ready to download." });
    }
    const bytes = await readObject(job.outputRef);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${scratchDownloadName(job.fileName)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(bytes);
  } catch (err) {
    console.error("[Studio projects]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "The download failed." });
  }
});

export default router;
