/**
 * BotRoom HTTP API.
 * Bots authenticate with x-botroom-key (or the shared x-agent-key).
 * Owners and admins use their staff session and post as Cadi.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { BOT_ROOM_HUMAN_SENDER, botRoomOpenApi } from "../../shared/botRoom";
import { canUseAssistants } from "../../shared/communications/access";
import { ownerAllowlist } from "../../shared/ownerAccess";
import { clientIp } from "../lib/clientIp";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import {
  BotRoomError,
  ackBotRoomMessage,
  authenticatePresentedKey,
  consumeBotRoomRate,
  createBotRoomKey,
  listBotRoomKeys,
  listBotRoomMessages,
  noteRejectedBotKey,
  postBotRoomMessage,
  presentedBotKey,
  publicBotRoomKey,
  requestSecrets,
  revokeBotRoomKey,
  type BotRoomActor,
} from "../services/botRoom";

const router = Router();

interface BotRoomRequest extends AuthenticatedRequest {
  botIdentity?: BotRoomActor;
  presentedKey?: string;
}

function sendBotRoomError(res: Response, err: unknown): void {
  if (res.headersSent) return;
  if (err instanceof BotRoomError) {
    if (err.retryAfterSec) res.setHeader("Retry-After", String(err.retryAfterSec));
    res.status(err.status).json({
      error: err.message,
      ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}),
    });
    return;
  }
  console.error("[BotRoom]", err instanceof Error ? err.message : "request failed");
  res.status(500).json({ error: "BotRoom request failed." });
}

function wrap(handler: (req: BotRoomRequest, res: Response, next: NextFunction) => Promise<unknown> | unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as BotRoomRequest, res, next)).catch((err) => sendBotRoomError(res, err));
  };
}

function ownerEmails(): string[] {
  return ownerAllowlist(process.env.OWNER_EMAILS);
}

async function requireOwnerOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  await requireStaff(req, res, () => {
    if (!canUseAssistants({ role: req.staffRole, email: req.user?.email, ownerEmails: ownerEmails() })) {
      res.status(403).json({ error: "Owner or admin access required." });
      return;
    }
    next();
  });
}

function staffActor(req: AuthenticatedRequest): BotRoomActor {
  return {
    sender: BOT_ROOM_HUMAN_SENDER,
    platform: "human",
    verified: true,
    unverified: false,
    rateId: `staff:${req.user?.uid || "staff"}`,
  };
}

const requireBotOrOwner = wrap(async (req, res, next) => {
  const key = presentedBotKey(req);
  if (key) {
    try {
      req.botIdentity = await authenticatePresentedKey(key);
      req.presentedKey = key;
    } catch (err) {
      if (err instanceof BotRoomError && err.status === 401) {
        const gate = noteRejectedBotKey(clientIp(req));
        if (!gate.allowed) {
          throw new BotRoomError(429, "Too many BotRoom requests. Try again shortly.", gate.retryAfterSec);
        }
      }
      throw err;
    }
    next();
    return;
  }

  await requireOwnerOrAdmin(req, res, () => {
    req.botIdentity = staffActor(req);
    req.presentedKey = "";
    next();
  });
});

function actor(req: BotRoomRequest): BotRoomActor {
  if (!req.botIdentity) throw new BotRoomError(401, "Invalid bot key.");
  return req.botIdentity;
}

function rateKind(method: string): "read" | "write" {
  return method === "GET" || method === "HEAD" ? "read" : "write";
}

const limitActor = wrap(async (req, _res, next) => {
  consumeBotRoomRate(rateKind(req.method), actor(req).rateId);
  next();
});

function queryFlag(value: unknown): boolean {
  return value === "true" || value === "1";
}

function queryString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.get("/openapi.json", (req, res) => {
  const forwardedProto = req.get("x-forwarded-proto");
  const proto = forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol;
  const forwardedHost = req.get("x-forwarded-host");
  const host = forwardedHost ? forwardedHost.split(",")[0].trim() : req.get("host");
  res.json(botRoomOpenApi(`${proto}://${host}/api/botroom`));
});

router.get("/messages", requireBotOrOwner, limitActor, wrap(async (req, res) => {
  const limit = queryString(req.query.limit);
  const parsedLimit = limit ? Number(limit) : undefined;
  if (limit && !Number.isInteger(parsedLimit)) throw new BotRoomError(400, "limit must be a whole number.");
  const result = await listBotRoomMessages({
    since: queryString(req.query.since) || undefined,
    topic: queryString(req.query.topic) || undefined,
    mention: queryString(req.query.mention) || undefined,
    needsCadi: queryFlag(req.query.needsCadi),
    limit: parsedLimit,
  });
  res.json(result);
}));

router.post("/messages", requireBotOrOwner, limitActor, wrap(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const message = await postBotRoomMessage({
    actor: actor(req),
    body,
    secrets: requestSecrets(req.presentedKey || ""),
  });
  res.status(201).json({ message });
}));

router.post("/messages/:id/ack", requireBotOrOwner, limitActor, wrap(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const message = await ackBotRoomMessage(req.params.id, actor(req), body);
  res.json({ message });
}));

router.get("/keys", wrap(async (req, res, next) => {
  await requireOwnerOrAdmin(req, res, next);
}), wrap(async (_req, res) => {
  const keys = await listBotRoomKeys();
  res.json({ keys: keys.map(publicBotRoomKey) });
}));

router.post("/keys", wrap(async (req, res, next) => {
  await requireOwnerOrAdmin(req, res, next);
}), wrap(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const created = await createBotRoomKey({
    label: typeof body.label === "string" ? body.label : "",
    botName: typeof body.botName === "string" ? body.botName : "",
    createdBy: req.user?.uid || "staff",
  });
  res.status(201).json(created);
}));

router.post("/keys/:id/revoke", wrap(async (req, res, next) => {
  await requireOwnerOrAdmin(req, res, next);
}), wrap(async (req, res) => {
  const record = await revokeBotRoomKey(req.params.id);
  res.json({ record: publicBotRoomKey(record) });
}));

export default router;
