import { Router } from "express";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { LIVE_CHAT_MAX_PER_WINDOW, LIVE_CHAT_WINDOW_MS, LiveChatDeliveryError, deliverLiveChat, parseLiveChatBody } from "../services/liveChat";
import { BUSINESS_CONTACT } from "../../shared/businessContact";

const router = Router();

const liveChatLimiter = createRateLimiter({
  windowMs: LIVE_CHAT_WINDOW_MS,
  max: LIVE_CHAT_MAX_PER_WINDOW,
});

/**
 * POST /api/contact/live-chat
 * Visitor → staff only. Emails the office and best-effort SMS to Google Voice.
 * Does not email or text the visitor.
 */
router.post("/live-chat", async (req, res) => {
  const parsed = parseLiveChatBody(req.body);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }

  const limit = liveChatLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many messages. Please wait a few minutes or call us at ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }

  try {
    const delivery = await deliverLiveChat(parsed.value);
    return res.json({
      success: true,
      emailDelivered: delivery.emailDelivered,
      smsDelivered: delivery.smsDelivered,
      message: "We got your message. A teammate will reply by email or phone.",
    });
  } catch (error) {
    console.error("[LiveChat] Delivery failed:", error);
    if (error instanceof LiveChatDeliveryError && error.code === "not_configured") {
      return res.status(503).json({
        error: `Chat delivery isn't set up on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
      });
    }
    return res.status(500).json({
      error: `We couldn't deliver your message. Please try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`,
    });
  }
});

export default router;
