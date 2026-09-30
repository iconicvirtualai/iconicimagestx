/**
 * Content library API.
 * Staff upload and manage. Public callers can list and read visibility=public only.
 * Listing galleries and booking routes are not used here.
 */

import { Router } from "express";
import admin from "firebase-admin";
import {
  CONTENT_DIRECT_UPLOAD_LIMIT,
  isContentAssetId,
  normalizeAlt,
  normalizeFolder,
  normalizePurpose,
  normalizeTags,
  normalizeVisibility,
  parseContentListQuery,
  parseContentWrite,
} from "../../shared/contentBucket";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { allowUploadOrigin } from "../services/listingMedia";
import {
  createContentUploadUrl,
  deleteContentAsset,
  getContentAsset,
  listContentAssets,
  newContentAssetId,
  registerContentAsset,
  saveContentBytes,
  updateContentAsset,
} from "../services/contentBucket";

const router = Router();

function adminReady(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and VITE_FIREBASE_STORAGE_BUCKET.",
  });
  return false;
}

function sendKnownError(res: { status: (code: number) => { json: (body: unknown) => unknown } }, err: unknown, fallback: string) {
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Content]", err);
  return res.status(500).json({ error: fallback });
}

async function staffIfToken(req: AuthenticatedRequest, res: Parameters<typeof requireStaff>[1], next: () => void) {
  if (!req.headers.authorization) {
    next();
    return;
  }
  await requireStaff(req, res, next);
}

router.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    await staffIfToken(req, res, next);
  } catch (err) {
    next(err);
  }
}, async (req: AuthenticatedRequest, res) => {
  const parsed = parseContentListQuery(req.query);
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
  if (!adminReady(res)) return;
  try {
    const assets = await listContentAssets(parsed.value, { staff: Boolean(req.staffRole) });
    return res.json({
      assets,
      storage: "firebase",
      metadata: "firestore",
    });
  } catch (err) {
    return sendKnownError(res, err, "Failed to list content.");
  }
});

router.post("/upload-url", requireStaff, async (req: AuthenticatedRequest, res) => {
  const parsed = parseContentWrite(req.body || {}, { requireSize: true });
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
  if (!adminReady(res)) return;
  if ((parsed.value.sizeBytes || 0) <= 0) {
    return res.status(400).json({ error: "File is empty." });
  }
  try {
    allowUploadOrigin(req.get("origin"));
    const ticket = await createContentUploadUrl(newContentAssetId(), parsed.value);
    return res.json(ticket);
  } catch (err) {
    return sendKnownError(res, err, "Failed to prepare the upload. Check VITE_FIREBASE_STORAGE_BUCKET.");
  }
});

router.post("/", requireStaff, async (req: AuthenticatedRequest, res) => {
  const parsed = parseContentWrite(req.body || {});
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
  if (!adminReady(res)) return;
  const assetId = typeof req.body?.assetId === "string" && isContentAssetId(req.body.assetId)
    ? req.body.assetId
    : newContentAssetId();

  try {
    let storagePath = typeof req.body?.storagePath === "string" ? req.body.storagePath : "";
    if (typeof req.body?.dataBase64 === "string" && req.body.dataBase64) {
      const bytes = Buffer.from(req.body.dataBase64, "base64");
      if (bytes.length > CONTENT_DIRECT_UPLOAD_LIMIT) {
        return res.status(413).json({ error: "File is too large for a direct API upload. Use the signed upload URL." });
      }
      storagePath = await saveContentBytes(assetId, { ...parsed.value, sizeBytes: bytes.length }, bytes);
    }
    const asset = await registerContentAsset({
      assetId,
      storagePath,
      write: parsed.value,
      uploadedBy: req.user!.uid,
      uploadedByEmail: req.user?.email,
    });
    return res.status(201).json({ asset });
  } catch (err) {
    return sendKnownError(res, err, "Failed to save the uploaded file.");
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    await staffIfToken(req, res, next);
  } catch (err) {
    next(err);
  }
}, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const asset = await getContentAsset(req.params.id, { staff: Boolean(req.staffRole) });
    if (!asset) return res.status(404).json({ error: "Asset not found." });
    return res.json({ asset });
  } catch (err) {
    return sendKnownError(res, err, "Failed to load the asset.");
  }
});

router.patch("/:id", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  const body = req.body || {};
  const patch: {
    purpose?: ReturnType<typeof normalizePurpose>;
    tags?: string[];
    folder?: string;
    visibility?: ReturnType<typeof normalizeVisibility>;
    alt?: string;
  } = {};
  if (body.purpose != null) {
    patch.purpose = normalizePurpose(body.purpose);
    if (!patch.purpose) return res.status(400).json({ error: "purpose must be portfolio, marketing, go, or general." });
  }
  if (body.tags != null) patch.tags = normalizeTags(body.tags);
  if (body.folder != null) patch.folder = normalizeFolder(body.folder);
  if (body.visibility != null) {
    patch.visibility = normalizeVisibility(body.visibility);
    if (!patch.visibility) return res.status(400).json({ error: "visibility must be public or staff." });
  }
  if (body.alt != null) patch.alt = normalizeAlt(body.alt);
  if (!patch.purpose && !patch.tags && patch.folder == null && !patch.visibility && patch.alt == null) {
    return res.status(400).json({ error: "Nothing to update." });
  }
  try {
    const asset = await updateContentAsset(req.params.id, {
      purpose: patch.purpose || undefined,
      tags: patch.tags,
      folder: patch.folder,
      visibility: patch.visibility || undefined,
      alt: patch.alt,
    });
    return res.json({ asset });
  } catch (err) {
    return sendKnownError(res, err, "Failed to update the asset.");
  }
});

router.delete("/:id", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    await deleteContentAsset(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return sendKnownError(res, err, "Failed to delete the asset.");
  }
});

export default router;
