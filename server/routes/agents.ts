/**
 * Iconic Images — AI Agents Routes
 * Morning briefing, flag management, agent log queries.
 * Nora / Lena / Remmi / Grant / Travis / Brady
 * Place at: server/routes/agents.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireStaff, requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

// ─── GET /api/agents/briefing — Morning dashboard briefing ───────────────────

router.get("/briefing", requireStaff, async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = admin.firestore.Timestamp.fromDate(today);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTs = admin.firestore.Timestamp.fromDate(yesterday);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTs = admin.firestore.Timestamp.fromDate(tomorrow);

    const [
      pendingRequests,
      todayAppointments,
      tomorrowAppointments,
      unreviewedFlags,
      urgentFlags,
      pendingGalleries,
      overdueInvoices,
      recentLogs,
    ] = await Promise.all([
      db().collection("orderRequests").where("status", "==", "new").get(),
      db().collection("appointments")
        .where("scheduledDate", ">=", todayTs)
        .where("scheduledDate", "<", tomorrowTs)
        .where("status", "in", ["confirmed", "scheduled"])
        .get(),
      db().collection("appointments")
        .where("scheduledDate", ">=", tomorrowTs)
        .where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(
          new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
        ))
        .where("status", "in", ["confirmed", "scheduled"])
        .get(),
      db().collection("agentLogs")
        .where("requiresHumanReview", "==", true)
        .where("reviewedAt", "==", null)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
      db().collection("agentLogs")
        .where("priority", "==", "urgent")
        .where("requiresHumanReview", "==", true)
        .orderBy("createdAt", "desc")
        .limit(5)
        .get(),
      db().collection("galleries")
        .where("status", "in", ["raw_uploaded", "editing"])
        .get(),
      db().collection("invoices")
        .where("status", "==", "overdue")
        .get(),
      db().collection("agentLogs")
        .where("createdAt", ">=", yesterdayTs)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get(),
    ]);

    // Build agent-specific summaries
    const agentSummaries = {
      nora: {
        name: "Nora",
        role: "Operations",
        emoji: "⚙️",
        items: [
          `${pendingRequests.size} pending booking request${pendingRequests.size !== 1 ? "s" : ""} awaiting review`,
          `${todayAppointments.size} appointment${todayAppointments.size !== 1 ? "s" : ""} scheduled today`,
          `${tomorrowAppointments.size} appointment${tomorrowAppointments.size !== 1 ? "s" : ""} tomorrow`,
          `${pendingGalleries.size} galler${pendingGalleries.size !== 1 ? "ies" : "y"} in editing pipeline`,
        ],
        flags: unreviewedFlags.docs
          .filter((d) => d.data().agent === "nora")
          .map((d) => ({ id: d.id, ...d.data() })),
      },
      travis: {
        name: "Travis",
        role: "Accounting & Finance",
        emoji: "💰",
        items: [
          `${overdueInvoices.size} overdue invoice${overdueInvoices.size !== 1 ? "s" : ""}`,
        ],
        flags: unreviewedFlags.docs
          .filter((d) => d.data().agent === "travis")
          .map((d) => ({ id: d.id, ...d.data() })),
      },
      brady: {
        name: "Brady",
        role: "Quality Control",
        emoji: "🔍",
        items: [],
        flags: unreviewedFlags.docs
          .filter((d) => d.data().agent === "brady")
          .map((d) => ({ id: d.id, ...d.data() })),
      },
      lena: {
        name: "Lena",
        role: "Sales",
        emoji: "🎯",
        items: [],
        flags: unreviewedFlags.docs
          .filter((d) => d.data().agent === "lena")
          .map((d) => ({ id: d.id, ...d.data() })),
      },
      remmi: {
        name: "Remmi",
        role: "Marketing & Social",
        emoji: "📱",
        items: [],
        flags: unreviewedFlags.docs
          .filter((d) => d.data().agent === "remmi")
          .map((d) => ({ id: d.id, ...d.data() })),
      },
      grant: {
        name: "Grant",
        role: "Training & Onboarding",
        emoji: "📚",
        items: [],
        flags: unreviewedFlags.docs
          .filter((d) => d.data().agent === "grant")
          .map((d) => ({ id: d.id, ...d.data() })),
      },
    };

    return res.json({
      briefingDate: new Date().toISOString(),
      urgentCount: urgentFlags.size,
      urgentItems: urgentFlags.docs.map((d) => ({ id: d.id, ...d.data() })),
      agents: agentSummaries,
      recentActivity: recentLogs.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() })),
      todayAppointments: todayAppointments.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    console.error("[Agents] Briefing error:", err);
    return res.status(500).json({ error: "Failed to generate briefing." });
  }
});

// ─── GET /api/agents/logs — All agent logs ───────────────────────────────────

router.get("/logs", requireStaff, async (req, res) => {
  try {
    const { agent, status, requiresReview, limit = "50" } = req.query;
    let query = db().collection("agentLogs").orderBy("createdAt", "desc");

    if (agent) query = query.where("agent", "==", agent) as typeof query;
    if (status) query = query.where("status", "==", status) as typeof query;
    if (requiresReview === "true") {
      query = query.where("requiresHumanReview", "==", true) as typeof query;
    }

    const snapshot = await query.limit(Number(limit)).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch agent logs." });
  }
});

// ─── PATCH /api/agents/logs/:id/resolve — Mark flag as reviewed ──────────────

router.patch("/logs/:id/resolve", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const { notes } = req.body;
    await db().collection("agentLogs").doc(req.params.id).update({
      requiresHumanReview: false,
      status: "completed",
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: req.user!.uid,
      resolvedNotes: notes || "",
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to resolve flag." });
  }
});

// ─── POST /api/agents/log — Log an agent action (used by agent processes) ────

router.post("/log", async (req, res) => {
  try {
    // Verify agent service key
    const serviceKey = req.headers["x-agent-key"];
    if (serviceKey !== process.env.AGENT_SERVICE_KEY) {
      return res.status(401).json({ error: "Invalid agent key." });
    }

    const { agent, action, summary, status, relatedId, relatedType,
            priority, requiresHumanReview, details } = req.body;

    if (!agent || !action || !summary) {
      return res.status(400).json({ error: "agent, action, and summary required." });
    }

    const ref = await db().collection("agentLogs").add({
      agent, action, summary,
      status: status || "completed",
      relatedId: relatedId || null,
      relatedType: relatedType || null,
      priority: priority || "normal",
      requiresHumanReview: requiresHumanReview || false,
      details: details || "",
      reviewedAt: null,
      reviewedBy: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to log agent action." });
  }
});

export default router;
