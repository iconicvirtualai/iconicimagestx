/**
 * Idempotent client delivery QA seed.
 *
 *   pnpm seed:delivery-qa
 *   pnpm seed:delivery-qa -- --write
 *
 * Dry run is the default. It prints the documents and does not
 * contact Firebase, send email, or upload media.
 *
 * --write needs FIREBASE_SERVICE_ACCOUNT (JSON) or
 * GOOGLE_APPLICATION_CREDENTIALS, same as pnpm seed:booking-catalog.
 * It does not send email, SMS, or a Square invoice, and it does not
 * create a Firebase Auth user.
 */
import {
  buildDeliveryQaSeed,
  deliveryQaRefusals,
  formatDeliveryQaDryRun,
  parseDeliveryQaArgs,
  type DeliveryQaDocument,
} from "../shared/deliveryQaSeed.ts";

const parsed = parseDeliveryQaArgs(process.argv.slice(2));

if (parsed.unknown.length > 0) {
  console.error(
    `Unknown argument: ${parsed.unknown.join(" ")}. Dry run is the default. The only write flag is --write.`,
  );
  process.exit(2);
}

const origin = String(process.env.APP_URL || "").trim();
const plan = buildDeliveryQaSeed(origin ? { origin } : undefined);

if (!parsed.write) {
  process.stdout.write(formatDeliveryQaDryRun(plan));
  process.exit(0);
}

try {
  await writeDeliveryQa(plan.documents);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

async function writeDeliveryQa(documents: DeliveryQaDocument[]) {
  await import("dotenv/config");
  const admin = (await import("firebase-admin")).default;
  const projectId = await credentialProjectId();

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
