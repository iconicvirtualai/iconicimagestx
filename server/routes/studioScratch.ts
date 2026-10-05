/**
 * Coordinator scratch pad.
 * POST one JPEG. The handler calls editListingPhotoWithOpenAI and returns the JPEG.
 * It does not enqueue a studio job or touch a gallery.
 */

import { Router, type NextFunction, type Response } from "express";
import express from "express";
import { orderExteriorTwilightPrompt } from "../../shared/orderEditPlan";
import {
  SCRATCH_ACTION_HEADER,
  SCRATCH_NAME_HEADER,
  SCRATCH_PROMPT_HEADER,
  decodeScratchHeader,
} from "../../shared/studioScratch";
import { requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { OpenAiEditError } from "../services/openaiImageEdit";
import { editScratchPhoto, grassReferenceStatus } from "../services/studioScratch";

const router = Router();

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

router.get("/", requireCoordinator, async (_req: AuthenticatedRequest, res: Response) => {
  const grass = await grassReferenceStatus();
  return res.json({ grass, twilightPrompt: orderExteriorTwilightPrompt() });
});

router.post(
  "/",
  requireCoordinator,
  express.raw({ type: "image/jpeg", limit: "4mb" }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const edited = await editScratchPhoto({
        action: headerValue(req.headers[SCRATCH_ACTION_HEADER]) || "edit",
        prompt: decodeScratchHeader(headerValue(req.headers[SCRATCH_PROMPT_HEADER])),
        fileName: decodeScratchHeader(headerValue(req.headers[SCRATCH_NAME_HEADER])),
        bytes,
        contentType: headerValue(req.headers["content-type"]) || "",
      });
      res.setHeader("Content-Type", edited.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${edited.downloadName}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(edited.bytes);
    } catch (err) {
      const status = err instanceof OpenAiEditError && err.status ? err.status : 502;
      const message = err instanceof Error ? err.message : "The scratch edit failed.";
      if (status >= 500) console.error("[Studio scratch]", message);
      return res.status(status).json({ error: message });
    }
  },
);

router.use((err: { type?: string; status?: number }, _req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "That photo is too large for the scratch pad. Export a smaller JPEG." });
  }
  return next(err);
});

export default router;
