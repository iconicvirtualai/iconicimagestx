/**
 * POST /api/senior-living
 * Public request for the senior living page.
 * Writes seniorLivingRequests and notifies the office. Does not email the client.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { buildAdminOrderTile } from "../../shared/adminOrderTile";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import { clientNotifyLive } from "../../shared/clientNotify";
import { createPayToken } from "../../shared/invoicePay";
import { nextSequentialInvoiceNumber } from "../../shared/orderProjectInvoice";
import {
  SENIOR_LIVING_DEPOSIT_LINE,
  SENIOR_LIVING_DEPOSIT_PERCENT,
  SENIOR_LIVING_DEPOSIT_REQUIRED,
  SENIOR_LIVING_ORDER_SOURCE,
  SENIOR_LIVING_PROCESSING_LABEL,
  SENIOR_LIVING_REQUESTS,
  parseSeniorLivingOrder,
  parseSeniorLivingRequest,
  seniorLivingOfficeEnv,
  seniorLivingOfficeRecord,
} from "../../shared/seniorLiving";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { sendEmail } from "../services/email";
import { notifyOfficeOfOrder } from "../services/officeOrderNotify";

const router = Router();

export const SENIOR_LIVING_RATE_WINDOW_MS = 15 * 60 * 1000;
export const SENIOR_LIVING_RATE_MAX = 5;

const limiter = createRateLimiter({
  windowMs: SENIOR_LIVING_RATE_WINDOW_MS,
  max: SENIOR_LIVING_RATE_MAX,
});

export function resetSeniorLivingRateLimit() {
  limiter.reset();
}

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

const db = () => admin.firestore();

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
    console.error("[SeniorLiving] Invoice number lookup failed:", error);
    return `INV-${year}-${String(Date.now()).slice(-6)}`;
  }
}

router.post("/order", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many requests. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const parsed = parseSeniorLivingOrder(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot === true) {
      return res.json({ success: true, message: "Request received." });
    }
    return res.status(400).json({ error: parsed.error });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: `Orders are not available on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const { value, quote } = parsed;
  const lineItems = [
    ...quote.lines,
    quote.travelLine,
    {
      id: "processing",
      name: SENIOR_LIVING_PROCESSING_LABEL,
      qty: 1,
      unitPrice: quote.processing,
      price: quote.processing,
    },
  ];
  const now = admin.firestore.FieldValue.serverTimestamp();
  const confirmationEmail = clientNotifyLive();

  try {
    const requestRef = await db().collection("orderRequests").add({
      clientName: value.name,
      email: value.email,
      clientEmail: value.email,
      phone: value.phone,
      clientPhone: value.phone,
      title: value.title,
      community: value.community,
      onsiteContact: value.onsiteContact,
      address: value.address,
      propertyAddress: value.address,
      lineItems,
      services: lineItems,
      selectedService: "Senior Living",
      subtotal: quote.serviceSubtotal,
      processing: quote.processing,
      total: quote.total,
      pricing: {
        subtotal: quote.serviceSubtotal,
        tax: 0,
        processing: quote.processing,
        total: quote.total,
      },
      travelZone: quote.travel.travelZone,
      travelMiles: quote.travel.travelMiles,
      travelFeeCents: quote.travel.travelFeeCents,
      travelQuoted: quote.travel.travelQuoted,
      depositRequired: SENIOR_LIVING_DEPOSIT_REQUIRED,
      depositPercent: SENIOR_LIVING_DEPOSIT_PERCENT,
      depositAmount: quote.depositAmount,
      depositPaid: 0,
      balanceDue: quote.total,
      scheduledDate: value.scheduledDate,
      scheduledTime: value.scheduledTime,
      notes: value.notes,
      vibeNote: [
        SENIOR_LIVING_DEPOSIT_LINE,
        `Deposit required: yes`,
        `Deposit percent: ${SENIOR_LIVING_DEPOSIT_PERCENT}`,
        `Deposit due today: ${quote.depositAmount}`,
        `Balance due after the shoot: ${quote.balanceDue}`,
        `Processing: ${quote.processing}`,
        value.notes,
      ].filter(Boolean).join("\n"),
      status: "new",
      source: SENIOR_LIVING_ORDER_SOURCE,
      leadSource: "Senior living page",
      createdAt: now,
      submittedAt: now,
      updatedAt: now,
    });

    const orderRef = await db().collection("orders").add({
      orderRequestId: requestRef.id,
      clientName: value.name,
      clientEmail: value.email,
      clientPhone: value.phone,
      title: value.title,
      community: value.community,
      onsiteContact: value.onsiteContact,
      address: value.address,
      lineItems,
      services: lineItems,
      selectedService: "Senior Living",
      subtotal: quote.serviceSubtotal,
      processing: quote.processing,
      pricing: {
        subtotal: quote.serviceSubtotal,
        tax: 0,
        processing: quote.processing,
        total: quote.total,
      },
      total: quote.total,
      travelZone: quote.travel.travelZone,
      travelMiles: quote.travel.travelMiles,
      travelFeeCents: quote.travel.travelFeeCents,
      travelQuoted: quote.travel.travelQuoted,
      depositRequired: SENIOR_LIVING_DEPOSIT_REQUIRED,
      depositPercent: SENIOR_LIVING_DEPOSIT_PERCENT,
      depositAmount: quote.depositAmount,
      depositPaid: 0,
      balanceDue: quote.total,
      scheduledDate: value.scheduledDate,
      scheduledTime: value.scheduledTime,
      notes: value.notes,
      status: "confirmed",
      source: SENIOR_LIVING_ORDER_SOURCE,
      createdAt: now,
      updatedAt: now,
    });

    const orderNumber = buildAdminOrderTile({
      id: orderRef.id,
      lineItems,
      selectedService: "Senior Living",
      clientName: value.name,
      address: value.address,
    }).orderCode;

    const invoiceRef = db().collection("invoices").doc();
    const payToken = createPayToken();
    const invoiceNumber = await nextInvoiceNumber();
    await invoiceRef.set({
      orderId: orderRef.id,
      orderRequestId: requestRef.id,
      source: SENIOR_LIVING_ORDER_SOURCE,
      clientName: value.name,
      clientEmail: value.email,
      clientPhone: value.phone,
      address: value.address,
      lineItems,
      subtotal: quote.serviceSubtotal,
      tax: 0,
      processing: quote.processing,
      total: quote.total,
      amountPaid: 0,
      amountDue: quote.total,
      depositRequired: SENIOR_LIVING_DEPOSIT_REQUIRED,
      depositPercent: SENIOR_LIVING_DEPOSIT_PERCENT,
      depositAmount: quote.depositAmount,
      depositPaid: 0,
      status: "draft",
      paymentProvider: "square",
      payToken,
      invoiceNumber,
      orderNumber,
      notes: value.notes,
      travelZone: quote.travel.travelZone,
      travelMiles: quote.travel.travelMiles,
      travelFeeCents: quote.travel.travelFeeCents,
      travelQuoted: quote.travel.travelQuoted,
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all([
      orderRef.update({ invoiceId: invoiceRef.id, orderNumber, updatedAt: now }),
      requestRef.update({
        invoiceId: invoiceRef.id,
        convertedToOrderId: orderRef.id,
        orderNumber,
        updatedAt: now,
      }),
    ]);

    const saved = {
      id: orderRef.id,
      orderNumber,
      clientName: value.name,
      email: value.email,
      clientEmail: value.email,
      phone: value.phone,
      clientPhone: value.phone,
      community: value.community,
      address: value.address,
      propertyAddress: value.address,
      title: value.title,
      onsiteContact: value.onsiteContact,
      lineItems,
      services: lineItems,
      selectedService: "Senior Living",
      total: quote.total,
      processing: quote.processing,
      depositRequired: true,
      depositPercent: SENIOR_LIVING_DEPOSIT_PERCENT,
      depositAmount: quote.depositAmount,
      balanceDue: quote.balanceDue,
      scheduledDate: value.scheduledDate,
      scheduledTime: value.scheduledTime,
      requestedDate: value.scheduledDate,
      source: SENIOR_LIVING_ORDER_SOURCE,
      leadSource: "Senior living page",
      notes: value.notes,
      vibeNote: [
        `Community: ${value.community}`,
        `Title: ${value.title}`,
        `Onsite contact: ${value.onsiteContact}`,
        `Deposit required: yes`,
        `Deposit percent: ${SENIOR_LIVING_DEPOSIT_PERCENT}`,
        `Deposit due today: ${quote.depositAmount}`,
        `Balance due after the shoot: ${quote.balanceDue}`,
        SENIOR_LIVING_DEPOSIT_LINE,
        value.notes,
      ].filter(Boolean).join("\n"),
    };

    try {
      await notifyOfficeOfOrder({
        isNewOrder: true,
        saved,
        adminUrl: `${appUrl()}/admin/orders`,
        env: seniorLivingOfficeEnv(),
      });
    } catch (error) {
      console.error("[SeniorLiving] Office notify failed:", error);
    }

    if (confirmationEmail) {
      try {
        await sendEmail({
          to: value.email,
          template: "senior_living_order",
          audience: "client",
          subject: `Order ${orderNumber} received`,
          html: `<p>We received order ${orderNumber}. The balance is due after the shoot.</p>`,
          variables: { clientName: value.name, orderNumber },
        });
      } catch (error) {
        console.error("[SeniorLiving] Confirmation email failed:", error);
      }
    }

    return res.status(201).json({
      success: true,
      orderId: orderRef.id,
      orderRequestId: requestRef.id,
      orderNumber,
      invoiceId: invoiceRef.id,
      payToken,
      depositAmount: quote.depositAmount,
      confirmationEmail,
    });
  } catch (error) {
    console.error("[SeniorLiving] Order failed:", error);
    return res.status(500).json({
      error: `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
});

router.post("/", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many requests. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const parsed = parseSeniorLivingRequest(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot === true) {
      return res.json({ success: true, message: "Request received." });
    }
    return res.status(400).json({ error: parsed.error });
  }

  if (!admin.apps.length) {
    return res.status(503).json({
      error: `Requests are not available on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  try {
    const draft = seniorLivingOfficeRecord("pending", parsed.value);
    const { id: _ignoredId, ...stored } = draft;
    const ref = await admin
      .firestore()
      .collection(SENIOR_LIVING_REQUESTS)
      .add({
        ...stored,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    const saved = seniorLivingOfficeRecord(ref.id, parsed.value);
    try {
      await notifyOfficeOfOrder({
        isNewOrder: true,
        saved,
        adminUrl: `${appUrl()}/admin/orders`,
        env: seniorLivingOfficeEnv(),
      });
    } catch (error) {
      console.error("[SeniorLiving] Office notify failed:", error);
    }
    return res
      .status(201)
      .json({ success: true, message: "Request received." });
  } catch (error) {
    console.error("[SeniorLiving] Request failed:", error);
    return res.status(500).json({
      error: `We could not save that request. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
});

export default router;
