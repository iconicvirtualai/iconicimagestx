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
import { attachBookingClient, createRequestedAppointment, sendFirebasePasswordEmail } from "../services/bookingClient";
import { ensureBookingListingForRequest } from "../services/bookingListing";
import { clientNotifyBlockReason, clientNotifyLive, isNotifyTestAllowlisted } from "../../shared/clientNotify";
import { lifeOfTheListingCareSelected } from "../../shared/lifeOfTheListingCare";
import { buildBookingInvoiceDraft, existingInvoiceId } from "../../shared/bookingInvoice";
import { nextSequentialInvoiceNumber, planInvoiceLink } from "../../shared/orderProjectInvoice";
import { chargedServiceLines, normalizeBookingLineItems, orderTotalLabel, resolveSubmittedBooking, sumLineItemPrices, unpricedCatalogBookingError } from "../../shared/bookingPricing";
import { applyServerTravel, isTravelFeeLine, travelSummaryText, type TravelAssessment } from "../../shared/travelZones";
import { planOrderPackageRepair } from "../../shared/orderPackageRepair";
import { notifyOfficeOfOrder } from "../services/officeOrderNotify";
import { packagesForStaffEditor } from "../../shared/bookingCatalog";
import { normalizeEmail } from "../../shared/listingAccess";
import { addressText } from "../../shared/addressText";
import { bookingDateLabel } from "../../shared/clientHome";
import { storedServiceLocationFields } from "../../shared/serviceLocation";

const router = Router();
const db = () => admin.firestore();

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

function addressLabel(address: unknown): string {
  return addressText(address) || "Address not provided";
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
  return orderTotalLabel(value);
}

async function loadBookingCatalog() {
  try {
    const snap = await db().collection("packages").get();
    return packagesForStaffEditor(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  } catch (err) {
    console.error("[Bookings] Catalog read failed — using the seeded catalog", err);
    return packagesForStaffEditor([]);
  }
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
      vibeNote,
      scheduledDate,
      scheduledTime,
      photographerPreference,
      squareFootage,
      accessMethod,
      lockboxCode,
      propertyStatus,
      furnishingStatus,
      // Additional fields from booking form (previously dropped)
      leadSource,
      marketingDoing,
      resultsBothering,
      perfectBusiness,
      businessSource,
      investmentWilling,
      lifeOfTheListingCare,
    } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !phone || !address) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const clientName = `${firstName} ${lastName}`.trim();
    const locationFields = storedServiceLocationFields(address);
    const savedAddress = locationFields.address;
    if (!savedAddress) {
      return res.status(400).json({ error: "Missing required fields." });
    }
    const displayAddress = addressLabel(savedAddress);

    const catalog = await loadBookingCatalog();
    const unpriced = unpricedCatalogBookingError(req.body, catalog);
    if (unpriced) return res.status(400).json({ error: unpriced });
    const resolved = resolveSubmittedBooking(req.body, catalog);
    // A posted travel fee is not a service and is not the price. Quote the pin or ZIP.
    const keptLines = resolved.lineItems.filter((item) => !isTravelFeeLine(item));
    if (chargedServiceLines(keptLines).length === 0) {
      return res.status(400).json({ error: "No services selected." });
    }
    const traveled = applyServerTravel(keptLines, savedAddress);
    const lineItems = traveled.lineItems;
    const total = traveled.total;
    const travel = traveled.travel;
    const promoCode = resolved.promoCode;
    const promoDiscount = resolved.promoDiscount;
    const pricing = { subtotal: total, tax: 0, total };
    const selectedService = resolved.selectedService;
    const selectedBasics = resolved.selectedBasics;
    const selectedAddOns = resolved.selectedAddOns;
    const specializedPhotography = resolved.specializedPhotography;
    const virtualStagingCredits = resolved.virtualStagingCredits;
    const { address: _savedAddress, ...storedPin } = locationFields;

    const orderRequest = {
      firstName,
      lastName,
      clientName,
      email: email.toLowerCase().trim(),
      phone,
      address: savedAddress,
      ...storedPin,
      lineItems,
      pricing: pricing || {},
      total: Number(total) || 0,
      vibeNote: vibeNote || "",
      promoCode: promoCode || null,
      promoDiscount: Number(promoDiscount) || 0,
      travelZone: travel.travelZone,
      travelMiles: travel.travelMiles,
      travelFeeCents: travel.travelFeeCents,
      travelQuoted: travel.travelQuoted,
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
      // Draft add-on. Quote only — do not price it or mention it in client email/SMS.
      lifeOfTheListingCare: lifeOfTheListingCareSelected(lifeOfTheListingCare),
      status: "new",
      source: "booking_form",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db().collection("orderRequests").add(orderRequest);

    const normalizedEmail = orderRequest.email;
    // Password setup follows the client-mail gate. An exact allowlist address
    // can still receive it while notifications are off, including in RED.
    const passwordSetupAllowed = clientNotifyLive() || isNotifyTestAllowlisted(normalizedEmail);
    let account: Awaited<ReturnType<typeof attachBookingClient>> = {
      clientId: null,
      createdAccount: false,
      passwordSetupLink: null,
      skipReason: null,
    };
    try {
      account = await attachBookingClient({
        email: normalizedEmail,
        firstName,
        lastName,
        phone,
        preparePasswordLink: passwordSetupAllowed,
      });
    } catch (err) {
      console.error("[Bookings] Account attach failed:", err);
    }

    if (account.clientId) {
      try {
        await docRef.update({
          clientId: account.clientId,
          clientEmail: normalizedEmail,
          portalAttached: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await createRequestedAppointment({
          orderRequestId: docRef.id,
          clientId: account.clientId,
          clientName,
          clientEmail: normalizedEmail,
          clientPhone: String(phone || ""),
          address: savedAddress,
          addressLabel: displayAddress,
          scheduledDate: typeof scheduledDate === "string" ? scheduledDate : null,
          scheduledTime: typeof scheduledTime === "string" ? scheduledTime : null,
          services: lineItems,
          notes: typeof vibeNote === "string" ? vibeNote : "",
        });
      } catch (err) {
        console.error("[Bookings] Appointment attach failed:", err);
      }
    }

    let invoiceId: string | null = null;
    try {
      const created = await createBookingInvoiceDraft({
        orderRequestId: docRef.id,
        email,
        clientName,
        lineItems,
        pricing,
        total,
        promoCode,
        promoDiscount,
        travel,
        clientId: account.clientId,
      });
      invoiceId = created.invoiceId;
      try {
        await docRef.update({
          invoiceId: created.invoiceId,
          ...(account.clientId
            ? { clientId: account.clientId }
            : created.clientId
              ? { clientId: created.clientId }
              : {}),
        });
      } catch (linkErr) {
        console.error("[Bookings] Invoice link update failed:", linkErr);
      }
    } catch (err) {
      console.error("[Bookings] Invoice draft create failed:", err);
      invoiceId = null;
    }

    // Listing doc for the home tile. Confirmation email and SMS are unchanged.
    try {
      await ensureBookingListingForRequest(docRef.id);
    } catch (err) {
      console.error("[Bookings] Listing ensure failed:", err);
    }

    // Build access info line for emails
    const accessLine = accessMethod
      ? `${accessMethod}${lockboxCode ? ` — Code: ${lockboxCode}` : ""}`
      : "Not specified";

    let clientEmailStatus: "sent" | "failed" = "failed";
    let passwordSetupStatus: "sent" | "failed" | "not_needed" | "gated" = account.createdAccount ? "gated" : "not_needed";
    let smsStatus: "sent" | "failed" | "skipped" | "not_configured" = phone ? "failed" : "skipped";

    // Order-received confirmation to the client. booking_received is excluded from the
    // RED blast kill and sends even when CLIENT_NOTIFY_LIVE is unset.
    clientEmailStatus = await sendEmail({
      to: email,
      template: "booking_received",
      variables: {
        clientName,
        address: displayAddress,
        total: money(total),
        requestId: docRef.id,
        scheduledDate: bookingDateLabel(scheduledDate, "TBD — we'll confirm shortly"),
        scheduledTime: scheduledTime || "",
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        travelFee: travelSummaryText(travel),
        dashboardUrl: `${appUrl()}/admin/order-request/${docRef.id}`,
      },
    }).then((result) => (result.sent ? "sent" as const : "failed" as const)).catch((err) => {
      console.error("[Bookings] Confirmation email failed:", err);
      return "failed" as const;
    });

    // Order-received SMS to the client. Same carve-out as booking_received:
    // not blocked by RED or a missing CLIENT_NOTIFY_LIVE.
    if (phone) {
      smsStatus = await sendSMS({
        to: phone,
        kind: "booking_confirmation",
        body: SMS_TEMPLATES.bookingConfirmation(
          firstName,
          bookingDateLabel(scheduledDate, "TBD — we'll confirm shortly"),
          displayAddress,
          money(total)
        ),
      }).then((result) => ("suppressed" in result && result.suppressed ? "failed" as const : "sent" as const)).catch((err) => {
        console.error("[Bookings] Confirmation SMS failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        return /TWILIO_|not configured|not set/i.test(message) ? "not_configured" as const : "failed" as const;
      });
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
          bookingDateLabel(scheduledDate, "TBD"),
          serviceNames
        ),
      }).catch((err) => console.error("[Bookings] Admin SMS alert failed:", err));
    }

    // Password setup is not the order-received confirmation. It follows the
    // same CLIENT_NOTIFY_LIVE / RED gate as other portal mail, with the same
    // exact NOTIFY_TEST_ALLOWLIST exception. The link is not stored on the
    // order request.
    if (account.createdAccount) {
      if (!passwordSetupAllowed) {
        passwordSetupStatus = "gated";
        console.info(
          `[Bookings] Password-setup email not sent for request ${docRef.id}. ${clientNotifyBlockReason()}.`,
        );
      } else if (account.passwordSetupLink) {
        passwordSetupStatus = await sendEmail({
          to: email,
          template: "account_password_setup",
          variables: {
            clientName,
            clientEmail: normalizedEmail,
            setupUrl: account.passwordSetupLink,
            portalUrl: `${appUrl()}/portal`,
          },
        }).then((result) => (result.sent ? "sent" as const : "failed" as const)).catch(async (err) => {
          console.error("[Bookings] Password setup email failed:", err);
          try {
            await sendFirebasePasswordEmail(normalizedEmail);
            return "sent" as const;
          } catch (fallbackErr) {
            console.error("[Bookings] Firebase password email fallback failed:", fallbackErr);
            return "failed" as const;
          }
        });
      } else {
        try {
          await sendFirebasePasswordEmail(normalizedEmail);
          passwordSetupStatus = "sent";
        } catch (err) {
          console.error("[Bookings] Firebase password email fallback failed:", err);
          passwordSetupStatus = "failed";
        }
      }
    }

    let officeAlertStatus: "sent" | "failed" | "skipped" = "skipped";
    try {
      const savedSnap = await docRef.get();
      const savedOrder = { id: savedSnap.id, ...(savedSnap.data() || {}) } as Record<string, unknown>;
      const alert = await notifyOfficeOfOrder({
        isNewOrder: true,
        saved: savedOrder,
        adminUrl: `${appUrl()}/admin/order-request/${savedSnap.id}`,
      });
      officeAlertStatus = alert.sent ? "sent" : "skipped";
    } catch (err) {
      console.error("[Bookings] Office new-order email failed:", err);
      officeAlertStatus = "failed";
    }

    const notifications = {
      appointmentEmail: clientEmailStatus,
      officeAlert: officeAlertStatus,
      sms: smsStatus,
      passwordSetup: passwordSetupStatus,
      accountCreated: account.createdAccount,
      accountAttached: Boolean(account.clientId),
      accountSkipReason: account.skipReason,
    };

    await docRef.update({
      notifications,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[Bookings] Notification status was not saved:", err));

    // Firestore draft stays for staff. Square billing waits until after the shoot.

    return res.status(201).json({
      success: true,
      requestId: docRef.id,
      invoiceId,
      accountCreated: account.createdAccount,
      notifications,
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
      let listingId = existingInvoiceId(request.listingId);
      try {
        const ensured = await ensureBookingListingForRequest(req.params.id);
        if (ensured?.listingId) listingId = ensured.listingId;
      } catch (err) {
        console.error("[Bookings] Listing ensure failed:", err);
      }
      try {
        await stampDurableLinks({
          invoiceId: existingInvoiceId(request.invoiceId),
          orderRequestId: req.params.id,
          orderId: String(request.convertedToOrderId),
          listingId,
        });
      } catch (err) {
        console.error("[Bookings] Order/project/invoice link failed:", err);
      }
      return res.json({
        success: true,
        orderId: request.convertedToOrderId,
        clientId: request.clientId || null,
        invoiceId: existingInvoiceId(request.invoiceId),
        message: "Booking was already confirmed.",
      });
    }

    const requestEmail = String(request.email || request.clientEmail || "").toLowerCase().trim();
    const requestPhone = request.phone || request.clientPhone || "";
    const requestFirstName = request.firstName || request.clientName?.split(" ")?.[0] || "Client";
    const requestLastName = request.lastName || request.clientName?.split(" ")?.slice(1).join(" ") || "";
    const requestClientName = request.clientName || `${requestFirstName} ${requestLastName}`.trim() || "Client";
    const locationFields = storedServiceLocationFields(request.address || request.propertyAddress || "");
    const requestAddress = locationFields.address || "";
    const requestAddressLabel = addressLabel(requestAddress);
    const storedPin = locationFields.lat == null ? {} : {
      lat: locationFields.lat,
      lng: locationFields.lng,
      latitude: locationFields.latitude,
      longitude: locationFields.longitude,
      placeId: locationFields.placeId,
    };
    const traveledConfirm = applyServerTravel(linesForConfirmedOrder(request), requestAddress);
    const requestLineItems = traveledConfirm.lineItems;
    const travel = traveledConfirm.travel;
    const requestTotal = traveledConfirm.total;
    const requestSubtotal = sumLineItemPrices(requestLineItems.filter((item) => {
      const id = String(item.id || "");
      return !id.startsWith("promo-") && !item.name.startsWith("Promo Code:");
    }));
    const confirmSource = scheduledDate || request.scheduledDate || request.appointmentDate || request.requestedDate;
    const confirmDate = toDate(confirmSource);
    const confirmTime = scheduledTime || request.scheduledTime || request.appointmentTime || request.requestedTime || null;

    if (!requestEmail) {
      return res.status(400).json({ error: "Client email is missing on this booking request." });
    }

    let photographer: Record<string, any> | null = null;
    if (assignedPhotographerId) {
      const staffDoc = await db().collection("staff").doc(assignedPhotographerId).get();
      photographer = staffDoc.exists ? staffDoc.data()! : null;
    }

    // Find or create client record. Prefer the portal account attached at submit.
    let clientId: string;
    const attachedClientId = typeof request.clientId === "string" ? request.clientId.trim() : "";
    const attachedClient = attachedClientId
      ? await db().collection("clients").doc(attachedClientId).get()
      : null;

    if (attachedClient?.exists) {
      clientId = attachedClient.id;
      await attachedClient.ref.update({
        totalOrders: admin.firestore.FieldValue.increment(1),
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
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
          address: requestAddress,
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
      ...storedPin,
      services: requestLineItems,
      lineItems: requestLineItems,
      selectedService: request.selectedService || null,
      addOns: [],
      subtotal: requestSubtotal,
      pricing: { ...(request.pricing || {}), subtotal: requestSubtotal, tax: Number(request.pricing?.tax) || 0, total: requestTotal },
      total: requestTotal,
      travelZone: travel.travelZone,
      travelMiles: travel.travelMiles,
      travelFeeCents: travel.travelFeeCents,
      travelQuoted: travel.travelQuoted,
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
      lifeOfTheListingCare: lifeOfTheListingCareSelected(request.lifeOfTheListingCare),
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const orderRef = await db().collection("orders").add(orderData);

    // Promote the request appointment when the public form already created one.
    const existingAppointment = await db().collection("appointments")
      .where("orderRequestId", "==", req.params.id)
      .limit(1)
      .get();
    const confirmedAppointment = {
      orderId: orderRef.id,
      orderRequestId: req.params.id,
      clientId,
      clientName: requestClientName,
      clientEmail: requestEmail,
      clientPhone: requestPhone,
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const appointmentRef = existingAppointment.empty
      ? db().collection("appointments").doc()
      : existingAppointment.docs[0].ref;
    if (existingAppointment.empty) {
      await appointmentRef.set({
        ...confirmedAppointment,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await appointmentRef.update(confirmedAppointment);
    }

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
      services: requestLineItems.filter((item) => !isTravelFeeLine(item)).map((item) => item.name || String(item)).filter(Boolean),
      travelSummary: travelSummaryText(travel, { miles: true }),
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

    const linkedInvoiceId = existingInvoiceId(request.invoiceId);
    let listingId = existingInvoiceId(request.listingId);
    let invoiceId = linkedInvoiceId;
    if (linkedInvoiceId) {
      const existingInvoice = await db().collection("invoices").doc(linkedInvoiceId).get();
      if (existingInvoice.exists) {
        await existingInvoice.ref.update({
          orderId: orderRef.id,
          clientId,
          galleryId: galleryRef.id,
          clientName: requestClientName,
          clientEmail: requestEmail,
          ...(listingId ? { listingId } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        console.error(`[Bookings] Confirm kept invoiceId ${linkedInvoiceId} but the invoice doc is missing. Not creating a second invoice.`);
      }
    } else {
      const invoiceRef = db().collection("invoices").doc();
      const draft = buildBookingInvoiceDraft({
        lineItems: requestLineItems,
        total: requestTotal,
        pricing: { subtotal: requestSubtotal, tax: Number(request.pricing?.tax) || 0 },
        clientEmail: requestEmail,
        clientId,
        clientName: requestClientName,
        orderRequestId: req.params.id,
        promoCode: request.promoCode,
        promoDiscount: request.promoDiscount,
        travel,
      });
      await invoiceRef.set({
        ...draft,
        orderId: orderRef.id,
        galleryId: galleryRef.id,
        ...(listingId ? { listingId } : {}),
        invoiceNumber: await generateInvoiceNumber(),
        paymentUrl: `${appUrl()}/invoice/${invoiceRef.id}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      invoiceId = invoiceRef.id;
    }

    await galleryRef.update({
      invoiceId,
      deliveryUrl: `${appUrl()}/gallery/${galleryRef.id}`,
    });

    // Mark request as confirmed
    await requestDoc.ref.update({
      status: "confirmed",
      convertedToOrderId: orderRef.id,
      clientId,
      galleryId: galleryRef.id,
      invoiceId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      const ensured = await ensureBookingListingForRequest(req.params.id);
      if (ensured?.listingId) listingId = ensured.listingId;
    } catch (err) {
      console.error("[Bookings] Listing ensure failed:", err);
    }

    try {
      await stampDurableLinks({
        invoiceId,
        orderRequestId: req.params.id,
        orderId: orderRef.id,
        listingId,
      });
    } catch (err) {
      console.error("[Bookings] Order/project/invoice link failed:", err);
    }

    // Send confirmation email to client
    await sendEmail({
      to: requestEmail,
      template: "order_confirmed",
      variables: {
        clientName: requestClientName,
        address: requestAddressLabel,
        scheduledDate: bookingDateLabel(confirmSource, "To be confirmed"),
        scheduledTime: confirmTime || "To be confirmed",
        photographerName: assignedPhotographerName || "Our team",
        travelFee: travelSummaryText(travel),
        orderId: orderRef.id,
        portalUrl: `${appUrl()}/portal`,
      },
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));

    // Confirm schedules the shoot. Square billing waits until after the shoot.

    return res.json({
      success: true,
      orderId: orderRef.id,
      clientId,
      invoiceId,
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

/** Point the order, project, and invoice at each other. Does not change totals or send mail. */
async function stampDurableLinks(input: {
  invoiceId: string | null;
  orderRequestId: string;
  orderId: string;
  listingId: string | null;
}): Promise<void> {
  if (!input.invoiceId || !input.orderId) return;
  const plan = planInvoiceLink({
    orderRequestId: input.orderRequestId,
    orderId: input.orderId,
    listingId: input.listingId,
    orderInvoiceId: input.invoiceId,
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  const invoiceRef = db().collection("invoices").doc(plan.createId);
  const invoiceSnap = await invoiceRef.get();
  if (invoiceSnap.exists && Object.keys(plan.invoiceFields).length > 0) {
    await invoiceRef.update({ ...plan.invoiceFields, updatedAt: now });
  }
  if (plan.orderFields) {
    await db().collection("orders").doc(input.orderId).update({ ...plan.orderFields, updatedAt: now });
  }
  if (input.listingId && plan.listingFields) {
    await db().collection("listings").doc(input.listingId).update({ ...plan.listingFields, updatedAt: now });
  }
}

function linesForConfirmedOrder(request: Record<string, unknown>) {
  const raw = Array.isArray(request.lineItems) && request.lineItems.length > 0
    ? request.lineItems
    : Array.isArray(request.services)
      ? request.services.map((service: unknown) => typeof service === "string" ? { name: service, price: 0 } : service)
      : [];
  const stored = normalizeBookingLineItems(raw).filter((item) => item.name.trim());
  if (chargedServiceLines(stored).length > 0) return stored;
  return planOrderPackageRepair(request)?.lineItems ?? stored;
}

async function linkClientIdByEmail(email: string): Promise<string | null> {
  try {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const snap = await db().collection("clients").where("email", "==", normalized).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
  } catch (err) {
    console.error("[Bookings] Client lookup for invoice failed:", err);
    return null;
  }
}

async function createBookingInvoiceDraft(input: {
  orderRequestId: string;
  email: string;
  clientName: string;
  lineItems: unknown;
  pricing: { subtotal?: unknown; tax?: unknown } | null | undefined;
  total: unknown;
  promoCode?: string | null;
  promoDiscount?: unknown;
  travel?: TravelAssessment | null;
  clientId?: string | null;
}): Promise<{ invoiceId: string; clientId: string | null }> {
  const clientId = input.clientId || await linkClientIdByEmail(input.email);
  const draft = buildBookingInvoiceDraft({
    lineItems: input.lineItems,
    total: input.total,
    pricing: input.pricing,
    clientEmail: input.email,
    clientId,
    clientName: input.clientName,
    orderRequestId: input.orderRequestId,
    promoCode: input.promoCode,
    promoDiscount: input.promoDiscount,
    travel: input.travel,
  });
  const invoiceRef = db().collection("invoices").doc();
  await invoiceRef.set({
    ...draft,
    invoiceNumber: await generateInvoiceNumber(),
    paymentUrl: `${appUrl()}/invoice/${invoiceRef.id}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { invoiceId: invoiceRef.id, clientId };
}

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const snapshot = await db()
    .collection("invoices")
    .where("invoiceNumber", ">=", `INV-${year}-`)
    .where("invoiceNumber", "<", `INV-${year + 1}`)
    .get()
    .catch((err) => {
      console.error("[Bookings] Invoice number lookup failed:", err);
      return null;
    });

  if (!snapshot) {
    return `INV-${year}-${String(Date.now()).slice(-6)}`;
  }

  return nextSequentialInvoiceNumber(
    snapshot.docs.map((entry) => entry.data().invoiceNumber),
    year,
  );
}

export default router;
