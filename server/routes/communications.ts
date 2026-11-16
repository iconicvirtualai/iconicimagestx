import { Router } from "express";
import { canUseAssistants } from "../../shared/communications/access";
import { ownerAllowlist } from "../../shared/ownerAccess";
import { filterThreads, portalUnreadCount, threadVisibleTo, type PortalScope, type ThreadAudience } from "../../shared/communications/threads";
import type { FlagPatch } from "../../shared/portalInbox.ts";
import { resolveClientIdentity } from "../services/clientAccounts";
import { requireAuth, requireCoordinator, requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { assistantStatus, completeAssistant, parseAssistantTurns } from "../services/assistants";
import { logCommunicationMessage } from "../services/communicationLog";
import { findUnifiedThread, listUnifiedThreads, threadsForPortal } from "../services/communicationsHub";
import { listFlags, patchesFromBody, saveFlags } from "../services/portalInboxFlags";
import { moveInbox, resolveDeskActor, visibleInboxThread } from "../services/peopleDesk";
import { sendEmail } from "../services/email";
import { sendSMS } from "../services/sms";
import admin from "firebase-admin";

const router = Router();

const AUDIENCES = new Set<ThreadAudience>(["clients", "leads", "photographers", "socials", "website"]);

function ownerEmails(): string[] {
  return ownerAllowlist(process.env.OWNER_EMAILS);
}

async function requireOwnerOrAdmin(req: AuthenticatedRequest, res: Parameters<typeof requireStaff>[1], next: Parameters<typeof requireStaff>[2]) {
  await requireStaff(req, res, () => {
    if (!canUseAssistants({ role: req.staffRole, email: req.user?.email, ownerEmails: ownerEmails() })) {
      res.status(403).json({ error: "Owner or admin access required." });
      return;
    }
    next();
  });
}

async function portalScope(req: AuthenticatedRequest): Promise<PortalScope> {
  const uid = req.user?.uid || "";
  const email = (req.user?.email || "").trim().toLowerCase();
  if (!admin.apps.length) {
    if (uid === "temp-admin-uid" || req.staffRole) {
      return { kind: "photographer", uid, email, phone: "" };
    }
    return { kind: "client", uid, email, phone: "" };
  }
  try {
    const staffDoc = await admin.firestore().collection("staff").doc(uid).get();
    if (staffDoc.exists) {
      const data = staffDoc.data() || {};
      return {
        kind: "photographer",
        uid,
        email,
        phone: typeof data.phone === "string" ? data.phone : "",
      };
    }
    const clientDoc = await admin.firestore().collection("clients").doc(uid).get();
    const client = clientDoc.exists ? clientDoc.data() || {} : {};
    let clientIds = [uid];
    try {
      const identity = await resolveClientIdentity(uid, email || (typeof client.email === "string" ? client.email : ""));
      if (identity.ids.length) clientIds = identity.ids;
    } catch (identityError) {
      console.warn("[Communications] Client identity lookup failed.", identityError);
    }
    return {
      kind: "client",
      uid,
      email: email || (typeof client.email === "string" ? client.email.trim().toLowerCase() : ""),
      phone: typeof client.phone === "string" ? client.phone : "",
      clientIds,
    };
  } catch (error) {
    console.warn("[Communications] Portal scope lookup failed.", error);
    return { kind: "client", uid, email, phone: "" };
  }
}

router.get("/threads", requireCoordinator, async (req, res) => {
  const audience = typeof req.query.audience === "string" ? req.query.audience : "";
  const q = typeof req.query.q === "string" ? req.query.q : "";
  try {
    const threads = await listUnifiedThreads();
    const filtered = AUDIENCES.has(audience as ThreadAudience)
      ? filterThreads(threads, audience as ThreadAudience, q)
      : threads;
    return res.json({ threads: filtered });
  } catch (error) {
    console.error("[Communications] Thread list failed.", error);
    return res.status(500).json({ error: "Couldn't load conversations." });
  }
});

router.get("/mine", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const scope = await portalScope(req);
    const threads = threadsForPortal(await listUnifiedThreads(), scope);
    return res.json({ threads, unreadCount: portalUnreadCount(threads) });
  } catch (error) {
    console.error("[Communications] Portal threads failed.", error);
    return res.status(500).json({ error: "Couldn't load your messages." });
  }
});

router.post("/mine/reply", requireAuth, async (req: AuthenticatedRequest, res) => {
  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId.trim() : "";
  const content = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!threadId || !content) return res.status(400).json({ error: "Choose a thread and enter a reply." });
  if (content.length > 2000) return res.status(400).json({ error: "Reply is too long. Please keep it under 2,000 characters." });

  try {
    const scope = await portalScope(req);
    const thread = await findUnifiedThread(threadId);
    if (!thread || !threadVisibleTo(thread, scope)) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    const senderType = scope.kind === "photographer" ? "photographer" : "client";
    await logCommunicationMessage({
      threadId: thread.id,
      orderId: thread.orderId,
      clientId: scope.kind === "client" ? scope.uid : thread.clientId,
      photographerId: scope.kind === "photographer" ? scope.uid : thread.photographerId,
      participantIds: [...new Set([...thread.participantIds, scope.uid])],
      senderId: scope.uid,
      senderType,
      senderName: req.user?.email || (scope.kind === "photographer" ? "Photographer" : "Client"),
      email: thread.email,
      phone: thread.phone,
      content,
      channel: "in-app",
      direction: "inbound",
      delivery: "logged",
      isRead: false,
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("[Communications] Portal reply failed.", error);
    return res.status(500).json({ error: "Couldn't save the reply." });
  }
});

router.get("/mine/flags", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const who = await resolveDeskActor(req.user?.uid || "", req.user?.email || "");
    if (!who) return res.status(403).json({ error: "Sign in to see messages." });
    const flags = await listFlags(who.uid);
    return res.json({ flags });
  } catch (error) {
    console.error("[Communications] Portal flags failed.", error);
    return res.status(500).json({ error: "Couldn't load your message folders." });
  }
});

router.post("/mine/flags", requireAuth, async (req: AuthenticatedRequest, res) => {
  const patches = patchesFromBody(req.body);
  if (!patches) return res.status(400).json({ error: "Choose a conversation to update." });
  try {
    const who = await resolveDeskActor(req.user?.uid || "", req.user?.email || "");
    if (!who) return res.status(403).json({ error: "Sign in to update a conversation." });
    const scope = await portalScope(req);
    const flagPatches: FlagPatch[] = [];
    for (const patch of patches) {
      if (patch.threadKey.startsWith("direct:")) {
        const id = patch.threadKey.slice("direct:".length);
        const thread = await visibleInboxThread(who, id);
        if (!thread) return res.status(404).json({ error: "Conversation not found." });
        if (patch.folder) {
          const moved = await moveInbox(who, id, patch.folder);
          if ("error" in moved && moved.error) return res.status(moved.status).json({ error: moved.error });
        }
        if (patch.starred !== undefined || patch.forceUnread !== undefined || patch.readAt !== undefined) {
          flagPatches.push({
            threadKey: patch.threadKey,
            starred: patch.starred,
            forceUnread: patch.forceUnread,
            readAt: patch.readAt,
          });
        }
        continue;
      }
      const visible = await conversationVisible(scope, patch.threadKey.slice("comm:".length));
      if (!visible) return res.status(404).json({ error: "Conversation not found." });
      flagPatches.push(patch);
    }
    const flags = flagPatches.length ? await saveFlags(who.uid, flagPatches) : await listFlags(who.uid);
    return res.json({ flags });
  } catch (error) {
    console.error("[Communications] Portal flag save failed.", error);
    return res.status(500).json({ error: "Couldn't update that conversation." });
  }
});

async function conversationVisible(scope: PortalScope, id: string): Promise<boolean> {
  const thread = await findUnifiedThread(id);
  return Boolean(thread && threadVisibleTo(thread, scope));
}

router.post("/reply", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId.trim() : "";
  const channel = req.body?.channel === "sms" ? "sms" : req.body?.channel === "email" ? "email" : "";
  const content = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const subject = typeof req.body?.subject === "string" && req.body.subject.trim()
    ? req.body.subject.trim()
    : "Message from Iconic Images";
  if (!threadId || !channel || !content) {
    return res.status(400).json({ error: "Choose a thread, a channel, and a message." });
  }
  if (content.length > 2000) return res.status(400).json({ error: "Reply is too long. Please keep it under 2,000 characters." });

  try {
    const thread = await findUnifiedThread(threadId);
    if (!thread) return res.status(404).json({ error: "Conversation not found." });
    if (thread.connectorNeeded) {
      return res.status(400).json({ error: "Connector needed. Instagram, Facebook, TikTok, and Google Business are not connected." });
    }

    const baseLog = {
      threadId: thread.id,
      orderId: thread.orderId,
      clientId: thread.clientId,
      photographerId: thread.photographerId,
      participantIds: thread.participantIds,
      senderId: req.user!.uid,
      senderType: "staff",
      senderName: req.user?.email || "Iconic Images",
      email: thread.email,
      phone: thread.phone,
      content,
    };

    if (channel === "email") {
      if (!thread.email) return res.status(400).json({ error: "This thread has no email address." });
      const result = await sendEmail({
        to: thread.email,
        template: "manual_message",
        subject,
        variables: { message: content },
      });
      const delivery = result.sent ? (result.delivery === "allowlist" ? "allowlist" : "sent") : "suppressed";
      await logCommunicationMessage({
        ...baseLog,
        recipient: thread.email,
        channel: "email",
        direction: "outbound",
        delivery,
        isRead: true,
      });
      if (!result.sent) {
        return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
      }
      return res.status(201).json({ ok: true, delivery });
    }

    if (!thread.phone) return res.status(400).json({ error: "This thread has no phone number." });
    const result = await sendSMS({ to: thread.phone, body: content });
    const delivery = result.suppressed ? "suppressed" : "sent";
    await logCommunicationMessage({
      ...baseLog,
      recipient: thread.phone,
      channel: "sms",
      direction: "outbound",
      delivery,
      isRead: true,
    });
    if (result.suppressed) {
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }
    return res.status(201).json({ ok: true, sid: result.sid, delivery });
  } catch (error) {
    console.error("[Communications] Reply failed.", error);
    return res.status(500).json({ error: "Couldn't send the reply." });
  }
});

router.get("/assist/status", requireOwnerOrAdmin, (_req, res) => {
  const status = assistantStatus();
  return res.json({
    openai: status.openai,
    grok: status.grok,
    grokNotice: status.grokNotice,
    openaiNotice: status.openaiNotice,
  });
});

router.post("/assist", requireOwnerOrAdmin, async (req, res) => {
  const provider = req.body?.provider === "grok" ? "grok" : req.body?.provider === "openai" ? "openai" : "";
  if (!provider) return res.status(400).json({ error: "Choose Grok or OpenAI." });
  const messages = parseAssistantTurns(req.body);
  if (!messages) return res.status(400).json({ error: "Enter a message to send." });
  const result = await completeAssistant({ provider, messages });
  if (result.ok === false) return res.status(result.status).json({ error: result.message, enabled: false });
  return res.json({ reply: result.reply });
});

export default router;
