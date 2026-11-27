/**
 * Read-only count of Pay at Booking orders that Square collected
 * while the local order still shows unpaid.
 *
 *   pnpm report:pay-at-booking-unpaid
 *   pnpm report:pay-at-booking-unpaid -- --fixture
 *   pnpm report:pay-at-booking-unpaid -- --live
 *
 * Default and --fixture use a built-in sample. They do not contact Firebase or Square.
 * --live reads order requests and, when Square credentials are set, reads Square
 * orders. It prints counts only. It has no write path.
 *
 * The live scan needs FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.
 * Square checks also need SQUARE_ACCESS_TOKEN. Secrets are not printed.
 */
import { readFileSync } from "node:fs";
import {
  formatPayAtBookingUnpaidReport,
  payAtBookingShowsUnpaid,
  payAtBookingUnpaidReport,
  type PayAtBookingRow,
} from "../shared/payAtBookingUnpaid.ts";
import { fetchSquareOrderSnapshot } from "../server/services/squareOrderLookup.ts";

const SQUARE_LOOKUP_CAP = 50;

if (process.argv.includes("--write") || process.argv.includes("--apply") || process.argv.includes("--migrate")) {
  console.error("report:pay-at-booking-unpaid is read-only and has no write path.");
  process.exit(2);
}

if (!process.argv.includes("--live")) {
  process.stdout.write(formatPayAtBookingUnpaidReport(payAtBookingUnpaidReport(fixtureRows()), "fixture"));
  process.exit(0);
}

await liveReport();

function fixtureRows(): PayAtBookingRow[] {
  return [
    { paymentMethod: "pay_now", total: 137.89, amountPaid: 0, paymentStatus: "unpaid", squarePaidCents: 13789, squareState: "COMPLETED" },
    { paymentMethod: "pay_now", total: 134, amountPaid: 134, paymentStatus: "paid", squarePaidCents: 13400, squareState: "COMPLETED" },
    { paymentMethod: "pay_later", total: 139, amountPaid: 0, squarePaidCents: 13900 },
  ];
}

async function liveReport() {
  const admin = await initAdmin();
  const projectId = (await credentialProjectId()) || admin.app().options.projectId || "(unknown project)";
  const db = admin.firestore();
  const snap = await db.collection("orderRequests").get();
  const rows: PayAtBookingRow[] = [];
  const pending: Array<{ row: PayAtBookingRow; squareOrderId: string }> = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const row: PayAtBookingRow = {
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      status: data.status,
      total: data.total,
      amountPaid: data.amountPaid,
      depositPaid: data.depositPaid,
    };
    rows.push(row);
    const squareOrderId = typeof data.squareOrderId === "string" ? data.squareOrderId.trim() : "";
    if (squareOrderId && payAtBookingShowsUnpaid(row)) pending.push({ row, squareOrderId });
  }

  let checked = 0;
  if (!process.env.SQUARE_ACCESS_TOKEN) {
    process.stdout.write("Square was not checked. SQUARE_ACCESS_TOKEN is not set.\n");
  } else {
    for (const item of pending.slice(0, SQUARE_LOOKUP_CAP)) {
      const snapshot = await fetchSquareOrderSnapshot(item.squareOrderId, process.env);
      checked += 1;
      if (!snapshot) continue;
      item.row.squareState = snapshot.state;
      item.row.squarePaidCents = snapshot.paidCents;
    }
    if (pending.length > SQUARE_LOOKUP_CAP) {
      process.stdout.write(`Square checks stopped after ${SQUARE_LOOKUP_CAP} unpaid Pay at Booking orders.\n`);
    }
  }

  const report = payAtBookingUnpaidReport(rows);
  process.stdout.write(formatPayAtBookingUnpaidReport(report, projectId));
  if (process.env.SQUARE_ACCESS_TOKEN) {
    process.stdout.write(`Square orders read: ${checked}\n`);
  }
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
    "Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before a live Pay at Booking scan.",
  );
}

async function credentialProjectId(): Promise<string | null> {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const parsed = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
  } catch {
    return null;
  }
  return null;
}
