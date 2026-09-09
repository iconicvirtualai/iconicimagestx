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

const router = Router();
const db = () => admin.firestore();

function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "object" && item !== null
        ? `${escapeEmailHtml((item as { name?: string }).name || "Item")}${(item as { price?: number }).price != null ? ` — $${Number((item as { price?: number }).price).toFixed(2)}` : ""}`
        : escapeEmailHtml(item))
      .filter(Boolean)
      .join("<br>");
  }
  return escapeEmailHtml(value);
}

function detailRow(label: string, value: unknown, shaded = false): string {
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) return "";
  return `<tr${shaded ? ' style="background:#f8fafc;"' : ""}><td style="padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;vertical-align:top;">${escapeEmailHtml(label)}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${emailValue(value)}</td></tr>`;
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

    const confirmationVariables = {
      clientName,
      address,
      total: `$${Number(total).toFixed(2)}`,
      requestId: docRef.id,
      scheduledDate: scheduledDate || "TBD — we'll confirm shortly",
      scheduledTime: scheduledTime || "",
      propertyStatus: propertyStatus || "Not specified",
      furnishingStatus: furnishingStatus || "Not specified",
      accessMethod: accessLine,
      squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
      completeOrderSummary: `
        <h3 style="color:#333;margin:28px 0 10px;">Complete order details</h3>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
          ${detailRow("Client", clientName, true)}
          ${detailRow("Email", email)}
          ${detailRow("Phone", phone, true)}
          ${detailRow("Property / Request", address)}
          ${detailRow("Requested Date", scheduledDate, true)}
          ${detailRow("Requested Time", scheduledTime)}
          ${detailRow("Preferred Photographer", photographerPreference, true)}
          ${detailRow("Square Footage", squareFootage)}
          ${detailRow("Access Method", accessLine, true)}
          ${detailRow("Property Status", propertyStatus)}
          ${detailRow("Furnishing", furnishingStatus, true)}
          ${detailRow("Package and Services", lineItems)}
          ${detailRow("Selected Basics", selectedBasics, true)}
          ${detailRow("Selected Add-ons", selectedAddOns)}
          ${detailRow("Special Requests / Notes", vibeNote, true)}
          ${detailRow("Specialized Photography", specializedPhotography)}
          ${detailRow("Virtual Staging Credits", virtualStagingCredits, true)}
          ${detailRow("Promo Code", promoCode)}
          ${detailRow("Promo Discount", promoDiscount, true)}
          ${detailRow("Lead Source", leadSource)}
          ${detailRow("Current Marketing", marketingDoing, true)}
          ${detailRow("Current Challenges", resultsBothering)}
          ${detailRow("Ideal Business", perfectBusiness, true)}
          ${detailRow("Business Source", businessSource)}
          ${detailRow("Investment Preference", investmentWilling, true)}
          ${detailRow("Order Total", `$${Number(total).toFixed(2)}`)}
          ${detailRow("Confirmation ID", docRef.id, true)}
        </table>`,
    };

    // Send both copies in parallel so a slow SMTP connection cannot prevent
    // the office from receiving the order notification.
    await Promise.allSettled([
      sendEmail({
        to: email,
        template: "booking_received",
        variables: confirmationVariables,
      }),
      sendEmail({
        to: "photos@iconicimagestx.com",
        template: "booking_received",
        variables: confirmationVariables,
      }),
    ]);

    // Send confirmation SMS to client
    if (phone) {
      await sendSMS({
        to: phone,
        body: SMS_TEMPLATES.bookingConfirmation(
          firstName,
          scheduledDate || "TBD — we'll confirm shortly",
          address,
          `$${Number(total).toFixed(2)}`
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
          address,
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

    // Find or create client record
    let clientId: string;
    const existingClients = await db()
      .collection("clients")
      .where("email", "==", request.email)
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
        firstName: request.firstName,
        lastName: request.lastName,
        email: request.email,
        phone: request.phone,
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
      clientName: request.clientName,
      clientEmail: request.email,
      clientPhone: request.phone,
      address: request.address,
      services: request.lineItems || [],
      addOns: [],
      pricing: request.pricing || {},
      total: request.total || 0,
      depositPaid: 0,
      balanceDue: request.total || 0,
      status: "confirmed",
      assignedPhotographerId: assignedPhotographerId || null,
      assignedPhotographerName: assignedPhotographerName || null,
      scheduledDate: scheduledDate
        ? admin.firestore.Timestamp.fromDate(new Date(scheduledDate))
        : null,
      scheduledTime: scheduledTime || request.scheduledTime || null,
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
    await db().collection("appointments").add({
      orderId: orderRef.id,
      clientId,
      clientName: request.clientName,
      address: request.address,
      scheduledDate: scheduledDate
        ? admin.firestore.Timestamp.fromDate(new Date(scheduledDate))
        : null,
      scheduledTime: scheduledTime || request.scheduledTime || null,
      photographerId: assignedPhotographerId || null,
      photographerName: assignedPhotographerName || null,
      services: request.lineItems || [],
      status: "confirmed",
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create Gallery placeholder
    await db().collection("galleries").add({
      orderId: orderRef.id,
      clientId,
      clientName: request.clientName,
      address: request.address,
      title: `${request.address} — Gallery`,
      status: "pending_upload",
      mediaItems: [],
      downloadEnabled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create Invoice draft
    await db().collection("invoices").add({
      orderId: orderRef.id,
      clientId,
      clientName: request.clientName,
      clientEmail: request.email,
      invoiceNumber: await generateInvoiceNumber(),
      lineItems: request.lineItems || [],
      subtotal: request.pricing?.subtotal || request.total || 0,
      tax: request.pricing?.tax || 0,
      total: request.total || 0,
      amountPaid: 0,
      amountDue: request.total || 0,
      status: "draft",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Mark request as confirmed
    await requestDoc.ref.update({
      status: "confirmed",
      convertedToOrderId: orderRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send confirmation email to client
    await sendEmail({
      to: request.email,
      template: "order_confirmed",
      variables: {
        clientName: request.clientName,
        address: request.address,
        scheduledDate: scheduledDate || "To be confirmed",
        scheduledTime: scheduledTime || "To be confirmed",
        photographerName: assignedPhotographerName || "Our team",
        orderId: orderRef.id,
        portalUrl: `${process.env.APP_URL}/portal`,
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
    .get();

  if (snapshot.empty) {
    return `INV-${year}-0001`;
  }

  const last = snapshot.docs[0].data().invoiceNumber as string;
  const num = parseInt(last.split("-")[2] || "0") + 1;
  return `INV-${year}-${String(num).padStart(4, "0")}`;
}

export default router;
