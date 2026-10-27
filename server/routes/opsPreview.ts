/**
 * GET /api/ops/photographer-preview?staffId=
 * Admin only. Read-only. Demo preview stays in the browser and does not call this.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth";
import { loadPhotographerPreview } from "../services/photographerPreview";

const router = Router();

router.get("/photographer-preview", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const staffId = String(req.query.staffId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(staffId) || staffId === "demo-photographer") {
    return res.status(400).json({ error: "Choose a photographer." });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: "Firebase Admin is not configured. The demo photographer still works in the preview.",
    });
  }
  try {
    const payload = await loadPhotographerPreview(staffId);
    return res.json(payload);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 500) {
      return res.status(status).json({ error: err instanceof Error ? err.message : "Photographer not found." });
    }
    console.error("[Ops] Photographer preview failed:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Could not load that photographer." });
  }
});

export default router;
