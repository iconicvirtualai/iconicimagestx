/**
 * Iconic Images — Bookings Routes
 * Handles public booking form submissions and booking management.
 * Place at: server/routes/bookings.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { sendEmail } from "../services/email";
import { sendSMS, SMS_TEMPLATES } from "../services/sms";
import { createCalendarBookingEvent } from "../services/calendar";

const router = Router();
const db = () => admin.firestore();

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

function addressLabel(address: unknown): string {
  if (!address) return "Address not provided";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address as Record<string, unknown>;
    if (typeof a.formatted === "string" && a.formatted) return a.formatted;
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "Address not provided";
  }
  return String(address);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function money(value: unknown): string {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

// ─── POST /api/bookings — Public booking form submission ────────────────────
// No auth required — this is the public-facing booking form

router.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      lineItems,
      pricing,
      total,
      vibeNote,
      promoCode,
      promoDiscount,
      scheduledDate,
      scheduledTime,
      photographerPreference,
      squareFootage,
      accessMethod,
      lockboxCode,
      propertyStatus,
      furnishingStatus,
      // Additional fields from booking form (previously dropped)
      specializedPhotography,
      virtualStagingCredits,
      selectedService,
      selectedBasics,
      selectedAddOns,
      leadSource,
      marketingDoing,
      resultsBothering,
      perfectBusiness,
      businessSource,
      investmentWilling,
    } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !phone || !address) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ error: "No services selected." });
    }

    const clientName = `${firstName} ${lastName}`.trim();
    const displayAddress = addressLabel(address);

    const orderRequest = {
      firstName,
      lastName,
      clientName,
      email: email.toLowerCase().trim(),
      phone,
      address,
      lineItems,
      pricing: pricing || {},
      total: Number(total) || 0,
      vibeNote: vibeNote || "",
      promoCode: promoCode || null,
      promoDiscount: Number(promoDiscount) || 0,
      scheduledDate: scheduledDate || null,
      scheduledTime: scheduledTime || null,
      photographerPreference: photographerPreference || null,
      squareFootage: squareFootage || null,
      accessMethod: accessMethod || null,
      lockboxCode: lockboxCode || null,
      propertyStatus: propertyStatus || null,
      furnishingStatus: furnishingStatus || null,
      // Booking form fields — previously dropped
      specializedPhotography: specializedPhotography || null,
      virtualStagingCredits: Number(virtualStagingCredits) || 0,
      selectedService: selectedService || null,
      selectedBasics: Array.isArray(selectedBasics) ? selectedBasics : [],
      selectedAddOns: Array.isArray(selectedAddOns) ? selectedAddOns : [],
      leadSource: leadSource || null,
      marketingDoing: marketingDoing || null,
      resultsBothering: resultsBothering || null,
      perfectBusiness: perfectBusiness || null,
      businessSource: businessSource || null,
      investmentWilling: investmentWilling || null,
      status: "new",
      source: "booking_form",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db().collection("orderRequests").add(orderRequest);

    // Build access info line for emails
    const accessLine = accessMethod
      ? `${accessMethod}${lockboxCode ? ` — Code: ${lockboxCode}` : ""}`
      : "Not specified";

    // Send confirmation email to client
    await sendEmail({
      to: email,
      template: "booking_received",
      variables: {
        clientName,
        address: displayAddress,
        total: money(total),
        requestId: docRef.id,
        scheduledDate: scheduledDate || "TBD — we'll confirm shortly",
        scheduledTime: scheduledTime || "",
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        dashboardUrl: `${appUrl()}/admin/order-request/${docRef.id}`,
      },
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));


    // Send the same complete order notification to the office
    await sendEmail({
      to: "photos@iconicimagestx.com",
      template: "booking_received",
      variables: {
        clientName,
        address: displayAddress,
        total: money(total),
        requestId: docRef.id,
        scheduledDate: scheduledDate || "TBD — we'll confirm shortly",
        scheduledTime: scheduledTime || "",
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        dashboardUrl: `${appUrl()}/admin/order-request/${docRef.id}`,
      },
    }).catch((err) => console.error("[Bookings] Office notification email failed:", err));

    // Send confirmation SMS to client
    if (phone) {
      await sendSMS({
        to: phone,
        body: SMS_TEMPLATES.bookingConfirmation(
          firstName,
          scheduledDate || "TBD — we'll confirm shortly",
          displayAddress,
          money(total)
        ),
      }).catch((err) => console.error("[Bookings] Confirmation SMS failed:", err));
    }

    // Send SMS alert to coordinator/admin if ADMIN_PHONE is set
    if (process.env.ADMIN_PHONE) {
      const serviceNames = (lineItems as Array<{ name: string }>)
        .map((i) => i.name)
        .join(", ");
      await sendSMS({
        to: process.env.ADMIN_PHONE,
        body: SMS_TEMPLATES.newBookingAlert(
          displayAddress,
          scheduledDate || "TBD",
          serviceNames
        ),
      }).catch((err) => console.error("[Bookings] Admin SMS alert failed:", err));
    }

    return res.status(201).json({
      success: true,
      requestId: docRef.id,
      message: "Booking request received. We'll confirm shortly!",
    });
  } catch (err) {
    console.error("[Bookings] Submission error:", err);
    return res.status(500).json({ error: "Failed to submit booking request." });
  }
});

// ─── GET /api/bookings — List all order requests (staff only) ─────────────────

router.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db()
      .collection("orderRequests")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(requests);
  } catch (err) {
    console.error("[Bookings] List error:", err);
    return res.status(500).json({ error: "Failed to fetch booking requests." });
  }
});

// ─── GET /api/bookings/:id — Get single booking request ──────────────────

router.get("/:id", requireCoordinator, async (req, res) => {
  try {
    const doc = await db().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("[Bookings] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch booking request." });
  }
});

// ─── PATCH /api/bookings/:id/confirm — Confirm and convert to Order ──────────

router.patch("/:id/confirm", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const { assignedPhotographerId, assignedPhotographerName, scheduledDate, scheduledTime, internalNotes } = req.body;
    const requestDoc = await db().collection("orderRequests").doc(req.params.id).get();

    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }

    const request = requestDoc.data()!;
    if (request.convertedToOrderId) {
      return res.json({
        success: true,
        orderId: request.convertedToOrderId,
        clientId: request.clientId || null,
        message: "Booking was already confirmed.",
      });
    }

    const requestEmail = String(request.email || request.clientEmail || "").toLowerCase().trim();
    const requestPhone = request.phone || request.clientPhone || "";
    const requestFirstName = request.firstName || request.clientName?.split(" ")?.[0] || "Client";
    const requestLastName = request.lastName || request.clientName?.split(" ")?.slice(1).join(" ") || "";
    const requestClientName = request.clientName || `${requestFirstName} ${requestLastName}`.trim() || "Client";
    const requestAddress = request.address || request.propertyAddress || "";
    const requestAddressLabel = addressLabel(requestAddress);
    const requestLineItems = Array.isArray(request.lineItems) && request.lineItems.length > 0
      ? request.lineItems
      : Array.isArray(request.services)
        ? request.services.map((service: unknown) => typeof service === "string" ? { name: service, price: 0 } : service)
        : [];
    const requestTotal = Number(request.total ?? request.pricing?.total ?? 0) || 0;
    const confirmDate = toDate(scheduledDate || request.scheduledDate || request.appointmentDate || request.requestedDate);
    const confirmTime = scheduledTime || request.scheduledTime || request.appointmentTime || request.requestedTime || null;

    if (!requestEmail) {
      return res.status(400).json({ error: "Client email is missing on this booking request." });
    }

    let photographer: Record<string, any> | null = null;
    if (assignedPhotographerId) {
      const staffDoc = await db().collection("staff").doc(assignedPhotographerId).get();
      photographer = staffDoc.exists ? staffDoc.data()! : null;
    }

    // Find or create client record
    let clientId: string;
    const existingClients = await db()
      .collection("clients")
      .where("email", "==", requestEmail)
      .limit(1)
      .get();

    if (!existingClients.empty) {
      clientId = existingClients.docs[0].id;
      // Update last activity
      await existingClients.docs[0].ref.update({
        totalOrders: admin.firestore.FieldValue.increment(1),
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Create new client record
      const clientRef = await db().collection("clients").add({
        firstName: requestFirstName,
        lastName: requestLastName,
        email: requestEmail,
        phone: requestPhone,
        address: request.address,
        totalOrders: 1,
        totalSpend: 0,
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
        portalAccess: false,
        tags: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      clientId = clientRef.id;
    }

    // Create Order document
    const orderData = {
      orderRequestId: req.params.id,
      clientId,
      clientName: requestClientName,
      clientEmail: requestEmail,
      clientPhone: requestPhone,
      address: requestAddress,
      addressLabel: requestAddressLabel,
      services: requestLineItems,
      addOns: [],
      pricing: request.pricing || {},
      total: requestTotal,
      depositPaid: 0,
      balanceDue: requestTotal,
      status: "confirmed",
      assignedPhotographerId: assignedPhotographerId || null,
      assignedPhotographerName: assignedPhotographerName || null,
      scheduledDate: confirmDate ? admin.firestore.Timestamp.fromDate(confirmDate) : null,
      scheduledTime: confirmTime,
      squareFootage: request.squareFootage || null,
      accessMethod: request.accessMethod || null,
      propertyStatus: request.propertyStatus || null,
      furnishingStatus: request.furnishingStatus || null,
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const orderRef = await db().collection("orders").add(orderData);

    // Create Appointment document
    const appointmentRef = await db().collection("appointments").add({
      orderId: orderRef.id,
      clientId,
      clientName: requestClientName,
      address: requestAddress,
      addressLabel: requestAddressLabel,
      scheduledDate: confirmDate ? admin.firestore.Timestamp.fromDate(confirmDate) : null,
      scheduledTime: confirmTime,
      photographerId: assignedPhotographerId || null,
      photographerName: assignedPhotographerName || null,
      services: requestLineItems,
      status: "confirmed",
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create Gallery placeholder
    const galleryRef = await db().collection("galleries").add({
      orderId: orderRef.id,
      clientId,
      clientName: requestClientName,
      address: requestAddress,
      addressLabel: requestAddressLabel,
      title: `${requestAddressLabel} — Gallery`,
      status: "pending_upload",
      mediaItems: [],
      downloadEnabled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const calendarResult = await createCalendarBookingEvent({
      orderId: orderRef.id,
      clientName: requestClientName,
      clientEmail: requestEmail,
      clientPhone: requestPhone,
      address: requestAddressLabel,
      services: requestLineItems.map((item: any) => item.name || String(item)).filter(Boolean),
      scheduledDate: confirmDate,
      scheduledTime: confirmTime,
      photographerEmail: photographer?.email || null,
      photographerCalendarId: photographer?.googleCalendarId || photographer?.calendarId || null,
      photographerName: assignedPhotographerName || photographer?.name || null,
      notes: internalNotes || request.vibeNote || "",
    }).catch(async (err) => {
      console.error("[Bookings] Calendar event creation failed:", err);
      await db().collection("agentLogs").add({
        agent: "nora",
        action: "Calendar event failed",
        summary: `Google Calendar event was not created for order ${orderRef.id}`,
        status: "flagged",
        relatedId: orderRef.id,
        relatedType: "order",
        priority: "high",
        requiresHumanReview: true,
        details: err instanceof Error ? err.message : String(err),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return null;
    });

    if (calendarResult?.eventId) {
      await Promise.all([
        orderRef.update({
          googleCalendarEventId: calendarResult.eventId,
          googleCalendarId: calendarResult.calendarId,
          googleCalendarUrl: calendarResult.htmlLink,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
        appointmentRef.update({
          googleCalendarEventId: calendarResult.eventId,
          googleCalendarId: calendarResult.calendarId,
          googleCalendarUrl: calendarResult.htmlLink,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      ]);
    }

    // Create Invoice draft
    const invoiceRef = await db().collection("invoices").add({
      orderId: orderRef.id,
      clientId,
      galleryId: galleryRef.id,
      clientName: requestClientName,
      clientEmail: requestEmail,
      invoiceNumber: await generateInvoiceNumber(),
      lineItems: requestLineItems,
      subtotal: request.pricing?.subtotal || requestTotal,
      tax: request.pricing?.tax || 0,
      total: requestTotal,
      amountPaid: 0,
      amountDue: requestTotal,
      status: "draft",
      paymentProvider: "square",
      paymentUrl: `${appUrl()}/invoice/${orderRef.id}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await invoiceRef.update({
      paymentUrl: `${appUrl()}/invoice/${invoiceRef.id}`,
    });

    await galleryRef.update({
      invoiceId: invoiceRef.id,
      deliveryUrl: `${appUrl()}/gallery/${galleryRef.id}`,
    });

    // Mark request as confirmed
    await requestDoc.ref.update({
      status: "confirmed",
      convertedToOrderId: orderRef.id,
      clientId,
      galleryId: galleryRef.id,
      invoiceId: invoiceRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send confirmation email to client
    await sendEmail({
      to: requestEmail,
      template: "order_confirmed",
      variables: {
        clientName: requestClientName,
        address: requestAddressLabel,
        scheduledDate: confirmDate ? confirmDate.toLocaleDateString("en-US") : "To be confirmed",
        scheduledTime: confirmTime || "To be confirmed",
        photographerName: assignedPhotographerName || "Our team",
        orderId: orderRef.id,
        portalUrl: `${appUrl()}/portal`,
      },
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));

    return res.json({
      success: true,
      orderId: orderRef.id,
      clientId,
      message: "Booking confirmed and order created.",
    });
  } catch (err) {
    console.error("[Bookings] Confirm error:", err);
    return res.status(500).json({ error: "Failed to confirm booking." });
  }
});

// ─── PATCH /api/bookings/:id/decline ─────────────────────────────────────────────

router.patch("/:id/decline", requireCoordinator, async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await db().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found." });

    await doc.ref.update({
      status: "declined",
      declineReason: reason || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to decline booking." });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const snapshot = await db()
    .collection("invoices")
    .where("invoiceNumber", ">=", `INV-${year}-`)
    .orderBy("invoiceNumber", "desc")
    .limit(1)
    .get()
    .catch((err) => {
      console.error("[Bookings] Invoice number lookup failed:", err);
      return null;
    });

  if (!snapshot || snapshot.empty) {
    return `INV-${year}-0001`;
  }

  const last = snapshot.docs[0].data().invoiceNumber as string;
  const num = parseInt(last.split("-")[2] || "0") + 1;
  return `INV-${year}-${String(num).padStart(4, "0")}`;
}

export default router;
