/**
 * Unpaid apprentice holds.
 *
 * Every apprentice order starts as awaiting_deposit with a HOLD event on the
 * apprentice calendar. If the $25 booking fee is not paid within 60 minutes the
 * order becomes expired_unpaid and the HOLD event is deleted so the slot opens.
 *
 * Runs from the daily Vercel cron (/api/apprenticeship/release-holds) and lazily,
 * throttled, before /api/apprenticeship/slots and /api/apprenticeship/order read
 * the calendar.
 *
 * A $25 that lands after expiry re-confirms the booking only when the time is
 * still open; otherwise the order is flagged for the office. No client email/SMS.
 */

import admin from "firebase-admin";
import {
  APPRENTICESHIP_AWAITING_DEPOSIT_STATUS,
  APPRENTICESHIP_EXPIRED_STATUS,
  APPRENTICESHIP_HOLD_MINUTES,
  APPRENTICESHIP_ORDER_SOURCE,
  APPRENTICESHIP_PAID_NEEDS_RESCHEDULE_STATUS,
  apprenticeshipHoldExpired,
} from "../../shared/apprenticeship";
import {
  createApprenticeshipEvent,
  deleteApprenticeshipEvent,
  readApprenticeshipAvailability,
} from "./apprenticeshipCalendar";

const db = () => admin.firestore();

export interface HoldReleaseResult {
  checked: number;
  released: number;
  eventsDeleted: number;
  eventErrors: number;
}

type DeleteEvent = (input: { calendarId?: string | null; eventId: string }) => Promise<boolean>;

async function releaseEvent(
  ref: FirebaseFirestore.DocumentReference,
  order: Record<string, unknown>,
  deleteEvent: DeleteEvent,
  result: HoldReleaseResult,
) {
  const eventId = typeof order.calendarEventId === "string" ? order.calendarEventId : "";
  if (!eventId) {
    await ref.update({ calendarEventReleased: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return;
  }
  let deleted = false;
  try {
    deleted = await deleteEvent({
      calendarId: typeof order.calendarId === "string" ? order.calendarId : null,
      eventId,
    });
  } catch (error) {
    console.error("[ApprenticeshipHolds] Calendar delete failed:", error);
  }
  if (deleted) result.eventsDeleted += 1;
  else result.eventErrors += 1;
  await ref.update({
    calendarEventReleased: deleted,
    ...(deleted ? { holdReleasedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function releaseExpiredApprenticeshipHolds(options: {
  now?: Date;
  deleteEvent?: DeleteEvent;
} = {}): Promise<HoldReleaseResult> {
  const result: HoldReleaseResult = { checked: 0, released: 0, eventsDeleted: 0, eventErrors: 0 };
  if (!admin.apps.length) return result;
  const now = options.now ?? new Date();
  const deleteEvent = options.deleteEvent ?? deleteApprenticeshipEvent;

  const handled = new Set<string>();
  const waiting = await db().collection("orders")
    .where("source", "==", APPRENTICESHIP_ORDER_SOURCE)
    .where("status", "==", APPRENTICESHIP_AWAITING_DEPOSIT_STATUS)
    .get();

  for (const snap of waiting.docs) {
    const listed = snap.data() || {};
    if (!apprenticeshipHoldExpired(listed, now)) continue;
    result.checked += 1;
    const ref = db().collection("orders").doc(snap.id);
    const expired = await db().runTransaction(async (tx) => {
      const orderSnap = await tx.get(ref);
      if (!orderSnap.exists) return null;
      const order = orderSnap.data() || {};
      if (!apprenticeshipHoldExpired(order, now)) return null;
      const invoiceId = typeof order.invoiceId === "string" ? order.invoiceId : "";
      const invoiceRef = invoiceId ? db().collection("invoices").doc(invoiceId) : null;
      const invoiceSnap = invoiceRef ? await tx.get(invoiceRef) : null;
      const invoice = invoiceSnap?.exists ? invoiceSnap.data() || {} : {};
      // A deposit already on the invoice wins; the webhook will confirm it.
      if ((Number(invoice.depositPaid) || 0) > 0 || invoice.depositPaidAt) return null;
      const requestId = typeof order.orderRequestId === "string" ? order.orderRequestId : "";
      const requestRef = requestId ? db().collection("orderRequests").doc(requestId) : null;
      const requestSnap = requestRef ? await tx.get(requestRef) : null;
      const stamp = admin.firestore.FieldValue.serverTimestamp();
      const note = `Hold released: the $25 booking fee was not paid within ${APPRENTICESHIP_HOLD_MINUTES} minutes.`;
      tx.update(ref, {
        status: APPRENTICESHIP_EXPIRED_STATUS,
        depositStatus: "expired",
        holdExpiredAt: stamp,
        calendarEventReleased: false,
        officeNote: note,
        updatedAt: stamp,
      });
      if (requestRef && requestSnap?.exists) {
        tx.update(requestRef, {
          status: APPRENTICESHIP_EXPIRED_STATUS,
          depositStatus: "expired",
          officeNote: note,
          updatedAt: stamp,
        });
      }
      if (invoiceRef && invoiceSnap?.exists) {
        tx.update(invoiceRef, { holdExpired: true, updatedAt: stamp });
      }
      return order;
    });
    if (!expired) continue;
    handled.add(snap.id);
    result.released += 1;
    await releaseEvent(ref, expired, deleteEvent, result);
  }

  // Retry calendar deletes that failed on an earlier run.
  const stuck = await db().collection("orders")
    .where("source", "==", APPRENTICESHIP_ORDER_SOURCE)
    .where("status", "==", APPRENTICESHIP_EXPIRED_STATUS)
    .where("calendarEventReleased", "==", false)
    .get();
  for (const snap of stuck.docs) {
    const order = snap.data() || {};
    if (handled.has(snap.id) || order.source !== APPRENTICESHIP_ORDER_SOURCE) continue;
    if (order.status !== APPRENTICESHIP_EXPIRED_STATUS || order.calendarEventReleased !== false) continue;
    await releaseEvent(db().collection("orders").doc(snap.id), order, deleteEvent, result);
  }
  return result;
}

let lastLazyRun = 0;
let lazyRunning: Promise<unknown> | null = null;
const LAZY_INTERVAL_MS = 60 * 1000;
const LAZY_TIMEOUT_MS = 4000;

/** Throttled, time-boxed, never throws. Used before reading open slots. */
export async function maybeReleaseExpiredApprenticeshipHolds(now = new Date()): Promise<void> {
  if (lazyRunning) {
    await Promise.race([lazyRunning, new Promise((resolve) => setTimeout(resolve, LAZY_TIMEOUT_MS))]);
    return;
  }
  if (now.getTime() - lastLazyRun < LAZY_INTERVAL_MS) return;
  lastLazyRun = now.getTime();
  lazyRunning = releaseExpiredApprenticeshipHolds({ now })
    .catch((error) => console.error("[ApprenticeshipHolds] Lazy release failed:", error))
    .finally(() => {
      lazyRunning = null;
    });
  await Promise.race([lazyRunning, new Promise((resolve) => setTimeout(resolve, LAZY_TIMEOUT_MS))]);
}

export function resetApprenticeshipHoldThrottle() {
  lastLazyRun = 0;
  lazyRunning = null;
}

/**
 * The $25 landed after the hold expired. Re-confirm when the same time is still
 * open (new calendar event), otherwise flag the office. Never contacts the client.
 */
export async function resolveLateApprenticeshipPayment(orderId: string): Promise<"confirmed" | "flagged" | "skipped"> {
  const ref = db().collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return "skipped";
  const order = snap.data() || {};
  if (order.source !== APPRENTICESHIP_ORDER_SOURCE || order.status !== APPRENTICESHIP_EXPIRED_STATUS) return "skipped";
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const requestId = typeof order.orderRequestId === "string" ? order.orderRequestId : "";
  const requestRef = requestId ? db().collection("orderRequests").doc(requestId) : null;
  const orderNumber = String(order.orderNumber || "");
  const slotStart = typeof order.slotStart === "string" ? order.slotStart : "";
  const packageId = typeof order.packageId === "string" ? order.packageId : "";

  const confirm = async (extra: Record<string, unknown>) => {
    await ref.update({
      status: "confirmed",
      depositStatus: "paid",
      confirmedAt: stamp,
      reconfirmedAfterExpiry: true,
      officeNote: "$25 booking fee paid after the hold expired. The time was still open and is booked again.",
      updatedAt: stamp,
      ...extra,
    });
    if (requestRef) {
      await requestRef.update({ status: "new", depositStatus: "paid", updatedAt: stamp }).catch(() => {});
    }
    return "confirmed" as const;
  };

  if (!slotStart) return confirm({});

  let flagReason = "the time was taken after the hold expired";
  try {
    const availability = await readApprenticeshipAvailability({ packageId: packageId || "apprentice-25" });
    const slot = availability.available ? availability.slots.find((item) => item.start === slotStart) : undefined;
    if (!availability.available) flagReason = "the apprentice calendar could not be read";
    if (slot) {
      const event = await createApprenticeshipEvent({
        orderNumber,
        clientName: String(order.clientName || ""),
        clientEmail: String(order.clientEmail || ""),
        clientPhone: String(order.clientPhone || ""),
        address: String(order.address || ""),
        packageName: String(order.packageName || ""),
        slot,
      });
      if (event?.eventId) {
        return confirm({
          calendarEventId: event.eventId,
          calendarId: event.calendarId,
          calendarEventReleased: null,
        });
      }
      flagReason = "the calendar event could not be created";
    }
  } catch (error) {
    console.error("[ApprenticeshipHolds] Late payment re-confirm failed:", error);
    flagReason = "the apprentice calendar could not be read";
  }

  const note = `$25 booking fee paid after the ${APPRENTICESHIP_HOLD_MINUTES}-minute hold expired, but ${flagReason}. Call the agent to pick a new time or refund the $25.`;
  await ref.update({
    status: APPRENTICESHIP_PAID_NEEDS_RESCHEDULE_STATUS,
    depositStatus: "paid",
    needsOfficeReview: true,
    officeNote: note,
    updatedAt: stamp,
  });
  if (requestRef) {
    await requestRef.update({
      status: APPRENTICESHIP_PAID_NEEDS_RESCHEDULE_STATUS,
      depositStatus: "paid",
      needsOfficeReview: true,
      officeNote: note,
      updatedAt: stamp,
    }).catch(() => {});
  }
  await db().collection("agentLogs").add({
    agent: "travis",
    action: "Apprentice fee paid after hold expired",
    summary: `Order ${orderNumber || orderId}: ${note}`,
    status: "flagged",
    relatedType: "order",
    relatedId: orderId,
    priority: "high",
    requiresHumanReview: true,
    createdAt: stamp,
  });
  return "flagged";
}
