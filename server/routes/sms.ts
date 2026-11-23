/**
 * Iconic Images — SMS Routes
 *
 * POST /api/sms/send              — Send a one-off SMS to a client (staff only)
 * POST /api/sms/remind/:orderId   — Send appointment reminder for an order (staff only)
 * POST /api/sms/conversation      — Create masked photographer ↔ client conversation
 * GET  /api/sms/conversations     — List all conversations
 * POST /api/sms/webhook           — Twilio inbound webhook (no auth, validated by signature)
 * POST /api/sms/campaign/:id/send — Send an SMS campaign (coordinator only)
 */

import { Router, type Request, type Response } from "express";
import admin from "firebase-admin";
import twilio from "twilio";
import {
  sendSMS,
  sendSMSCampaign,
  deliverCampaignSms,
  createMaskedConversation,
  sendConversationMessage,
  closeConversation,
  SMS_TEMPLATES,
  normalisePhone,
} from "../services/sms";
import { requireStaff, requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { recordAddressText } from "../../shared/addressText";
import { bookingDateLabel } from "../../shared/clientHome";
import { clientNotifyBlockReason, clientNotifyLive } from "../../shared/clientNotify";
import { refuseQaStaffPhone } from "../services/qaStaffAssign";
import { bumpAdminUnreadChannel } from "../services/adminUnread";
import { noteCampaignSmsInbound } from "../services/channelCampaignStore";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { campaignSendLive, isStopKeyword } from "../../shared/channelCampaigns";
import {
  MARKETING_OPT_IN_CONFIRMATION,
  SMS_HELP_REPLY,
  isHelpKeyword,
  phoneDigits10,
  twimlEmpty,
  twimlMessage,
} from "../../shared/a2p";
import { isSmsStopped, marketingRecipientAllowed, optOutEverywhere, saveMarketingOptIn } from "../services/smsProgram";

const router = Router();
const db = () => admin.firestore();
const marketingOptInLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });

async function applyInboundKeyword(from: string, body: string): Promise<"stop" | "help" | "other"> {
  if (from && body) {
    try { await noteCampaignSmsInbound(from, body); } catch { /* campaign index is optional */ }
  }
  if (isStopKeyword(body)) {
    await optOutEverywhere(from);
    return "stop";
  }
  if (isHelpKeyword(body)) return "help";
  return "other";
}

async function findOrderLikeDocument(id: string) {
  const orderRequestDoc = await db().collection("orderRequests").doc(id).get();
  if (orderRequestDoc.exists) return orderRequestDoc;
  const orderDoc = await db().collection("orders").doc(id).get();
  if (orderDoc.exists) return orderDoc;
  return null;
}

// ─── POST /api/sms/send — One-off SMS to any client ──────────────────────────

router.post("/send", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { to, body, orderId } = req.body;
    if (!to || !body) return res.status(400).json({ error: "to and body required." });

    const result = await sendSMS({ to, body });
    if (result.suppressed) {
      console.warn(`[SMS] Suppressed staff send to ${to} — ${clientNotifyBlockReason()}.`);
      if (admin.apps.length) {
        await db().collection("smsLogs").add({
          direction: "outbound",
          to: normalisePhone(to),
          body,
          status: "suppressed",
          orderId: orderId || null,
          sentBy: req.user!.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await db().collection("messages").add({
          orderId: orderId || null,
          senderId: req.user!.uid,
          senderType: "staff",
          senderName: "Iconic Images",
          content: body,
          channel: "sms",
          direction: "outbound",
          delivery: "suppressed",
          phone: normalisePhone(to),
          isRead: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }

    // Log to Firestore
    await db().collection("smsLogs").add({
      direction: "outbound",
      to: normalisePhone(to),
      body,
      sid: result.sid,
      status: result.status,
      orderId: orderId || null,
      sentBy: req.user!.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // If tied to an order, also log as a message
    if (orderId) {
      await db().collection("messages").add({
        orderId,
        senderId: req.user!.uid,
        senderType: "staff",
        senderName: "Iconic Images",
        content: body,
        channel: "sms",
        isRead: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Send error:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
});

// ─── POST /api/sms/remind/:orderId — Send appointment reminder ────────────────

router.post("/remind/:orderId", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type = "24h" } = req.body; // "24h" | "1h"

    const orderDoc = await findOrderLikeDocument(req.params.orderId);
    if (!orderDoc) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderDoc.data()!;
    const phone = order.phone || order.clientPhone;
    if (!phone) return res.status(400).json({ error: "No phone number on order." });
    if (order.smsConsent !== true) {
      return res.status(409).json({ error: "This booking does not have SMS consent.", skipped: "no_sms_consent" });
    }
    if (await isSmsStopped(String(phone))) {
      return res.status(409).json({ error: "This number opted out.", skipped: "sms_stopped" });
    }

    const name = order.firstName || order.clientName?.split(" ")[0] || "there";
    const date = bookingDateLabel(order.scheduledDate, "your scheduled date");
    const time = order.scheduledTime || "your appointment time";
    const address = recordAddressText(order) || "the property";

    let body: string;
    if (type === "1h") {
      body = SMS_TEMPLATES.appointmentReminder1h(name, time);
    } else {
      body = SMS_TEMPLATES.appointmentReminder24h(name, date, time, address);
    }

    const result = await sendSMS({ to: phone, body });
    if (result.suppressed) {
      console.warn(`[SMS] Suppressed reminder to ${phone} — ${clientNotifyBlockReason()}.`);
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }

    await db().collection("smsLogs").add({
      direction: "outbound",
      to: normalisePhone(phone),
      body,
      sid: result.sid,
      type: `reminder_${type}`,
      orderId: req.params.orderId,
      sentBy: req.user!.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Reminder error:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
});

// ─── POST /api/sms/conversation — Create masked photographer ↔ client chat ────

router.post("/conversation", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, photographerPhone, photographerName, clientPhone, clientName } = req.body;

    if (!orderId || !photographerPhone || !clientPhone) {
      return res.status(400).json({ error: "orderId, photographerPhone, clientPhone required." });
    }

    const [staffSnap, orderLike] = await Promise.all([
      db().collection("staff").get(),
      findOrderLikeDocument(String(orderId)),
    ]);
    const refusal = refuseQaStaffPhone({
      photographerPhone,
      staff: staffSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
      record: orderLike ? { id: orderLike.id, ...orderLike.data() } : { id: String(orderId) },
    });
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });

    // Check if conversation already exists for this order
    const existing = await db().collection("conversations")
      .where("orderId", "==", orderId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.json({ conversationSid: existing.docs[0].data().conversationSid, existing: true });
    }

    const appUrl = process.env.APP_URL || process.env.VERCEL_URL || "";
    const webhookUrl = appUrl ? `${appUrl}/api/sms/webhook` : undefined;

    const result = await createMaskedConversation(
      `Order ${orderId} — ${photographerName || "Photographer"} + ${clientName || "Client"}`,
      { phone: photographerPhone, name: photographerName },
      { phone: clientPhone, name: clientName },
      webhookUrl
    );

    // Persist to Firestore
    await db().collection("conversations").add({
      orderId,
      conversationSid: result.conversationSid,
      photographerPhone: normalisePhone(photographerPhone),
      photographerName: photographerName || null,
      photographerParticipantSid: result.photographerParticipantSid,
      clientPhone: normalisePhone(clientPhone),
      clientName: clientName || null,
      clientParticipantSid: result.clientParticipantSid,
      status: "active",
      createdBy: req.user!.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send intro message from system
    await sendConversationMessage(
      result.conversationSid,
      `Hi! This is a private message channel for your Iconic Images appointment. ` +
      `${photographerName || "Your photographer"} and ${clientName || "your client"} are connected here. ` +
      `Neither party can see each other's phone number. 📸`
    );

    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Conversation error:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
});

// ─── GET /api/sms/conversations — List active conversations ──────────────────

router.get("/conversations", requireStaff, async (_req, res: Response) => {
  try {
    const snapshot = await db().collection("conversations")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch conversations." });
  }
});

// ─── POST /api/sms/conversation/:id/close — Close a conversation ─────────────

router.post("/conversation/:id/close", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const convoDoc = await db().collection("conversations").doc(req.params.id).get();
    if (!convoDoc.exists) return res.status(404).json({ error: "Conversation not found." });

    await closeConversation(convoDoc.data()!.conversationSid);
    await convoDoc.ref.update({ status: "closed", closedAt: admin.firestore.FieldValue.serverTimestamp() });

    return res.json({ success: true });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: errorMessage });
  }
});

// ─── POST /api/sms/webhook — Twilio inbound message webhook ──────────────────
// Twilio sends a POST here when someone replies to a Conversations message.
// Signature validation is applied in production.

router.post("/webhook", express_raw_or_json, async (req: Request, res: Response) => {
  try {
    // Validate Twilio signature in production
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken && process.env.NODE_ENV === "production") {
      const signature = req.headers["x-twilio-signature"] as string;
      const url = `${process.env.APP_URL}/api/sms/webhook`;
      const valid = twilio.validateRequest(authToken, signature, url, req.body);
      if (!valid) {
        console.warn("[SMS Webhook] Invalid Twilio signature");
        return res.status(403).send("Forbidden");
      }
    }

    const {
      ConversationSid,
      Body,
      Author,
      From,
      MessageSid,
    } = req.body;

    const inboundFrom = String(From || Author || "");
    const inboundBody = String(Body || "");
    const keyword = await applyInboundKeyword(inboundFrom, inboundBody);

    if (!ConversationSid || !Body) {
      if (keyword === "help") {
        res.type("text/xml");
        return res.status(200).send(twimlMessage(SMS_HELP_REPLY));
      }
      return res.status(200).send("OK");
    }

    // Find the conversation in Firestore
    const convoSnap = await db().collection("conversations")
      .where("conversationSid", "==", ConversationSid)
      .limit(1)
      .get();

    const orderId = convoSnap.empty ? null : convoSnap.docs[0].data().orderId;
    const convoData = convoSnap.empty ? null : convoSnap.docs[0].data();

    // Determine sender type
    let senderType = "client";
    if (convoData && Author === convoData.photographerParticipantSid) {
      senderType = "photographer";
    } else if (Author === "Iconic Images") {
      senderType = "staff";
    }

    // Store inbound message in Firestore
    await db().collection("smsLogs").add({
      direction: "inbound",
      conversationSid: ConversationSid,
      messageSid: MessageSid,
      from: Author,
      body: Body,
      senderType,
      orderId,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Also mirror into the messages collection for unified inbox
    if (orderId) {
      await db().collection("messages").add({
        orderId,
        senderId: Author,
        senderType,
        senderName: senderType === "photographer"
          ? (convoData?.photographerName || "Photographer")
          : (convoData?.clientName || "Client"),
        content: Body,
        channel: "sms",
        conversationSid: ConversationSid,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (senderType !== "staff") await bumpAdminUnreadChannel("sms");

    if (keyword === "help") {
      res.type("text/xml");
      return res.status(200).send(twimlMessage(SMS_HELP_REPLY));
    }
    // Twilio Conversations expects empty 200
    return res.status(200).send("");
  } catch (err) {
    console.error("[SMS Webhook] Error:", err);
    return res.status(200).send(""); // Always return 200 to Twilio
  }
});

// ─── POST /api/sms/campaign/:id/send — Send SMS campaign ─────────────────────

router.post("/campaign/:id/send", requireCoordinator, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignDoc = await db().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });

    const campaign = campaignDoc.data()!;
    if (campaign.status === "sent") return res.status(400).json({ error: "Campaign already sent." });
    if (campaign.type !== "sms") return res.status(400).json({ error: "Not an SMS campaign." });
    if (!clientNotifyLive()) {
      console.warn(`[SMS] Suppressed campaign ${req.params.id} — ${clientNotifyBlockReason()}.`);
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }

    const [bySmsOptIn, byMarketingOptIn] = await Promise.all([
      db().collection("clients").where("smsOptIn", "==", true).get(),
      db().collection("clients").where("marketingSmsOptIn", "==", true).get(),
    ]);
    const byId = new Map<string, Record<string, unknown>>();
    for (const doc of [...bySmsOptIn.docs, ...byMarketingOptIn.docs]) {
      byId.set(doc.id, { id: doc.id, ...doc.data() });
    }
    let clients = [...byId.values()];

    if (campaign.audience === "custom" && campaign.audienceIds?.length) {
      clients = clients.filter((c) => campaign.audienceIds.includes(c.id));
    }

    const recipients = [];
    for (const client of clients) {
      if (!marketingRecipientAllowed(client)) continue;
      if (await isSmsStopped(String(client.phone))) continue;
      recipients.push({
        phone: client.phone as string,
        name: ((client.firstName as string) || "") + " " + ((client.lastName as string) || ""),
        marketingOptIn: true,
      });
    }

    await campaignDoc.ref.update({ status: "sending" });

    const results = await sendSMSCampaign(
      recipients,
      campaign.body,
      campaign.messagingServiceSid || undefined
    );

    const sent = results.filter((r) => r.sid).length;
    const failed = results.filter((r) => r.error).length;

    await campaignDoc.ref.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      "stats.sent": sent,
      "stats.failed": failed,
    });

    return res.json({ success: true, sent, failed });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS Campaign] Error:", errorMessage);
    await db().collection("campaigns").doc(req.params.id).update({ status: "draft" }).catch(() => {});
    return res.status(500).json({ error: errorMessage });
  }
});

// ─── POST /api/sms/opt-out ────────────────────────────────────────────────────
// Twilio will auto-handle STOP/HELP, but we can also handle it server-side.

router.post("/opt-out", async (req: Request, res: Response) => {
  try {
    const from = String(req.body?.From || "");
    const body = String(req.body?.Body || "");
    res.type("text/xml");
    if (!from) return res.status(200).send(twimlEmpty());
    const keyword = await applyInboundKeyword(from, body);
    if (keyword === "help") return res.status(200).send(twimlMessage(SMS_HELP_REPLY));
    return res.status(200).send(twimlEmpty());
  } catch (err) {
    res.type("text/xml");
    return res.status(200).send(twimlEmpty());
  }
});

router.post("/marketing-opt-in", async (req: Request, res: Response) => {
  const limit = marketingOptInLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ error: "Too many signups. Please wait and try again." });
  }
  const name = String(req.body?.name || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const consent = req.body?.consent === true || req.body?.consent === "yes" || req.body?.consent === "on";
  const source = String(req.body?.source || "/sms");
  if (!name || !phoneDigits10(phone)) {
    return res.status(400).json({ error: "Name and a mobile number are required." });
  }
  if (!consent) {
    return res.status(400).json({ error: "Check the box to agree to promotional texts." });
  }
  if (source !== "/sms") {
    return res.status(400).json({ error: "Unknown opt-in source." });
  }
  try {
    const record = await saveMarketingOptIn({
      name,
      phone,
      ip: clientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
    });
    let confirmation: "skipped" | "sent" | "failed" = "skipped";
    if (campaignSendLive()) {
      try {
        await deliverCampaignSms(phone, MARKETING_OPT_IN_CONFIRMATION, true);
        confirmation = "sent";
      } catch (error) {
        console.error("[SMS] Opt-in confirmation failed:", error);
        confirmation = "failed";
      }
    }
    const accept = String(req.headers.accept || "");
    const formPost = req.is("application/x-www-form-urlencoded") && !accept.includes("application/json");
    if (formPost) return res.redirect(303, "/sms?joined=1");
    return res.status(201).json({
      ok: true,
      phone: record.phone,
      consentTextVersion: record.consentTextVersion,
      source: record.source,
      confirmation,
    });
  } catch (error) {
    console.error("[SMS] Marketing opt-in failed:", error);
    return res.status(500).json({ error: "Could not save your opt-in." });
  }
});

// Middleware to handle both raw and JSON bodies for webhook
function express_raw_or_json(req: Request, _res: Response, next: () => void) {
  next();
}

export default router;
