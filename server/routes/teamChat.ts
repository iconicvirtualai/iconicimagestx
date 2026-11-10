/**
 * Team chat API.
 * POST /api/team-chat/sms/webhook is the Twilio inbound URL.
 * Clients can post to their shooter thread. They are not texted or emailed.
 */

import { Router, type Request, type Response } from "express";
import admin from "firebase-admin";
import twilio from "twilio";
import { requireAuth, requireCoordinator, requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { recordAddressText } from "../../shared/addressText.ts";
import { canonicalPhone } from "../../shared/teamChat.ts";
import { vapidPublicKey } from "../services/teamPush.ts";
import {
  getTeamChatRepo,
  type TeamChatRepo,
  type TeamStaffRecord,
} from "../services/teamChatRepo.ts";
import {
  acceptInboundTeamSms,
  createTeamThread,
  directory,
  ensureMember,
  markThreadRead,
  openOrCreateOrderThread,
  publicThread,
  publishTeamMessage,
  saveTextPrefs,
  updateMembers,
} from "../services/teamChat.ts";

const router = Router();

interface OrderShooterMatch {
  clientId: string;
  clientName: string;
  photographer: TeamStaffRecord;
  orderId: string | null;
  listingId: string | null;
  address: string;
}

type OrderResolver = (input: { clientId: string; listingId?: string; orderId?: string }) => Promise<OrderShooterMatch | { error: string; status: number } | null>;

let orderResolver: OrderResolver | null = null;

export function setOrderResolverForTests(resolver: OrderResolver | null) {
  orderResolver = resolver;
}

function originOf(req: Request): string {
  return process.env.APP_URL || process.env.PUBLIC_SITE_URL || `${req.protocol}://${req.get("host")}`;
}

function webhookUrl(req: Request): string {
  if (process.env.TEAM_SMS_WEBHOOK_URL) return process.env.TEAM_SMS_WEBHOOK_URL;
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  return `${proto}://${host}/api/team-chat/sms/webhook`;
}

async function actor(req: AuthenticatedRequest, repo: TeamChatRepo): Promise<TeamStaffRecord | null> {
  const uid = req.user?.uid;
  if (!uid) return null;
  const existing = await repo.getStaff(uid);
  if (existing) return existing;
  if (!req.staffRole) return null;
  const email = req.user?.email || "";
  return {
    uid,
    name: email.includes("@") ? email.split("@")[0] || "Staff" : "Staff",
    role: req.staffRole,
    phone: null,
  };
}

async function readOrderShooter(input: { clientId: string; listingId?: string; orderId?: string }): Promise<OrderShooterMatch | { error: string; status: number } | null> {
  if (!admin.apps.length) return { error: "Orders are not available.", status: 503 };
  const db = admin.firestore();
  let listingId = input.listingId || "";
  let orderId = input.orderId || "";
  let address = "";
  let clientId = "";
  let photographerId = "";
  if (listingId) {
    const doc = await db.collection("listings").doc(listingId).get();
    if (!doc.exists) return { error: "That listing was not found.", status: 404 };
    const data = doc.data() || {};
    clientId = String(data.clientId || "");
    address = recordAddressText(data) || "Your shoot";
    const ids = Array.isArray(data.photographerIds) ? data.photographerIds.map(String) : [];
    photographerId = ids[0] || String(data.assignedPhotographerId || "");
    if (!orderId && typeof data.orderId === "string") orderId = data.orderId;
  } else if (orderId) {
    const doc = await db.collection("orders").doc(orderId).get();
    if (!doc.exists) return { error: "That order was not found.", status: 404 };
    const data = doc.data() || {};
    clientId = String(data.clientId || "");
    address = recordAddressText(data) || "Your shoot";
    photographerId = String(data.assignedPhotographerId || "");
    if (typeof data.listingId === "string") listingId = data.listingId;
  } else {
    return { error: "Choose an order.", status: 400 };
  }
  if (!clientId || clientId !== input.clientId) return { error: "That order is not on this login.", status: 403 };
  if (!photographerId) return { error: "No shooter is assigned yet.", status: 409 };
  const staffDoc = await db.collection("staff").doc(photographerId).get();
  if (!staffDoc.exists) return { error: "The assigned shooter is not on the team.", status: 409 };
  const staff = staffDoc.data() || {};
  const name = [staff.firstName, staff.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ") || "Shooter";
  const clientDoc = await db.collection("clients").doc(input.clientId).get();
  const client = clientDoc.data() || {};
  const clientName = [client.firstName, client.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ") || "Client";
  return {
    clientId: input.clientId,
    clientName,
    photographer: {
      uid: photographerId,
      name,
      role: typeof staff.role === "string" ? staff.role : "photographer",
      phone: typeof staff.phone === "string" ? staff.phone : null,
    },
    orderId: orderId || null,
    listingId: listingId || null,
    address,
  };
}

router.get("/inbox", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const who = await actor(req, repo);
  if (!who) return res.status(403).json({ error: "Staff access required." });
  const threads = await repo.getInbox(who.uid);
  return res.json({ threads, uid: who.uid, name: who.name });
});

router.get("/directory", requireStaff, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ people: await directory(getTeamChatRepo()) });
});

router.get("/sms-log", requireCoordinator, async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await getTeamChatRepo().listSmsLog(40);
  return res.json({
    live: process.env.TEAM_SMS_LIVE === "true",
    entries: rows,
  });
});

router.get("/prefs", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const who = await actor(req, repo);
  if (!who) return res.status(403).json({ error: "Staff access required." });
  const prefs = await repo.getPrefs(who.uid);
  const push = await repo.listPush(who.uid);
  return res.json({
    smsMuted: prefs.smsMuted,
    quietStart: prefs.quietStart,
    quietEnd: prefs.quietEnd,
    timeZone: prefs.timeZone,
    smsOptOut: prefs.smsOptOut,
    push: push.length > 0,
    vapidPublicKey: vapidPublicKey(),
  });
});

router.put("/prefs", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const who = await actor(req, repo);
  if (!who) return res.status(403).json({ error: "Staff access required." });
  const body = req.body || {};
  const prefs = await saveTextPrefs(repo, who.uid, {
    smsMuted: body.smsMuted,
    quietStart: body.quietStart === "" ? null : body.quietStart ?? undefined,
    quietEnd: body.quietEnd === "" ? null : body.quietEnd ?? undefined,
    timeZone: body.timeZone,
  });
  return res.json({
    smsMuted: prefs.smsMuted,
    quietStart: prefs.quietStart,
    quietEnd: prefs.quietEnd,
    timeZone: prefs.timeZone,
    smsOptOut: prefs.smsOptOut,
  });
});

router.get("/push/public-key", requireStaff, (_req, res) => {
  const key = vapidPublicKey();
  if (!key) return res.status(503).json({ error: "VAPID_PUBLIC_KEY is not set." });
  return res.json({ publicKey: key });
});

router.post("/push/subscribe", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const who = await actor(req, repo);
  if (!who) return res.status(403).json({ error: "Staff access required." });
  const endpoint = String(req.body?.endpoint || "");
  const p256dh = String(req.body?.keys?.p256dh || "");
  const authKey = String(req.body?.keys?.auth || "");
  if (!endpoint || !p256dh || !authKey) return res.status(400).json({ error: "Push subscription is incomplete." });
  const current = (await repo.listPush(who.uid)).filter((item) => item.endpoint !== endpoint);
  current.push({ endpoint, p256dh, auth: authKey });
  await repo.savePush(who.uid, current.slice(-5));
  return res.json({ push: true });
});

router.delete("/push/subscribe", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const who = await actor(req, repo);
  if (!who) return res.status(403).json({ error: "Staff access required." });
  const endpoint = String(req.body?.endpoint || "");
  const current = endpoint
    ? (await repo.listPush(who.uid)).filter((item) => item.endpoint !== endpoint)
    : [];
  await repo.savePush(who.uid, current);
  return res.json({ push: current.length > 0 });
});

router.post("/threads", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repo = getTeamChatRepo();
    const who = await actor(req, repo);
    if (!who) return res.status(403).json({ error: "Staff access required." });
    const kind = req.body?.kind === "channel" || req.body?.kind === "dm" ? req.body.kind : "group";
    const thread = await createTeamThread({
      repo,
      kind,
      name: String(req.body?.name || ""),
      creator: who,
      memberIds: Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [],
    });
    return res.json({ thread: publicThread(thread, who.uid) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Could not create the chat." });
  }
});

router.patch("/threads/:id/members", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repo = getTeamChatRepo();
    const who = await actor(req, repo);
    if (!who) return res.status(403).json({ error: "Staff access required." });
    const thread = await updateMembers({
      repo,
      threadId: req.params.id,
      actorId: who.uid,
      add: Array.isArray(req.body?.add) ? req.body.add.map(String) : [],
      remove: Array.isArray(req.body?.remove) ? req.body.remove.map(String) : [],
    });
    return res.json({ thread: publicThread(thread, who.uid) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Could not update members." });
  }
});

router.get("/threads/:id/messages", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const thread = await repo.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "That chat was not found." });
  const uid = req.user!.uid;
  if (!(await ensureMember(repo, thread, uid))) return res.status(403).json({ error: "You are not in this chat." });
  const messages = await repo.listMessages(thread.id, 100);
  return res.json({ thread: publicThread(thread, uid), messages });
});

router.post("/threads/:id/messages", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repo = getTeamChatRepo();
    const who = await actor(req, repo);
    if (!who) return res.status(403).json({ error: "Staff access required." });
    const result = await publishTeamMessage({
      repo,
      threadId: req.params.id,
      senderId: who.uid,
      senderName: who.name,
      senderRole: "staff",
      body: String(req.body?.body || ""),
      source: "app",
      origin: originOf(req),
    });
    return res.json({ message: result.message, log: result.log });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Could not send." });
  }
});

router.post("/threads/:id/read", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const who = await actor(req, repo);
  if (!who) return res.status(403).json({ error: "Staff access required." });
  await markThreadRead(repo, who.uid, req.params.id);
  return res.json({ ok: true });
});

router.get("/portal/threads", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const repo = getTeamChatRepo();
  const uid = req.user!.uid;
  if (await repo.getStaff(uid)) return res.json({ threads: [] });
  const threads = (await repo.listThreads()).filter((thread) => thread.clientId === uid);
  const detailed = [];
  for (const thread of threads) {
    detailed.push({
      thread: publicThread(thread, uid),
      messages: await repo.listMessages(thread.id, 50),
    });
  }
  return res.json({ threads: detailed });
});

router.post("/portal/message", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repo = getTeamChatRepo();
    const uid = req.user!.uid;
    if (await repo.getStaff(uid)) return res.status(403).json({ error: "Use team chat for staff messages." });
    const listingId = String(req.body?.listingId || "");
    const orderId = String(req.body?.orderId || "");
    const resolved = await (orderResolver || readOrderShooter)({
      clientId: uid,
      listingId: listingId || undefined,
      orderId: orderId || undefined,
    });
    if (!resolved) return res.status(404).json({ error: "That order was not found." });
    if ("error" in resolved) return res.status(resolved.status).json({ error: resolved.error });
    const thread = await openOrCreateOrderThread({
      repo,
      clientId: uid,
      clientName: resolved.clientName,
      photographer: resolved.photographer,
      orderId: resolved.orderId,
      listingId: resolved.listingId,
      address: resolved.address,
    });
    const result = await publishTeamMessage({
      repo,
      threadId: thread.id,
      senderId: uid,
      senderName: resolved.clientName,
      senderRole: "client",
      body: String(req.body?.body || ""),
      source: "app",
      origin: originOf(req),
    });
    const packed = JSON.stringify({ thread: publicThread(thread, uid), message: result.message });
    if (/\+1\d{10}/.test(packed)) return res.status(500).json({ error: "Could not send." });
    return res.json({ thread: publicThread(thread, uid), message: result.message });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Could not send." });
  }
});

router.post("/sms/webhook", async (req: Request, res: Response) => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return res.status(503).type("text/plain").send("Twilio auth token is not configured.");
  const signature = String(req.header("x-twilio-signature") || "");
  const url = webhookUrl(req);
  const params = req.body && typeof req.body === "object" ? req.body as Record<string, string> : {};
  if (!twilio.validateRequest(token, signature, url, params)) {
    return res.status(403).type("text/plain").send("Forbidden");
  }
  try {
    const result = await acceptInboundTeamSms({
      from: canonicalPhone(String(params.From || "")),
      body: String(params.Body || ""),
      messageSid: String(params.MessageSid || ""),
      origin: process.env.APP_URL || process.env.PUBLIC_SITE_URL || "https://iconicimagestx.com",
    });
    return res.status(result.status).type("text/xml").send(result.twiml);
  } catch (error) {
    console.error("[team-sms] Inbound failed.", error instanceof Error ? error.message : "inbound failed");
    return res.status(200).type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
  }
});

export default router;
