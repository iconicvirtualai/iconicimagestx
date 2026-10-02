import { Router } from "express";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { LIVE_CHAT_MAX_PER_WINDOW, LIVE_CHAT_WINDOW_MS, deliverLiveChat, parseLiveChatBody } from "../services/liveChat";

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
      error: "Too many messages. Please wait a few minutes or call us at 281-356-0965.",
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
    return res.status(500).json({
      error: "We couldn't deliver your message. Please try again, or call 281-356-0965.",
    });
  }
});

export default router;
