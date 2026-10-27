/**
 * Unpaid $10 Tuesday headshot holds.
 *
 * Same 60-minute rule as an apprentice booking. The calendar event is deleted
 * when the booking fee is not paid, and a late payment rebooks the time only
 * when it is still open. No client email or SMS.
 */

import admin from "firebase-admin";
import {
  HEADSHOTS_HOLD_MINUTES,
  HEADSHOTS_HOLD_PREFIX,
  HEADSHOTS_ORDER_SOURCE,
  HEADSHOTS_PAID_NOTE,
  HEADSHOTS_STUDIO_ADDRESS,
  HEADSHOTS_UNPAID_NOTE,
  headshotHoldExpired,
  publishHeadshotSlots,
} from "../../shared/headshots10";
import { APPRENTICESHIP_EXPIRED_STATUS, APPRENTICESHIP_PAID_NEEDS_RESCHEDULE_STATUS } from "../../shared/apprenticeship";
import {
  confirmBookingCalendarHold,
  createBookingCalendarHold,
  deleteBookingCalendarHold,
  readHeadshotAvailability,
} from "./bookingAvailability";

const db = () => admin.firestore();

export interface HeadshotHoldReleaseResult {
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
  result: HeadshotHoldReleaseResult,
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
    console.error("[HeadshotHolds] Calendar delete failed:", error);
  }
  if (deleted) result.eventsDeleted += 1;
  else result.eventErrors += 1;
  await ref.update({
    calendarEventReleased: deleted,
    ...(deleted ? { holdReleasedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function releaseExpiredHeadshotHolds(options: {
  now?: Date;
  deleteEvent?: DeleteEvent;
} = {}): Promise<HeadshotHoldReleaseResult> {
  const result: HeadshotHoldReleaseResult = { checked: 0, released: 0, eventsDeleted: 0, eventErrors: 0 };
  if (!admin.apps.length) return result;
  const now = options.now ?? new Date();
  const deleteEvent = options.deleteEvent ?? (async (input) => {
    if (!input.calendarId || !input.eventId) return false;
    await deleteBookingCalendarHold({ calendarId: input.calendarId, eventId: input.eventId });
    return true;
  });

  const waiting = await db().collection("orders")
    .where("source", "==", HEADSHOTS_ORDER_SOURCE)
    .where("status", "==", "awaiting_deposit")
    .get();

  for (const snap of waiting.docs) {
    const listed = snap.data() || {};
    if (!headshotHoldExpired(listed, now)) continue;
    result.checked += 1;
    const ref = db().collection("orders").doc(snap.id);
    const expired = await db().runTransaction(async (tx) => {
      const orderSnap = await tx.get(ref);
      if (!orderSnap.exists) return null;
      const order = orderSnap.data() || {};
      if (!headshotHoldExpired(order, now)) return null;
      const invoiceId = typeof order.invoiceId === "string" ? order.invoiceId : "";
      const invoiceRef = invoiceId ? db().collection("invoices").doc(invoiceId) : null;
      const invoiceSnap = invoiceRef ? await tx.get(invoiceRef) : null;
      const invoice = invoiceSnap?.exists ? invoiceSnap.data() || {} : {};
      if ((Number(invoice.depositPaid) || 0) > 0 || invoice.depositPaidAt) return null;
      const requestId = typeof order.orderRequestId === "string" ? order.orderRequestId : "";
      const requestRef = requestId ? db().collection("orderRequests").doc(requestId) : null;
      const requestSnap = requestRef ? await tx.get(requestRef) : null;
      const stamp = admin.firestore.FieldValue.serverTimestamp();
      const note = `Hold released: the $10 booking fee was not paid within ${HEADSHOTS_HOLD_MINUTES} minutes.`;
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
    result.released += 1;
    await releaseEvent(ref, expired, deleteEvent, result);
  }
  return result;
}

let lastLazyRun = 0;
let lazyRunning: Promise<unknown> | null = null;
const LAZY_INTERVAL_MS = 60 * 1000;
const LAZY_TIMEOUT_MS = 4000;

export async function maybeReleaseExpiredHeadshotHolds(now = new Date()): Promise<void> {
  if (lazyRunning) {
    await Promise.race([lazyRunning, new Promise((resolve) => setTimeout(resolve, LAZY_TIMEOUT_MS))]);
    return;
  }
  if (now.getTime() - lastLazyRun < LAZY_INTERVAL_MS) return;
  lastLazyRun = now.getTime();
  lazyRunning = releaseExpiredHeadshotHolds({ now })
    .catch((error) => console.error("[HeadshotHolds] Lazy release failed:", error))
    .finally(() => {
      lazyRunning = null;
    });
  await Promise.race([lazyRunning, new Promise((resolve) => setTimeout(resolve, LAZY_TIMEOUT_MS))]);
}

export function resetHeadshotHoldThrottle() {
  lastLazyRun = 0;
  lazyRunning = null;
}

export async function confirmHeadshotHold(input: {
  calendarId?: string | null;
  eventId: string;
}): Promise<boolean> {
  if (!input.calendarId || !input.eventId) return false;
  return confirmBookingCalendarHold({
    calendarId: input.calendarId,
    eventId: input.eventId,
    summaryPrefix: HEADSHOTS_HOLD_PREFIX,
    unpaidNote: HEADSHOTS_UNPAID_NOTE,
    paidNote: HEADSHOTS_PAID_NOTE,
  });
}

/**
 * The $10 landed after the hold expired. Rebook when the time is still open.
 * Otherwise flag the office. Never contacts the client.
 */
export async function resolveLateHeadshotPayment(orderId: string): Promise<"confirmed" | "flagged" | "skipped"> {
  const ref = db().collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return "skipped";
  const order = snap.data() || {};
  if (order.source !== HEADSHOTS_ORDER_SOURCE || order.status !== APPRENTICESHIP_EXPIRED_STATUS) return "skipped";
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const requestId = typeof order.orderRequestId === "string" ? order.orderRequestId : "";
  const requestRef = requestId ? db().collection("orderRequests").doc(requestId) : null;
  const orderNumber = String(order.orderNumber || "");
  const slotStart = typeof order.slotStart === "string" ? order.slotStart : "";
  const quantity = Number(order.quantity) || 1;

  const confirm = async (extra: Record<string, unknown>) => {
    await ref.update({
      status: "confirmed",
      depositStatus: "paid",
      confirmedAt: stamp,
      reconfirmedAfterExpiry: true,
      officeNote: "$10 booking fee paid after the hold expired. The time was still open and is booked again.",
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
    const availability = await readHeadshotAvailability();
    const open = availability.live
      ? publishHeadshotSlots(availability.slots, quantity).find((item) => item.start === slotStart)
      : undefined;
    if (!availability.live) flagReason = "the studio calendar could not be read";
    if (open) {
      const event = await createBookingCalendarHold({
        photographerId: open.photographerId,
        orderNumber,
        clientName: String(order.clientName || ""),
        clientEmail: String(order.clientEmail || ""),
        clientPhone: String(order.clientPhone || ""),
        address: HEADSHOTS_STUDIO_ADDRESS,
        serviceSummary: "Tuesday headshot",
        slot: { start: open.start, end: open.end },
        notes: HEADSHOTS_PAID_NOTE,
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
    console.error("[HeadshotHolds] Late payment re-confirm failed:", error);
    flagReason = "the studio calendar could not be read";
  }

  const note = `$10 booking fee paid after the ${HEADSHOTS_HOLD_MINUTES}-minute hold expired, but ${flagReason}. Call to pick a new time or refund the $10.`;
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
  return "flagged";
}
