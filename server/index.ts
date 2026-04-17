/**
 * Iconic Images — Express Server
 * Full replacement for the existing server/index.ts
 * All API routes wired. Firebase Admin initialized here.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import admin from "firebase-admin";

// Route imports
import bookingsRouter from "./routes/bookings";
import ordersRouter from "./routes/orders";
import galleriesRouter from "./routes/galleries";
import paymentsRouter from "./routes/payments";
import vsaiRouter from "./routes/vsai";
import messagingRouter from "./routes/messaging";
import clientsRouter from "./routes/clients";
import staffRouter from "./routes/staff";
import campaignsRouter from "./routes/campaigns";
import agentsRouter from "./routes/agents";
import placesRouter from "./routes/places";

const SETTINGS_FILE = path.join(process.cwd(), "site_settings.json");

// ─── Firebase Admin Init ──────────────────────────────────────────────────────

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production: service account JSON stored as env var
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET ||
                     process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Fallback: path to service account file
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET ||
                     process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else {
    console.warn(
      "[Server] WARNING: No Firebase service account configured. " +
      "Set FIREBASE_SERVICE_ACCOUNT env var with your service account JSON."
    );
  }

  // Allow undefined fields to be silently omitted rather than throwing
  if (admin.apps.length) {
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  }
}

// ─── Server Factory ───────────────────────────────────────────────────────────

export function createServer() {
  const app = express();

  // CORS
  app.use(cors({
    origin: process.env.APP_URL || "*",
    credentials: true,
  }));

  // Stripe webhook needs raw body — mount BEFORE express.json()
  app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

  // Standard middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Health check ──────────────────────────────────────────────────
  app.get("/api/ping", (_req, res) => {
    res.json({
      status: "ok",
      message: process.env.PING_MESSAGE ?? "Iconic Images API",
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Site Settings ─────────────────────────────────────────────────
  app.get("/api/settings", async (_req, res) => {
    try {
      const data = await fs.readFile(SETTINGS_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch {
      res.status(404).json({ error: "Settings not found" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  // ─── API Routes ────────────────────────────────────────────────────
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/galleries", galleriesRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/vsai", vsaiRouter);
  app.use("/api/messages", messagingRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/agents", agentsRouter);
  app.use("/api/places", placesRouter);

  // ─── Error handler ─────────────────────────────────────────────────
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("[Server] Unhandled error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  );

  return app;
}
