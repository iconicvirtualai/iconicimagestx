/**
 * Iconic Images — Campaigns Routes
 * Email + SMS campaign management (Remmi's domain).
 * Place at: server/routes/campaigns.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import crypto from "crypto";
import { requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { sendEmail } from "../services/email";
import { sendSMSCampaign } from "../services/sms";

const router = Router();
const db = () => admin.firestore();

function mailchimpConfig() {
  const apiKey = process.env.MAILCHIMP_API_KEY || "";
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX || apiKey.split("-").pop() || "";
  return { apiKey, serverPrefix };
}

async function mailchimpRequest(path: string, init: RequestInit = {}) {
  const { apiKey, serverPrefix } = mailchimpConfig();
  if (!apiKey || !serverPrefix) {
    throw new Error("Mailchimp is not configured. Set MAILCHIMP_API_KEY.");
  }

  const auth = Buffer.from(`iconic:${apiKey}`).toString("base64");
  const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Mailchimp request failed.";
    throw new Error(detail);
  }

  return data;
}

// GET /api/campaigns
router.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db().collection("campaigns")
      .orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch campaigns." });
  }
});

// GET /api/campaigns/mailchimp/status — Check Mailchimp account + lists
router.get("/mailchimp/status", requireCoordinator, async (_req, res) => {
  try {
    const { apiKey, serverPrefix } = mailchimpConfig();
    if (!apiKey || !serverPrefix) {
      return res.json({
        connected: false,
        message: "Add MAILCHIMP_API_KEY to enable Mailchimp.",
        lists: [],
      });
    }

    const account = await mailchimpRequest("/");
    const listsData = await mailchimpRequest("/lists?count=20&fields=lists.id,lists.name,lists.stats.member_count,lists.stats.unsubscribe_count");

    return res.json({
      connected: true,
      accountName: account.account_name || account.username || "Mailchimp",
      serverPrefix,
      lists: (listsData.lists || []).map((list: any) => ({
        id: list.id,
        name: list.name,
        memberCount: list.stats?.member_count || 0,
        unsubscribeCount: list.stats?.unsubscribe_count || 0,
      })),
    });
  } catch (err) {
    console.error("[Campaigns] Mailchimp status error:", err);
    return res.status(500).json({
      connected: false,
      error: err instanceof Error ? err.message : "Mailchimp connection failed.",
    });
  }
});

// POST /api/campaigns/mailchimp/sync — Push Iconic clients into a Mailchimp list
router.post("/mailchimp/sync", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const { listId, audience = "all" } = req.body;
    if (!listId) return res.status(400).json({ error: "listId required." });

    let recipientQuery = db().collection("clients").where("status", "==", "active");
    if (audience === "vip") {
      recipientQuery = db().collection("clients").where("status", "==", "vip");
    }

    const clientsSnap = await recipientQuery.get();
    const clients = clientsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Record<string, any>))
      .filter((client) => client.email && client.emailMarketingOptOut !== true);

    let synced = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const client of clients) {
      const email = String(client.email).toLowerCase().trim();
      const hash = crypto.createHash("md5").update(email).digest("hex");
      const mergeFields = {
        FNAME: client.firstName || "",
        LNAME: client.lastName || "",
      };
      const tags = ["Iconic Images", audience === "vip" ? "VIP" : "Client"].filter(Boolean);

      try {
        await mailchimpRequest(`/lists/${listId}/members/${hash}`, {
          method: "PUT",
          body: JSON.stringify({
            email_address: email,
            status_if_new: "subscribed",
            status: client.mailchimpStatus || "subscribed",
            merge_fields: mergeFields,
          }),
        });
        await mailchimpRequest(`/lists/${listId}/members/${hash}/tags`, {
          method: "POST",
          body: JSON.stringify({
            tags: tags.map((name) => ({ name, status: "active" })),
          }),
        });
        synced++;
      } catch (err) {
        errors.push({
          email,
          error: err instanceof Error ? err.message : "Sync failed",
        });
      }
    }

    await db().collection("agentLogs").add({
      agent: "remmi",
      action: "Mailchimp sync",
      summary: `Synced ${synced} clients to Mailchimp list ${listId}`,
      status: errors.length ? "flagged" : "completed",
      relatedType: "campaign",
      priority: errors.length ? "medium" : "low",
      requiresHumanReview: errors.length > 0,
      details: { listId, audience, synced, failed: errors.length, errors: errors.slice(0, 20) },
      createdBy: req.user!.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    return res.json({ success: true, synced, failed: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error("[Campaigns] Mailchimp sync error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to sync Mailchimp." });
  }
});

// POST /api/campaigns — create campaign
router.post("/", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, type, subject, body, audience, audienceIds, scheduledAt } = req.body;
    if (!name || !body || !audience) {
      return res.status(400).json({ error: "name, body, and audience required." });
    }

    const ref = await db().collection("campaigns").add({
      name, type: type || "email", status: "draft",
      subject: subject || "", body, audience,
      audienceIds: audienceIds || [],
      scheduledAt: scheduledAt
        ? admin.firestore.Timestamp.fromDate(new Date(scheduledAt)) : null,
      stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      createdBy: req.user!.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create campaign." });
  }
});

// POST /api/campaigns/:id/send — Send campaign immediately
router.post("/:id/send", requireCoordinator, async (req, res) => {
  try {
    const campaignDoc = await db().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });

    const campaign = campaignDoc.data()!;
    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Campaign already sent." });
    }

    // Get recipients
    let recipientQuery = db().collection("clients").where("status", "==", "active");
    if (campaign.audience === "vip") {
      recipientQuery = db().collection("clients").where("status", "==", "vip");
    }

    const clientsSnap = await recipientQuery.get();
    let clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));

    if (campaign.audience === "custom" && campaign.audienceIds?.length) {
      clients = clients.filter((c) => campaign.audienceIds.includes(c.id));
    }

    await campaignDoc.ref.update({ status: "sending", updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    let sentCount = 0;

    if (campaign.type === "sms") {
      // SMS campaign
      const recipients = clients
        .filter((c) => c.phone && c.smsOptIn !== false)
        .map((c) => ({
          phone: c.phone as string,
          name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || "there",
        }));

      const results = await sendSMSCampaign(
        recipients,
        campaign.body,
        campaign.messagingServiceSid || undefined
      );
      sentCount = results.filter((r) => r.sid).length;
    } else {
      // Email campaign (default)
      for (const client of clients) {
        if (!client.email) continue;
        try {
          await sendEmail({
            to: client.email as string,
            template: "marketing",
            subject: campaign.subject,
            variables: {
              clientName: `${client.firstName} ${client.lastName}`,
              body: campaign.body,
            },
          });
          sentCount++;
        } catch {
          // continue sending to others
        }
      }
    }

    await campaignDoc.ref.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      "stats.sent": sentCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, sent: sentCount });
  } catch (err) {
    console.error("[Campaigns] Send error:", err);
    await db().collection("campaigns").doc(req.params.id)
      .update({ status: "draft" }).catch(() => {});
    return res.status(500).json({ error: "Failed to send campaign." });
  }
});

export default router;
