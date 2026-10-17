/**
 * Read holiday RSVP and season orders. Callers return times only.
 */

import admin from "firebase-admin";
import { HOLIDAY_RSVP_LEAD, HOLIDAY_SEASON_LEAD } from "../../shared/holidayCheckout";

const db = () => admin.firestore();

export async function loadHolidaySlotOrders(): Promise<Record<string, unknown>[]> {
  const [rsvp, season] = await Promise.all([
    db().collection("orderRequests").where("leadSource", "==", HOLIDAY_RSVP_LEAD).get(),
    db().collection("orderRequests").where("leadSource", "==", HOLIDAY_SEASON_LEAD).get(),
  ]);
  return [...rsvp.docs, ...season.docs].map((doc) => doc.data() as Record<string, unknown>);
}
