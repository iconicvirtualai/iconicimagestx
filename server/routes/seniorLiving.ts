/**
 * POST /api/senior-living
 * Public request for the senior living page.
 * Writes seniorLivingRequests and notifies the office. Does not email the client.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { BUSINESS_CONTACT } from "../../shared/businessContact";
import {
  SENIOR_LIVING_REQUESTS,
  parseSeniorLivingRequest,
  seniorLivingOfficeEnv,
  seniorLivingOfficeRecord,
} from "../../shared/seniorLiving";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
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
