/**
 * Read-only impact report for the studio download lock.
 *
 *   pnpm report:lock-impact
 *   pnpm report:lock-impact -- --fixtures
 *
 * The live scan needs FIREBASE_SERVICE_ACCOUNT (JSON) or
 * GOOGLE_APPLICATION_CREDENTIALS. It prints the Firebase project id, then
 * reads listings, galleries, and invoices. It has no write path: no set,
 * update, delete, batch, or commit.
 *
 * --fixtures prints the in-memory sample and does not contact Firebase.
 */
import { formatLockImpactReport, lockImpactFixtureScan, type LockImpactDoc, type LockImpactScan } from "../shared/lockImpact.ts";

if (process.argv.includes("--write") || process.argv.includes("--unlock")) {
  console.error("report:lock-impact is read-only and has no write path.");
  process.exit(2);
}

if (process.argv.includes("--fixtures")) {
  process.stdout.write(formatLockImpactReport(lockImpactFixtureScan(), "fixtures"));
  process.exit(0);
}

await liveReport();

async function liveReport() {
  const admin = await initAdmin();
  const projectId = (await credentialProjectId()) || admin.app().options.projectId || "(unknown project)";
  const db = admin.firestore();
  const [listings, galleries, invoices] = await Promise.all([
    db.collection("listings").get(),
    db.collection("galleries").get(),
    db.collection("invoices").get(),
  ]);
  const scan: LockImpactScan = {
    listings: snapshotDocs(listings),
    galleries: snapshotDocs(galleries),
    invoices: snapshotDocs(invoices),
  };
  process.stdout.write(formatLockImpactReport(scan, projectId));
}

function snapshotDocs(snap: { docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }> }): LockImpactDoc[] {
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
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
    "Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before running report:lock-impact.",
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
