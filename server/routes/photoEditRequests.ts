/**
 * Staff steps for a photo edit request: sent out, received back, replacement file.
 * Clients file the request on the portal listing route.
 */

import { Router, type Response } from "express";
import admin from "firebase-admin";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { portalListingId } from "../../shared/portalListingDetail";
import {
  decodeReplacementBytes,
  markPhotoEditRequest,
  PhotoEditRequestError,
  savePhotoEditReplacement,
} from "../services/photoEditRequests";

const router = Router();

function adminReady(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (admin.apps.length) return true;
  res.status(503).json({ error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT." });
  return false;
}

function sendKnownError(res: Response, err: unknown, fallback: string) {
  const status = err instanceof PhotoEditRequestError ? err.status : (err as { status?: number }).status;
  if (status && status >= 400 && status < 500 || status === 503) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Photo edit request]", err);
  return res.status(500).json({ error: fallback });
}

async function advance(req: AuthenticatedRequest, res: Response, to: "sent_out" | "received_back") {
  if (!adminReady(res)) return;
  const listingId = portalListingId(req.params.id);
  const requestId = typeof req.params.requestId === "string" ? req.params.requestId.trim() : "";
  if (!listingId || !requestId) return res.status(400).json({ error: "That edit request could not be found." });
  try {
    const request = await markPhotoEditRequest({
      listingId,
      requestId,
      to,
      actorId: req.user!.uid,
      at: new Date().toISOString(),
    });
    return res.json({ request });
  } catch (err) {
    return sendKnownError(res, err, "Could not update that edit request.");
  }
}

router.post("/listings/:id/photo-edit-requests/:requestId/sent", requireStaff, async (req: AuthenticatedRequest, res) => {
  return advance(req, res, "sent_out");
});

router.post("/listings/:id/photo-edit-requests/:requestId/received", requireStaff, async (req: AuthenticatedRequest, res) => {
  return advance(req, res, "received_back");
});

router.post("/listings/:id/photo-edit-requests/:requestId/replacement", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  const listingId = portalListingId(req.params.id);
  const requestId = typeof req.params.requestId === "string" ? req.params.requestId.trim() : "";
  if (!listingId || !requestId) return res.status(400).json({ error: "That edit request could not be found." });
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const bytes = decodeReplacementBytes(body.dataBase64);
  if (!bytes) return res.status(400).json({ error: "The replacement file was empty." });
  try {
    const request = await savePhotoEditReplacement({
      listingId,
      requestId,
      fileName: typeof body.fileName === "string" ? body.fileName : "replacement.jpg",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      bytes,
      actorId: req.user!.uid,
      at: new Date().toISOString(),
    });
    return res.json({ request });
  } catch (err) {
    return sendKnownError(res, err, "Could not attach that replacement.");
  }
});

export default router;
