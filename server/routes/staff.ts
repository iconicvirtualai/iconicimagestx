/**
 * Iconic Images — Staff Routes
 * Staff management + first-run admin setup.
 * Place at: server/routes/staff.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireAdmin, requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { isHostedDeployment, liveServerEnv } from "../../shared/tempAdmin";
import { ownerAllowlist } from "../../shared/ownerAccess";
import { normalizeSiteEditorFlags, siteEditorAccess } from "../../shared/siteEditor";
import { readSetupSecret, secretsMatch } from "../lib/playtestPolicy";
import { bootstrapPlaytest } from "../services/playtestBootstrap";
import { provisionStaffLogin, setStaffPassword, StaffLoginError } from "../services/staffLogin";

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

function actingAdmin(req: AuthenticatedRequest): { uid: string; email?: string | null } {
  return { uid: req.user?.uid || "", email: req.user?.email || null };
}

function staffLoginFailure(err: unknown, res: { status: (code: number) => { json: (body: unknown) => unknown } }, fallback: string) {
  if (err instanceof StaffLoginError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error("[Staff] Login provision error.");
  return res.status(500).json({ error: fallback });
}

// POST /api/staff — create staff member + Firebase Auth account
router.post("/", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await provisionStaffLogin(req.body || {}, actingAdmin(req));
    return res.status(result.created ? 201 : 200).json({
      id: result.uid,
      created: result.created,
      role: result.role,
      mustChangePassword: true,
      message: "Staff member created. They must change their password on first login.",
    });
  } catch (err: unknown) {
    return staffLoginFailure(err, res, "Failed to create staff member.");
  }
});

// POST /api/staff/:id/password — set a new password for an existing member
router.post("/:id/password", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await setStaffPassword(
      String(req.params.id || ""),
      req.body?.password,
      actingAdmin(req),
      req.body?.replaceExisting === true,
    );
    return res.json({ id: result.uid, mustChangePassword: true });
  } catch (err: unknown) {
    return staffLoginFailure(err, res, "Failed to set the password.");
  }
});

// PATCH /api/staff/:id
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["firstName","lastName","phone","role","isActive"];
    const updates: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => { if (k in req.body) updates[k] = req.body[k]; });
    if (req.body.siteEditor && typeof req.body.siteEditor === "object") {
      const existing = await db().collection("staff").doc(req.params.id).get();
      const data = existing.data() || {};
      const nextRole = typeof updates.role === "string" ? updates.role : data.role;
      const access = siteEditorAccess({
        role: nextRole,
        email: data.email,
        flags: req.body.siteEditor,
        ownerEmails: ownerAllowlist(process.env.OWNER_EMAILS),
      });
      updates.siteEditor = access.locked
        ? { view: true, edit: true, publish: true }
        : normalizeSiteEditorFlags(req.body.siteEditor);
    }
    await db().collection("staff").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update staff member." });
  }
});

function requireSetupSecret(req: { header: (name: string) => string | undefined }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  const expected = process.env.STAFF_SETUP_SECRET;
  if (!expected) {
    res.status(503).json({
      error: "STAFF_SETUP_SECRET is not set. Add it to Vercel Production, then redeploy.",
    });
    return false;
  }
  const provided = readSetupSecret(req.header("x-staff-setup-secret") || req.header("x-setup-secret"));
  if (!secretsMatch(provided, expected)) {
    res.status(401).json({ error: "Invalid staff setup secret." });
    return false;
  }
  return true;
}

// POST /api/staff/playtest — secret-gated photographer + demo job for playtest
router.post("/playtest", async (req, res) => {
  if (!requireSetupSecret(req, res)) return;
  if (!admin.apps.length) {
    return res.status(503).json({
      error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET.",
    });
  }
  try {
    const result = await bootstrapPlaytest(req.body || {});
    return res.status(201).json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 500) {
      return res.status(status).json({ error: err instanceof Error ? err.message : "Playtest setup failed." });
    }
    console.error("[Staff] Playtest bootstrap error:", err);
    return res.status(500).json({ error: "Playtest setup failed." });
  }
});

// POST /api/staff/setup — First-run: create initial admin account
// Only works if NO staff documents exist yet.
// Hosted deploys also require x-setup-secret (main's gate).
router.post("/setup", async (req, res) => {
  try {
    if (isHostedDeployment(liveServerEnv())) {
      const secret = process.env.STAFF_SETUP_SECRET;
      const provided = req.header("x-setup-secret");
      if (!secret || provided !== secret) {
        return res.status(403).json({ error: "Staff setup is disabled." });
      }
    }

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
