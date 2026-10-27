/**
 * Public apprenticeship landing.
 * Orders use the same #NNN counter and orderRequests flow as /book.
 * The $25 booking fee is a deposit on the existing Square checkout.
 */

import { Router } from "express";
import admin from "firebase-admin";
import {
  APPRENTICESHIP_AWAITING_DEPOSIT_STATUS,
  APPRENTICESHIP_BALANCE_LINE,
  APPRENTICESHIP_BOOKING_FEE,
  APPRENTICESHIP_BOOKING_FEE_LINE,
  APPRENTICESHIP_CALENDAR_FALLBACK,
  APPRENTICESHIP_ORDER_SOURCE,
  APPRENTICESHIP_DEPOSIT_REQUIRED_LINE,
  apprenticeshipHoldExpiresAt,
  apprenticeshipHoursFromEnv,
  apprenticeshipLeadSource,
  findApprenticeshipPackage,
  parseApprenticeshipOrder,
  quoteApprenticeship,
} from "../../shared/apprenticeship";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import { createPayToken } from "../../shared/invoicePay";
import { processingEnabled } from "../../shared/invoiceProcessing";
import { nextSequentialInvoiceNumber } from "../../shared/orderProjectInvoice";
import { seniorDepositCheckoutLive } from "../../shared/seniorLiving";
import { storedServiceLocationFields } from "../../shared/serviceLocation";
import { packagesForStaffEditor } from "../../shared/bookingCatalog";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import {
  createApprenticeshipEvent,
  readApprenticeshipAvailability,
} from "../services/apprenticeshipCalendar";
import { notifyOfficeOfOrder } from "../services/officeOrderNotify";
import {
  maybeReleaseExpiredApprenticeshipHolds,
  releaseExpiredApprenticeshipHolds,
} from "../services/apprenticeshipHolds";
import { releaseExpiredHeadshotHolds } from "../services/headshotHolds";
import { nextOrderNumber } from "../services/orderNumbers";

const router = Router();

const limiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

export function resetApprenticeshipRateLimit() {
  limiter.reset();
}

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

const db = () => admin.firestore();

async function loadCatalog() {
  try {
    const snapshot = await db().collection("packages").get();
    return packagesForStaffEditor(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  } catch (error) {
    console.error("[Apprenticeship] Catalog read failed — using the seeded catalog", error);
    return packagesForStaffEditor([]);
  }
}

async function nextInvoiceNumber(): Promise<string> {
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
    console.error("[Apprenticeship] Invoice number lookup failed:", error);
    return `INV-${year}-${String(Date.now()).slice(-6)}`;
  }
}

function publicAvailability(result: Awaited<ReturnType<typeof readApprenticeshipAvailability>>, packageId: string) {
  return {
    available: result.available,
    packageId,
    durationMinutes: result.durationMinutes,
    slots: result.available ? result.slots : [],
    fallback: result.available ? null : APPRENTICESHIP_CALENDAR_FALLBACK,
  };
}

router.get("/config", (_req, res) => {
  res.json({ depositCheckoutLive: seniorDepositCheckoutLive() });
});

function cronAuthorized(req: { headers: Record<string, string | string[] | undefined> }) {
  const secret = typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

/** Vercel cron (and manual staff/ops runs with the cron secret): release unpaid holds. */
async function releaseHolds(req: { headers: Record<string, string | string[] | undefined> }, res: import("express").Response) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await releaseExpiredApprenticeshipHolds();
    const headshots = await releaseExpiredHeadshotHolds();
    return res.json({ ok: true, ...result, headshots });
  } catch (error) {
    console.error("[Apprenticeship] Hold release failed:", error);
    return res.status(500).json({ error: "Hold release failed." });
  }
}
router.get("/release-holds", releaseHolds);
router.post("/release-holds", releaseHolds);

router.get("/slots", async (req, res) => {
  const packageId = typeof req.query.package === "string" ? req.query.package : "apprentice-25";
  if (!findApprenticeshipPackage(packageId)) {
    return res.status(400).json({ error: "Choose an apprenticeship package." });
  }
  // Expired unpaid HOLDs are deleted first so their slots show as open.
  await maybeReleaseExpiredApprenticeshipHolds();
  const result = await readApprenticeshipAvailability({ packageId });
  return res.json(publicAvailability(result, packageId));
});

router.get("/setup", requireStaff, async (_req: AuthenticatedRequest, res) => {
  const hours = apprenticeshipHoursFromEnv();
  const result = await readApprenticeshipAvailability({ packageId: "apprentice-25" });
  return res.json({
    reachable: result.available,
    calendarId: result.calendarId,
    serviceAccountEmail: result.serviceAccountEmail,
    setupNote: result.setupNote,
    hours: {
      timeZone: hours.timeZone,
      startMinutes: hours.startMinutes,
      endMinutes: hours.endMinutes,
      days: hours.days,
    },
  });
});

router.post("/order", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many requests. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const parsed = parseApprenticeshipOrder(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot === true) return res.json({ success: true });
    return res.status(400).json({ error: parsed.error });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: `Orders are not available on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
  // Every apprentice booking takes the $25 booking fee online. Without the
  // Square deposit checkout there is no way to collect it, so do not save a
  // booking (or hold a calendar slot) that could never be confirmed.
  const checkoutLive = seniorDepositCheckoutLive();
  if (!checkoutLive) {
    return res.status(503).json({
      error: `Online booking is paused. Call ${BUSINESS_CONTACT.phoneDisplay} to book and pay the $25 booking fee.`,
    });
  }

  const catalog = await loadCatalog();
  const quoted = quoteApprenticeship({
    packageId: parsed.value.packageId,
    address: parsed.value.address,
    applyProcessing: processingEnabled(),
    catalog,
  });
  if (quoted.ok === false) return res.status(400).json({ error: quoted.error });
  const { quote } = quoted;
  const pkg = findApprenticeshipPackage(parsed.value.packageId, catalog);
  await maybeReleaseExpiredApprenticeshipHolds();
  const availability = await readApprenticeshipAvailability({ packageId: parsed.value.packageId });
  const slot = parsed.value.slotStart
    ? availability.slots.find((item) => item.start === parsed.value.slotStart) || null
    : null;

  if (parsed.value.slotStart && !availability.available) {
    return res.status(503).json({ error: APPRENTICESHIP_CALENDAR_FALLBACK });
  }
  if (parsed.value.slotStart && !slot) {
    return res.status(409).json({ error: "That time was just taken. Pick another open time." });
  }
  if (!parsed.value.slotStart && availability.available) {
    return res.status(400).json({ error: "Choose an open time." });
  }

  const { value } = parsed;
  const clientName = `${value.firstName} ${value.lastName}`.trim();
  const location = storedServiceLocationFields(value.address);
  let orderNumber = "";
  try {
    orderNumber = await nextOrderNumber();
  } catch (error) {
    console.error("[Apprenticeship] Order number failed:", error);
    return res.status(500).json({
      error: `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  let calendarEvent: { calendarId: string; eventId: string | null; htmlLink: string | null } | null = null;
  if (slot) {
    try {
      calendarEvent = await createApprenticeshipEvent({
        orderNumber,
        clientName,
        clientEmail: value.email,
        clientPhone: value.phone,
        address: value.address,
        packageName: quote.packageName,
        slot,
        notes: value.preferredTime,
        hold: true,
      });
      if (!calendarEvent?.eventId) {
        return res.status(503).json({ error: APPRENTICESHIP_CALENDAR_FALLBACK });
      }
    } catch (error) {
      console.error("[Apprenticeship] Calendar event failed:", error);
      return res.status(503).json({ error: APPRENTICESHIP_CALENDAR_FALLBACK });
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const leadSource = apprenticeshipLeadSource(value.returnPage);
  const holdFields = {
    packageId: value.packageId,
    slotStart: slot?.start || null,
    slotEnd: slot?.end || null,
    holdExpiresAt: apprenticeshipHoldExpiresAt(new Date()),
  };
  const note = [
    APPRENTICESHIP_BOOKING_FEE_LINE,
    "Not confirmed until the $25 booking fee is paid.",
    APPRENTICESHIP_BALANCE_LINE,
    value.preferredTime ? `Preferred time: ${value.preferredTime}` : "",
    pkg?.appointmentLimit || "",
    value.details,
  ].filter(Boolean).join("\n");

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
      lineItems: quote.lineItems,
      services: quote.lineItems,
      selectedBasics: [value.packageId],
      selectedService: null,
      subtotal: quote.subtotal,
      processing: quote.processing,
      processingPolicy: quote.processing > 0 ? "included" : "waived",
      total: quote.total,
      pricing: { subtotal: quote.subtotal, tax: 0, processing: quote.processing, total: quote.total },
      travelZone: quote.travel.travelZone,
      travelMiles: quote.travel.travelMiles,
      travelFeeCents: quote.travel.travelFeeCents,
      travelQuoted: quote.travel.travelQuoted,
      depositRequired: true,
      depositAmount: APPRENTICESHIP_BOOKING_FEE,
      depositPaid: 0,
      depositStatus: "awaiting",
      ...holdFields,
      balanceDue: quote.total,
      scheduledDate: slot?.date || null,
      scheduledTime: slot?.time || value.preferredTime || null,
      notes: note,
      vibeNote: note,
      status: "new",
      source: APPRENTICESHIP_ORDER_SOURCE,
      leadSource,
      ...(value.gclid ? { gclid: value.gclid } : {}),
      orderNumber,
      packageName: quote.packageName,
      calendarEventId: calendarEvent?.eventId || null,
      calendarId: calendarEvent?.calendarId || null,
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
      lineItems: quote.lineItems,
      services: quote.lineItems,
      selectedBasics: [value.packageId],
      selectedService: null,
      subtotal: quote.subtotal,
      processing: quote.processing,
      pricing: { subtotal: quote.subtotal, tax: 0, processing: quote.processing, total: quote.total },
      total: quote.total,
      travelZone: quote.travel.travelZone,
      travelMiles: quote.travel.travelMiles,
      travelFeeCents: quote.travel.travelFeeCents,
      travelQuoted: quote.travel.travelQuoted,
      depositRequired: true,
      depositAmount: APPRENTICESHIP_BOOKING_FEE,
      depositPaid: 0,
      depositStatus: "awaiting",
      ...holdFields,
      balanceDue: quote.total,
      scheduledDate: slot?.date || null,
      scheduledTime: slot?.time || value.preferredTime || null,
      notes: note,
      // Confirmed by the Square deposit webhook once the $25 lands.
      status: APPRENTICESHIP_AWAITING_DEPOSIT_STATUS,
      source: APPRENTICESHIP_ORDER_SOURCE,
      leadSource,
      orderNumber,
      packageName: quote.packageName,
      calendarEventId: calendarEvent?.eventId || null,
      calendarId: calendarEvent?.calendarId || null,
      createdAt: now,
      updatedAt: now,
    });

    const invoiceRef = db().collection("invoices").doc();
    const payToken = createPayToken();
    const invoiceNumber = await nextInvoiceNumber();
    await invoiceRef.set({
      orderId: orderRef.id,
      orderRequestId: requestRef.id,
      source: APPRENTICESHIP_ORDER_SOURCE,
      clientName,
      clientEmail: value.email,
      clientPhone: value.phone,
      address: location.address,
      lineItems: quote.lineItems,
      subtotal: quote.subtotal,
      tax: 0,
      processing: quote.processing,
      processingPolicy: quote.processing > 0 ? "included" : "waived",
      total: quote.total,
      amountPaid: 0,
      amountDue: quote.total,
      depositRequired: true,
      depositAmount: APPRENTICESHIP_BOOKING_FEE,
      depositPaid: 0,
      status: "draft",
      paymentProvider: "square",
      payToken,
      depositReturn: value.returnPage,
      invoiceNumber,
      orderNumber,
      notes: note,
      travelZone: quote.travel.travelZone,
      travelMiles: quote.travel.travelMiles,
      travelFeeCents: quote.travel.travelFeeCents,
      travelQuoted: quote.travel.travelQuoted,
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all([
      orderRef.update({ invoiceId: invoiceRef.id, updatedAt: now }),
      requestRef.update({
        invoiceId: invoiceRef.id,
        convertedToOrderId: orderRef.id,
        updatedAt: now,
      }),
    ]);

    try {
      await notifyOfficeOfOrder({
        isNewOrder: true,
        saved: {
          id: orderRef.id,
          orderNumber,
          clientName,
          email: value.email,
          clientEmail: value.email,
          phone: value.phone,
          clientPhone: value.phone,
          address: value.address,
          propertyAddress: value.address,
          lineItems: quote.lineItems,
          services: quote.lineItems,
          selectedService: quote.packageName,
          packageName: quote.packageName,
          total: quote.total,
          processing: quote.processing,
          source: APPRENTICESHIP_ORDER_SOURCE,
          leadSource,
          notes: note,
          scheduledDate: slot?.date || null,
          scheduledTime: slot?.time || value.preferredTime || null,
        },
        adminUrl: `${appUrl()}/admin/orders`,
      });
    } catch (error) {
      console.error("[Apprenticeship] Office notify failed:", error);
    }

    return res.status(201).json({
      success: true,
      orderId: orderRef.id,
      orderRequestId: requestRef.id,
      orderNumber,
      invoiceId: invoiceRef.id,
      payToken,
      depositAmount: APPRENTICESHIP_BOOKING_FEE,
      total: quote.total,
      balanceDue: quote.balanceDue,
      checkoutReady: checkoutLive,
      status: APPRENTICESHIP_AWAITING_DEPOSIT_STATUS,
      message: APPRENTICESHIP_DEPOSIT_REQUIRED_LINE,
      holdExpiresAt: holdFields.holdExpiresAt,
    });
  } catch (error) {
    console.error("[Apprenticeship] Order failed:", error);
    return res.status(500).json({
      error: `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
});

export default router;
