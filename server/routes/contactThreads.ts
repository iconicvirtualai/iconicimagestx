import { Router } from "express";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { LIVE_CHAT_MAX_PER_WINDOW, LIVE_CHAT_WINDOW_MS, parseLiveChatBody } from "../services/liveChat";
import {
  appendStaffReply,
  continueClientThread,
  listContactThreads,
  readClientThread,
  startClientThread,
} from "../services/contactThreads";

const router = Router();

const THREAD_ID_RE = /^[a-f0-9]{32}$/;

const postLimiter = createRateLimiter({
  windowMs: LIVE_CHAT_WINDOW_MS,
  max: LIVE_CHAT_MAX_PER_WINDOW,
});

function routeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : "";
}

function threadToken(req: { header(name: string): string | undefined }): string {
  const header = req.header("x-contact-thread-token");
  return typeof header === "string" ? header.trim() : "";
}

/**
 * Portal contact thread.
 * The site widget and the staff communications page share these messages.
 * This router does not email, text, or send marketing.
 */

router.get("/staff/threads", requireCoordinator, async (_req, res) => {
  try {
    const threads = await listContactThreads();
    return res.json({ threads });
  } catch (error) {
    console.error("[ContactThread] List failed.", error);
    return res.status(500).json({ error: "Couldn't load contact chats." });
  }
});

router.post("/staff/threads/:id/reply", requireCoordinator, async (req: AuthenticatedRequest, res) => {
  const id = routeParam(req.params.id);
  if (!THREAD_ID_RE.test(id)) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    return res.status(400).json({ error: "Please enter a reply." });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: "Reply is too long. Please keep it under 2,000 characters." });
  }

  try {
    const thread = await appendStaffReply(id, message, "Iconic Images");
    if (!thread) return res.status(404).json({ error: "Conversation not found." });
    return res.json({ thread });
  } catch (error) {
    console.error("[ContactThread] Staff reply failed.", error);
    return res.status(500).json({ error: "Couldn't save the reply." });
  }
});

router.get("/threads/:id", async (req, res) => {
  const id = routeParam(req.params.id);
  const token = threadToken(req);
  if (!THREAD_ID_RE.test(id) || !token) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  try {
    const thread = await readClientThread(id, token);
    if (!thread) return res.status(404).json({ error: "Conversation not found." });
    return res.json({ thread });
  } catch (error) {
    console.error("[ContactThread] Read failed.", error);
    return res.status(500).json({ error: "Couldn't load this chat." });
  }
});

router.post("/threads", async (req, res) => {
  const parsed = parseLiveChatBody(req.body);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }

  const limit = postLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: "Too many messages. Please wait a few minutes or call us at 281-356-0965.",
    });
  }

  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId.trim() : "";
  const accessToken = typeof req.body?.accessToken === "string" ? req.body.accessToken.trim() : "";
  if ((threadId && !accessToken) || (!threadId && accessToken)) {
    return res.status(400).json({ error: "Conversation credentials are incomplete." });
  }

  try {
    if (threadId) {
      if (!THREAD_ID_RE.test(threadId)) {
        return res.status(404).json({ error: "Conversation not found." });
      }
      const continued = await continueClientThread(threadId, accessToken, parsed.value);
      if (!continued) return res.status(404).json({ error: "Conversation not found." });
      return res.json(continued);
    }

    const created = await startClientThread(parsed.value);
    return res.status(201).json(created);
  } catch (error) {
    console.error("[ContactThread] Client message failed.", error);
    return res.status(500).json({
      error: "We couldn't save your message. Please try again, or call 281-356-0965.",
    });
  }
});

export default router;
