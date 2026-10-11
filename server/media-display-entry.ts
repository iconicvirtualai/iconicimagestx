/**
 * Vercel function for GET /api/media/display/:listingId/:index.
 * Separate from api/index.mjs so sharp is not traced into the main API.
 */
import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import admin from "firebase-admin";
import { handleMediaDisplay } from "./routes/mediaDisplay";

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

export default function mediaDisplayHandler(req: IncomingMessage, res: ServerResponse) {
  return handleMediaDisplay(req as never, adapt(res) as never, (() => undefined) as never);
}
