/**
 * Iconic Images — Firebase Admin Auth Middleware
 * Verifies Firebase ID tokens on protected Express routes.
 * Place at: server/middleware/auth.ts
 */

import { type Request, type Response, type NextFunction } from "express";
import admin from "firebase-admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  staffRole?: string;
  isAdmin?: boolean;
  isCoordinator?: boolean;
}

// ─── Middleware: Require any valid Firebase Auth token ────────────────────────

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
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("[Auth Middleware] Token verification failed:", err);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// ─── Middleware: Require staff role ──────────────────────────────────────────

export async function requireStaff(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireAuth(req, res, async () => {
    try {
      const staffDoc = await admin
        .firestore()
        .collection("staff")
        .doc(req.user!.uid)
        .get();

      if (!staffDoc.exists) {
        return res.status(403).json({ error: "Staff access required." });
      }

      const staffData = staffDoc.data()!;
      req.staffRole = staffData.role;
      req.isAdmin = staffData.role === "admin";
      req.isCoordinator =
        staffData.role === "admin" || staffData.role === "coordinator";

      next();
    } catch (err) {
      console.error("[Auth Middleware] Staff lookup error:", err);
      return res.status(500).json({ error: "Server error during authorization." });
    }
  });
}

// ─── Middleware: Require admin role ──────────────────────────────────────────

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireStaff(req, res, () => {
    if (!req.isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }
    next();
  });
}

// ─── Middleware: Require coordinator or above ────────────────────────────────

export async function requireCoordinator(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireStaff(req, res, () => {
    if (!req.isCoordinator) {
      return res.status(403).json({ error: "Coordinator access required." });
    }
    next();
  });
}

// ─── Middleware: Require photographer or above ───────────────────────────────

export async function requirePhotographer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  await requireStaff(req, res, () => {
    const allowed = ["admin", "coordinator", "photographer"];
    if (!req.staffRole || !allowed.includes(req.staffRole)) {
      return res.status(403).json({ error: "Photographer access required." });
    }
    next();
  });
}
