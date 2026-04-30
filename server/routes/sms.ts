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
  createMaskedConversation,
  sendConversationMessage,
  closeConversation,
  SMS_TEMPLATES,
  normalisePhone,
} from "../services/sms";
import { requireStaff, requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

// ─── POST /api/sms/send — One-off SMS to any client ──────────────────────────

router.post("/send", requireStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { to, body, orderId } = req.body;
    if (!to || !body) return res.status(400).json({ error: "to and body required." });

    const result = await sendSMS({ to, body });

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

    const orderDoc = await db().collection("orderRequests").doc(req.params.orderId).get()
      || await db().collection("orders").doc(req.params.orderId).get();

    if (!orderDoc?.exists) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderDoc.data()!;
    const phone = order.phone;
    if (!phone) return res.status(400).json({ error: "No phone number on order." });

    const name = order.firstName || order.clientName?.split(" ")[0] || "there";
    const date = order.scheduledDate || "your scheduled date";
    const time = order.scheduledTime || "your appointment time";
    const address = order.address || "the property";

    let body: string;
    if (type === "1h") {
      body = SMS_TEMPLATES.appointmentReminder1h(name, time);
    } else {
      body = SMS_TEMPLATES.appointmentReminder24h(name, date, time, address);
    }

    const result = await sendSMS({ to: phone, body });

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
      ParticipantSid,
      MessageSid,
    } = req.body;

    if (!ConversationSid || !Body) {
      return res.status(200).send("OK"); // Twilio expects 200
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

    // Get recipients
    const clientsSnap = await db().collection("clients")
      .where("smsOptIn", "==", true)
      .get();

    let clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));

    if (campaign.audience === "custom" && campaign.audienceIds?.length) {
      clients = clients.filter((c) => campaign.audienceIds.includes(c.id));
    }

    const recipients = clients
      .filter((c) => c.phone)
      .map((c) => ({
        phone: c.phone as string,
        name: ((c.firstName as string) || "") + " " + ((c.lastName as string) || ""),
      }));

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
    const { From, Body } = req.body;
    if (!From) return res.status(200).send("");

    const keyword = (Body || "").trim().toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword)) {
      // Find client by phone and mark opted out
      const snap = await db().collection("clients")
        .where("phone", "==", From)
        .limit(1)
        .get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({ smsOptIn: false });
      }
    }

    return res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>");
  } catch (err) {
    return res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>");
  }
});

// Middleware to handle both raw and JSON bodies for webhook
function express_raw_or_json(req: Request, _res: Response, next: () => void) {
  next();
}

export default router;
