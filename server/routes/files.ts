/**
 * Staff file library API. Every route checks a Firebase staff token.
 * Bytes are uploaded and downloaded with presigned Backblaze URLs.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { StorageError } from "../services/b2Storage";
import { LibraryError, libraryForRequest, type LibraryActor } from "../services/mediaLibrary";

const router = Router();

router.use(requireStaff);

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const trash = req.query.trash === "1" || req.query.trash === "true";
    const folder = typeof req.query.folder === "string" ? req.query.folder : "";
    res.json(await libraryForRequest().list(await actor(req), folder, trash));
  } catch (err) { fail(res, err); }
});

router.get("/tree", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().tree(await actor(req))); }
  catch (err) { fail(res, err); }
});

router.get("/search", async (req: AuthenticatedRequest, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const trash = req.query.trash === "1";
    res.json(await libraryForRequest().search(await actor(req), query, trash));
  } catch (err) { fail(res, err); }
});

router.get("/access", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().accessSettings(await actor(req))); }
  catch (err) { fail(res, err); }
});

router.put("/access", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().setAccess(await actor(req), req.body?.path, req.body?.access)); }
  catch (err) { fail(res, err); }
});

router.get("/order-targets", async (req: AuthenticatedRequest, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    res.json(await libraryForRequest().orderTargets(await actor(req), query));
  } catch (err) { fail(res, err); }
});

router.post("/order-folder", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().orderFolder(await actor(req), req.body?.orderId, req.body?.kind)); }
  catch (err) { fail(res, err); }
});

router.post("/folders", async (req: AuthenticatedRequest, res) => {
  try {
    res.status(201).json(await libraryForRequest().createFolder(await actor(req), req.body?.parent ?? "", req.body?.name));
  } catch (err) { fail(res, err); }
});

router.post("/sign-upload", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().signUpload(await actor(req), req.body ?? {})); }
  catch (err) { fail(res, err); }
});

router.post("/multipart/create", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().createMultipart(await actor(req), req.body ?? {})); }
  catch (err) { fail(res, err); }
});

router.post("/multipart/sign-part", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().signPart(await actor(req), req.body ?? {})); }
  catch (err) { fail(res, err); }
});

router.post("/multipart/complete", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().completeMultipart(await actor(req), req.body ?? {})); }
  catch (err) { fail(res, err); }
});

router.post("/multipart/abort", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().abortMultipart(await actor(req), req.body ?? {})); }
  catch (err) { fail(res, err); }
});

router.post("/commit", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().commit(await actor(req), req.body?.key)); }
  catch (err) { fail(res, err); }
});

router.post("/sign-download", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().signDownloads(await actor(req), req.body?.ids)); }
  catch (err) { fail(res, err); }
});

router.post("/move", async (req: AuthenticatedRequest, res) => {
  try {
    res.json(await libraryForRequest().move(await actor(req), req.body?.fileIds, req.body?.folderIds, req.body?.destination));
  } catch (err) { fail(res, err); }
});

router.post("/rename", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().rename(await actor(req), req.body?.kind, req.body?.id, req.body?.name)); }
  catch (err) { fail(res, err); }
});

router.post("/delete", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().trash(await actor(req), req.body?.fileIds, req.body?.folderIds)); }
  catch (err) { fail(res, err); }
});

router.post("/restore", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().restore(await actor(req), req.body?.fileIds, req.body?.folderIds)); }
  catch (err) { fail(res, err); }
});

router.post("/destroy", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().destroy(await actor(req), req.body?.fileIds, req.body?.folderIds)); }
  catch (err) { fail(res, err); }
});

router.post("/import", async (req: AuthenticatedRequest, res) => {
  try { res.status(201).json(await libraryForRequest().importObject(await actor(req), req.body ?? {})); }
  catch (err) { fail(res, err); }
});

router.patch("/:id", async (req: AuthenticatedRequest, res) => {
  try { res.json(await libraryForRequest().updateFile(await actor(req), req.params.id, req.body ?? {})); }
  catch (err) { fail(res, err); }
});

export default router;

async function actor(req: AuthenticatedRequest): Promise<LibraryActor> {
  const uid = req.user?.uid || "";
  let name = req.user?.email || "Staff";
  try {
    const snap = await admin.firestore().collection("staff").doc(uid).get();
    const data = snap.data();
    const full = [data?.firstName, data?.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ");
    if (full) name = full;
    else if (typeof data?.name === "string" && data.name.trim()) name = data.name.trim();
  } catch (err) {
    console.error("[Files] Staff name lookup failed.", err instanceof Error ? err.name : "error");
  }
  return { uid, name, email: req.user?.email || "", role: req.staffRole || "" };
}

function fail(res: { status: (code: number) => { json: (body: unknown) => void } }, err: unknown) {
  if (err instanceof LibraryError || err instanceof StorageError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("[Files] Request failed.", err instanceof Error ? err.name : "error");
  res.status(500).json({ error: "The file library could not complete that request." });
}
