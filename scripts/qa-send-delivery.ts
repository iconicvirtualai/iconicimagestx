/**
 * Send the client gallery delivery email for the playtest QA case only.
 *
 *   APP_URL=https://iconicimagestx.vercel.app pnpm qa:send-delivery -- --playtest --dry-run
 *   APP_URL=https://iconicimagestx.vercel.app pnpm qa:send-delivery -- --playtest
 *
 * --dry-run prints the subject, recipient, and links. It does not read
 * Firestore and it does not send.
 *
 * Without --dry-run, the script loads the playtest gallery, order, and client.
 * It exits non-zero and sends nothing unless the gallery and order are
 * playtest, the client is the delivery QA client, and the recipient is
 * exactly ops+deliveryqa@iconicimagestx.com. The send goes through
 * deliverGalleryToClient → sendEmail, so CLIENT_NOTIFY_LIVE and
 * NOTIFY_TEST_ALLOWLIST still apply.
 *
 * SMTP_PASS is a Vercel secret, so the live command cannot send from a laptop.
 * Staff send the real delivery email by clicking Deliver Gallery on the
 * playtest order in the app. That button calls the same deliverGalleryToClient
 * path. The playtest gallery clears the release gate, so the button is not held.
 */
import { DELIVERY_QA_IDS } from "../shared/deliveryQaSeed.ts";
import {
  deliveryQaSendPreview,
  deliveryQaSendRefusals,
  formatDeliveryQaSendDryRun,
  parseDeliveryQaSendArgs,
  type DeliveryQaSendRecord,
} from "../shared/deliveryQaSend.ts";

const parsed = parseDeliveryQaSendArgs(process.argv.slice(2));

if (parsed.unknown.length > 0) {
  console.error(`Unknown argument: ${parsed.unknown.join(" ")}. Use --playtest and, to preview, --dry-run.`);
  process.exit(2);
}

if (!parsed.playtest) {
  console.error("Refusing to send. Pass --playtest. This script only delivers the playtest QA gallery.");
  process.exit(2);
}

const origin = String(process.env.APP_URL || "").trim();
const preview = deliveryQaSendPreview(origin || undefined);

if (parsed.dryRun) {
  process.stdout.write(formatDeliveryQaSendDryRun(preview));
  process.exit(0);
}

try {
  await sendPlaytestDelivery();
} catch (err) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  console.error(err instanceof Error ? err.message : err);
  process.exit(status === 409 || status === 404 ? status : 1);
}

async function sendPlaytestDelivery() {
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
      throw new Error("Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before sending.");
    }
  }

  const db = admin.firestore();
  const [gallerySnap, orderSnap, clientSnap] = await Promise.all([
    db.collection("galleries").doc(DELIVERY_QA_IDS.gallery).get(),
    db.collection("orders").doc(DELIVERY_QA_IDS.order).get(),
    db.collection("clients").doc(DELIVERY_QA_IDS.client).get(),
  ]);
  const gallery = recordOf(gallerySnap.exists, gallerySnap.data());
  const order = recordOf(orderSnap.exists, orderSnap.data());
  const client = recordOf(clientSnap.exists, clientSnap.data());
  const refusals = deliveryQaSendRefusals({ gallery, order, client });
  if (refusals.length > 0) {
    console.error("Refusing to send. No email was sent.");
    for (const reason of refusals) console.error(`- ${reason}`);
    process.exit(1);
  }

  console.log(`Calling deliverGalleryToClient for galleries/${DELIVERY_QA_IDS.gallery}.`);
  console.log(`Recipient: ${preview.to}`);
  console.log(`Gallery link: ${preview.galleryUrl}`);
  console.log(`Invoice link: ${preview.paymentUrl}`);
  const { deliverGalleryToClient } = await import("../server/services/galleryDeliver.ts");
  const result = await deliverGalleryToClient(DELIVERY_QA_IDS.gallery);
  console.log(`deliverGalleryToClient returned ${result.deliveryUrl}.`);
  console.log("sendEmail applied its own gate. A suppressed send is logged by the mailer and is not retried here.");
}

function recordOf(exists: boolean, data: Record<string, unknown> | undefined): DeliveryQaSendRecord {
  return {
    exists,
    playtest: data?.playtest,
    linkedClientId: data?.linkedClientId,
    clientId: data?.clientId,
    orderId: data?.orderId,
    email: data?.email,
    clientEmail: data?.clientEmail,
    phone: data?.phone,
  };
}
