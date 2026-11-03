/**
 * Holy Grail sync routes.
 * Cron: GET /api/holy-grail/sync every 15 minutes, GET /api/holy-grail/har daily.
 * Dry run: GET /api/holy-grail/dry-run (admin Firebase token or CRON_SECRET).
 * Writes nothing unless HOLY_GRAIL_SYNC_LIVE is exactly "true".
 * Does not send email or SMS.
 */

import { Router } from "express";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth";
import { runHolyGrailHar, runHolyGrailSync } from "../services/holyGrailSync";

const router = Router();

function cronAuthorized(req: { headers: Record<string, string | string[] | undefined> }) {
  const secret = typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

function parseSince(value: unknown): number | null | "invalid" {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : "invalid";
}

async function handleSync(req: { headers: Record<string, string | string[] | undefined> }, res: import("express").Response) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await runHolyGrailSync({ dryRun: false });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[HolyGrail] Sync failed.", message.includes("PRIVATE KEY") ? "credentials error" : message.slice(0, 300));
    if (message.includes("Firebase Admin is not configured")) {
      return res.status(503).json({ ok: false, error: "Firebase Admin is not configured." });
    }
    return res.status(500).json({ ok: false, error: "Holy Grail sync failed." });
  }
}

async function handleHar(req: { headers: Record<string, string | string[] | undefined> }, res: import("express").Response) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await runHolyGrailHar();
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[HolyGrail] HAR sync failed.", message.includes("PRIVATE KEY") ? "credentials error" : message.slice(0, 300));
    return res.status(500).json({ ok: false, error: "Holy Grail HAR sync failed." });
  }
}

async function adminOrCron(req: AuthenticatedRequest, res: import("express").Response, next: import("express").NextFunction) {
  if (cronAuthorized(req)) return next();
  return requireAdmin(req, res, next);
}

router.get("/sync", handleSync);
router.post("/sync", handleSync);
router.get("/har", handleHar);
router.post("/har", handleHar);
router.get("/dry-run", adminOrCron, async (req, res) => {
  const since = parseSince(req.query.since);
  if (since === "invalid") return res.status(400).json({ error: "since must be an ISO timestamp." });
  try {
    const result = await runHolyGrailSync({ dryRun: true, sinceMs: since });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[HolyGrail] Dry run failed.", message.includes("PRIVATE KEY") ? "credentials error" : message.slice(0, 300));
    if (message.includes("Firebase Admin is not configured")) {
      return res.status(503).json({ ok: false, error: "Firebase Admin is not configured." });
    }
    return res.status(500).json({ ok: false, error: "Holy Grail dry run failed." });
  }
});

export default router;
