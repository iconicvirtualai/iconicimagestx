/**
 * Idempotent client delivery QA seed.
 *
 *   pnpm seed:delivery-qa
 *   APP_URL=https://iconicimagestx.vercel.app pnpm seed:delivery-qa -- --write
 *   APP_URL=https://iconicimagestx.vercel.app pnpm seed:delivery-qa -- --unlock
 *
 * Dry run is the default. It prints the documents and does not
 * contact Firebase, send email, or upload media.
 *
 * --write needs FIREBASE_SERVICE_ACCOUNT (JSON) or
 * GOOGLE_APPLICATION_CREDENTIALS, same as pnpm seed:booking-catalog.
 * It does not send email, SMS, or a Square invoice, and it does not
 * create a Firebase Auth user. A later --write puts the download lock back.
 *
 * --unlock changes lock fields on the playtest gallery and listing only.
 * It does not mark the invoice paid and does not send email.
 */
import {
  DELIVERY_QA_IDS,
  DELIVERY_QA_UNLOCK_FIELDS,
  buildDeliveryQaSeed,
  deliveryQaRefusals,
  deliveryQaUnlockRefusals,
  formatDeliveryQaDryRun,
  parseDeliveryQaArgs,
  type DeliveryQaDocument,
} from "../shared/deliveryQaSeed.ts";

const parsed = parseDeliveryQaArgs(process.argv.slice(2));

if (parsed.unknown.length > 0) {
  console.error(
    `Unknown argument: ${parsed.unknown.join(" ")}. Dry run is the default. Flags are --write and --unlock.`,
  );
  process.exit(2);
}

if (parsed.write && parsed.unlock) {
  console.error("Pass either --write or --unlock, not both. --write re-locks. --unlock only clears the lock.");
  process.exit(2);
}

const origin = String(process.env.APP_URL || "").trim();
const plan = buildDeliveryQaSeed(origin ? { origin } : undefined);

if (!parsed.write && !parsed.unlock) {
  process.stdout.write(formatDeliveryQaDryRun(plan));
  process.exit(0);
}

try {
  if (parsed.unlock) await unlockDeliveryQa();
  else await writeDeliveryQa(plan.documents);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

async function unlockDeliveryQa() {
  const admin = await loadAdmin();
  const projectId = await credentialProjectId();
  const resolvedProject = projectId || admin.app().options.projectId || "(unknown project)";
  console.log(`UNLOCK MODE. Firebase project: ${resolvedProject}`);
  console.log("Reading the playtest gallery and listing before any write.");

  const db = admin.firestore();
  const galleryRef = db.collection("galleries").doc(DELIVERY_QA_IDS.gallery);
  const listingRef = db.collection("listings").doc(DELIVERY_QA_IDS.listing);
  const [gallerySnap, listingSnap] = await Promise.all([galleryRef.get(), listingRef.get()]);
  const refusals = deliveryQaUnlockRefusals({
    gallery: { exists: gallerySnap.exists, playtest: gallerySnap.data()?.playtest },
    listing: { exists: listingSnap.exists, playtest: listingSnap.data()?.playtest },
  });
  if (refusals.length > 0) {
    console.error("Refusing to unlock. No documents were changed.");
    for (const reason of refusals) console.error(`- ${reason}`);
    process.exit(1);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const patch = { ...DELIVERY_QA_UNLOCK_FIELDS, updatedAt: now };
  const batch = db.batch();
  batch.set(galleryRef, patch, { merge: true });
  batch.set(listingRef, patch, { merge: true });
  await batch.commit();
  console.log(`Unlocked downloads on galleries/${DELIVERY_QA_IDS.gallery} and listings/${DELIVERY_QA_IDS.listing}.`);
  console.log("Invoice was not changed and is still unpaid. No email was sent.");
}

async function loadAdmin() {
  await import("dotenv/config");
  const admin = (await import("firebase-admin")).default;
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      throw new Error(
        "Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before writing the delivery QA seed.",
      );
    }
  }
  return admin;
}

async function writeDeliveryQa(documents: DeliveryQaDocument[]) {
  const admin = await loadAdmin();
  const projectId = await credentialProjectId();

  const resolvedProject = projectId || admin.app().options.projectId || "(unknown project)";
  console.log(`WRITE MODE. Firebase project: ${resolvedProject}`);
  console.log("Creating or updating 5 playtest documents. No email, SMS, Square, Stripe, or Auth user.");

  const db = admin.firestore();
  const snaps = await Promise.all(documents.map(async (doc) => {
    const snap = await db.collection(doc.collection).doc(doc.id).get();
    return { doc, snap };
  }));

  const client = documents.find((doc) => doc.collection === "clients");
  const email = String(client?.data.email || "");
  const emailSnap = email
    ? await db.collection("clients").where("email", "==", email).limit(5).get()
    : null;

  const refusals = deliveryQaRefusals({
    documents: snaps.map(({ doc, snap }) => ({
      path: doc.path,
      exists: snap.exists,
      playtest: snap.exists ? snap.data()?.playtest : undefined,
    })),
    emailMatches: (emailSnap?.docs || []).map((match) => ({
      path: `clients/${match.id}`,
      playtest: match.data()?.playtest,
    })),
  });

  if (refusals.length > 0) {
    console.error("Refusing to write. No documents were changed.");
    for (const reason of refusals) console.error(`- ${reason}`);
    process.exit(1);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const { doc, snap } of snaps) {
    const createdAt = snap.exists ? snap.data()?.createdAt || now : now;
    batch.set(db.collection(doc.collection).doc(doc.id), {
      ...doc.data,
      createdAt,
      updatedAt: now,
    }, { merge: true });
  }
  await batch.commit();

  console.log(`Wrote ${documents.length} delivery QA documents in ${resolvedProject}.`);
  for (const doc of documents) console.log(`- ${doc.path}`);
  console.log("No email was sent.");
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
