/**
 * Read holiday RSVP and season orders. Callers return times only.
 */

import admin from "firebase-admin";
import { HOLIDAY_RSVP_LEAD, HOLIDAY_SEASON_LEAD } from "../../shared/holidayCheckout";

const db = () => admin.firestore();

async function holidayOrderSnaps() {
  const [rsvp, season] = await Promise.all([
    db().collection("orderRequests").where("leadSource", "==", HOLIDAY_RSVP_LEAD).get(),
    db().collection("orderRequests").where("leadSource", "==", HOLIDAY_SEASON_LEAD).get(),
  ]);
  const byId = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const doc of [...rsvp.docs, ...season.docs]) {
    byId.set(doc.id, { id: doc.id, data: doc.data() as Record<string, unknown> });
  }
  return [...byId.values()];
}

export async function loadHolidaySlotOrders(): Promise<Record<string, unknown>[]> {
  return (await holidayOrderSnaps()).map((doc) => doc.data);
}

export async function loadHolidayCalendarOrders(): Promise<Array<Record<string, unknown> & { id: string }>> {
  return (await holidayOrderSnaps()).map((doc) => ({ id: doc.id, ...doc.data }));
}
