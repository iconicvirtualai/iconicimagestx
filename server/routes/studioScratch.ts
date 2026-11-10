/**
 * Coordinator scratch pad.
 * POST one JPEG. Grass is composited from the lawn reference. Other edits call
 * editListingPhotoWithOpenAI. This does not enqueue a studio job or touch a gallery.
 */

import { Router, type NextFunction, type Response } from "express";
import express from "express";
import { orderExteriorTwilightPrompt } from "../../shared/orderEditPlan";
import { GRASS_UNCHANGED_NOTE } from "../../shared/grassEdit";
import {
  SCRATCH_ACTION_HEADER,
  SCRATCH_LAWN_MASK_HEADER,
  SCRATCH_NAME_HEADER,
  SCRATCH_NOTE_HEADER,
  SCRATCH_PROMPT_HEADER,
  decodeScratchHeader,
  splitScratchBody,
} from "../../shared/studioScratch";
import { requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { OpenAiEditError } from "../services/openaiImageEdit";
import { editScratchPhoto, grassReferenceStatus, previewLawnMask } from "../services/studioScratch";

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
  "/lawn-mask",
  requireCoordinator,
  express.raw({ type: "image/jpeg", limit: "6mb" }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const mask = await previewLawnMask(bytes);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(SCRATCH_NOTE_HEADER, mask.note);
      if (!mask.png) return res.status(200).json({ note: mask.note || GRASS_UNCHANGED_NOTE, mask: null });
      res.setHeader("Content-Type", "image/png");
      return res.status(200).send(mask.png);
    } catch (err) {
      const status = err instanceof OpenAiEditError && err.status ? err.status : 502;
      const message = err instanceof Error ? err.message : "The lawn mask failed.";
      if (status >= 500) console.error("[Studio scratch]", message);
      return res.status(status).json({ error: message });
    }
  },
);

router.post(
  "/",
  requireCoordinator,
  express.raw({ type: "image/jpeg", limit: "6mb" }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const masked = headerValue(req.headers[SCRATCH_LAWN_MASK_HEADER]) === "1";
      let bytes = rawBody;
      let mask: Buffer | undefined;
      try {
        const parts = splitScratchBody(rawBody, masked);
        bytes = Buffer.from(parts.jpeg);
        mask = parts.mask ? Buffer.from(parts.mask) : undefined;
      } catch (err) {
        throw new OpenAiEditError(err instanceof Error ? err.message : "The lawn mask could not be read.", 400);
      }
      const edited = await editScratchPhoto({
        action: headerValue(req.headers[SCRATCH_ACTION_HEADER]) || "edit",
        prompt: decodeScratchHeader(headerValue(req.headers[SCRATCH_PROMPT_HEADER])),
        fileName: decodeScratchHeader(headerValue(req.headers[SCRATCH_NAME_HEADER])),
        bytes,
        mask,
        contentType: "image/jpeg",
      });
      res.setHeader("Content-Type", edited.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${edited.downloadName}"`);
      res.setHeader("Cache-Control", "no-store");
      if (edited.note) res.setHeader(SCRATCH_NOTE_HEADER, edited.note);
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
