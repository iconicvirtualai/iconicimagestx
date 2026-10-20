/**
 * Iconic Images — Bookings Routes
 * Handles public booking form submissions and booking management.
 * Place at: server/routes/bookings.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireAdmin, requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { clientOrderReceivedSubject, sendEmail } from "../services/email";
import { sendSMS, SMS_TEMPLATES } from "../services/sms";
import { createCalendarBookingEvent } from "../services/calendar";
import { attachBookingClient, createRequestedAppointment, sendFirebasePasswordEmail } from "../services/bookingClient";
import { ensureBookingListingForRequest } from "../services/bookingListing";
import { assignBookingPhotographerToListing } from "../services/bookingPhotographerAssign";
import { clientNotifyBlockReason, clientNotifyLive, isNotifyTestAllowlisted } from "../../shared/clientNotify";
import { lifeOfTheListingCareSelected } from "../../shared/lifeOfTheListingCare";
import { dotOptInSelected } from "../../shared/doorsOpenTour";
import { buildBookingInvoiceDraft, existingInvoiceId } from "../../shared/bookingInvoice";
import { createPayToken } from "../../shared/invoicePay";
import { processingEnabled } from "../../shared/invoiceProcessing";
import { nextSequentialInvoiceNumber, planInvoiceLink } from "../../shared/orderProjectInvoice";
import { clientInvoiceUrl } from "../../shared/invoicePayLink";
import { publicClientUrl } from "../../shared/publicSiteUrl";
import { chargedServiceLines, normalizeBookingLineItems, orderTotalLabel, resolveSubmittedBooking, sumLineItemPrices, unpricedCatalogBookingError } from "../../shared/bookingPricing";
import { applyServerTravel, isTravelFeeLine, travelInvoiceLine, travelSummaryText, type TravelAssessment } from "../../shared/travelZones";
import { planOrderPackageRepair } from "../../shared/orderPackageRepair";
import { notifyOfficeOfOrder } from "../services/officeOrderNotify";
import { HOLIDAY_RSVP_LEAD, HOLIDAY_SEASON_LEAD, HOLIDAY_SOCIAL_SAVES_LEAD, holidayCheckoutKind, holidayOrderReceivedHtml } from "../../shared/holidayCheckout";
import { THANKFUL_RSVP_CLOSED, quoteThankfulSocialSave, socialRatePreviewAllowed, socialRateView, thankfulRsvpOpen } from "../../shared/thankfulEvent";
import { isActiveStaffRecord } from "../../shared/staffAccess";
import { isTempAdminEnabled } from "../../shared/tempAdmin";
import { HOLIDAY_SLOT_TAKEN_MESSAGE, holidaySlotClaim, holidaySlotIsFull, holidayTakenFromOrders } from "../../shared/holidaySlots";
import { HOLIDAY_OFFICE_CALENDAR_ID, classifyHolidayCalendarOrder } from "../../shared/holidayCalendar";
import { createHolidaySquareCheckout } from "../services/holidaySquareCheckout";
import { loadHolidaySlotOrders } from "../services/holidaySlots";
import { packagesForStaffEditor, publicBookingCatalogResponse } from "../../shared/bookingCatalog";
import { normalizeEmail } from "../../shared/listingAccess";
import { addressText } from "../../shared/addressText";
import { bookingDateLabel } from "../../shared/clientHome";
import { storedServiceLocationFields } from "../../shared/serviceLocation";
import { buildAdminOrderTile } from "../../shared/adminOrderTile";
import { nextOrderNumber } from "../services/orderNumbers";
import { refuseQaStaffAssignment } from "../services/qaStaffAssign";
import { preferenceFromRequest, preferenceName, publicBookingPhotographers, NO_PREFERENCE_ID, NO_PREFERENCE_NAME } from "../services/bookingPhotographers";
import {
  createBookingCalendarHold,
  deleteBookingCalendarHold,
  readBookingAvailability,
  readRealEstate75Availability,
} from "../services/bookingAvailability";
import {
  RE75_LEAD_SOURCE,
  RE75_OUTSIDE_MESSAGE,
  classifyRealEstate75Area,
  isRealEstate75PackageId,
  quoteRealEstate75Travel,
  realEstate75Package,
  sanitizeGclid,
} from "../../shared/realestate75";
import { createHolidayCalendarEvent, deleteHolidayCalendarEvent } from "../services/holidayCalendar";
import { backfillHolidayCalendarEvents } from "../services/holidayCalendarBackfill";
import { isPreferredWindowBooking, resolveBookingAssignment } from "../../shared/bookingAvailability";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";

const router = Router();
const db = () => admin.firestore();

const BOOKING_SUBMIT_WINDOW_MS = 15 * 60 * 1000;
const BOOKING_SUBMIT_MAX = 10;
const bookingSubmitLimiter = createRateLimiter({
  windowMs: BOOKING_SUBMIT_WINDOW_MS,
  max: BOOKING_SUBMIT_MAX,
});

export function resetPublicBookingRateLimit() {
  bookingSubmitLimiter.reset();
}

function orderRequestAdminUrl(id: string): string {
  return publicClientUrl(`/admin/order-request/${encodeURIComponent(id)}`);
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

/** Message only. A Calendar error also carries headers and credentials. */
function calendarHoldFailureMessage(err: unknown): string {
  const message = err instanceof Error
    ? err.message
    : err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";
  return (message || "Calendar hold failed.").slice(0, 300);
}

function failedCalendarHoldNote(slot: { photographerName?: string; label?: string; date?: string; time?: string }): string {
  const photographer = slot.photographerName?.trim() || "the assigned photographer";
  const when = slot.label?.trim() || [slot.date, slot.time].filter(Boolean).join(" ") || "the selected time";
  return `Calendar hold failed for ${photographer} at ${when}. Add it to the calendar manually.`;
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
  const limit = bookingSubmitLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many booking requests. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  let calendarHold: { calendarId: string; eventId: string | null; htmlLink: string | null } | null = null;
  let holidayHold: { calendarId: string; eventId: string | null; htmlLink: string | null } | null = null;
  let holidayEventSaved = false;
  let calendarHoldError: string | null = null;
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
      requestedTimeLabel: postedTimeLabel,
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

    const requestedTimeLabel = typeof postedTimeLabel === "string" ? postedTimeLabel.trim().slice(0, 80) : "";
    if (leadSource === HOLIDAY_RSVP_LEAD && !thankfulRsvpOpen(new Date())) {
      return res.status(400).json({ error: THANKFUL_RSVP_CLOSED });
    }
    const slotClaim = holidaySlotClaim(leadSource, scheduledDate, requestedTimeLabel);
    if (slotClaim && holidaySlotIsFull(await loadHolidaySlotOrders(), slotClaim)) {
      return res.status(409).json({ error: HOLIDAY_SLOT_TAKEN_MESSAGE });
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
    let serviceLines = keptLines;
    const realEstate75Lead = leadSource === RE75_LEAD_SOURCE;
    const realEstate75Area = realEstate75Lead ? classifyRealEstate75Area(displayAddress) : null;
    if (realEstate75Lead) {
      if (!realEstate75Area || realEstate75Area.status !== "inside") {
        return res.status(400).json({ error: RE75_OUTSIDE_MESSAGE });
      }
      const packageId = resolved.selectedBasics[0];
      const onlyApprentice = !resolved.selectedService
        && resolved.selectedBasics.length === 1
        && isRealEstate75PackageId(packageId)
        && resolved.selectedAddOns.length === 0
        && !resolved.premiumUpgrade
        && !(Number(resolved.virtualStagingCredits) > 0);
      if (!onlyApprentice) {
        return res.status(400).json({ error: "This page books Apprentice 25 / $75 or Apprentice 50 / $125 only." });
      }
      const pkg = realEstate75Package(packageId);
      serviceLines = serviceLines.map((item) => (
        item.id === pkg.id ? { ...item, name: pkg.name } : item
      ));
    }
    if (leadSource === HOLIDAY_SOCIAL_SAVES_LEAD) {
      const quoted = quoteThankfulSocialSave({
        label: serviceLines.map((item) => item.name).join("\n"),
        packageName: req.body.socialPackage,
        months: req.body.socialMonths,
        now: new Date(),
      });
      if (!quoted.ok) return res.status(400).json({ error: quoted.error });
      serviceLines = serviceLines.map((item, index) => (
        index === 0
          ? { ...item, unitPrice: quoted.termDollars, price: quoted.termDollars }
          : item
      ));
    }
    let traveled = applyServerTravel(serviceLines, savedAddress);
    if (realEstate75Lead && realEstate75Area?.status === "inside" && realEstate75Area.travelFee === "tbd") {
      const travel = quoteRealEstate75Travel(traveled.travel);
      const kept = traveled.lineItems.filter((item) => !isTravelFeeLine(item));
      const line = travelInvoiceLine(travel);
      traveled = {
        lineItems: [...kept, line],
        total: sumLineItemPrices([...kept, line]),
        travel,
      };
    }
    const travel = traveled.travel;
    const promoCode = resolved.promoCode;
    const promoDiscount = resolved.promoDiscount;
    // New bookings store 2.8% once. The kill switch is server-only.
    // Legacy invoices are not updated here.
    const sale = buildBookingInvoiceDraft({
      lineItems: traveled.lineItems,
      total: traveled.total,
      pricing: { subtotal: traveled.total, tax: 0 },
      clientEmail: email,
      clientName,
      promoCode,
      promoDiscount,
      travel,
      applyProcessing: processingEnabled(),
    });
    const lineItems = sale.lineItems;
    const total = sale.total;
    const pricing = { subtotal: sale.subtotal, tax: sale.tax, total: sale.total };
    const selectedService = resolved.selectedService;
    const selectedBasics = resolved.selectedBasics;
    const selectedAddOns = resolved.selectedAddOns;
    const preferenceId = preferenceFromRequest(req.body.photographerId, photographerPreference);
    // The Wix order page sends a preferred date plus Morning / Midday / Afternoon.
    // That is not a calendar slot. Save it for the office to confirm, and do not
    // ask Google Calendar first. /book still has to pick an open time when live.
    const preferredWindow = isPreferredWindowBooking(req.body);
    let availability: Awaited<ReturnType<typeof readBookingAvailability>> = {
      live: false,
      slots: [],
      durationMinutes: 90,
      bufferMinutes: 30,
      driveMode: "buffer",
    };
    if (!preferredWindow) {
      try {
        availability = realEstate75Lead
          ? await readRealEstate75Availability({
            address: displayAddress,
            packageId: resolved.selectedBasics[0],
          })
          : await readBookingAvailability({
            address: displayAddress,
            preferenceId,
            selectedService: typeof selectedService === "string" ? selectedService : null,
            selectedBasics: Array.isArray(selectedBasics) ? selectedBasics.map((id) => String(id)) : [],
            catalog,
          });
      } catch (err) {
        console.error("[Bookings] Availability check failed — keeping the standard time list:", err);
      }
    }
    const decision = resolveBookingAssignment({
      live: preferredWindow ? false : availability.live,
      slotStart: typeof req.body.slotStart === "string" ? req.body.slotStart : "",
      slots: availability.slots,
    });
    if (decision.ok === false) return res.status(decision.status).json({ error: decision.error });

    let reservedOrderNumber: string | null = null;
    if (decision.slot) {
      try {
        reservedOrderNumber = await nextOrderNumber();
        const serviceSummary = traveled.lineItems
          .filter((item) => !isTravelFeeLine(item))
          .map((item) => item.name)
          .filter(Boolean)
          .join(", ");
        calendarHold = await createBookingCalendarHold({
          photographerId: decision.slot.photographerId,
          orderNumber: reservedOrderNumber,
          clientName,
          clientEmail: String(email || ""),
          clientPhone: String(phone || ""),
          address: displayAddress,
          serviceSummary,
          slot: decision.slot,
          notes: typeof vibeNote === "string" ? vibeNote : "",
        });
      } catch (err) {
        console.error("[Bookings] Calendar hold failed:", err);
        calendarHold = null;
        calendarHoldError = calendarHoldFailureMessage(err);
      }
      if (!calendarHoldError && !calendarHold?.eventId) {
        calendarHoldError = "Calendar returned no event id.";
        console.error("[Bookings] Calendar hold failed:", calendarHoldError);
      }
    }
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
      processing: sale.processing ?? 0,
      processingPolicy: sale.processingPolicy ?? (processingEnabled() ? "included" : "waived"),
      travelZone: travel.travelZone,
      travelMiles: travel.travelMiles,
      travelFeeCents: travel.travelFeeCents,
      travelQuoted: travel.travelQuoted,
      scheduledDate: decision.slot?.date || scheduledDate || null,
      scheduledTime: decision.slot?.time || scheduledTime || null,
      requestedTimeLabel: requestedTimeLabel || null,
      photographerPreference: preferenceName(preferenceId),
      assignedPhotographerName: decision.slot?.photographerName || null,
      bookingPhotographerId: decision.slot?.photographerId || null,
      appointmentDuration: decision.slot ? availability.durationMinutes : null,
      calendarEventId: calendarHold?.eventId || null,
      calendarId: calendarHold?.calendarId || null,
      calendarHtmlLink: calendarHold?.htmlLink || null,
      calendarHold: decision.slot ? (calendarHold?.eventId ? "held" : "failed") : "none",
      calendarHoldError,
      officeFlag: calendarHoldError ? "calendar_hold_failed" : null,
      officeNote: calendarHoldError && decision.slot ? failedCalendarHoldNote(decision.slot) : null,
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
      gclid: sanitizeGclid(req.body.gclid) || null,
      brokerage: typeof req.body.brokerage === "string" ? req.body.brokerage.trim().slice(0, 160) : null,
      marketingDoing: marketingDoing || null,
      resultsBothering: resultsBothering || null,
      perfectBusiness: perfectBusiness || null,
      businessSource: businessSource || null,
      investmentWilling: investmentWilling || null,
      // Draft add-on. Quote only — do not price it or mention it in client email/SMS.
      lifeOfTheListingCare: lifeOfTheListingCareSelected(lifeOfTheListingCare),
      dotOptIn: dotOptInSelected(req.body.dotOptIn),
      dotOptInToken: createPayToken(),
      status: "new",
      source: "booking_form",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db().collection("orderRequests").add(orderRequest);

    // Same short code /admin/orders prints. Stamp it before the office email
    // so the template receives the order number and package name.
    let orderNumber = docRef.id;
    let packageName = "";
    try {
      const tile = buildAdminOrderTile({
        id: docRef.id,
        selectedService: selectedService || null,
        lineItems,
        services: lineItems,
        clientName,
        address: savedAddress,
      });
      orderNumber = tile.orderCode;
      // Short sequential code (#003, #004, …) from an atomic Firestore counter.
      orderNumber = reservedOrderNumber || await nextOrderNumber();
      packageName = tile.packageName === "Custom order" ? "" : tile.packageName;
    } catch (err) {
      console.error("[Bookings] Order number format failed:", err);
    }
    let holidayPatch: Record<string, unknown> = {};
    const holidayDecision = classifyHolidayCalendarOrder({
      ...orderRequest,
      id: docRef.id,
      orderNumber,
      ...(packageName ? { packageName } : {}),
    }, orderRequestAdminUrl(docRef.id));
    if (holidayDecision.action === "create") {
      let holidayError: string | null = null;
      try {
        const created = await createHolidayCalendarEvent(holidayDecision.plan);
        if (!created?.eventId) holidayError = "Calendar returned no event id.";
        else holidayHold = created;
      } catch (err) {
        console.error("[Bookings] Holiday calendar event failed:", err);
        holidayError = calendarHoldFailureMessage(err);
        holidayHold = null;
      }
      if (holidayError) console.error("[Bookings] Holiday calendar event failed:", holidayError);
      holidayPatch = holidayHold?.eventId
        ? {
          calendarEventId: holidayHold.eventId,
          calendarId: holidayHold.calendarId,
          calendarHtmlLink: holidayHold.htmlLink,
          calendarHold: "held",
          calendarHoldError: null,
          officeFlag: null,
          officeNote: null,
          ...(holidayDecision.plan.movedFrom ? { scheduledDate: holidayDecision.plan.date } : {}),
        }
        : {
          calendarEventId: null,
          calendarId: HOLIDAY_OFFICE_CALENDAR_ID,
          calendarHtmlLink: null,
          calendarHold: "failed",
          calendarHoldError: holidayError,
          officeFlag: "calendar_hold_failed",
          officeNote: "Holiday calendar event was not created. Add it to the photos calendar manually.",
        };
    }
    try {
      await docRef.update({
        orderNumber,
        ...(packageName ? { packageName } : {}),
        ...holidayPatch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      holidayEventSaved = Boolean(holidayHold?.eventId);
    } catch (err) {
      console.error("[Bookings] Order number was not saved:", err);
      if (holidayHold?.eventId) {
        await deleteHolidayCalendarEvent({
          calendarId: holidayHold.calendarId,
          eventId: holidayHold.eventId,
        }).catch((deleteErr) => console.error("[Bookings] Holiday calendar cleanup failed:", deleteErr));
        holidayHold = null;
      }
    }

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
          scheduledDate: decision.slot?.date || (typeof scheduledDate === "string" ? scheduledDate : null),
          scheduledTime: decision.slot?.time || (typeof scheduledTime === "string" ? scheduledTime : null),
          photographerName: decision.slot?.photographerName || null,
          bookingPhotographerId: decision.slot?.photographerId || null,
          services: traveled.lineItems,
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
        prepared: sale,
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
    const shownTime = requestedTimeLabel || (typeof scheduledTime === "string" ? scheduledTime : "");
    const holidayMailKind = holidayCheckoutKind(leadSource, total);
    const holidayHtml = holidayMailKind === "none" ? "" : holidayOrderReceivedHtml({
      clientName,
      serviceName: typeof selectedService === "string" && selectedService.trim() ? selectedService : "Holiday order",
      whenDate: bookingDateLabel(scheduledDate, "TBD — we'll confirm shortly"),
      whenTime: shownTime,
      total: money(total),
      requestId: docRef.id,
      pagePath: leadSource === HOLIDAY_SEASON_LEAD ? "/tis-the-season" : "/thankful",
      complimentary: holidayMailKind === "free",
    });

    // Order-received confirmation to the client. booking_received is excluded from the
    // RED blast kill and sends even when CLIENT_NOTIFY_LIVE is unset.
    // Holiday orders send their own HTML so a stored real-estate template cannot replace it.
    clientEmailStatus = await sendEmail({
      to: email,
      template: "booking_received",
      subject: clientOrderReceivedSubject(displayAddress, orderNumber),
      html: holidayHtml || undefined,
      lockHtml: Boolean(holidayHtml),
      variables: {
        clientName,
        address: displayAddress,
        orderNumber,
        processing: money(sale.processing ?? 0),
        total: money(total),
        requestId: docRef.id,
        scheduledDate: bookingDateLabel(scheduledDate, "TBD — we'll confirm shortly"),
        scheduledTime: shownTime,
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        travelFee: travelSummaryText(travel),
        dashboardUrl: orderRequestAdminUrl(docRef.id),
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
            portalUrl: publicClientUrl("/portal"),
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
      const savedOrder = {
        id: savedSnap.id,
        ...(savedSnap.data() || {}),
        orderNumber,
        ...(packageName ? { packageName } : {}),
      } as Record<string, unknown>;
      const alert = await notifyOfficeOfOrder({
        isNewOrder: true,
        saved: savedOrder,
        adminUrl: orderRequestAdminUrl(savedSnap.id),
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

    // Firestore draft stays for staff. Square invoices still wait until after the shoot.
    // Holiday Buy Now is the exception: a payment link for this order's total.
    // A free RSVP does not get one. Missing Square env vars keep the text-a-link fallback.
    let holidayCheckout: {
      payment: "square" | "free" | "fallback";
      checkoutUrl?: string;
      missingEnv?: string[];
    } | null = null;
    const holidayKind = holidayCheckoutKind(leadSource, total);
    if (holidayKind === "free") {
      holidayCheckout = { payment: "free" };
    } else if (holidayKind === "paid") {
      if (!invoiceId) {
        holidayCheckout = { payment: "fallback" };
      } else {
        try {
          const invoiceSnap = await db().collection("invoices").doc(invoiceId).get();
          const invoiceData = invoiceSnap.data() || {};
          const invoiceNumber = typeof invoiceData.invoiceNumber === "string" ? invoiceData.invoiceNumber : undefined;
          const linked = await createHolidaySquareCheckout({
            invoiceId,
            invoiceNumber,
            amount: Number(total) || 0,
            email: normalizedEmail,
            itemName: typeof selectedService === "string" && selectedService.trim()
              ? selectedService
              : "Holiday order",
            leadSource: typeof leadSource === "string" ? leadSource : "",
            orderNumber,
          });
          if (linked.payment === "square" && linked.checkoutUrl) {
            await db().collection("invoices").doc(invoiceId).update({
              paymentProvider: "square",
              paymentUrl: linked.checkoutUrl,
              squarePaymentLinkId: linked.linkId || null,
              squareOrderId: linked.squareOrderId || null,
              status: "sent",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch((err) => console.error("[Bookings] Holiday payment link was not saved:", err));
          }
          holidayCheckout = {
            payment: linked.payment,
            ...(linked.checkoutUrl ? { checkoutUrl: linked.checkoutUrl } : {}),
            ...(linked.missingEnv?.length ? { missingEnv: linked.missingEnv } : {}),
          };
        } catch (err) {
          console.error("[Bookings] Holiday checkout failed:", err);
          holidayCheckout = { payment: "fallback" };
        }
      }
    }

    return res.status(201).json({
      success: true,
      requestId: docRef.id,
      orderNumber,
      invoiceId,
      accountCreated: account.createdAccount,
      notifications,
      ...(holidayCheckout ? { payment: holidayCheckout.payment } : {}),
      ...(holidayCheckout?.checkoutUrl ? { checkoutUrl: holidayCheckout.checkoutUrl } : {}),
      ...(holidayCheckout?.missingEnv ? { missingEnv: holidayCheckout.missingEnv } : {}),
      message: "Booking request received. We'll confirm shortly!",
    });
  } catch (err) {
    console.error("[Bookings] Submission error:", err);
    if (calendarHold?.eventId) {
      await deleteBookingCalendarHold({
        calendarId: calendarHold.calendarId,
        eventId: calendarHold.eventId,
      }).catch((deleteErr) => console.error("[Bookings] Calendar hold cleanup failed:", deleteErr));
    }
    if (holidayHold?.eventId && !holidayEventSaved) {
      await deleteHolidayCalendarEvent({
        calendarId: holidayHold.calendarId,
        eventId: holidayHold.eventId,
      }).catch((deleteErr) => console.error("[Bookings] Holiday calendar cleanup failed:", deleteErr));
    }
    return res.status(500).json({ error: "Failed to submit booking request." });
  }
});

async function socialRateCaller(req: { headers: { authorization?: string | string[] } }): Promise<{ role: string | null; email: string | null }> {
  const header = req.headers.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw?.startsWith("Bearer ")) return { role: null, email: null };
  const token = raw.slice("Bearer ".length).trim();
  if (!token) return { role: null, email: null };
  if (isTempAdminEnabled() && token === "temp-admin-token") return { role: "admin", email: null };
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = typeof decoded.email === "string" ? decoded.email : null;
    let role: string | null = null;
    const staff = await admin.firestore().collection("staff").doc(decoded.uid).get();
    if (staff.exists && isActiveStaffRecord(staff.data())) role = String(staff.data()?.role || "");
    return { role, email };
  } catch {
    return { role: null, email: null };
  }
}

// Today's social rate only. The full table stays on the server.
// ?date= is a preview for an active admin or the delivery-QA test mailbox.
router.get("/social-rate", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const requested = typeof req.query.date === "string" ? req.query.date : "";
  const previewAllowed = requested
    ? socialRatePreviewAllowed(await socialRateCaller(req))
    : false;
  return res.json(socialRateView(new Date(), requested || null, previewAllowed));
});

// Public times only. Names and emails stay on the order.
router.post("/holiday-calendar-backfill", requireAdmin, async (_req, res) => {
  try {
    return res.json(await backfillHolidayCalendarEvents());
  } catch (err) {
    console.error("[Bookings] Holiday calendar backfill failed:", err);
    return res.status(500).json({ error: "Holiday calendar backfill failed." });
  }
});

router.get("/holiday-slots", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    return res.json(holidayTakenFromOrders(await loadHolidaySlotOrders()));
  } catch (err) {
    console.error("[Bookings] Holiday slot list failed:", err);
    return res.status(500).json({ error: "Holiday slots are unavailable." });
  }
});

// ─── GET /api/bookings/catalog — Public packages /book can sell ───────────────
// Registered before /:id so "catalog" is not read as a booking request id.

router.get("/photographers", (_req, res) => {
  return res.json({
    noPreference: { id: NO_PREFERENCE_ID, name: NO_PREFERENCE_NAME },
    photographers: publicBookingPhotographers(),
  });
});

router.get("/realestate-75/slots", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const pkg = realEstate75Package(typeof req.query.package === "string" ? req.query.package : "");
  try {
    const availability = await readRealEstate75Availability({
      address: typeof req.query.address === "string" ? req.query.address : "",
      packageId: pkg.id,
    });
    return res.json({
      live: availability.live,
      durationMinutes: availability.durationMinutes,
      packageId: pkg.id,
      slots: availability.live ? availability.slots : [],
    });
  } catch (err) {
    console.error("[Bookings] Apprentice slot lookup failed:", err);
    return res.json({ live: false, durationMinutes: pkg.durationMinutes, packageId: pkg.id, slots: [] });
  }
});

router.get("/slots", async (req, res) => {
  const basics = typeof req.query.basics === "string"
    ? req.query.basics.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  const preferenceId = preferenceFromRequest(req.query.photographer, "");
  try {
    const catalog = await loadBookingCatalog();
    const availability = await readBookingAvailability({
      address: typeof req.query.address === "string" ? req.query.address : "",
      preferenceId,
      selectedService: typeof req.query.service === "string" ? req.query.service : null,
      selectedBasics: basics,
      catalog,
    });
    return res.json({
      live: availability.live,
      durationMinutes: availability.durationMinutes,
      slots: availability.live ? availability.slots : [],
    });
  } catch (err) {
    console.error("[Bookings] Slot lookup failed — keeping the standard time list:", err);
    return res.json({ live: false, durationMinutes: 90, slots: [] });
  }
});

router.get("/catalog", async (_req, res) => {
  const catalog = await loadBookingCatalog();
  return res.json({
    ...publicBookingCatalogResponse(catalog),
    processingEnabled: processingEnabled(),
  });
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

// ─── POST /api/bookings/:id/assign-photographer — staff uid on the listing ───

router.post("/:id/assign-photographer", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const requestDoc = await db().collection("orderRequests").doc(req.params.id).get();
    if (!requestDoc.exists) return res.status(404).json({ error: "Booking request not found." });
    const request = requestDoc.data() || {};
    const posted = typeof req.body?.listingId === "string" ? req.body.listingId.trim() : "";
    const listingId = posted || (typeof request.listingId === "string" ? request.listingId.trim() : "");
    if (!listingId) return res.status(400).json({ error: "Listing is missing." });
    const assigned = await assignBookingPhotographerToListing(listingId, request);
    return res.json({ success: true, photographerUid: assigned.uid, publicId: assigned.publicId });
  } catch (err) {
    console.error("[Bookings] Photographer assign failed:", err);
    return res.status(500).json({ error: "Could not assign the photographer." });
  }
});

// ─── PATCH /api/bookings/:id/confirm — Confirm and convert to Order ──────────

router.patch("/:id/confirm", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const { assignedPhotographerId, assignedPhotographerName: postedPhotographerName, scheduledDate, scheduledTime, internalNotes } = req.body;
    const requestDoc = await db().collection("orderRequests").doc(req.params.id).get();

    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }

    const request = requestDoc.data()!;
    const assignedPhotographerName = (typeof postedPhotographerName === "string" && postedPhotographerName.trim())
      ? postedPhotographerName.trim()
      : (typeof request.assignedPhotographerName === "string" ? request.assignedPhotographerName : null);
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
      const existingGalleryId = existingInvoiceId(request.galleryId);
      if (existingGalleryId && listingId) {
        await db().collection("galleries").doc(existingGalleryId).set({
          listingId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (listingId) {
        try {
          await assignBookingPhotographerToListing(listingId, request);
        } catch (err) {
          console.error("[Bookings] Photographer assign failed:", err);
        }
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
      photographer = staffDoc.exists ? { id: staffDoc.id, ...staffDoc.data()! } : null;
      const refusal = await refuseQaStaffAssignment({
        staff: photographer ? [photographer] : [],
        record: { id: requestDoc.id, ...request },
      });
      if (refusal) return res.status(refusal.status).json({ error: refusal.error });
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
      orderNumber: typeof request.orderNumber === "string" ? request.orderNumber : "",
      address: requestAddress,
      addressLabel: requestAddressLabel,
      ...storedPin,
      services: requestLineItems,
      lineItems: requestLineItems,
      selectedService: request.selectedService || null,
      addOns: Array.isArray(request.selectedAddOns) ? [...request.selectedAddOns] : [],
      selectedAddOns: Array.isArray(request.selectedAddOns) ? [...request.selectedAddOns] : [],
      ...(typeof request.processing === "number" ? { processing: request.processing } : {}),
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
      lockboxCode: request.lockboxCode || null,
      propertyStatus: request.propertyStatus || null,
      furnishingStatus: request.furnishingStatus || null,
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      lifeOfTheListingCare: lifeOfTheListingCareSelected(request.lifeOfTheListingCare),
      dotOptIn: dotOptInSelected(request.dotOptIn),
      dotOptInToken: typeof request.dotOptInToken === "string" && request.dotOptInToken.trim()
        ? request.dotOptInToken.trim()
        : createPayToken(),
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

    let listingIdForGallery = existingInvoiceId(request.listingId);
    try {
      const ensuredEarly = await ensureBookingListingForRequest(req.params.id);
      if (ensuredEarly?.listingId) listingIdForGallery = ensuredEarly.listingId;
    } catch (err) {
      console.error("[Bookings] Listing ensure failed:", err);
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
      ...(listingIdForGallery ? { listingId: listingIdForGallery } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const existingEventId = typeof request.calendarEventId === "string" ? request.calendarEventId : "";
    const calendarResult = existingEventId
      ? {
          calendarId: typeof request.calendarId === "string" ? request.calendarId : "",
          eventId: existingEventId,
          htmlLink: typeof request.calendarHtmlLink === "string" ? request.calendarHtmlLink : null,
        }
      : await createCalendarBookingEvent({
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
    let listingId = listingIdForGallery;
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
      const payToken = createPayToken();
      const paymentUrl = clientInvoiceUrl({ id: invoiceRef.id, status: "draft", payToken });
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
        // A request quoted with processing already has the fee on its lines.
        // Older requests have no policy, so confirming them does not add one.
        applyProcessing: request.processingPolicy === "included",
      });
      await invoiceRef.set({
        ...draft,
        orderId: orderRef.id,
        galleryId: galleryRef.id,
        ...(listingId ? { listingId } : {}),
        invoiceNumber: await generateInvoiceNumber(),
        payToken,
        ...(paymentUrl ? { paymentUrl } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      invoiceId = invoiceRef.id;
    }

    await galleryRef.update({
      invoiceId,
      deliveryUrl: publicClientUrl(`/gallery/${galleryRef.id}`),
    });

    // Mark request as confirmed
    await requestDoc.ref.update({
      status: "confirmed",
      convertedToOrderId: orderRef.id,
      clientId,
      galleryId: galleryRef.id,
      invoiceId,
      dotOptInToken: orderData.dotOptInToken,
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

    if (listingId) {
      await galleryRef.update({
        listingId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      try {
        await assignBookingPhotographerToListing(listingId, request);
      } catch (err) {
        console.error("[Bookings] Photographer assign failed:", err);
      }
    }

    // Send confirmation email to client
    await sendEmail({
      to: requestEmail,
      template: "order_confirmed",
      variables: {
        clientName: requestClientName,
        address: requestAddressLabel,
        orderNumber: typeof request.orderNumber === "string" ? request.orderNumber : "",
        scheduledDate: bookingDateLabel(confirmSource, "To be confirmed"),
        scheduledTime: confirmTime || "To be confirmed",
        photographerName: assignedPhotographerName || "Our team",
        travelFee: travelSummaryText(travel),
        orderId: orderRef.id,
        portalUrl: publicClientUrl("/portal"),
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

async function releaseOrderCalendar(data: Record<string, unknown>): Promise<string | null> {
  const eventId = typeof data.calendarEventId === "string" ? data.calendarEventId : "";
  if (!eventId) return null;
  const calendarId = typeof data.calendarId === "string" && data.calendarId
    ? data.calendarId
    : HOLIDAY_OFFICE_CALENDAR_ID;
  try {
    await deleteHolidayCalendarEvent({ calendarId, eventId });
    return null;
  } catch (err) {
    console.error("[Bookings] Holiday calendar delete failed:", err);
    return calendarHoldFailureMessage(err);
  }
}

router.patch("/:id/cancel", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  try {
    const doc = await db().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found." });
    const data = doc.data() || {};
    const calendarError = await releaseOrderCalendar(data);
    const hadEvent = typeof data.calendarEventId === "string" && data.calendarEventId.length > 0;
    const history = Array.isArray(data.history) ? data.history : [];
    await doc.ref.update({
      status: "cancelled",
      history: [...history, {
        action: "Order cancelled by admin",
        by: req.user?.email || "admin",
        at: new Date().toISOString(),
        details: "",
      }],
      ...(calendarError
        ? {
          calendarHold: "failed",
          calendarHoldError: calendarError,
          officeFlag: "calendar_hold_failed",
        }
        : hadEvent ? { calendarHold: "none" } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ success: true, calendarDeleted: !calendarError });
  } catch (err) {
    console.error("[Bookings] Cancel error:", err);
    return res.status(500).json({ error: "Failed to cancel booking." });
  }
});

router.patch("/:id/decline", requireCoordinator, async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await db().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found." });
    const data = doc.data() || {};
    const calendarError = await releaseOrderCalendar(data);
    const hadEvent = typeof data.calendarEventId === "string" && data.calendarEventId.length > 0;

    await doc.ref.update({
      status: "declined",
      declineReason: reason || "",
      ...(calendarError
        ? {
          calendarHold: "failed",
          calendarHoldError: calendarError,
          officeFlag: "calendar_hold_failed",
        }
        : hadEvent ? { calendarHold: "none" } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, calendarDeleted: !calendarError });
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
  prepared?: ReturnType<typeof buildBookingInvoiceDraft> | null;
}): Promise<{ invoiceId: string; clientId: string | null }> {
  const clientId = input.clientId || await linkClientIdByEmail(input.email);
  const draft = input.prepared
    ? { ...input.prepared, orderRequestId: input.orderRequestId, clientId: clientId || input.prepared.clientId }
    : buildBookingInvoiceDraft({
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
  const payToken = createPayToken();
  const paymentUrl = clientInvoiceUrl({ id: invoiceRef.id, status: "draft", payToken });
  await invoiceRef.set({
    ...draft,
    invoiceNumber: await generateInvoiceNumber(),
    payToken,
    ...(paymentUrl ? { paymentUrl } : {}),
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
