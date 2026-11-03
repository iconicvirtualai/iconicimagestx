import type { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { hasMustChangePassword, isPasswordChangeApiPath, MUST_CHANGE_PASSWORD_CODE } from "../../shared/passwordAccount";
import { isTempAdminEnabled, liveServerEnv } from "../../shared/tempAdmin";

type ClaimedUser = { uid?: string; mustChangePassword?: unknown };

export function mustChangePasswordResponse(res: Response) {
  return res.status(403).json({
    code: MUST_CHANGE_PASSWORD_CODE,
    error: "Choose a new password before using the portal.",
  });
}

async function profileRequiresNewPassword(uid: string): Promise<boolean> {
  try {
    const db = admin.firestore();
    const [staff, client] = await Promise.all([
      db.collection("staff").doc(uid).get(),
      db.collection("clients").doc(uid).get(),
    ]);
    return hasMustChangePassword(staff.exists ? staff.data() : null)
      || hasMustChangePassword(client.exists ? client.data() : null);
  } catch {
    console.error("[Auth] mustChangePassword lookup failed.");
    return false;
  }
}

/** Claim or Firestore flag. The password route is the only authenticated exception. */
export async function sessionMustChangePassword(user: ClaimedUser | null | undefined): Promise<boolean> {
  if (!user?.uid) return false;
  if (user.mustChangePassword === true) return true;
  return profileRequiresNewPassword(user.uid);
}

export async function rejectStalePassword(req: Request, res: Response, user: ClaimedUser): Promise<boolean> {
  if (isPasswordChangeApiPath(req.originalUrl || req.url)) return false;
  if (!(await sessionMustChangePassword(user))) return false;
  mustChangePasswordResponse(res);
  return true;
}

/** Blocks every authenticated /api request while a password change is required. */
export async function blockUntilPasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (!req.originalUrl.startsWith("/api/") && !req.url.startsWith("/api/")) return next();
  if (isPasswordChangeApiPath(req.originalUrl || req.url)) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  if (isTempAdminEnabled(liveServerEnv()) && header === "Bearer temp-admin-token") return next();
  if (!admin.apps.length) return next();
  try {
    const decoded = await admin.auth().verifyIdToken(header.slice("Bearer ".length).trim());
    if (await sessionMustChangePassword(decoded)) return mustChangePasswordResponse(res);
  } catch {
    // Invalid tokens stay the route's 401.
  }
  return next();
}
