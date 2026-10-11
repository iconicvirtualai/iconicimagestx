/**
 * Read-only share-photo report.
 *
 *   npm run report:share-photos
 *   npm run report:share-photos -- --fixtures
 *
 * The live scan needs FIREBASE_SERVICE_ACCOUNT (JSON) or
 * GOOGLE_APPLICATION_CREDENTIALS. It prints the Firebase project id, then
 * reads listings. It has no write path: no set, update, delete, batch, or commit.
 *
 * --fixtures prints the in-memory sample and does not contact Firebase.
 */
import { formatSharePhotoReport, sharePhotoFixtureScan, type SharePhotoScan } from "../shared/sharePhotoReport.ts";

if (process.argv.includes("--write") || process.argv.includes("--unlock")) {
  console.error("report:share-photos is read-only and has no write path.");
  process.exit(2);
}

if (process.argv.includes("--fixtures")) {
  process.stdout.write(formatSharePhotoReport(sharePhotoFixtureScan(), "fixtures"));
  process.exit(0);
}

await liveReport();

async function liveReport() {
  const admin = await initAdmin();
  const projectId = (await credentialProjectId()) || admin.app().options.projectId || "(unknown project)";
  const snap = await admin.firestore().collection("listings").get();
  const scan: SharePhotoScan = {
    listings: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
  };
  process.stdout.write(formatSharePhotoReport(scan, projectId));
}

async function initAdmin() {
  await import("dotenv/config");
  const admin = (await import("firebase-admin")).default;
  if (admin.apps.length) return admin;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
    return admin;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return admin;
  }
  throw new Error(
    "Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before running report:share-photos.",
  );
}

async function credentialProjectId(): Promise<string | null> {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { readFile } = await import("node:fs/promises");
      const parsed = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
  } catch {
    return null;
  }
  return null;
}
