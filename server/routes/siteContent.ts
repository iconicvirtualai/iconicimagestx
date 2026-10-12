/**
 * Site editor API.
 * Public reads receive published pages only. Drafts, uploads, and publish
 * are checked against the staff record on every request.
 */

import { Router, type RequestHandler } from "express";
import { ownerAllowlist } from "../../shared/ownerAccess.ts";
import {
  type ContentPage,
  type SiteEditorAccess,
  type SiteEditorFlags,
  allows,
  pushRevision,
  revertTo,
  siteEditorAccess,
  stripPage,
} from "../../shared/siteEditor.ts";
import { defaultPage, defaultPages, knownPageIds } from "../../shared/siteEditorDefaults.ts";
import { mergeContent, samePage } from "../../shared/siteEditorMerge.ts";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth.ts";
import {
  deleteDraft,
  historyOf,
  listDraftIds,
  listPublished,
  readDraft,
  readPublished,
  writeDraft,
  writePublished,
} from "../services/siteContentStore.ts";
import { importDropboxFile, siteMediaBlob, storeSiteUpload } from "../services/siteMedia.ts";

type EditorRequest = AuthenticatedRequest & {
  testFlags?: SiteEditorFlags | null;
  siteAccess?: SiteEditorAccess;
};

const router = Router();

function actor(req: EditorRequest) {
  const email = req.user?.email || "";
  const name = email === "temp-admin@iconicimagestx.com" ? "Temporary Admin" : (email || req.user?.uid || "Staff");
  return { uid: req.user?.uid || "staff", name };
}

async function accessFor(req: EditorRequest): Promise<SiteEditorAccess> {
  const ownerEmails = ownerAllowlist(process.env.OWNER_EMAILS);
  if (process.env.NODE_ENV === "test" && req.testFlags !== undefined) {
    return siteEditorAccess({
      role: req.staffRole,
      email: req.user?.email,
      flags: req.testFlags,
      ownerEmails,
    });
  }
  let flags: Partial<SiteEditorFlags> | null = null;
  let email = req.user?.email || null;
  let role = req.staffRole || null;
  if (req.user?.uid && req.user.uid !== "temp-admin-uid") {
    try {
      const admin = await import("firebase-admin");
      if (admin.default.apps.length) {
        const doc = await admin.default.firestore().collection("staff").doc(req.user.uid).get();
        const data = doc.data();
        if (data) {
          flags = data.siteEditor ?? null;
          email = (data.email as string) || email;
          role = (data.role as string) || role;
        }
      }
    } catch (err) {
      console.error("[Site editor] staff lookup failed:", err);
    }
  }
  return siteEditorAccess({ role, email, flags, ownerEmails });
}

function gate(level: keyof SiteEditorFlags): RequestHandler {
  return async (req, res, next) => {
    const editorReq = req as EditorRequest;
    const run = async () => {
      const access = await accessFor(editorReq);
      editorReq.siteAccess = access;
      if (!allows(access, level)) {
        return res.status(403).json({ error: level === "publish" ? "Only owner/admin can publish." : "Site editor permission required." });
      }
      return next();
    };
    if (process.env.NODE_ENV === "test" && req.header("x-test-staff")) {
      const parsed = JSON.parse(req.header("x-test-staff") || "{}") as { uid?: string; email?: string; role?: string; flags?: SiteEditorFlags | null };
      editorReq.user = { uid: parsed.uid || "test", email: parsed.email || "" } as AuthenticatedRequest["user"];
      editorReq.staffRole = parsed.role;
      editorReq.testFlags = parsed.flags ?? null;
      return run();
    }
    return requireStaff(editorReq, res, () => { void run(); });
  };
}

async function workspacePage(id: string): Promise<ContentPage | null> {
  const base = defaultPage(id);
  if (!base) return null;
  const published = await readPublished(id);
  const draft = await readDraft(id);
  return mergeContent(draft || (published ? stripPage(published) : base));
}

router.get("/", async (_req, res) => {
  const pages = await listPublished();
  return res.json({ pages });
});

router.get("/blob/:id", (req, res) => {
  const blob = siteMediaBlob(req.params.id);
  if (!blob) return res.status(404).json({ error: "File not found." });
  res.setHeader("Content-Type", blob.type);
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.send(blob.body);
});

router.get("/workspace", gate("view"), async (req, res) => {
  const editorReq = req as EditorRequest;
  const ids = knownPageIds();
  const pages: ContentPage[] = [];
  const published: Record<string, ContentPage | null> = {};
  const history: Record<string, ReturnType<typeof historyOf>> = {};
  for (const id of ids) {
    const page = await workspacePage(id);
    if (page) pages.push(page);
    const stored = await readPublished(id);
    published[id] = stored ? stripPage(stored) : null;
    history[id] = historyOf(stored);
  }
  const draftIds = await listDraftIds();
  return res.json({
    access: editorReq.siteAccess,
    pages,
    published,
    history,
    draftIds,
  });
});

router.put("/:id", gate("edit"), async (req, res) => {
  const id = req.params.id;
  if (!defaultPage(id)) return res.status(404).json({ error: "Unknown page." });
  const merged = mergeContent({ ...req.body, id } as ContentPage);
  if (!merged) return res.status(400).json({ error: "Page could not be saved." });
  const who = actor(req as EditorRequest);
  await writeDraft(merged, { at: new Date().toISOString(), byUid: who.uid, byName: who.name });
  return res.json({ page: merged });
});

router.post("/:id/discard", gate("edit"), async (req, res) => {
  const id = req.params.id;
  if (!defaultPage(id)) return res.status(404).json({ error: "Unknown page." });
  await deleteDraft(id);
  const page = await workspacePage(id);
  return res.json({ page });
});

router.post("/:id/publish", gate("publish"), async (req, res) => {
  const id = req.params.id;
  if (!defaultPage(id)) return res.status(404).json({ error: "Unknown page." });
  const draft = await readDraft(id);
  const current = await readPublished(id);
  const source = draft || (req.body?.page ? mergeContent({ ...req.body.page, id }) : null) || (current ? stripPage(current) : defaultPage(id));
  if (!source) return res.status(400).json({ error: "Nothing to publish." });
  const who = actor(req as EditorRequest);
  const now = new Date().toISOString();
  const revisions = pushRevision(current, source, who, now);
  await writePublished({
    ...source,
    revisions,
    publishedAt: now,
    publishedByUid: who.uid,
    publishedByName: who.name,
  });
  await deleteDraft(id);
  return res.json({ page: stripPage(source), publishedAt: now, publishedByName: who.name });
});

router.post("/publish-all", gate("publish"), async (req, res) => {
  const who = actor(req as EditorRequest);
  const publishedIds: string[] = [];
  for (const id of await listDraftIds()) {
    const draft = await readDraft(id);
    if (!draft || !defaultPage(id)) continue;
    const current = await readPublished(id);
    const now = new Date().toISOString();
    await writePublished({
      ...draft,
      revisions: pushRevision(current, draft, who, now),
      publishedAt: now,
      publishedByUid: who.uid,
      publishedByName: who.name,
    });
    await deleteDraft(id);
    publishedIds.push(id);
  }
  return res.json({ publishedIds });
});

router.post("/:id/revert", gate("publish"), async (req, res) => {
  const id = req.params.id;
  const current = await readPublished(id);
  if (!current) return res.status(404).json({ error: "That page has no published history." });
  const who = actor(req as EditorRequest);
  const restored = revertTo(current, String(req.body?.revisionId || ""), who);
  if (!restored) return res.status(404).json({ error: "That version was not found." });
  await writePublished(restored);
  return res.json({ page: stripPage(restored) });
});

router.post("/media", gate("edit"), async (req, res) => {
  try {
    const pageId = String(req.body?.pageId || "page");
    if (!defaultPage(pageId) && pageId !== "page") return res.status(404).json({ error: "Unknown page." });
    const raw = String(req.body?.dataBase64 || "");
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length) return res.status(400).json({ error: "No file was received." });
    const stored = await storeSiteUpload(defaultPage(pageId) ? pageId : "page", bytes);
    return res.json(stored);
  } catch (err) {
    const status = (err as { status?: number }).status || 400;
    return res.status(status).json({ error: err instanceof Error ? err.message : "Upload failed." });
  }
});

router.post("/dropbox", gate("edit"), async (req, res) => {
  try {
    const pageId = String(req.body?.pageId || "page");
    const imported = await importDropboxFile(String(req.body?.url || ""));
    const stored = await storeSiteUpload(defaultPage(pageId) ? pageId : "page", imported.bytes);
    return res.json(stored);
  } catch (err) {
    const status = (err as { status?: number }).status || 400;
    return res.status(status).json({ error: err instanceof Error ? err.message : "Dropbox import failed." });
  }
});

export function pageDirty(workspace: ContentPage | null, published: ContentPage | null, id: string): boolean {
  const baseline = published || defaultPage(id);
  return !samePage(workspace, baseline);
}

export function emptyPublishedList() {
  return defaultPages().map((item) => item.id);
}

export default router;
