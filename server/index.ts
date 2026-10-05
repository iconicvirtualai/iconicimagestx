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
import listingsRouter from "./routes/listings";
import campaignsRouter from "./routes/campaigns";
import agentsRouter from "./routes/agents";
import mediaJobsRouter from "./routes/mediaJobs";
import studioRouter from "./routes/studio";
import placesRouter from "./routes/places";
import smsRouter from "./routes/sms";
import contactRouter from "./routes/contact";
import liveChatRouter from "./routes/liveChat";
import contactThreadsRouter from "./routes/contactThreads";
import { listCalendarScheduleEvents, verifyCalendarWriteAccess } from "./services/calendar";
import { clientNotifyLive } from "../shared/clientNotify";
import { requireAdmin, requireStaff } from "./middleware/auth";
import { handleListingPhotoUpload } from "./routes/listingPhotos";
import { handleGetPublicPortalListing } from "./routes/portalListing";
import presentationsRouter from "./routes/presentations";

const SETTINGS_FILE = path.join(process.cwd(), "site_settings.json");
const API_BUILD_MARKER = "auth-square-2026-09-28";

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
  const configuredOrigin = process.env.APP_URL;
  const allowedOrigins = new Set([
    "https://iconicimagestx.com",
    "https://www.iconicimagestx.com",
    "https://iconic-booking-test.cadi0224.chatgpt.site",
    ...(configuredOrigin ? [configuredOrigin] : []),
  ]);

  app.use(cors({
    origin(origin, callback) {
      // Requests without an Origin header are server-to-server or same-origin.
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true,
  }));

  // Payment webhooks need raw body — mount BEFORE express.json()
  app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
  app.use("/api/payments/square-webhook", express.raw({ type: "application/json" }));

  // Standard middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Two clients share this path:
  // - Admin gallery (AdminListingFile) POSTs raw image bytes. Staff token required.
  // - Photographer My Jobs and the Upload tab POST JSON (base64, or a storagePath
  //   after a signed upload). That must reach listingsRouter below.
  // This route is registered first, so a JSON post has to skip it with next("route").
  // Otherwise express.json() has already parsed the body into an object, and the
  // raw handler answers "No image data was received."
  app.post(
    "/api/listings/:id/photos",
    (req, _res, next) => {
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (type === "application/json") return next("route");
      next();
    },
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp", "application/octet-stream"],
      limit: "8mb",
    }),
    requireStaff,
    handleListingPhotoUpload,
  );

  // ─── Health check ──────────────────────────────────────────────────
  app.get("/api/ping", (_req, res) => {
    res.json({
      status: "ok",
      message: process.env.PING_MESSAGE ?? "Iconic Images API",
      build: API_BUILD_MARKER,
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/api/health/calendar", async (req, res) => {
    const expectedSecret = process.env.CALENDAR_HEALTH_SECRET;
    const providedSecret = req.header("x-calendar-health-secret");

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const result = await verifyCalendarWriteAccess();
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("[Health] Calendar write check failed:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Calendar write check failed",
      });
    }
  });

  app.post("/api/calendar/schedule", requireStaff, async (req, res) => {
    try {
      const calendars = Array.isArray(req.body?.calendars) ? req.body.calendars : [];
      const timeMin = typeof req.body?.timeMin === "string" ? req.body.timeMin : "";
      const timeMax = typeof req.body?.timeMax === "string" ? req.body.timeMax : "";

      if (!timeMin || !timeMax) {
        return res.status(400).json({ error: "timeMin and timeMax are required." });
      }

      const events = await listCalendarScheduleEvents({ calendars, timeMin, timeMax });
      return res.json({ events });
    } catch (error) {
      console.error("[Calendar] Schedule sync failed:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Calendar schedule sync failed.",
      });
    }
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

  app.post("/api/settings", requireAdmin, async (req, res) => {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  // Portal password-reset and other non-order client mail check this.
  // booking_received does not. live is false unless CLIENT_NOTIFY_LIVE is exactly "true"
  // and CLIENT_COMMS_ZONE is not RED.
  app.get("/api/client-notify", (_req, res) => {
    res.json({ live: clientNotifyLive() });
  });

  // ─── API Routes ────────────────────────────────────────────────────
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/galleries", galleriesRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/vsai", vsaiRouter);
  app.use("/api/messages", messagingRouter);
  app.use("/api/clients", clientsRouter);
  app.get("/api/portal/listings/:id", handleGetPublicPortalListing);
  app.use("/api/staff", staffRouter);
  app.use("/api", presentationsRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/agents", agentsRouter);
  app.use("/api/media-jobs", mediaJobsRouter);
  app.use("/api/studio", studioRouter);
  app.use("/api/places", placesRouter);
  app.use("/api/sms", smsRouter);
  // Portal contact threads. Separate from live-chat email/SMS delivery.
  app.use("/api/contact", contactThreadsRouter);
  app.use("/api/contact", liveChatRouter);
  app.use("/api/contact", contactRouter);

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
