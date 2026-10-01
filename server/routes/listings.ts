/**
 * Listing reads and photographer uploads.
 * Browser Storage writes to listings/ are denied by storage rules, so uploads
 * go through the Admin SDK (signed URL or small direct save).
 */

import { Router } from "express";
import admin from "firebase-admin";
import {
  requireAuth,
  requireCoordinator,
  requirePhotographer,
  requireStaff,
  type AuthenticatedRequest,
} from "../middleware/auth";
import {
  clientCanViewListing,
  contentTypeForUpload,
  isListingStoragePath,
  safeStorageFileName,
  staffCanAccessListing,
} from "../../shared/listingAccess";
import { resolveClientIdentity } from "../services/clientAccounts";
import { byteSize } from "../../shared/mediaLibrary";
import {
  assignListingFiles,
  createListingMediaFolder,
  deleteListingFiles,
  deleteListingMediaFolder,
  moveListingFiles,
  queueListingAiEdit,
  queueListingCubiCasa,
  createListingUploadUrl,
  registerListingPhoto,
  saveListingBytes,
  serializeDoc,
} from "../services/listingMedia";

const router = Router();
const db = () => admin.firestore();

const DIRECT_UPLOAD_LIMIT = 3_000_000;

function adminReady(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET.",
  });
  return false;
}

function folderFrom(value: unknown): "photos" | "raw" {
  return value === "raw" ? "raw" : "photos";
}

async function loadListing(id: string) {
  const snap = await db().collection("listings").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as FirebaseFirestore.DocumentData & { id: string };
}

async function assertListingAccess(req: AuthenticatedRequest, listingId: string) {
  const listing = await loadListing(listingId);
  if (!listing) {
    const error = Object.assign(new Error("Listing not found."), { status: 404 });
    throw error;
  }
  const staffDoc = await db().collection("staff").doc(req.user!.uid).get();
  if (staffDoc.exists && staffDoc.data()?.isActive !== false) {
    const role = String(staffDoc.data()?.role || req.staffRole || "");
    if (!staffCanAccessListing(role, req.user!.uid, listing)) {
      throw Object.assign(new Error("This job is not assigned to you."), { status: 403 });
    }
    return listing;
  }
  const identity = await resolveClientIdentity(req.user!.uid, req.user!.email);
  if (!clientCanViewListing(listing, { uid: req.user!.uid, email: identity.email, ids: identity.ids })) {
    throw Object.assign(new Error("You do not have access to this project."), { status: 403 });
  }
  return listing;
}

function sendKnownError(res: { status: (code: number) => { json: (body: unknown) => unknown } }, err: unknown, fallback: string) {
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Listings]", err);
  return res.status(500).json({ error: fallback });
}

router.get("/assigned", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const uid = req.user!.uid;
    const role = req.staffRole || "";
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (role === "admin" || role === "coordinator") {
      const snap = await db().collection("listings").limit(100).get();
      docs = snap.docs;
    } else {
      const [byUid, byIds] = await Promise.all([
        db().collection("listings").where("photographerUid", "==", uid).limit(50).get(),
        db().collection("listings").where("photographerIds", "array-contains", uid).limit(50).get(),
      ]);
      const merged = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const doc of [...byUid.docs, ...byIds.docs]) merged.set(doc.id, doc);
      docs = [...merged.values()];
    }

    const listings = docs
      .map((doc) => serializeDoc(doc.id, doc.data()))
      .sort((a, b) => {
        const aTime = Date.parse(String(a.apptDate || a.shootDate || "")) || 0;
        const bTime = Date.parse(String(b.apptDate || b.shootDate || "")) || 0;
        return bTime - aTime;
      });
    return res.json({ listings });
  } catch (err) {
    console.error("[Listings] Assigned fetch error:", err);
    return res.status(500).json({ error: "Failed to load assigned jobs." });
  }
});

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const listing = await assertListingAccess(req, req.params.id);
    const staffDoc = await db().collection("staff").doc(req.user!.uid).get();
    const payload = serializeDoc(listing.id, listing);
    if (!staffDoc.exists) {
      delete payload.notes;
      delete payload.internalNotes;
    }
    return res.json(payload);
  } catch (err) {
    return sendKnownError(res, err, "Failed to load listing.");
  }
});

router.post("/:id/photos/upload-url", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const fileName = safeStorageFileName(req.body?.fileName);
    if (!fileName) return res.status(400).json({ error: "fileName is required." });
    await assertListingAccess(req, req.params.id);
    const folder = folderFrom(req.body?.folder);
    const ticket = await createListingUploadUrl(
      req.params.id,
      fileName,
      contentTypeForUpload(fileName, req.body?.contentType),
      folder,
    );
    return res.json(ticket);
  } catch (err) {
    return sendKnownError(res, err, "Failed to prepare the upload. Check FIREBASE_STORAGE_BUCKET.");
  }
});

router.post("/:id/photos", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = req.params.id;
    await assertListingAccess(req, listingId);
    const fileName = safeStorageFileName(req.body?.fileName || "upload");
    const folder = folderFrom(req.body?.folder);

    if (typeof req.body?.dataBase64 === "string" && req.body.dataBase64) {
      const bytes = Buffer.from(req.body.dataBase64, "base64");
      if (!bytes.length) return res.status(400).json({ error: "Upload body was empty." });
      if (bytes.length > DIRECT_UPLOAD_LIMIT) {
        return res.status(413).json({ error: "File is too large for a direct API upload. Use the signed upload URL." });
      }
      const saved = await saveListingBytes(listingId, fileName, req.body?.contentType, folder, bytes);
      const registered = await registerListingPhoto({
        listingId,
        storagePath: saved.storagePath,
        fileName,
        contentType: saved.contentType,
        uploadedBy: req.user!.uid,
        existingUrl: saved.url,
        size: bytes.length,
      });
      return res.status(201).json({ success: true, ...registered });
    }

    const storagePath = req.body?.storagePath;
    if (!isListingStoragePath(listingId, storagePath)) {
      return res.status(400).json({ error: "storagePath must be a photos or raw path for this listing." });
    }
    const registered = await registerListingPhoto({
      listingId,
      storagePath,
      fileName,
      contentType: req.body?.contentType,
      uploadedBy: req.user!.uid,
      size: byteSize(req.body?.size),
    });
    return res.status(201).json({ success: true, ...registered });
  } catch (err) {
    return sendKnownError(res, err, "Failed to save the uploaded photo.");
  }
});

function pathsFrom(body: unknown): string[] {
  const raw = (body as { paths?: unknown; path?: unknown }) || {};
  const list = Array.isArray(raw.paths) ? raw.paths : raw.path ? [raw.path] : [];
  return [...new Set(list.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

router.post("/:id/media/folders", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    await assertListingAccess(req, req.params.id);
    const folder = await createListingMediaFolder(req.params.id, req.body?.name, req.user!.uid);
    return res.status(201).json({ folder });
  } catch (err) {
    return sendKnownError(res, err, "Failed to create the folder.");
  }
});

router.post("/:id/media/folders/delete", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    await assertListingAccess(req, req.params.id);
    const folderId = typeof req.body?.folderId === "string" ? req.body.folderId : "";
    const result = await deleteListingMediaFolder(req.params.id, folderId);
    return res.json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to delete the folder.");
  }
});

router.post("/:id/media/files/delete", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    await assertListingAccess(req, req.params.id);
    const result = await deleteListingFiles(req.params.id, pathsFrom(req.body));
    return res.json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to delete the file.");
  }
});

router.post("/:id/media/files/folder", requirePhotographer, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    await assertListingAccess(req, req.params.id);
    const folderId = typeof req.body?.folderId === "string" ? req.body.folderId : null;
    const result = await assignListingFiles(req.params.id, pathsFrom(req.body), folderId);
    return res.json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to move the file into that folder.");
  }
});

router.post("/:id/media/files/move", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const destinationListingId = typeof req.body?.destinationListingId === "string" ? req.body.destinationListingId : "";
    if (!destinationListingId) return res.status(400).json({ error: "Choose a destination listing." });
    await assertListingAccess(req, req.params.id);
    await assertListingAccess(req, destinationListingId);
    const storageFolder = req.body?.destinationStorageFolder === "raw" ? "raw" : "photos";
    const result = await moveListingFiles({
      sourceListingId: req.params.id,
      destinationListingId,
      paths: pathsFrom(req.body),
      destinationStorageFolder: storageFolder,
      destinationFolderId: typeof req.body?.destinationFolderId === "string" ? req.body.destinationFolderId : null,
      movedBy: req.user!.uid,
    });
    return res.json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to move the file.");
  }
});

router.post("/:id/media/cubicasa", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    await assertListingAccess(req, req.params.id);
    const result = await queueListingCubiCasa(req.params.id, pathsFrom(req.body), req.user!.uid);
    return res.status(201).json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to queue the CubiCasa request.");
  }
});

router.post("/:id/media/ai-edit", requireStaff, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    await assertListingAccess(req, req.params.id);
    const result = await queueListingAiEdit(req.params.id, pathsFrom(req.body), req.user!.uid);
    return res.status(201).json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to queue the edit.");
  }
});

export default router;
