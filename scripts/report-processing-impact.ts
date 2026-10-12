/**
 * Read-only report of open invoices if 2.8% processing were added.
 *
 *   pnpm report:processing-impact -- --fixture
 *
 * The live scan needs FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.
 * It only reads the invoices collection. It has no write path.
 */
import { formatProcessingImpactReport, processingImpactFixtureScan, processingImpactReport, type ProcessingImpactInvoice } from "../shared/processingImpact.ts";

if (process.argv.includes("--write") || process.argv.includes("--apply") || process.argv.includes("--migrate")) {
  console.error("report:processing-impact is read-only and has no write path.");
  process.exit(2);
}

if (process.argv.includes("--fixture") || process.argv.includes("--fixtures")) {
  process.stdout.write(formatProcessingImpactReport(processingImpactFixtureScan(), "fixture"));
  process.exit(0);
}

await liveReport();

async function liveReport() {
  const admin = await initAdmin();
  const projectId = (await credentialProjectId()) || admin.app().options.projectId || "(unknown project)";
  const db = admin.firestore();
  const snap = await db.collection("invoices").get();
  const invoices: ProcessingImpactInvoice[] = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));
  process.stdout.write(formatProcessingImpactReport(processingImpactReport(invoices), projectId));
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
    "Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before a live processing-impact report.",
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
