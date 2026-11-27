/**
 * Vercel function for GET /api/media/display/:listingId/:index.
 * Separate from api/index.mjs so sharp is not traced into the main API.
 */
import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import admin from "firebase-admin";
import express from "express";
import { handleMediaDisplay } from "./routes/mediaDisplay";
import siteContentRouter from "./routes/siteContent";
import clientDeliveryMediaRouter from "./routes/clientDeliveryMedia";

if (!admin.apps.length) {
  const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      storageBucket: bucket,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: bucket,
    });
  }
  if (admin.apps.length) {
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  }
}

type DisplayResponse = ServerResponse & {
  status: (code: number) => DisplayResponse;
  json: (body: unknown) => void;
};

function adapt(res: ServerResponse): DisplayResponse {
  const wrapped = res as DisplayResponse;
  wrapped.status = (code: number) => {
    res.statusCode = code;
    return wrapped;
  };
  wrapped.json = (body: unknown) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
  };
  return wrapped;
}

let siteApp: ReturnType<typeof express> | null = null;
let deliveryApp: ReturnType<typeof express> | null = null;

function siteContentApp() {
  if (!siteApp) {
    siteApp = express();
    siteApp.use("/api/site-content/media", express.json({ limit: "120mb" }));
    siteApp.use("/api/site-content/dropbox", express.json({ limit: "1mb" }));
    siteApp.use("/api/site-content", siteContentRouter);
  }
  return siteApp;
}

function deliveryMediaApp() {
  if (!deliveryApp) {
    deliveryApp = express();
    deliveryApp.use("/api/deliver", clientDeliveryMediaRouter);
  }
  return deliveryApp;
}

function isDeliveryMedia(url: string): boolean {
  const path = url.split("?")[0] || "";
  return /^\/api\/deliver\/[^/]+\/media\/[^/]+\/?$/.test(path)
    || /^\/api\/deliver\/[^/]+\/download\.zip\/?$/.test(path);
}

export default function mediaDisplayHandler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "";
  if (url.startsWith("/api/site-content/media") || url.startsWith("/api/site-content/dropbox")) {
    return siteContentApp()(req as never, res as never);
  }
  if (isDeliveryMedia(url)) {
    return deliveryMediaApp()(req as never, res as never);
  }
  return handleMediaDisplay(req as never, adapt(res) as never, (() => undefined) as never);
}
