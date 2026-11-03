/**
 * Staff-only test-data cleanup.
 * POST /dry-run reads and reports. POST /apply archives only after the
 * backup write succeeds. No email, SMS, Square cancel, or client notice.
 */

import { Router } from "express";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth";
import {
  applyTestData,
  dryRunTestData,
  readCleanupBackup,
  unarchiveTestDataRun,
} from "../services/testDataCleanupRun";

const router = Router();

router.post("/dry-run", requireAdmin, async (_req, res) => {
  try {
    return res.json(await dryRunTestData());
  } catch (err) {
    console.error("[test-data] Dry run failed:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Dry run failed." });
  }
});

router.post("/apply", requireAdmin, async (req: AuthenticatedRequest, res) => {
  if (req.body?.confirm !== "APPLY") {
    return res.status(400).json({ error: "Apply requires confirm: APPLY. Dry run is the default." });
  }
  try {
    const result = await applyTestData(req.user?.email || "admin");
    if (!result.applied) {
      return res.status(409).json({
        applied: false,
        error: result.error || "Backup failed. Nothing was archived.",
        notificationsSent: [],
      });
    }
    return res.json(result);
  } catch (err) {
    console.error("[test-data] Apply failed:", err);
    return res.status(500).json({
      applied: false,
      error: err instanceof Error ? err.message : "Apply failed.",
      notificationsSent: [],
    });
  }
});

router.post("/unarchive", requireAdmin, async (req, res) => {
  const runId = typeof req.body?.runId === "string" ? req.body.runId.trim() : "";
  if (req.body?.confirm !== "UNARCHIVE" || !runId) {
    return res.status(400).json({ error: "Unarchive requires confirm: UNARCHIVE and a runId." });
  }
  try {
    const result = await unarchiveTestDataRun(runId);
    if (!result) return res.status(404).json({ error: "That backup was not found." });
    return res.json(result);
  } catch (err) {
    console.error("[test-data] Unarchive failed:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unarchive failed." });
  }
});

router.get("/backups/:runId", requireAdmin, async (req, res) => {
  try {
    const backup = await readCleanupBackup(String(req.params.runId || ""));
    if (!backup) return res.status(404).json({ error: "That backup was not found." });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${backup.runId}.json"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error("[test-data] Backup download failed:", err);
    return res.status(500).json({ error: "Could not read that backup." });
  }
});

export default router;
