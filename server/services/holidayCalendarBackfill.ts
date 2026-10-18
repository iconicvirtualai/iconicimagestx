/**
 * One-time, idempotent holiday calendar backfill.
 * Orders that already have calendarEventId are left alone.
 */

import admin from "firebase-admin";
import { publicClientUrl } from "../../shared/publicSiteUrl";
import { runHolidayBackfill, type HolidayBackfillReport } from "../../shared/holidayCalendar";
import { createHolidayCalendarEvent } from "./holidayCalendar";
import { loadHolidayCalendarOrders } from "./holidaySlots";

const db = () => admin.firestore();

export async function backfillHolidayCalendarEvents(): Promise<HolidayBackfillReport> {
  const orders = await loadHolidayCalendarOrders();
  const { report, patches } = await runHolidayBackfill({
    orders,
    adminUrl: (id) => publicClientUrl(`/admin/order-request/${encodeURIComponent(id)}`),
    create: (plan) => createHolidayCalendarEvent(plan),
  });
  for (const item of patches) {
    await db().collection("orderRequests").doc(item.id).update({
      ...item.patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return report;
}
