/**
 * Public RSVP for Thankful for You Always.
 * Saves the booking even when the photos@ calendar hold fails.
 * Does not email or text the client.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { LEGAL_BUSINESS_NAME } from "../../shared/businessContact";
import {
  THANKFUL_BUFFER_MINUTES,
  THANKFUL_EVENT_DAY,
  THANKFUL_EVENT_SOURCE,
  THANKFUL_EVENT_TITLE,
  THANKFUL_PHONE_DISPLAY,
  THANKFUL_SLOT_MINUTES,
  THANKFUL_STUDIO_ADDRESS,
  THANKFUL_WHEN_LABEL,
  openThankfulSlots,
  parseThankfulRsvp,
  type ThankfulSlot,
} from "../../shared/thankfulEvent";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import {
  createThankfulCalendarHold,
  deleteThankfulCalendarHold,
  listThankfulBusy,
} from "../services/thankfulCalendar";
import { nextOrderNumber } from "../services/orderNumbers";

const router = Router();
const db = () => admin.firestore();

const limiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
});

export function resetThankfulRateLimit() {
  limiter.reset();
}

function calendarHoldFailureMessage(err: unknown): string {
  const message = err instanceof Error
    ? err.message
    : err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";
  return (message || "Calendar hold failed.").slice(0, 300);
}

function failedCalendarHoldNote(slot: ThankfulSlot): string {
  return `Calendar hold failed for Studio 105 at ${slot.label}. Add it to the calendar manually.`;
}

router.get("/slots", async (_req, res) => {
  const now = new Date();
  const read = await listThankfulBusy();
  return res.json({
    live: read.ok,
    date: THANKFUL_EVENT_DAY,
    durationMinutes: THANKFUL_SLOT_MINUTES,
    bufferMinutes: THANKFUL_BUFFER_MINUTES,
    windowLabel: THANKFUL_WHEN_LABEL,
    slots: read.ok ? openThankfulSlots({ now, busy: read.busy }) : [],
  });
});

router.post("/", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many requests. Please wait and try again, or call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  const parsed = parseThankfulRsvp(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot === true) return res.json({ success: true });
    return res.status(400).json({ error: parsed.error });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: `RSVPs are not available on this server yet. Please call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  const now = new Date();
  const read = await listThankfulBusy();
  const open = openThankfulSlots({ now, busy: read.ok ? read.busy : [] });
  const slot = open.find((item) => item.start === parsed.value.slotStart) || null;
  if (!slot) {
    return res.status(read.ok ? 409 : 400).json({
      error: read.ok
        ? "That time was just taken. Pick another open time."
        : "Choose a photo time.",
    });
  }

  const { value } = parsed;
  const nameParts = value.name.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || value.name;
  const lastName = nameParts.slice(1).join(" ");

  let orderNumber = "";
  try {
    orderNumber = await nextOrderNumber();
  } catch (error) {
    console.error("[Thankful] Order number failed:", error);
    return res.status(500).json({
      error: `We could not save that RSVP. Please call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  let calendarHold: { calendarId: string; eventId: string | null; htmlLink: string | null } | null = null;
  let calendarHoldError: string | null = null;
  try {
    calendarHold = await createThankfulCalendarHold({
      orderNumber,
      clientName: value.name,
      clientEmail: value.email,
      clientPhone: value.phone,
      partySize: value.partySize,
      menuName: value.menuName,
      santa: value.santa,
      notes: value.notes,
      slot,
    });
  } catch (err) {
    console.error("[Thankful] Calendar hold failed:", err);
    calendarHold = null;
    calendarHoldError = calendarHoldFailureMessage(err);
  }
  if (!calendarHoldError && !calendarHold?.eventId) {
    calendarHoldError = "Calendar returned no event id.";
    console.error("[Thankful] Calendar hold failed:", calendarHoldError);
  }

  const orderRequest = {
    firstName,
    lastName,
    name: value.name,
    clientName: value.name,
    email: value.email,
    phone: value.phone,
    partySize: value.partySize,
    menuVote: value.menuVote,
    menuName: value.menuName,
    menuDishes: value.menuDishes,
    santa: value.santa,
    notes: value.notes,
    vibeNote: value.notes,
    address: THANKFUL_STUDIO_ADDRESS,
    eventTitle: THANKFUL_EVENT_TITLE,
    eventDate: THANKFUL_EVENT_DAY,
    eventWhen: THANKFUL_WHEN_LABEL,
    scheduledDate: slot.date,
    scheduledTime: slot.time,
    slotStart: slot.start,
    slotEnd: slot.end,
    appointmentDuration: THANKFUL_SLOT_MINUTES,
    calendarEventId: calendarHold?.eventId || null,
    calendarId: calendarHold?.calendarId || null,
    calendarHtmlLink: calendarHold?.htmlLink || null,
    calendarHold: calendarHold?.eventId ? "held" : "failed",
    calendarHoldError,
    officeFlag: calendarHoldError ? "calendar_hold_failed" : null,
    officeNote: calendarHoldError ? failedCalendarHoldNote(slot) : null,
    lineItems: [
      {
        id: "thankful-2026",
        name: "Thankful for You Always photo time",
        price: 0,
        quantity: 1,
      },
    ],
    total: 0,
    status: "new",
    source: THANKFUL_EVENT_SOURCE,
    legalName: LEGAL_BUSINESS_NAME,
    orderNumber,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  let docRef: { id: string };
  try {
    docRef = await db().collection("orderRequests").add(orderRequest);
  } catch (error) {
    console.error("[Thankful] Save failed:", error);
    if (calendarHold?.eventId) {
      await deleteThankfulCalendarHold({
        calendarId: calendarHold.calendarId,
        eventId: calendarHold.eventId,
      }).catch((deleteErr) => console.error("[Thankful] Calendar hold cleanup failed:", deleteErr));
    }
    return res.status(500).json({
      error: `We could not save that RSVP. Please call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  return res.status(201).json({
    success: true,
    requestId: docRef.id,
    orderNumber,
  });
});

export default router;
