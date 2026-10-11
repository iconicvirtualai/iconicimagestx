/**
 * Signed Square webhook fixture against a local server and mocked Firestore.
 *
 *   pnpm qa:square-webhook -- --fixture
 *
 * Builds a payment.updated COMPLETED event for playtest-delivery-qa-invoice,
 * signs it with a test key, and posts it twice. The first post marks the
 * invoice paid, unlocks the listing and gallery, writes history, and sends
 * the receipt through the NOTIFY_TEST_ALLOWLIST path. The replay is a no-op.
 *
 * This does not read or write live Firestore, does not send SMTP, and does
 * not set CLIENT_NOTIFY_LIVE.
 */
import express from "express";
import type { Server } from "node:http";
import { DELIVERY_QA_CLIENT_EMAIL } from "../shared/deliveryQaClient.ts";
import { buildDeliveryQaSeed } from "../shared/deliveryQaSeed.ts";
import { squarePaymentNote } from "../shared/paymentAccess.ts";
import { createMemoryFirestore } from "../server/lib/memoryFirestore.ts";
import { useAppFirestore } from "../server/lib/appFirestore.ts";
import { setEmailDeliveryOverride } from "../server/services/email.ts";
import { signSquareWebhook } from "../server/services/squareWebhook.ts";
import paymentsRouter from "../server/routes/payments.ts";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (!args.includes("--fixture")) {
  console.error("Refusing to run. Pass --fixture.");
  console.error("This posts a signed test event to a local server with mocked Firestore.");
  console.error("It does not use live Firestore, send real email, or set CLIENT_NOTIFY_LIVE.");
  process.exit(2);
}

const KEY = "qa-square-webhook-fixture-key";
const sent: Array<{ to?: string; subject?: string; html?: string; text?: string }> = [];

delete process.env.CLIENT_NOTIFY_LIVE;
process.env.CLIENT_COMMS_ZONE = "";
process.env.PUBLIC_SITE_URL = "https://iconicimagestx.vercel.app";
process.env.NOTIFY_TEST_ALLOWLIST = DELIVERY_QA_CLIENT_EMAIL;
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY;

const memory = createMemoryFirestore();
useAppFirestore(memory.db);
setEmailDeliveryOverride(async (message) => {
  sent.push(message);
});

const plan = buildDeliveryQaSeed({ origin: "https://iconicimagestx.vercel.app" });
for (const doc of plan.documents) memory.seed(doc.collection, doc.id, doc.data);

const app = express();
app.use("/api/payments/square-webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use("/api/payments", paymentsRouter);

const server = await new Promise<Server>((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Fixture server did not bind a port.");
const notificationUrl = `http://127.0.0.1:${address.port}/api/payments/square-webhook`;
process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = notificationUrl;

const invoiceId = "playtest-delivery-qa-invoice";
const event = {
  merchant_id: "MLPLAYTEST",
  type: "payment.updated",
  event_id: "evt-playtest-delivery-qa-payment-updated",
  created_at: "2026-10-11T05:41:00Z",
  data: {
    type: "payment",
    id: "pay-playtest-delivery-qa-1",
    object: {
      payment: {
        id: "pay-playtest-delivery-qa-1",
        created_at: "2026-10-11T05:41:00Z",
        updated_at: "2026-10-11T05:41:01Z",
        status: "COMPLETED",
        amount_money: { amount: 100, currency: "USD" },
        total_money: { amount: 100, currency: "USD" },
        source_type: "CARD",
        card_details: { status: "CAPTURED", card: { card_brand: "VISA", last_4: "1111" } },
        location_id: "LPLAYTEST",
        reference_id: invoiceId,
        note: squarePaymentNote(invoiceId, "TEST-DELIVERY-QA"),
      },
    },
  },
};

try {
  const first = await post(event);
  const replay = await post(event);
  const invoice = memory.get("invoices", invoiceId);
  const listing = memory.get("listings", "playtest-delivery-qa-listing");
  const gallery = memory.get("galleries", "playtest-delivery-qa-gallery");
  const history = (memory.get("orders", "playtest-delivery-qa-order")?.history || []) as Array<Record<string, unknown>>;
  const report = {
    notificationUrl,
    first,
    replay,
    invoice: {
      status: invoice?.status,
      amountPaid: invoice?.amountPaid,
      amountDue: invoice?.amountDue,
      amountStillDue: invoice?.amountStillDue,
      squarePaymentId: invoice?.squarePaymentId,
      paymentMethod: invoice?.paymentMethod,
      playtest: invoice?.playtest,
    },
    unlock: {
      listing: pickUnlock(listing),
      gallery: pickUnlock(gallery),
    },
    history,
    receipt: sent.map((message) => ({
      to: message.to,
      subject: message.subject,
      delivery: first.email,
      hasReceipt: Boolean(message.html?.includes("RECEIPT")),
      hasDownloads: Boolean(message.html?.includes("Your downloads are ready")),
      galleryUrl: message.html?.includes("/gallery/playtest-delivery-qa-gallery") || false,
      presentationButton: Boolean(message.html?.includes("View your listing presentation")),
    })),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  assert(first.applied === true && first.unlocked === true, "first event did not unlock");
  assert(first.email === "allowlist", "receipt did not go through the allowlist path");
  assert(invoice?.status === "paid" && invoice.amountPaid === 1, "invoice was not marked paid");
  assert(listing?.clientGalleryDownloadsUnlocked === true, "listing unlock flag was not set");
  assert(listing?.lockDownloads === false && listing.downloadEnabled === true, "listing downloads stayed locked");
  assert(gallery?.downloadEnabled === true && gallery.downloadsReleased === true, "gallery downloads stayed locked");
  assert(history.length === 1, "history was missing");
  assert(
    history[0]?.action === "Payment received $1.00 via Square; downloads unlocked",
    "history action did not record the unlock",
  );
  assert(String(history[0]?.details || "").includes("test allowlist"), "history did not record the allowlist send");
  assert(sent.length === 1, "receipt was not captured once");
  assert(replay.duplicate === true, "replay was not a duplicate");
  assert(memory.get("invoices", invoiceId)?.amountPaid === 1, "replay changed amountPaid");
  assert((memory.get("orders", "playtest-delivery-qa-order")?.history as unknown[]).length === 1, "replay duplicated history");
  assert(sent.length === 1, "replay sent another receipt");
  process.stdout.write("Fixture passed. Replay was a no-op.\n");
} finally {
  setEmailDeliveryOverride(null);
  useAppFirestore(null);
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function post(body: unknown) {
  const raw = JSON.stringify(body);
  const response = await fetch(process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || "", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-square-hmacsha256-signature": signSquareWebhook(raw, KEY, process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || ""),
    },
    body: raw,
  });
  const json = await response.json() as Record<string, unknown>;
  if (response.status !== 200) {
    throw new Error(`Webhook returned ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function pickUnlock(doc: Record<string, unknown> | undefined) {
  return {
    clientGalleryDownloadsUnlocked: doc?.clientGalleryDownloadsUnlocked,
    lockDownloads: doc?.lockDownloads,
    downloadsReleased: doc?.downloadsReleased,
    downloadEnabled: doc?.downloadEnabled,
    paymentStatus: doc?.paymentStatus,
    invoiceStatus: doc?.invoiceStatus,
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
