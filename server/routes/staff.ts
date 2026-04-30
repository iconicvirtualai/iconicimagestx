/**
 * Iconic Images — Staff Routes
 * Staff management + first-run admin setup.
 * Place at: server/routes/staff.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireAdmin, requireStaff } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

// GET /api/staff — list staff
router.get("/", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db().collection("staff")
      .where("isActive", "==", true)
      .orderBy("firstName").get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch staff." });
  }
});

// POST /api/staff — create staff member + Firebase Auth account
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, tempPassword } = req.body;
    if (!firstName || !lastName || !email || !role || !tempPassword) {
      return res.status(400).json({ error: "All fields required." });
    }

    // Create Firebase Auth account
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password: tempPassword,
      displayName: `${firstName} ${lastName}`,
    });

    // Create staff document using UID as document ID
    await db().collection("staff").doc(userRecord.uid).set({
      firebaseUid: userRecord.uid,
      firstName, lastName,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      role,
      isActive: true,
      assignedOrders: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      id: userRecord.uid,
      message: "Staff member created. They must change their password on first login.",
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      return res.status(409).json({ error: "Email already in use." });
    }
    console.error("[Staff] Create error:", err);
    return res.status(500).json({ error: "Failed to create staff member." });
  }
});

// PATCH /api/staff/:id
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["firstName","lastName","phone","role","isActive"];
    const updates: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => { if (k in req.body) updates[k] = req.body[k]; });
    await db().collection("staff").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update staff member." });
  }
});

// POST /api/staff/setup — First-run: create initial admin account
// Only works if NO staff documents exist yet
router.post("/setup", async (req, res) => {
  try {
    const existing = await db().collection("staff").limit(1).get();
    if (!existing.empty) {
      return res.status(403).json({ error: "Staff already configured." });
    }

    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "All fields required." });
    }

    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password,
      displayName: `${firstName} ${lastName}`,
    });

    await db().collection("staff").doc(userRecord.uid).set({
      firebaseUid: userRecord.uid,
      firstName, lastName,
      email: email.toLowerCase().trim(),
      phone: "",
      role: "admin",
      isActive: true,
      assignedOrders: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      message: "Admin account created successfully.",
      uid: userRecord.uid,
    });
  } catch (err) {
    console.error("[Staff] Setup error:", err);
    return res.status(500).json({ error: "Setup failed." });
  }
});

export default router;
