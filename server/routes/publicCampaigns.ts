/**
 * Public holiday and Iconic Studios requests.
 * Saves to orderRequests and flags the office. Does not email the client
 * and does not turn CLIENT_NOTIFY_LIVE on. Does not invent a Square URL.
 */

import { Router, type Request, type Response } from "express";
import admin from "firebase-admin";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import { parseHolidayBooking } from "../../shared/holidayPromo";
import { parseStudiosRequest } from "../../shared/iconicStudiosPublic";
import { HOLIDAY_PAY_LINK_ENV, PUBLIC_PROCESSING_NOTE, readSquarePayLink, STUDIOS_PAY_LINK_ENV } from "../../shared/publicRequests";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { notifyOfficeOfOrder } from "../services/officeOrderNotify";

const router = Router();

export const PUBLIC_CAMPAIGN_RATE_MAX = 8;
const limiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: PUBLIC_CAMPAIGN_RATE_MAX,
});

export function resetPublicCampaignRateLimit() {
  limiter.reset();
}

function appUrl() {
  return (process.env.APP_URL || "https://iconicimagestx.com").replace(/\/$/, "");
}

const db = () => admin.firestore();

function unavailable(res: Response) {
  return res.status(503).json({
    error: `Requests are not available on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
  });
}

async function saveOfficeRequest(res: Response, record: object) {
  if (!admin.apps.length) return unavailable(res);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const fields = record as Record<string, unknown>;
  const data = {
    ...fields,
    status: "new",
    createdAt: now,
    submittedAt: now,
    updatedAt: now,
  };
  try {
    const ref = await db().collection("orderRequests").add(data);
    try {
      await notifyOfficeOfOrder({
        isNewOrder: true,
        saved: { ...fields, id: ref.id },
        adminUrl: `${appUrl()}/admin/orders`,
        env: process.env,
      });
    } catch (error) {
      console.error("[PublicCampaigns] Office notify failed:", error);
    }
    return res.status(201).json({
      success: true,
      requestId: ref.id,
      message: "Request received. The office will confirm. This is not a charge.",
    });
  } catch (error) {
    console.error("[PublicCampaigns] Save failed:", error);
    return res.status(500).json({
      error: `We could not save that request. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
}

function limited(req: Request, res: Response) {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    res.status(429).json({
      error: `Too many requests. Please wait and try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
    return true;
  }
  return false;
}

router.get("/holiday", (_req, res) => {
  res.json({
    payLink: readSquarePayLink(process.env[HOLIDAY_PAY_LINK_ENV]),
    processingNote: PUBLIC_PROCESSING_NOTE,
  });
});

router.post("/holiday", async (req, res) => {
  if (limited(req, res)) return;
  const parsed = parseHolidayBooking(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot) return res.json({ success: true, message: "Request received." });
    return res.status(400).json({ error: parsed.error });
  }
  return saveOfficeRequest(res, parsed.record);
});

router.get("/studios", (_req, res) => {
  res.json({
    payLink: readSquarePayLink(process.env[STUDIOS_PAY_LINK_ENV]),
    processingNote: PUBLIC_PROCESSING_NOTE,
  });
});

router.post("/studios", async (req, res) => {
  if (limited(req, res)) return;
  const parsed = parseStudiosRequest(req.body);
  if (parsed.ok === false) {
    if (parsed.honeypot) return res.json({ success: true, message: "Request received." });
    return res.status(400).json({ error: parsed.error });
  }
  return saveOfficeRequest(res, parsed.record);
});

export default router;
