/**
 * Iconic Images — Orders Routes
 * Full CRUD for orders + status transitions.
 * Place at: server/routes/orders.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, requireStaff, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

// ─── GET /api/orders — List orders ───────────────────────────────────────────

router.get("/", requireStaff, async (req, res) => {
  try {
    const { status, photographerId, limit = "50", startAfter } = req.query;

    let query = db().collection("orders").orderBy("createdAt", "desc");

    if (status) query = query.where("status", "==", status) as typeof query;
    if (photographerId) {
      query = query.where("assignedPhotographerId", "==", photographerId) as typeof query;
    }

    const limitNum = Math.min(Number(limit), 200);
    query = query.limit(limitNum) as typeof query;

    if (startAfter) {
      const cursorDoc = await db().collection("orders").doc(startAfter as string).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc) as typeof query;
      }
    }

    const snapshot = await query.get();
    const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    return res.json({
      orders,
      hasMore: orders.length === limitNum,
      lastId: orders[orders.length - 1]?.id || null,
    });
  } catch (err) {
    console.error("[Orders] List error:", err);
    return res.status(500).json({ error: "Failed to fetch orders." });
  }
});

// ─── GET /api/orders/dashboard — Dashboard stats ─────────────────────────────

router.get("/dashboard", requireStaff, async (_req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allOrders, todayOrders, monthTransactions, pendingRequests] = await Promise.all([
      db().collection("orders").get(),
      db()
        .collection("orders")
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(todayStart))
        .get(),
      db()
        .collection("transactions")
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(monthStart))
        .where("status", "==", "completed")
        .get(),
      db().collection("orderRequests").where("status", "==", "new").get(),
    ]);

    const statusCounts: Record<string, number> = {};
    allOrders.docs.forEach((d) => {
      const s = d.data().status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    const monthRevenue = monthTransactions.docs.reduce(
      (sum, d) => sum + (d.data().amount || 0),
      0
    );

    return res.json({
      totalOrders: allOrders.size,
      todayOrders: todayOrders.size,
      pendingRequests: pendingRequests.size,
      monthRevenue,
      statusBreakdown: statusCounts,
      activeOrders: (statusCounts["confirmed"] || 0) +
        (statusCounts["scheduled"] || 0) +
        (statusCounts["in_progress"] || 0),
    });
  } catch (err) {
    console.error("[Orders] Dashboard error:", err);
    return res.status(500).json({ error: "Failed to fetch dashboard stats." });
  }
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

router.get("/:id", requireStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const orderDoc = await db().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });

    const order = { id: orderDoc.id, ...orderDoc.data() };

    // Fetch related records in parallel
    const [gallery, invoice, appointment, messages] = await Promise.all([
      db().collection("galleries").where("orderId", "==", req.params.id).limit(1).get(),
      db().collection("invoices").where("orderId", "==", req.params.id).limit(1).get(),
      db().collection("appointments").where("orderId", "==", req.params.id).limit(1).get(),
      db().collection("messages").where("orderId", "==", req.params.id)
        .orderBy("createdAt", "desc").limit(20).get(),
    ]);

    return res.json({
      order,
      gallery: gallery.empty ? null : { id: gallery.docs[0].id, ...gallery.docs[0].data() },
      invoice: invoice.empty ? null : { id: invoice.docs[0].id, ...invoice.docs[0].data() },
      appointment: appointment.empty ? null : { id: appointment.docs[0].id, ...appointment.docs[0].data() },
      messages: messages.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    console.error("[Orders] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch order." });
  }
});

// ─── PATCH /api/orders/:id — Update order ────────────────────────────────────

router.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = [
      "status", "assignedPhotographerId", "assignedPhotographerName",
      "scheduledDate", "scheduledTime", "internalNotes", "notes",
      "accessMethod", "squareFootage",
    ];

    const updates: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((key) => {
      if (key in req.body) updates[key] = req.body[key];
    });

    // Convert scheduledDate string to Timestamp if provided
    if (updates.scheduledDate && typeof updates.scheduledDate === "string") {
      updates.scheduledDate = admin.firestore.Timestamp.fromDate(
        new Date(updates.scheduledDate)
      );
    }

    await db().collection("orders").doc(req.params.id).update(updates);

    return res.json({ success: true });
  } catch (err) {
    console.error("[Orders] Update error:", err);
    return res.status(500).json({ error: "Failed to update order." });
  }
});

// ─── PATCH /api/orders/:id/status — Status transition ────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  confirmed: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["shot_complete", "cancelled"],
  shot_complete: ["editing"],
  editing: ["ready_for_delivery"],
  ready_for_delivery: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

router.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, note } = req.body;

    const orderDoc = await db().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });

    const currentStatus = orderDoc.data()!.status;
    const validNext = VALID_TRANSITIONS[currentStatus] || [];

    if (!validNext.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${currentStatus}' to '${status}'.`,
        validTransitions: validNext,
      });
    }

    const updates: Record<string, unknown> = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (status === "completed") {
      updates.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await orderDoc.ref.update(updates);

    // Sync appointment status
    const apptSnapshot = await db()
      .collection("appointments")
      .where("orderId", "==", req.params.id)
      .limit(1)
      .get();
    if (!apptSnapshot.empty) {
      const apptStatus =
        status === "in_progress" ? "in_progress" :
        status === "shot_complete" || status === "editing" ? "completed" :
        status === "cancelled" ? "cancelled" : undefined;
      if (apptStatus) {
        await apptSnapshot.docs[0].ref.update({ status: apptStatus });
      }
    }

    // Log to agent system
    await db().collection("agentLogs").add({
      agent: "nora",
      action: `Order status changed: ${currentStatus} → ${status}`,
      summary: `Order ${req.params.id} transitioned to ${status}`,
      status: "completed",
      relatedId: req.params.id,
      relatedType: "order",
      priority: "low",
      requiresHumanReview: false,
      details: note || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, status });
  } catch (err) {
    console.error("[Orders] Status update error:", err);
    return res.status(500).json({ error: "Failed to update order status." });
  }
});

// ─── GET /api/orders/:id/timeline — Full order history ───────────────────────

router.get("/:id/timeline", requireStaff, async (req, res) => {
  try {
    const [messages, editRequests, agentLogs] = await Promise.all([
      db().collection("messages")
        .where("orderId", "==", req.params.id)
        .orderBy("createdAt", "asc")
        .get(),
      db().collection("editRequests")
        .where("orderId", "==", req.params.id)
        .orderBy("createdAt", "asc")
        .get(),
      db().collection("agentLogs")
        .where("relatedId", "==", req.params.id)
        .orderBy("createdAt", "asc")
        .get(),
    ]);

    const timeline = [
      ...messages.docs.map((d) => ({ type: "message", ...d.data(), id: d.id })),
      ...editRequests.docs.map((d) => ({ type: "editRequest", ...d.data(), id: d.id })),
      ...agentLogs.docs.map((d) => ({ type: "agentLog", ...d.data(), id: d.id })),
    ].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aTime = (a.createdAt as admin.firestore.Timestamp)?.toMillis() || 0;
      const bTime = (b.createdAt as admin.firestore.Timestamp)?.toMillis() || 0;
      return aTime - bTime;
    });

    return res.json(timeline);
  } catch (err) {
    console.error("[Orders] Timeline error:", err);
    return res.status(500).json({ error: "Failed to fetch timeline." });
  }
});

export default router;
