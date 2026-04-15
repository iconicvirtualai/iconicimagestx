/**
 * Iconic Images — Campaigns Routes
 * Email + SMS campaign management (Remmi's domain).
 * Place at: server/routes/campaigns.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { sendEmail } from "../services/email";

const router = Router();
const db = () => admin.firestore();

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
