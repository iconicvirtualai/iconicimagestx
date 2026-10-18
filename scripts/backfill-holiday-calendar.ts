/**
 * Create photos-calendar events for holiday RSVPs and 'Tis shoots that
 * do not have one yet. Safe to run again: orders that already have
 * calendarEventId are skipped. Test and cancelled orders are skipped.
 *
 *   FIREBASE_SERVICE_ACCOUNT='{"client_email":"...","private_key":"..."}' \
 *     pnpm backfill:holiday-calendar
 *
 * The service account must be the Firebase admin SDK account that
 * photos@iconicimagestx.com is shared with. Prints a JSON report. Does not
 * print credentials.
 */
import admin from "firebase-admin";
import { backfillHolidayCalendarEvents } from "../server/services/holidayCalendarBackfill.ts";

const entry = process.argv[1] || "";
const invoked = /backfill-holiday-calendar\.ts$/.test(entry);

if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

async function main() {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("Set FIREBASE_SERVICE_ACCOUNT to the Firebase admin SDK JSON.");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const report = await backfillHolidayCalendarEvents();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
