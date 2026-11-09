/**
 * Admin read of photos@. Does not send or change mail.
 */

import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { readPhotosInbox } from "../services/photosInbox";

const router = Router();

router.get("/inbox", requireAdmin, async (_req, res) => {
  const snapshot = await readPhotosInbox(process.env);
  return res.json(snapshot);
});

export default router;
