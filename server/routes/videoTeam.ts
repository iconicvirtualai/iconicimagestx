/**
 * Video team inquiry.
 * Saves an order request tagged source: "video-team-form".
 * Does not send email or SMS, and does not write a calendar event.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { packagesForStaffEditor } from "../../shared/bookingCatalog";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import { orderRequestSignal } from "../../shared/adminUnread";
import { placedRevenueFields } from "../../shared/revenueCount";
import {
  MIKE_CALL_HORIZON_DAYS,
  MIKE_CALL_PHOTOGRAPHER_ID,
  MIKE_CALL_PHOTOGRAPHER_NAME,
  MIKE_CALL_TIME_ZONE,
  MIKE_CALL_WINDOW_LABEL,
  mikeCallSlots,
} from "../../shared/mikeCallSlots";
import {
  VIDEO_TEAM_LEAD,
  VIDEO_TEAM_SOURCE,
  parseVideoTeamInquiry,
  recommendVideoTeamPackages,
  videoTeamAnswerNote,
  videoTeamInquiryLine,
  videoTeamWhereLine,
  type VideoTeamCatalogRow,
} from "../../shared/videoTeamInquiry";
import { bumpAdminUnreadChannel } from "../services/adminUnread";
import { readPhotographerCalendarBlocks } from "../services/bookingAvailability";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { nextOrderNumber } from "../services/orderNumbers";

const router = Router();
const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const db = () => admin.firestore();

export function resetVideoTeamRateLimit() {
  limiter.reset();
}

async function catalogRows(): Promise<VideoTeamCatalogRow[] | undefined> {
  try {
    const snap = await db().collection("packages").get();
    return packagesForStaffEditor(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))).map((pkg) => ({
      id: pkg.id,
      bookingId: pkg.bookingId,
      name: pkg.name,
      price: pkg.price,
      description: pkg.description,
      bookingKind: pkg.bookingKind,
    }));
  } catch (error) {
    console.error("[VideoTeam] Catalog read failed — using the seeded catalog", error);
    return undefined;
  }
}

router.get("/mike-slots", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const now = new Date();
  const timeMax = new Date(now.getTime() + (MIKE_CALL_HORIZON_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  try {
    const blocks = await readPhotographerCalendarBlocks(MIKE_CALL_PHOTOGRAPHER_ID, {
      timeMin: now.toISOString(),
      timeMax,
    });
    return res.json({
      live: true,
      timeZone: MIKE_CALL_TIME_ZONE,
      windows: MIKE_CALL_WINDOW_LABEL,
      photographer: MIKE_CALL_PHOTOGRAPHER_NAME,
      slots: mikeCallSlots({
        now,
        busy: blocks.map((block) => ({ start: block.start, end: block.end })),
      }),
    });
  } catch (error) {
    console.error("[VideoTeam] Mike calendar unavailable:", error);
    return res.json({
      live: false,
      timeZone: MIKE_CALL_TIME_ZONE,
      windows: MIKE_CALL_WINDOW_LABEL,
      photographer: MIKE_CALL_PHOTOGRAPHER_NAME,
      slots: mikeCallSlots({ now }),
      fallback: MIKE_CALL_WINDOW_LABEL,
    });
  }
});

router.post("/inquiry", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many requests. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const parsed = parseVideoTeamInquiry(req.body);
  if (!parsed.ok) {
    if (parsed.honeypot) return res.json({ success: true });
    return res.status(400).json({ error: parsed.error });
  }
  if (!admin.apps.length) {
    return res.status(503).json({
      error: `Orders are not available on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const { value } = parsed;
  const recommendations = recommendVideoTeamPackages(value.answers, await catalogRows());
  const pick = recommendations.find((item) => item.id === value.packageId);
  if (!pick) {
    return res.status(409).json({ error: "Those recommendations changed. Review the packages and try again." });
  }

  let orderNumber = "";
  try {
    orderNumber = await nextOrderNumber();
  } catch (error) {
    console.error("[VideoTeam] Order number failed:", error);
    return res.status(500).json({
      error: `We could not save that request. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  const line = videoTeamInquiryLine(pick);
  const note = videoTeamAnswerNote(value.answers, pick);
  const where = videoTeamWhereLine(value.answers);
  const stamp = admin.firestore.FieldValue.serverTimestamp();

  try {
    const requestRef = await db().collection("orderRequests").add({
      clientName: value.name,
      email: value.email,
      clientEmail: value.email,
      phone: value.phone,
      clientPhone: value.phone,
      address: where,
      propertyAddress: where,
      lineItems: [line],
      services: [line],
      selectedService: pick.bookingKind === "service" ? pick.catalogId : null,
      selectedAddOns: pick.bookingKind === "addon" && pick.catalogId ? [pick.catalogId] : [],
      subtotal: line.price,
      total: line.price,
      pricing: { subtotal: line.price, tax: 0, total: line.price },
      vibeNote: note,
      notes: note,
      status: "new",
      source: VIDEO_TEAM_SOURCE,
      leadSource: VIDEO_TEAM_LEAD,
      videoTeamIntent: value.intent,
      videoTeamPackageId: pick.id,
      videoTeamPriceLabel: pick.priceLabel,
      scheduledDate: value.intent === "call" ? (value.slot?.date || null) : (value.answers.whenDate || null),
      scheduledTime: value.intent === "call" ? (value.slot?.time || null) : null,
      requestedTimeLabel: value.slot?.label || null,
      callSlotStart: value.slot?.start || null,
      callSlotEnd: value.slot?.end || null,
      photographerPreference: value.intent === "call" ? MIKE_CALL_PHOTOGRAPHER_NAME : null,
      bookingPhotographerId: value.intent === "call" ? MIKE_CALL_PHOTOGRAPHER_ID : null,
      orderNumber,
      ...placedRevenueFields(),
      createdAt: stamp,
      submittedAt: stamp,
      updatedAt: stamp,
    });
    await bumpAdminUnreadChannel(orderRequestSignal(VIDEO_TEAM_LEAD));
    return res.json({
      success: true,
      requestId: requestRef.id,
      orderNumber,
      source: VIDEO_TEAM_SOURCE,
    });
  } catch (error) {
    console.error("[VideoTeam] Inquiry save failed:", error);
    return res.status(500).json({
      error: `We could not save that request. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
});

export default router;
