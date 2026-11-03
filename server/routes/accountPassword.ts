import { Router } from "express";
import admin from "firebase-admin";
import { passwordPolicyError } from "../../shared/passwordAccount";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

async function clearMustChangeFlag(uid: string) {
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const name of ["staff", "clients"] as const) {
    const ref = db.collection(name).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) continue;
    await ref.update({ mustChangePassword: false, updatedAt: now });
  }
  const record = await admin.auth().getUser(uid);
  const claims = { ...(record.customClaims || {}) };
  delete claims.mustChangePassword;
  await admin.auth().setCustomUserClaims(uid, claims);
  await admin.auth().revokeRefreshTokens(uid);
}

/** Signed-in person replaces their own password and clears the first-login flag. */
router.post("/password", requireAuth, async (req: AuthenticatedRequest, res) => {
  const password = String(req.body?.password || "");
  const problem = passwordPolicyError(password);
  if (problem) return res.status(400).json({ error: problem });
  const uid = req.user!.uid;
  try {
    await admin.auth().updateUser(uid, { password });
    await clearMustChangeFlag(uid);
    return res.json({ ok: true, mustChangePassword: false });
  } catch {
    console.error("[Account] Password change failed.");
    return res.status(500).json({ error: "Could not change the password." });
  }
});

export default router;
