/**
 * Iconic Images — Clients Routes
 * CRM: client database management.
 * Place at: server/routes/clients.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, requireStaff, requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

// GET /api/clients — list (staff only)
router.get("/", requireStaff, async (req, res) => {
  try {
    const { status, search, limit = "50" } = req.query;
    let query = db().collection("clients").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status) as typeof query;

    const snapshot = await query.limit(Number(limit)).get();
    let clients = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Simple search filter (client-side for now)
    if (search) {
      const s = (search as string).toLowerCase();
      clients = clients.filter((c: Record<string, unknown>) => {
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const email = ((c.email as string) || "").toLowerCase();
        return name.includes(s) || email.includes(s);
      });
    }

    return res.json(clients);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch clients." });
  }
});

// GET /api/clients/me — client gets their own profile
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Try direct UID lookup first
    const directDoc = await db().collection("clients").doc(req.user!.uid).get();
    if (directDoc.exists) {
      const data = directDoc.data()!;
      // Handle redirect pointer
      if (data._redirect) {
        const realDoc = await db().collection("clients").doc(data._redirect).get();
        if (realDoc.exists) return res.json({ id: realDoc.id, ...realDoc.data() });
      }
      return res.json({ id: directDoc.id, ...data });
    }

    return res.status(404).json({ error: "Client profile not found." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// GET /api/clients/:id
router.get("/:id", requireStaff, async (req, res) => {
  try {
    const doc = await db().collection("clients").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found." });

    const [orders, invoices] = await Promise.all([
      db().collection("orders").where("clientId", "==", req.params.id)
        .orderBy("createdAt", "desc").limit(10).get(),
      db().collection("invoices").where("clientId", "==", req.params.id)
        .orderBy("createdAt", "desc").limit(10).get(),
    ]);

    return res.json({
      client: { id: doc.id, ...doc.data() },
      orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })),
      invoices: invoices.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch client." });
  }
});

// POST /api/clients — create client manually
router.post("/", requireCoordinator, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, notes, tags } = req.body;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "firstName, lastName, and email required." });
    }

    const existing = await db().collection("clients")
      .where("email", "==", email.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: "Client with this email already exists.", id: existing.docs[0].id });
    }

    const ref = await db().collection("clients").add({
      firstName, lastName,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      address: address || "",
      totalOrders: 0, totalSpend: 0,
      status: "active", portalAccess: false,
      notes: notes || "", tags: tags || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create client." });
  }
});

// PATCH /api/clients/:id
router.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = ["firstName","lastName","phone","address","status","notes","tags","company"];
    const updates: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => { if (k in req.body) updates[k] = req.body[k]; });
    await db().collection("clients").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update client." });
  }
});

export default router;
