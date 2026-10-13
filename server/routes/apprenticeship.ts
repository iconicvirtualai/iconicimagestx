/**
 * Public apprenticeship landing.
 * Orders use the same #NNN counter and orderRequests flow as /book.
 * The $25 booking fee is a deposit on the existing Square checkout.
 */

import { Router } from "express";
import admin from "firebase-admin";
import {
  APPRENTICESHIP_BALANCE_LINE,
  APPRENTICESHIP_BOOKING_FEE,
  APPRENTICESHIP_BOOKING_FEE_LINE,
  APPRENTICESHIP_CALENDAR_FALLBACK,
  APPRENTICESHIP_ORDER_SOURCE,
  apprenticeshipHoursFromEnv,
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

router.get("/slots", async (req, res) => {
  const packageId = typeof req.query.package === "string" ? req.query.package : "apprentice-25";
  if (!findApprenticeshipPackage(packageId)) {
    return res.status(400).json({ error: "Choose an apprenticeship package." });
  }
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
  const checkoutLive = seniorDepositCheckoutLive();
  const note = [
    APPRENTICESHIP_BOOKING_FEE_LINE,
    APPRENTICESHIP_BALANCE_LINE,
    value.preferredTime ? `Preferred time: ${value.preferredTime}` : "",
    pkg?.appointmentLimit || "",
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
      balanceDue: quote.total,
      scheduledDate: slot?.date || null,
      scheduledTime: slot?.time || value.preferredTime || null,
      notes: note,
      vibeNote: note,
      status: "new",
      source: APPRENTICESHIP_ORDER_SOURCE,
      leadSource: "Apprenticeship page",
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
      balanceDue: quote.total,
      scheduledDate: slot?.date || null,
      scheduledTime: slot?.time || value.preferredTime || null,
      notes: note,
      status: "confirmed",
      source: APPRENTICESHIP_ORDER_SOURCE,
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
          leadSource: "Apprenticeship page",
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
    });
  } catch (error) {
    console.error("[Apprenticeship] Order failed:", error);
    return res.status(500).json({
      error: `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
});

export default router;
