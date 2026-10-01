/**
 * Seed the public `packages` collection from the hardcoded booking catalog.
 *
 *   pnpm seed:booking-catalog
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS.
 * Firestore rules are not deployed by Vercel — publish firestore.rules in the
 * Firebase console before coordinators edit the catalog from the client.
 */
import "dotenv/config";
import admin from "firebase-admin";
import { bookingPackageSeedDocs } from "../shared/bookingCatalog.ts";

function initAdmin() {
  if (admin.apps.length) return;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
    return;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return;
  }
  throw new Error(
    "Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before seeding the booking catalog.",
  );
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const docs = bookingPackageSeedDocs();

  for (const doc of docs) {
    const ref = db.collection("packages").doc(doc.id);
    const existing = await ref.get();
    const { id: _id, ...data } = doc;
    await ref.set(
      {
        ...data,
        ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  console.log(`Seeded ${docs.length} booking catalog packages.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
