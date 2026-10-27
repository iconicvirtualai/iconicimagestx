/**
 * $10 Tuesday headshot bookings.
 *
 * Uses the /book photographer calendars and the Square deposit checkout the
 * apprentice $25 fee uses. The charge today is $10.28 (the $10 booking fee
 * plus 2.8%). The rest is due on delivery. Client email and SMS stay off
 * unless client notifications are live. CLIENT_NOTIFY_LIVE and
 * BOOKING_NOTIFY_LIVE are left unset, so nothing is sent.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { APPRENTICESHIP_AWAITING_DEPOSIT_STATUS } from "../../shared/apprenticeship";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import { buildBookingInvoiceDraft } from "../../shared/bookingInvoice";
import {
  HEADSHOT_PATHS,
  HEADSHOTS_CALENDAR_FALLBACK,
  HEADSHOTS_HOLD_PREFIX,
  HEADSHOTS_LEAD_SOURCE,
  HEADSHOTS_ORDER_SOURCE,
  HEADSHOTS_STUDIO_ADDRESS,
  HEADSHOTS_UNPAID_NOTE,
  headshotClientMailEnabled,
  headshotConfig,
  headshotConfirmationEmailHtml,
  headshotHoldExpiresAt,
  headshotLineItems,
  parseHeadshotOrder,
  publishHeadshotSlots,
  quoteHeadshots,
} from "../../shared/headshots10";
import { createPayToken } from "../../shared/invoicePay";
import { processingEnabled } from "../../shared/invoiceProcessing";
import { nextSequentialInvoiceNumber } from "../../shared/orderProjectInvoice";
import { publicClientUrl } from "../../shared/publicSiteUrl";
import { seniorDepositCheckoutLive } from "../../shared/seniorLiving";
import { storedServiceLocationFields } from "../../shared/serviceLocation";
import { applyServerTravel } from "../../shared/travelZones";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { createBookingCalendarHold, deleteBookingCalendarHold, readHeadshotAvailability } from "../services/bookingAvailability";
import { sendEmail } from "../services/email";
import { maybeReleaseExpiredHeadshotHolds } from "../services/headshotHolds";
import { nextOrderNumber } from "../services/orderNumbers";

const router = Router();
const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const db = () => admin.firestore();

export function resetHeadshotRateLimit() {
  limiter.reset();
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const snapshot = await db()
      .collection("invoices")
      .where("invoiceNumber", ">=", `INV-${year}-`)
      .where("invoiceNumber", "<", `INV-${year + 1}`)
      .get();
    return nextSequentialInvoiceNumber(snapshot.docs.map((entry) => entry.data().invoiceNumber), year);
  } catch (error) {
    console.error("[Headshots] Invoice number lookup failed:", error);
    return `INV-${year}-${String(Date.now()).slice(-6)}`;
  }
}

router.get("/config", (_req, res) => {
  const config = headshotConfig(process.env);
  res.json({
    ...config,
    unitPrice: 10,
    bookingFee: 10,
    processingEnabled: processingEnabled(),
    depositCheckoutLive: seniorDepositCheckoutLive(),
    holdMinutes: 60,
  });
});

router.get("/slots", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const config = headshotConfig(process.env);
  const quantity = Number(req.query.quantity);
  await maybeReleaseExpiredHeadshotHolds();
  try {
    const availability = await readHeadshotAvailability();
    const slots = availability.live
      ? publishHeadshotSlots(availability.slots, Number.isFinite(quantity) ? quantity : 1, config)
      : [];
    return res.json({
      live: availability.live,
      durationMinutes: availability.durationMinutes,
      slots,
      fallback: availability.live ? null : HEADSHOTS_CALENDAR_FALLBACK,
      ...config,
    });
  } catch (error) {
    console.error("[Headshots] Slot lookup failed:", error);
    return res.json({
      live: false,
      durationMinutes: 10,
      slots: [],
      fallback: HEADSHOTS_CALENDAR_FALLBACK,
      ...config,
    });
  }
});

router.post("/order", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many booking requests. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const config = headshotConfig(process.env);
  const parsed = parseHeadshotOrder(req.body, { maxQuantity: config.maxQuantity });
  if (parsed.ok === false) {
    if (parsed.honeypot === true) return res.json({ success: true });
    return res.status(400).json({ error: parsed.error });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: `Orders are not available on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const { value } = parsed;
  const applyProcessing = processingEnabled();
  const quote = quoteHeadshots(value.quantity, applyProcessing, config.maxQuantity);
  await maybeReleaseExpiredHeadshotHolds();
  const availability = await readHeadshotAvailability();
  if (!availability.live) {
    return res.status(503).json({ error: HEADSHOTS_CALENDAR_FALLBACK });
  }
  const slot = publishHeadshotSlots(availability.slots, quote.quantity, config)
    .find((item) => item.start === value.slotStart) || null;
  if (!slot) {
    return res.status(409).json({ error: "That time was just taken. Pick another open time." });
  }

  let orderNumber = "";
  try {
    orderNumber = await nextOrderNumber();
  } catch (error) {
    console.error("[Headshots] Order number failed:", error);
    return res.status(500).json({
      error: `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const clientName = `${value.firstName} ${value.lastName}`.trim();
  let calendarEvent: { calendarId: string; eventId: string | null; htmlLink: string | null } | null = null;
  try {
    calendarEvent = await createBookingCalendarHold({
      photographerId: slot.photographerId,
      orderNumber,
      clientName,
      clientEmail: value.email,
      clientPhone: value.phone,
      address: HEADSHOTS_STUDIO_ADDRESS,
      serviceSummary: `${quote.quantity} Tuesday headshot${quote.quantity === 1 ? "" : "s"}`,
      slot: { start: slot.start, end: slot.end },
      summaryPrefix: HEADSHOTS_HOLD_PREFIX,
      notes: [
        HEADSHOTS_UNPAID_NOTE,
        quote.dueTodayLine,
        quote.balanceLine || "Paid in full once the booking fee is received.",
        `Quantity: ${quote.quantity}`,
      ].join("\n"),
    });
    if (!calendarEvent?.eventId) {
      return res.status(503).json({ error: HEADSHOTS_CALENDAR_FALLBACK });
    }
  } catch (error) {
    console.error("[Headshots] Calendar hold failed:", error);
    return res.status(503).json({ error: HEADSHOTS_CALENDAR_FALLBACK });
  }

  const traveled = applyServerTravel(headshotLineItems(quote.quantity, config.maxQuantity), HEADSHOTS_STUDIO_ADDRESS);
  const draft = buildBookingInvoiceDraft({
    lineItems: traveled.lineItems,
    total: traveled.total,
    pricing: { subtotal: traveled.total, tax: 0 },
    clientEmail: value.email,
    clientName,
    travel: traveled.travel,
    applyProcessing,
  });
  const location = storedServiceLocationFields(HEADSHOTS_STUDIO_ADDRESS);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const holdExpiresAt = headshotHoldExpiresAt(new Date());
  const note = [
    quote.dueTodayLine,
    quote.balanceLine || "Nothing due on delivery.",
    "The $10 booking fee counts toward the headshots.",
    "Not confirmed until the booking fee is paid.",
  ].join("\n");
  const pageUrl = publicClientUrl(HEADSHOT_PATHS.home);
  const wearUrl = publicClientUrl(HEADSHOT_PATHS.how);
  const confirmationEmailHtml = headshotConfirmationEmailHtml({
    clientName,
    whenDate: slot.date,
    whenTime: slot.time,
    quantity: quote.quantity,
    quote,
    orderNumber,
    pageUrl,
    wearUrl,
  });

  try {
    const requestRef = await db().collection("orderRequests").add({
      firstName: value.firstName,
      lastName: value.lastName,
      clientName,
      email: value.email,
      clientEmail: value.email,
      phone: value.phone,
      clientPhone: value.phone,
      address: location.address,
      ...location,
      lineItems: draft.lineItems,
      services: draft.lineItems,
      quantity: quote.quantity,
      subtotal: draft.subtotal,
      processing: draft.processing,
      processingPolicy: draft.processingPolicy,
      total: draft.total,
      pricing: { subtotal: draft.subtotal, tax: 0, processing: draft.processing, total: draft.total },
      depositRequired: true,
      depositAmount: quote.dueToday,
      depositPaid: 0,
      depositStatus: "awaiting",
      balanceDue: quote.balanceTotal,
      dueToday: quote.dueToday,
      slotStart: slot.start,
      slotEnd: slot.end,
      holdExpiresAt,
      scheduledDate: slot.date,
      scheduledTime: slot.time,
      bookingPhotographerId: slot.photographerId,
      notes: note,
      vibeNote: note,
      confirmationEmailHtml,
      confirmationEmailStatus: "disabled",
      status: "new",
      source: HEADSHOTS_ORDER_SOURCE,
      leadSource: HEADSHOTS_LEAD_SOURCE,
      ...(value.gclid ? { gclid: value.gclid } : {}),
      orderNumber,
      calendarEventId: calendarEvent.eventId,
      calendarId: calendarEvent.calendarId,
      createdAt: now,
      submittedAt: now,
      updatedAt: now,
    });

    const orderRef = await db().collection("orders").add({
      orderRequestId: requestRef.id,
      clientName,
      clientEmail: value.email,
      clientPhone: value.phone,
      address: location.address,
      lineItems: draft.lineItems,
      services: draft.lineItems,
      quantity: quote.quantity,
      subtotal: draft.subtotal,
      processing: draft.processing,
      pricing: { subtotal: draft.subtotal, tax: 0, processing: draft.processing, total: draft.total },
      total: draft.total,
      depositRequired: true,
      depositAmount: quote.dueToday,
      depositPaid: 0,
      depositStatus: "awaiting",
      balanceDue: quote.balanceTotal,
      dueToday: quote.dueToday,
      slotStart: slot.start,
      slotEnd: slot.end,
      holdExpiresAt,
      scheduledDate: slot.date,
      scheduledTime: slot.time,
      bookingPhotographerId: slot.photographerId,
      notes: note,
      status: APPRENTICESHIP_AWAITING_DEPOSIT_STATUS,
      source: HEADSHOTS_ORDER_SOURCE,
      leadSource: HEADSHOTS_LEAD_SOURCE,
      orderNumber,
      calendarEventId: calendarEvent.eventId,
      calendarId: calendarEvent.calendarId,
      createdAt: now,
      updatedAt: now,
    });

    const invoiceRef = db().collection("invoices").doc();
    const payToken = createPayToken();
    const invoiceNumber = await nextInvoiceNumber();
    await invoiceRef.set({
      ...draft,
      orderId: orderRef.id,
      orderRequestId: requestRef.id,
      source: HEADSHOTS_ORDER_SOURCE,
      clientName,
      clientEmail: value.email,
      clientPhone: value.phone,
      address: location.address,
      depositRequired: true,
      depositAmount: quote.dueToday,
      depositPaid: 0,
      depositReturn: "headshots-10",
      payToken,
      invoiceNumber,
      orderNumber,
      notes: note,
      status: "draft",
      paymentProvider: "square",
      createdAt: now,
      updatedAt: now,
    });

    const stamp = admin.firestore.FieldValue.serverTimestamp();
    await Promise.all([
      orderRef.update({ invoiceId: invoiceRef.id, updatedAt: stamp }),
      requestRef.update({
        invoiceId: invoiceRef.id,
        convertedToOrderId: orderRef.id,
        updatedAt: stamp,
      }),
    ]);

    let confirmationEmailStatus: "disabled" | "sent" | "failed" = "disabled";
    if (headshotClientMailEnabled()) {
      confirmationEmailStatus = await sendEmail({
        to: value.email,
        template: "headshot_booking",
        subject: `Your Tuesday headshot time ${orderNumber}`,
        html: confirmationEmailHtml,
        lockHtml: true,
        variables: { clientName, orderNumber },
      }).then((result) => (result.sent ? "sent" as const : "failed" as const)).catch((error) => {
        console.error("[Headshots] Confirmation email failed:", error);
        return "failed" as const;
      });
      await requestRef.update({ confirmationEmailStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
    }

    const checkoutLive = seniorDepositCheckoutLive();
    return res.status(201).json({
      success: true,
      orderId: orderRef.id,
      orderRequestId: requestRef.id,
      orderNumber,
      invoiceId: invoiceRef.id,
      payToken,
      depositAmount: quote.dueToday,
      dueToday: quote.dueToday,
      balanceDue: quote.balanceTotal,
      balanceLine: quote.balanceLine,
      total: draft.total,
      quantity: quote.quantity,
      slotStart: slot.start,
      slotEnd: slot.end,
      slotDate: slot.date,
      slotTime: slot.time,
      checkoutReady: checkoutLive,
      status: APPRENTICESHIP_AWAITING_DEPOSIT_STATUS,
      holdExpiresAt,
      confirmationEmailStatus,
    });
  } catch (error) {
    console.error("[Headshots] Order failed:", error);
    if (calendarEvent?.eventId) {
      await deleteBookingCalendarHold({
        calendarId: calendarEvent.calendarId,
        eventId: calendarEvent.eventId,
      }).catch((deleteError) => console.error("[Headshots] Calendar hold cleanup failed:", deleteError));
    }
    return res.status(500).json({
      error: `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
});

export default router;
