/**
 * Profiles, permissions, groups, and the direct inbox.
 * One-to-one and group threads stay in the app.
 * This router does not send email or SMS and does not read the Holy Grail sheet.
 */

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { INBOX_FOLDERS, PERSON_KINDS, type InboxFolder, type PersonKind } from "../../shared/peopleProfiles.ts";
import {
  directory,
  groupFor,
  groupsFor,
  inboxFor,
  moveInbox,
  replyInbox,
  permissionRoster,
  profileFor,
  resolveDeskActor,
  saveGroup,
  saveInboxDraft,
  savePermission,
  saveSettings,
  sendInbox,
} from "../services/peopleDesk";

const router = Router();

function kindOf(value: string): PersonKind | null {
  return (PERSON_KINDS as readonly string[]).includes(value) ? value as PersonKind : null;
}

function folderOf(value: unknown): InboxFolder {
  const folder = typeof value === "string" ? value : "inbox";
  return (INBOX_FOLDERS as readonly string[]).includes(folder) ? folder as InboxFolder : "inbox";
}

async function actor(req: AuthenticatedRequest) {
  return resolveDeskActor(req.user?.uid || "", req.user?.email || "");
}

router.get("/directory", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to see people." });
  const result = await directory(who, String(req.query.q || ""), String(req.query.role || ""));
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.get("/permissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to see permissions." });
  const result = await permissionRoster(who);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.put("/permissions/:staffId", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to change permissions." });
  const result = await savePermission(who, req.params.staffId, String(req.body?.role || ""), req.body?.permissions);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.get("/groups", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to see groups." });
  const result = await groupsFor(who);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.post("/groups", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to add a group." });
  const result = await saveGroup(who, null, req.body);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.status(201).json(result);
});

router.get("/groups/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to see this group." });
  const result = await groupFor(who, req.params.id);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.patch("/groups/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to edit this group." });
  const result = await saveGroup(who, req.params.id, req.body);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.get("/inbox", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to see messages." });
  const result = await inboxFor(who, folderOf(req.query.folder));
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.post("/inbox/draft", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to save a draft." });
  const result = await saveInboxDraft(who, req.body || {});
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.status(201).json(result);
});

router.post("/inbox/send", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to send a message." });
  const result = await sendInbox(who, req.body || {});
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.status(201).json(result);
});

router.post("/inbox/:id/reply", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to reply." });
  const body = typeof req.body?.body === "string" ? req.body.body : "";
  const result = await replyInbox(who, req.params.id, body);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.status(201).json(result);
});

router.post("/inbox/:id/folder", requireAuth, async (req: AuthenticatedRequest, res) => {
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to file this message." });
  const folder = req.body?.folder;
  if (folder !== "inbox" && folder !== "archived" && folder !== "trash" && folder !== "purge") {
    return res.status(400).json({ error: "Choose inbox, archived, or trash." });
  }
  const result = await moveInbox(who, req.params.id, folder);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.get("/:kind/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const kind = kindOf(req.params.kind);
  if (!kind) return res.status(404).json({ error: "Profile not found." });
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to see this profile." });
  const sourceId = req.params.id === "me" ? who.uid : req.params.id;
  const result = await profileFor(who, kind, sourceId);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

router.patch("/:kind/:id/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
  const kind = kindOf(req.params.kind);
  if (!kind) return res.status(404).json({ error: "Profile not found." });
  const who = await actor(req);
  if (!who) return res.status(403).json({ error: "Sign in to save settings." });
  const sourceId = req.params.id === "me" ? who.uid : req.params.id;
  const result = await saveSettings(who, kind, sourceId, req.body);
  if ("error" in result && result.error) return res.status(result.status).json({ error: result.error });
  return res.json(result);
});

export default router;
