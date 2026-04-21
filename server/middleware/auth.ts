/**
 * Iconic Images — Firebase Admin Auth Middleware
 *
 * Uses Firebase custom claims (set by syncStaffClaims Cloud Function) for fast
 * role checking without a Firestore lookup on every request.
 * Falls back to a Firestore lookup if claims haven't been set yet.
 */

import { type Request, type Response, type NextFunction } from "express";
import admin from "firebase-admin";

// ─── Types ─────────────────────────────────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  staffRole?: string;
  isAdmin?: boolean;
  isCoordinator?: boolean;
  isPhotographer?: boolean;
}

type Role = "admin" | "coordinator" | "photographer" | "editor";

// ─── Helpers ────────────────────────────────────────────────────────────────────────────

function roleAtLeast(role: string | undefined, minimum: Role): boolean {
  if (!role) return false;
  const hierarchy: Role[] = ["editor", "photographer", "coordinator", "admin"];
  const minIdx = hierarchy.indexOf(minimum);
  const roleIdx = hierarchy.indexOf(role as Role);
  return roleIdx >= minIdx;
}

/** Resolve role from custom claims or fall back to Firestore */
async function resolveRole(uid: string, decoded: admin.auth.DecodedIdToken): Promise<string | null> {
  // Fast path: custom claims already set by Cloud Function
  if (decoded.isStaff && decoded.role) {
    return decoded.role as string;
  }

  // Slow path: claims not yet set — read from Firestore
  try {
    const staffDoc = await admin.firestore().collection("staff").doc(uid).get();
    if (!staffDoc.exists) return null;
    const data = staffDoc.data()!;
    if (data.isActive === false) return null;
    return data.role as string;
  } catch (err) {
    console.error("[Auth] Firestore staff lookup failed:", err);
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
