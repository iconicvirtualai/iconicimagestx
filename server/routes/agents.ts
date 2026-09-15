/**
 * Iconic Images — AI Agents Routes
 * Morning briefing, flag management, agent log queries.
 * Nora / Lena / Remmi / Grant / Travis / Brady
 * Place at: server/routes/agents.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireStaff, requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { sendSMS, SMS_TEMPLATES, normalisePhone } from "../services/sms";

const router = Router();
const db = () => admin.firestore();

function isAgentAuthorized(req: { headers: Record<string, string | string[] | undefined> }) {
  const serviceKey = req.headers["x-agent-key"];
  const auth = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  return serviceKey === process.env.AGENT_SERVICE_KEY ||
    Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addressLabel(address: unknown): string {
  if (!address) return "the property";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address as Record<string, unknown>;
    if (typeof a.formatted === "string" && a.formatted) return a.formatted;
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "the property";
  }
  return String(address);
}

function combineDateAndTime(date: Date | null, time: unknown) {
  if (!date) return null;
  const combined = new Date(date);
  if (typeof time !== "string" || !time.trim()) return combined;

  const trimmed = time.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return combined;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hours < 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

async function loadOrderForAppointment(appointment: FirebaseFirestore.DocumentData) {
  if (!appointment.orderId) return null;
  const orderDoc = await db().collection("orders").doc(String(appointment.orderId)).get();
  return orderDoc.exists ? { id: orderDoc.id, ref: orderDoc.ref, data: orderDoc.data() || {} } : null;
}

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

// ─── GET/POST /api/agents/run-reminders — Send due appointment reminders ────

async function runReminderSweep(req: any, res: any) {
  try {
    if (!isAgentAuthorized(req)) {
      return res.status(401).json({ error: "Invalid agent key." });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const twoDaysOut = new Date(today);
    twoDaysOut.setDate(twoDaysOut.getDate() + 2);

    const appointments = await db().collection("appointments")
      .where("scheduledDate", ">=", admin.firestore.Timestamp.fromDate(today))
      .where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(twoDaysOut))
      .get();

    const results: Array<Record<string, unknown>> = [];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const appointmentDoc of appointments.docs) {
      const appointment = appointmentDoc.data();
      const status = String(appointment.status || "").toLowerCase();
      if (!["confirmed", "scheduled"].includes(status)) continue;

      const scheduledDate = toDate(appointment.scheduledDate);
      if (!scheduledDate) continue;

      const orderRecord = await loadOrderForAppointment(appointment);
      const order = orderRecord?.data || {};
      const merged = { ...appointment, ...order };
      const sent = appointment.remindersSent || {};
      const orderId = String(appointment.orderId || orderRecord?.id || appointmentDoc.id);
      const phone = merged.clientPhone || merged.phone;
      const name = merged.firstName || merged.clientName?.split(" ")?.[0] || "there";
      const time = merged.scheduledTime || merged.appointmentTime || "your appointment time";
      const address = merged.addressLabel || addressLabel(merged.address || merged.propertyAddress);

      const dueTypes: Array<"24h" | "1h"> = [];
      if (!sent["24h"] && sameCalendarDay(scheduledDate, tomorrow)) {
        dueTypes.push("24h");
      }

      const scheduledAt = combineDateAndTime(scheduledDate, time);
      const minutesUntil = scheduledAt ? (scheduledAt.getTime() - now.getTime()) / 60000 : Number.POSITIVE_INFINITY;
      if (!sent["1h"] && minutesUntil >= 45 && minutesUntil <= 75) {
        dueTypes.push("1h");
      }

      let sentMap = { ...sent };
      for (const type of dueTypes) {
        if (!phone) {
          results.push({ appointmentId: appointmentDoc.id, orderId, type, skipped: "missing_phone" });
          continue;
        }

        const body = type === "1h"
          ? SMS_TEMPLATES.appointmentReminder1h(name, String(time))
          : SMS_TEMPLATES.appointmentReminder24h(name, scheduledDate.toLocaleDateString("en-US"), String(time), String(address));

        try {
          const result = await sendSMS({ to: String(phone), body });
          sentMap = { ...sentMap, [type]: true };
          const update = {
            remindersSent: sentMap,
            [`reminder${type === "24h" ? "24h" : "1h"}SentAt`]: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await Promise.all([
            appointmentDoc.ref.update(update),
            orderRecord?.ref.update(update) || Promise.resolve(),
            db().collection("smsLogs").add({
              direction: "outbound",
              to: normalisePhone(String(phone)),
              body,
              sid: result.sid,
              status: result.status,
              type: `reminder_${type}`,
              orderId,
              appointmentId: appointmentDoc.id,
              sentBy: "aicon-reminder-runner",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }),
          ]);

          results.push({ appointmentId: appointmentDoc.id, orderId, type, sent: true, sid: result.sid });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db().collection("agentLogs").add({
            agent: "nora",
            action: "Reminder send failed",
            summary: `Reminder ${type} failed for order ${orderId}`,
            status: "flagged",
            relatedId: orderId,
            relatedType: "order",
            priority: "high",
            requiresHumanReview: true,
            details: message,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          results.push({ appointmentId: appointmentDoc.id, orderId, type, error: message });
        }
      }
    }

    return res.json({
      success: true,
      checked: appointments.size,
      sent: results.filter((r) => r.sent).length,
      results,
    });
  } catch (err) {
    console.error("[Agents] Reminder sweep error:", err);
    return res.status(500).json({ error: "Failed to run reminder sweep." });
  }
}

router.get("/run-reminders", runReminderSweep);
router.post("/run-reminders", runReminderSweep);

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
