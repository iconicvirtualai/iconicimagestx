/**
 * Iconic Images — Firebase Admin Auth Middleware
 *
 * Staff role comes from the Firestore staff record (admin, coordinator,
 * photographer, editor) and must be active. Custom claims are only used if
 * that lookup fails. Temporary admin tokens are local/dev only.
 */

import { type Request, type Response, type NextFunction } from "express";
import admin from "firebase-admin";
import { isActiveStaffRecord } from "../../shared/staffAccess";
import { isTempAdminEnabled, liveServerEnv } from "../../shared/tempAdmin";

// ─── Types ─────────────────────────────────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  staffRole?: string;
  isAdmin?: boolean;
  isCoordinator?: boolean;
  isPhotographer?: boolean;
}

type Role = "admin" | "coordinator" | "photographer" | "editor";

function tempAdminAllowed(): boolean {
  return isTempAdminEnabled(liveServerEnv());
}

// ─── Helpers ────────────────────────────────────────────────────────────────────────────

function roleAtLeast(role: string | undefined, minimum: Role): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  if (role === "coordinator") return minimum !== "admin";
  if (minimum === "photographer") return role === "photographer";
  if (minimum === "editor") return role === "editor";
  return false;
}

/** Resolve role from the staff record. Claims are only a fallback if Firestore is unreachable. */
async function resolveRole(uid: string, decoded: admin.auth.DecodedIdToken): Promise<string | null> {
  if (tempAdminAllowed() && uid === "temp-admin-uid") {
    return "admin";
  }

  try {
    const staffDoc = await admin.firestore().collection("staff").doc(uid).get();
    if (!staffDoc.exists) return null;
    const data = staffDoc.data()!;
    if (!isActiveStaffRecord(data)) return null;
    return data.role as string;
  } catch (err) {
    console.error("[Auth] Firestore staff lookup failed:", err);
    const claimRole = decoded.role;
    if (decoded.isStaff === true && isActiveStaffRecord({ role: claimRole, isActive: true })) {
      return claimRole as string;
    }
    return null;
  }
}

// ─── requireAuth — verify token only ─────────────────────────────────────────────────

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  // Development / Temporary Admin Bypass
  if (tempAdminAllowed() && authHeader === "Bearer temp-admin-token") {
    req.user = {
      uid: "temp-admin-uid",
      email: "temp-admin@iconicimagestx.com",
    } as admin.auth.DecodedIdToken;
    return next();
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No authentication token provided." });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// ─── requireStaff — any active staff member ────────────────────────────────────────────────

export async function requireStaff(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireAuth(req, res, async () => {
    const role = await resolveRole(req.user!.uid, req.user!);
    if (!role) return res.status(403).json({ error: "Staff access required." });

    req.staffRole     = role;
    req.isAdmin       = role === "admin";
    req.isCoordinator = role === "admin" || role === "coordinator";
    req.isPhotographer = roleAtLeast(role, "photographer");
    next();
  });
}

// ─── requireAdmin ─────────────────────────────────────────────────────────────────────────────

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireStaff(req, res, () => {
    if (!req.isAdmin) return res.status(403).json({ error: "Admin access required." });
    next();
  });
}

// ─── requireCoordinator (coordinator or above) ──────────────────────────────────────────

export async function requireCoordinator(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireStaff(req, res, () => {
    if (!req.isCoordinator) return res.status(403).json({ error: "Coordinator access required." });
    next();
  });
}

// ─── requirePhotographer (photographer, coordinator, or admin) ────────────────────────

export async function requirePhotographer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireStaff(req, res, () => {
    if (!req.isPhotographer) return res.status(403).json({ error: "Photographer access required." });
    next();
  });
}

// ─── requireEditor (editor, coordinator, or admin) ─────────────────────────────────────

export async function requireEditor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireStaff(req, res, () => {
    const allowed = ["admin", "coordinator", "editor"];
    if (!req.staffRole || !allowed.includes(req.staffRole)) {
      return res.status(403).json({ error: "Editor access required." });
    }
    next();
  });
}
