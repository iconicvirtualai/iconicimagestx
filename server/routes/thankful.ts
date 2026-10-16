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
  THANKFUL_ALREADY_VOTED_ERROR,
  THANKFUL_RSVP_CLOSED_ERROR,
  THANKFUL_RSVP_CLOSES_LABEL,
  THANKFUL_SLOT_MINUTES,
  THANKFUL_SOCIAL_CLOSED_ERROR,
  THANKFUL_SOCIAL_SOURCE,
  THANKFUL_STUDIO_ADDRESS,
  THANKFUL_WHEN_LABEL,
  openThankfulSlots,
  parseThankfulCheckout,
  parseThankfulRsvp,
  thankfulRsvpOpen,
  thankfulSocialOfferOpen,
  type ThankfulSlot,
} from "../../shared/thankfulEvent";
import { createPayToken } from "../../shared/invoicePay";
import { computeInvoiceTotals, processingEnabled } from "../../shared/invoiceProcessing";
import { nextSequentialInvoiceNumber } from "../../shared/orderProjectInvoice";
import { squareConfigured } from "../../shared/squareInvoice";
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
const MENU_VOTES = "thankfulMenuVotes";

function menuVoteRef(email: string) {
  return db().collection(MENU_VOTES).doc(email);
}

const limiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
});

const checkoutLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
});

export function resetThankfulRateLimit() {
  limiter.reset();
  checkoutLimiter.reset();
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
  const closed = !thankfulRsvpOpen(now);
  const read = closed ? { ok: false, busy: [] } : await listThankfulBusy();
  return res.json({
    live: !closed && read.ok,
    closed,
    closesLabel: THANKFUL_RSVP_CLOSES_LABEL,
    date: THANKFUL_EVENT_DAY,
    durationMinutes: THANKFUL_SLOT_MINUTES,
    bufferMinutes: THANKFUL_BUFFER_MINUTES,
    windowLabel: THANKFUL_WHEN_LABEL,
    socialOpen: thankfulSocialOfferOpen(now),
    slots: !closed && read.ok ? openThankfulSlots({ now, busy: read.busy }) : [],
  });
});

async function nextThankfulInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const snapshot = await db()
      .collection("invoices")
      .where("invoiceNumber", ">=", `INV-${year}-`)
      .where("invoiceNumber", "<", `INV-${year + 1}`)
      .get();
    return nextSequentialInvoiceNumber(
      snapshot.docs.map((entry) => entry.data().invoiceNumber),
      year,
    );
  } catch (error) {
    console.error("[Thankful] Invoice number lookup failed:", error);
    return `INV-${year}-${String(Date.now()).slice(-6)}`;
  }
}

router.post("/checkout", async (req, res) => {
  const limit = checkoutLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many requests. Please wait and try again, or call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  const parsed = parseThankfulCheckout(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot === true) return res.json({ success: true });
    return res.status(400).json({ error: parsed.error });
  }
  if (!thankfulSocialOfferOpen(new Date())) {
    return res.status(403).json({ error: THANKFUL_SOCIAL_CLOSED_ERROR });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: `Checkout is not available on this server yet. Please call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  const { value } = parsed;
  const { quote } = value;
  const subtotal = quote.subtotalCents / 100;
  const totals = computeInvoiceTotals({
    subtotal,
    applyProcessing: processingEnabled(),
  });
  const nameParts = value.name.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || value.name;
  const lastName = nameParts.slice(1).join(" ");
  const lineName = `${quote.packageName} · ${quote.termLabel} · pre-event`;
  const lineItems = [{ id: `thankful-${quote.packageId}-${quote.termId}`, name: lineName, price: subtotal, quantity: 1 }];
  const now = admin.firestore.FieldValue.serverTimestamp();

  let orderNumber = "";
  try {
    orderNumber = await nextOrderNumber();
  } catch (error) {
    console.error("[Thankful] Order number failed:", error);
    return res.status(500).json({
      error: `We could not start checkout. Please call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  try {
    const requestRef = await db().collection("orderRequests").add({
      firstName,
      lastName,
      name: value.name,
      clientName: value.name,
      email: value.email,
      clientEmail: value.email,
      phone: value.phone,
      clientPhone: value.phone,
      lineItems,
      services: lineItems,
      subtotal: totals.subtotal,
      processing: totals.processing,
      processingPolicy: totals.processing > 0 ? "included" : "waived",
      total: totals.total,
      pricing: { subtotal: totals.subtotal, tax: 0, processing: totals.processing, total: totals.total },
      packageName: quote.packageName,
      socialTerm: quote.termId,
      socialTermLabel: quote.termLabel,
      regularMonthlyCents: quote.regularMonthlyCents,
      saleMonthlyCents: quote.saleMonthlyCents,
      status: "new",
      source: THANKFUL_SOCIAL_SOURCE,
      legalName: LEGAL_BUSINESS_NAME,
      orderNumber,
      createdAt: now,
      submittedAt: now,
      updatedAt: now,
    });

    const orderRef = await db().collection("orders").add({
      orderRequestId: requestRef.id,
      clientName: value.name,
      clientEmail: value.email,
      clientPhone: value.phone,
      lineItems,
      services: lineItems,
      subtotal: totals.subtotal,
      processing: totals.processing,
      pricing: { subtotal: totals.subtotal, tax: 0, processing: totals.processing, total: totals.total },
      total: totals.total,
      packageName: quote.packageName,
      socialTerm: quote.termId,
      status: "confirmed",
      source: THANKFUL_SOCIAL_SOURCE,
      orderNumber,
      createdAt: now,
      updatedAt: now,
    });

    const invoiceRef = db().collection("invoices").doc();
    const payToken = createPayToken();
    const invoiceNumber = await nextThankfulInvoiceNumber();
    await invoiceRef.set({
      orderId: orderRef.id,
      orderRequestId: requestRef.id,
      source: THANKFUL_SOCIAL_SOURCE,
      clientName: value.name,
      clientEmail: value.email,
      clientPhone: value.phone,
      lineItems,
      subtotal: totals.subtotal,
      tax: 0,
      processing: totals.processing,
      processingPolicy: totals.processing > 0 ? "included" : "waived",
      total: totals.total,
      amountPaid: 0,
      amountDue: totals.total,
      depositRequired: false,
      status: "draft",
      paymentProvider: "square",
      payToken,
      invoiceNumber,
      orderNumber,
      packageName: quote.packageName,
      socialTerm: quote.termId,
      notes: lineName,
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all([
      orderRef.update({ invoiceId: invoiceRef.id, updatedAt: now }),
      requestRef.update({ invoiceId: invoiceRef.id, convertedToOrderId: orderRef.id, updatedAt: now }),
    ]);

    return res.status(201).json({
      success: true,
      orderNumber,
      invoiceId: invoiceRef.id,
      payToken,
      total: totals.total,
      checkoutReady: squareConfigured(process.env),
    });
  } catch (error) {
    console.error("[Thankful] Checkout failed:", error);
    return res.status(500).json({
      error: `We could not start checkout. Please call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }
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
  if (!thankfulRsvpOpen(new Date())) {
    return res.status(403).json({ error: THANKFUL_RSVP_CLOSED_ERROR });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: `RSVPs are not available on this server yet. Please call ${THANKFUL_PHONE_DISPLAY}.`,
    });
  }

  const { value } = parsed;
  const voteRef = menuVoteRef(value.email);
  try {
    const prior = await voteRef.get();
    if (prior.exists) {
      return res.status(409).json({ error: THANKFUL_ALREADY_VOTED_ERROR, alreadyVoted: true });
    }
  } catch (error) {
    console.error("[Thankful] Menu vote lookup failed:", error);
    return res.status(500).json({
      error: `We could not save that RSVP. Please call ${THANKFUL_PHONE_DISPLAY}.`,
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

  const requestRef = db().collection("orderRequests").doc();
  let duplicateVote = false;
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(voteRef);
      if (snap.exists) {
        duplicateVote = true;
        return;
      }
      tx.set(requestRef, orderRequest);
      tx.set(voteRef, {
        email: value.email,
        menuVote: value.menuVote,
        menuName: value.menuName,
        orderNumber,
        requestId: requestRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
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
  if (duplicateVote) {
    if (calendarHold?.eventId) {
      await deleteThankfulCalendarHold({
        calendarId: calendarHold.calendarId,
        eventId: calendarHold.eventId,
      }).catch((deleteErr) => console.error("[Thankful] Calendar hold cleanup failed:", deleteErr));
    }
    return res.status(409).json({ error: THANKFUL_ALREADY_VOTED_ERROR, alreadyVoted: true });
  }

  return res.status(201).json({
    success: true,
    requestId: requestRef.id,
    orderNumber,
  });
});

export default router;
