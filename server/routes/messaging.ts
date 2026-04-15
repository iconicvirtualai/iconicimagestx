/**
 * Iconic Images — Messaging Routes
 * Order-scoped messaging between clients and staff (DoorDash-style).
 * Place at: server/routes/messaging.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireAuth, requireStaff, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

// ─── GET /api/messages/:orderId — Get messages for an order ──────────────────

router.get("/:orderId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Verify caller has access to this order
    const orderDoc = await db().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });

    const order = orderDoc.data()!;
    const staffDoc = await db().collection("staff").doc(req.user!.uid).get();
    const isStaff = staffDoc.exists;

    if (!isStaff && order.clientId !== req.user!.uid) {
      return res.status(403).json({ error: "Access denied." });
    }

    const snapshot = await db()
      .collection("messages")
      .where("orderId", "==", req.params.orderId)
      .orderBy("createdAt", "asc")
      .limit(100)
      .get();

    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Mark unread messages as read for this caller
    const unread = snapshot.docs.filter(
      (d) => !d.data().isRead && d.data().senderId !== req.user!.uid
    );
    const batch = db().batch();
    unread.forEach((d) => {
      batch.update(d.ref, {
        isRead: true,
        readAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    if (unread.length > 0) await batch.commit();

    return res.json(messages);
  } catch (err) {
    console.error("[Messages] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch messages." });
  }
});

// ─── POST /api/messages/:orderId — Send a message ────────────────────────────

router.post("/:orderId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { content, attachments } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content required." });
    }

    const orderDoc = await db().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });

    const order = orderDoc.data()!;
    const staffDoc = await db().collection("staff").doc(req.user!.uid).get();
    const isStaff = staffDoc.exists;

    if (!isStaff && order.clientId !== req.user!.uid) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Determine sender info
    let senderName = "Unknown";
    let senderType: "staff" | "client" = "client";

    if (isStaff) {
      const staff = staffDoc.data()!;
      senderName = `${staff.firstName} ${staff.lastName}`.trim();
      senderType = "staff";
    } else {
      const clientDoc = await db().collection("clients").doc(order.clientId).get();
      if (clientDoc.exists) {
        const client = clientDoc.data()!;
        senderName = `${client.firstName} ${client.lastName}`.trim();
      }
    }

    const message = {
      orderId: req.params.orderId,
      senderId: req.user!.uid,
      senderType,
      senderName,
      content: content.trim(),
      attachments: attachments || [],
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db().collection("messages").add(message);

    // Log for AI agent monitoring
    await db().collection("agentLogs").add({
      agent: "nora",
      action: "New message",
      summary: `New message on order ${req.params.orderId} from ${senderName}`,
      status: "completed",
      relatedId: req.params.orderId,
      relatedType: "order",
      priority: "low",
      requiresHumanReview: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ id: docRef.id, ...message });
  } catch (err) {
    console.error("[Messages] Send error:", err);
    return res.status(500).json({ error: "Failed to send message." });
  }
});

// ─── GET /api/messages/unread/count — Unread count for staff ─────────────────

router.get("/unread/count", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db()
      .collection("messages")
      .where("isRead", "==", false)
      .where("senderType", "==", "client")
      .get();

    return res.json({ unreadCount: snapshot.size });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get unread count." });
  }
});

export default router;
