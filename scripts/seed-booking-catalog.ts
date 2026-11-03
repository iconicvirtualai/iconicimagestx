/**
 * Seed missing `packages` and `pricingAdjustments` docs.
 * A doc that already exists is left alone, including one marked removed,
 * so a price Cadi saved is not put back and a deleted price does not return.
 *
 *   pnpm seed:booking-catalog
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS.
 * Firestore rules are not deployed by Vercel — publish firestore.rules in the
 * Firebase console before staff edit prices from the client.
 */
import "dotenv/config";
import admin from "firebase-admin";
import { bookingPackageSeedDocs } from "../shared/bookingCatalog.ts";
import {
  missingSeedDocs,
  PRICING_ADJUSTMENTS_COLLECTION,
  pricingAdjustmentSeedDocs,
} from "../shared/pricingSettings.ts";

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
  const packageSnap = await db.collection("packages").get();
  const packageDocs = missingSeedDocs(
    packageSnap.docs.map((entry) => entry.id),
    bookingPackageSeedDocs(),
  );
  for (const doc of packageDocs) {
    const { id, ...data } = doc;
    await db.collection("packages").doc(id).set({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const adjustmentSnap = await db.collection(PRICING_ADJUSTMENTS_COLLECTION).get();
  const adjustmentDocs = missingSeedDocs(
    adjustmentSnap.docs.map((entry) => entry.id),
    pricingAdjustmentSeedDocs(),
  );
  for (const doc of adjustmentDocs) {
    const { id, ...data } = doc;
    await db.collection(PRICING_ADJUSTMENTS_COLLECTION).doc(id).set({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  console.log(`Seeded ${packageDocs.length} new packages and ${adjustmentDocs.length} new price adjustments. Existing docs were left alone.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
