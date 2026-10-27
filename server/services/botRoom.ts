/**
 * BotRoom storage. Writes go through the Admin SDK.
 * Browser clients are denied in firestore.rules.
 * A local process with no service account keeps an in-memory room so dev
 * still works. Hosted deploys require FIREBASE_SERVICE_ACCOUNT.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import admin from "firebase-admin";
import {
  BOT_ROOM_BODY_MAX,
  BOT_ROOM_DEFAULT_LIMIT,
  BOT_ROOM_HUMAN_SENDER,
  BOT_ROOM_LINK_KINDS,
  BOT_ROOM_MAX_LIMIT,
  BOT_ROOM_RAW_MAX,
  BOT_ROOM_READ_WINDOW,
  BOT_ROOM_TOPIC_MAX,
  botRoomRosterByName,
  isBotRoomDocId,
  isBotRoomPlatform,
  redactBotRoomSecrets,
  stripBotRoomHtml,
  type BotRoomKeyRecord,
  type BotRoomLink,
  type BotRoomMessage,
  type BotRoomPlatform,
  type BotRoomReader,
} from "../../shared/botRoom";
import { isHostedDeployment, liveServerEnv } from "../../shared/tempAdmin";
import { createMemoryFirestore } from "../lib/memoryFirestore";
import { createRateLimiter, type RateLimitResult } from "../lib/rateLimit";

export const BOT_ROOM_MESSAGES = "botRoomMessages";
export const BOT_ROOM_KEYS = "botRoomKeys";

export class BotRoomError extends Error {
  status: number;
  retryAfterSec?: number;

  constructor(status: number, message: string, retryAfterSec?: number) {
    super(message);
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface BotRoomActor {
  sender: string;
  platform: BotRoomPlatform;
  verified: boolean;
  rateId: string;
  /** Set when the shared service key supplied the sender from the request body. */
  unverified: boolean;
}

interface StoredKey extends BotRoomKeyRecord {
  keyHash: string;
}

let override: FirebaseFirestore.Firestore | null = null;
let localMemory: FirebaseFirestore.Firestore | null = null;

const writeLimiter = createRateLimiter({
  windowMs: 60_000,
  max: () => positiveInt(process.env.BOTROOM_WRITE_LIMIT, 30),
});
const readLimiter = createRateLimiter({
  windowMs: 60_000,
  max: () => positiveInt(process.env.BOTROOM_READ_LIMIT, 120),
});
const authFailLimiter = createRateLimiter({
  windowMs: 60_000,
  max: () => positiveInt(process.env.BOTROOM_AUTH_FAIL_LIMIT, 30),
});

export function useBotRoomFirestore(db: FirebaseFirestore.Firestore | null): void {
  override = db;
}

export function resetBotRoomRateLimits(): void {
  writeLimiter.reset();
  readLimiter.reset();
  authFailLimiter.reset();
}

export function botRoomDb(): FirebaseFirestore.Firestore {
  if (override) return override;
  if (admin.apps.length) return admin.firestore();
  if (!isHostedDeployment(liveServerEnv())) {
    if (!localMemory) localMemory = createMemoryFirestore().db;
    return localMemory;
  }
  throw new BotRoomError(503, "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT.");
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function headerValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function presentedBotKey(req: Request): string {
  const primary = headerValue(req.headers["x-botroom-key"]);
  if (primary) return primary;
  return headerValue(req.headers["x-agent-key"]);
}

export function hashBotRoomKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function secretsInPlay(presented: string): string[] {
  return [presented, process.env.AGENT_SERVICE_KEY || ""].filter((value) => value.length >= 8);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asReaders(value: unknown): BotRoomReader[] {
  if (!Array.isArray(value)) return [];
  const readers: BotRoomReader[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const name = asText((row as { name?: unknown }).name).trim();
    const at = asText((row as { at?: unknown }).at).trim();
    if (!name || !at) continue;
    readers.push({ name: name.slice(0, 80), at });
  }
  return readers;
}

function asLinks(value: unknown): BotRoomLink[] {
  if (!Array.isArray(value)) return [];
  const links: BotRoomLink[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const kind = asText((row as { kind?: unknown }).kind);
    const id = asText((row as { id?: unknown }).id);
    if (!(BOT_ROOM_LINK_KINDS as readonly string[]).includes(kind)) continue;
    if (!isBotRoomDocId(id)) continue;
    links.push({ kind: kind as BotRoomLink["kind"], id });
  }
  return links;
}

function toMessage(id: string, data: Record<string, unknown>): BotRoomMessage {
  const platform = asText(data.platform);
  return {
    id,
    createdAt: asText(data.createdAt),
    sender: asText(data.sender),
    platform: isBotRoomPlatform(platform) ? platform : "system",
    topic: asText(data.topic),
    body: asText(data.body),
    mentions: Array.isArray(data.mentions) ? data.mentions.filter((name): name is string => typeof name === "string") : [],
    links: asLinks(data.links),
    needsCadi: data.needsCadi === true,
    replyTo: typeof data.replyTo === "string" && data.replyTo ? data.replyTo : null,
    readers: asReaders(data.readers),
    verified: data.verified !== false,
  };
}

function toKey(id: string, data: Record<string, unknown>): StoredKey {
  const platform = asText(data.platform);
  return {
    id,
    label: asText(data.label),
    botName: asText(data.botName),
    platform: isBotRoomPlatform(platform) ? platform : "grok",
    keyPrefix: asText(data.keyPrefix),
    keyHash: asText(data.keyHash),
    createdAt: asText(data.createdAt),
    createdBy: asText(data.createdBy),
    revokedAt: typeof data.revokedAt === "string" && data.revokedAt ? data.revokedAt : null,
    lastUsedAt: typeof data.lastUsedAt === "string" && data.lastUsedAt ? data.lastUsedAt : null,
  };
}

export function publicBotRoomKey(record: BotRoomKeyRecord): BotRoomKeyRecord {
  return {
    id: record.id,
    label: record.label,
    botName: record.botName,
    platform: record.platform,
    keyPrefix: record.keyPrefix,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
  };
}

async function findKey(raw: string): Promise<StoredKey | null> {
  const snap = await botRoomDb().collection(BOT_ROOM_KEYS).where("keyHash", "==", hashBotRoomKey(raw)).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return toKey(doc.id, doc.data() || {});
}

export async function authenticatePresentedKey(raw: string): Promise<BotRoomActor> {
  const key = raw.trim();
  if (!key) throw new BotRoomError(401, "Invalid bot key.");

  const record = await findKey(key);
  if (record) {
    if (record.revokedAt) throw new BotRoomError(401, "This bot key was revoked.");
    const now = new Date().toISOString();
    try {
      await botRoomDb().collection(BOT_ROOM_KEYS).doc(record.id).update({ lastUsedAt: now });
    } catch (err) {
      console.error("[BotRoom] Could not stamp key use.", err instanceof Error ? err.message : "update failed");
    }
    return {
      sender: record.botName,
      platform: record.platform,
      verified: true,
      unverified: false,
      rateId: `key:${record.id}`,
    };
  }

  const serviceKey = process.env.AGENT_SERVICE_KEY || "";
  if (serviceKey && safeEqual(key, serviceKey)) {
    return {
      sender: "",
      platform: "grok",
      verified: false,
      unverified: true,
      rateId: "agent-service",
    };
  }

  throw new BotRoomError(401, "Invalid bot key.");
}

export function noteRejectedBotKey(ip: string): RateLimitResult {
  return authFailLimiter.check(ip || "unknown");
}

export function consumeBotRoomRate(kind: "read" | "write", rateId: string): void {
  const result = (kind === "write" ? writeLimiter : readLimiter).check(rateId);
  if (!result.allowed) {
    throw new BotRoomError(429, "Too many BotRoom requests. Try again shortly.", result.retryAfterSec);
  }
}

function cleanTopic(value: unknown, secrets: readonly string[]): string {
  if (typeof value !== "string") throw new BotRoomError(400, "A topic is required.");
  if (value.length > 200) throw new BotRoomError(400, "Topic is too long.");
  const topic = redactBotRoomSecrets(stripBotRoomHtml(value), secrets).slice(0, BOT_ROOM_TOPIC_MAX).trim();
  if (!topic) throw new BotRoomError(400, "A topic is required.");
  return topic;
}

function cleanBody(value: unknown, secrets: readonly string[]): string {
  if (typeof value !== "string") throw new BotRoomError(400, "A message body is required.");
  if (value.length > BOT_ROOM_RAW_MAX) throw new BotRoomError(400, "Message body is too long.");
  const body = redactBotRoomSecrets(stripBotRoomHtml(value), secrets);
  if (!body) throw new BotRoomError(400, "A message body is required.");
  if (body.length > BOT_ROOM_BODY_MAX) throw new BotRoomError(400, "Message body is too long.");
  return body;
}

function cleanMentions(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new BotRoomError(400, "Mentions must be a list of bot names.");
  if (value.length > 12) throw new BotRoomError(400, "Too many mentions.");
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") throw new BotRoomError(400, "Mentions must be bot names.");
    const name = entry.trim();
    if (!botRoomRosterByName(name)) throw new BotRoomError(400, `Unknown bot mention: ${name.slice(0, 40)}`);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function cleanLinks(value: unknown): BotRoomLink[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new BotRoomError(400, "Links must be a list.");
  if (value.length > 8) throw new BotRoomError(400, "Too many links.");
  const links: BotRoomLink[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") throw new BotRoomError(400, "Each link needs a kind and an id.");
    const kind = asText((entry as { kind?: unknown }).kind);
    const id = asText((entry as { id?: unknown }).id).trim();
    if (!(BOT_ROOM_LINK_KINDS as readonly string[]).includes(kind)) {
      throw new BotRoomError(400, "Link kind must be order, client, or listing.");
    }
    if (!isBotRoomDocId(id)) throw new BotRoomError(400, "Link id is not valid.");
    links.push({ kind: kind as BotRoomLink["kind"], id });
  }
  return links;
}

function cleanNeedsCadi(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== "boolean") throw new BotRoomError(400, "needsCadi must be true or false.");
  return value;
}

async function assertReplyTarget(replyTo: string): Promise<void> {
  const snap = await botRoomDb().collection(BOT_ROOM_MESSAGES).doc(replyTo).get();
  if (!snap.exists) throw new BotRoomError(400, "replyTo message was not found.");
}

function unverifiedSender(body: Record<string, unknown>): { sender: string; platform: BotRoomPlatform } {
  const sender = asText(body.sender).trim();
  const known = botRoomRosterByName(sender);
  if (!known) throw new BotRoomError(400, "Shared service key posts must include a sender from the bot roster.");
  const requested = asText(body.platform).trim();
  if (!requested) return { sender: known.name, platform: known.platform };
  if (!isBotRoomPlatform(requested)) throw new BotRoomError(400, "Platform is not valid.");
  return { sender: known.name, platform: requested };
}

export interface PostBotRoomInput {
  actor: BotRoomActor;
  body: Record<string, unknown>;
  secrets: readonly string[];
}

export async function postBotRoomMessage(input: PostBotRoomInput): Promise<BotRoomMessage> {
  const identity = input.actor.unverified ? unverifiedSender(input.body) : input.actor;
  const replyRaw = input.body.replyTo;
  let replyTo: string | null = null;
  if (replyRaw != null && replyRaw !== "") {
    if (typeof replyRaw !== "string" || !isBotRoomDocId(replyRaw)) {
      throw new BotRoomError(400, "replyTo is not a message id.");
    }
    replyTo = replyRaw;
    await assertReplyTarget(replyTo);
  }

  const createdAtMs = Date.now();
  const createdAt = new Date(createdAtMs).toISOString();
  const payload = {
    createdAt,
    createdAtMs,
    sender: identity.sender,
    platform: identity.platform,
    topic: cleanTopic(input.body.topic, input.secrets),
    body: cleanBody(input.body.body, input.secrets),
    mentions: cleanMentions(input.body.mentions),
    links: cleanLinks(input.body.links),
    needsCadi: cleanNeedsCadi(input.body.needsCadi),
    replyTo,
    readers: [] as BotRoomReader[],
    verified: input.actor.verified,
  };

  const ref = botRoomDb().collection(BOT_ROOM_MESSAGES).doc();
  await ref.set(payload);
  return toMessage(ref.id, payload);
}

export interface ListBotRoomQuery {
  since?: string;
  topic?: string;
  mention?: string;
  needsCadi?: boolean;
  limit?: number;
}

async function loadWindow(): Promise<Array<{ id: string; createdAtMs: number; message: BotRoomMessage }>> {
  const snap = await botRoomDb().collection(BOT_ROOM_MESSAGES).orderBy("createdAtMs", "desc").limit(BOT_ROOM_READ_WINDOW).get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    const createdAtMs = typeof data.createdAtMs === "number" ? data.createdAtMs : Date.parse(asText(data.createdAt));
    return {
      id: doc.id,
      createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
      message: toMessage(doc.id, data),
    };
  });
}

async function resolveSince(since: string, window: Array<{ id: string; createdAtMs: number }>): Promise<{ ms: number; id: string | null }> {
  const trimmed = since.trim();
  if (!trimmed || trimmed.length > 80) throw new BotRoomError(400, "since must be an ISO time or a message id.");
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) throw new BotRoomError(400, "since must be an ISO time or a message id.");
    return { ms, id: null };
  }
  if (!isBotRoomDocId(trimmed)) throw new BotRoomError(400, "since must be an ISO time or a message id.");
  const found = window.find((row) => row.id === trimmed);
  if (found) return { ms: found.createdAtMs, id: found.id };
  const snap = await botRoomDb().collection(BOT_ROOM_MESSAGES).doc(trimmed).get();
  if (!snap.exists) throw new BotRoomError(404, "since message was not found.");
  const data = snap.data() || {};
  const ms = typeof data.createdAtMs === "number" ? data.createdAtMs : Date.parse(asText(data.createdAt));
  if (!Number.isFinite(ms)) throw new BotRoomError(404, "since message was not found.");
  return { ms, id: snap.id };
}

function isAfter(row: { id: string; createdAtMs: number }, cutoff: { ms: number; id: string | null }): boolean {
  if (row.createdAtMs > cutoff.ms) return true;
  if (row.createdAtMs < cutoff.ms) return false;
  if (!cutoff.id) return false;
  return row.id !== cutoff.id;
}

export async function listBotRoomMessages(query: ListBotRoomQuery): Promise<{ messages: BotRoomMessage[]; nextSince: string | null }> {
  const limit = Math.min(BOT_ROOM_MAX_LIMIT, Math.max(1, query.limit || BOT_ROOM_DEFAULT_LIMIT));
  if (query.topic && query.topic.length > BOT_ROOM_TOPIC_MAX) throw new BotRoomError(400, "Topic filter is too long.");
  if (query.mention && !botRoomRosterByName(query.mention)) throw new BotRoomError(400, "Mention filter must be a bot name.");

  const window = await loadWindow();
  const cutoff = query.since ? await resolveSince(query.since, window) : null;
  const filtered = window.filter((row) => {
    if (cutoff && !isAfter(row, cutoff)) return false;
    if (query.topic && row.message.topic !== query.topic) return false;
    if (query.mention && !row.message.mentions.includes(query.mention)) return false;
    if (query.needsCadi && !row.message.needsCadi) return false;
    return true;
  });
  filtered.sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
  const page = filtered.slice(0, limit).map((row) => row.message);
  return { messages: page, nextSince: page.length ? page[page.length - 1].id : query.since || null };
}

export async function ackBotRoomMessage(id: string, actor: BotRoomActor, body: Record<string, unknown>): Promise<BotRoomMessage> {
  if (!isBotRoomDocId(id)) throw new BotRoomError(400, "Message id is not valid.");
  const name = actor.unverified ? unverifiedSender(body).sender : actor.sender;
  const ref = botRoomDb().collection(BOT_ROOM_MESSAGES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new BotRoomError(404, "Message not found.");
  const data = snap.data() || {};
  const readers = asReaders(data.readers);
  if (!readers.some((reader) => reader.name === name)) {
    readers.push({ name, at: new Date().toISOString() });
    await ref.update({ readers });
  }
  return toMessage(id, { ...data, readers });
}

export async function createBotRoomKey(input: {
  label: string;
  botName: string;
  createdBy: string;
}): Promise<{ key: string; record: BotRoomKeyRecord }> {
  const bot = botRoomRosterByName(input.botName.trim());
  if (!bot) throw new BotRoomError(400, "Choose a bot from the roster.");
  const label = stripBotRoomHtml(input.label).slice(0, 80).trim();
  if (!label) throw new BotRoomError(400, "A key label is required.");
  const key = `br_${randomBytes(24).toString("base64url")}`;
  const createdAt = new Date().toISOString();
  const record: StoredKey = {
    id: "",
    label,
    botName: bot.name,
    platform: bot.platform,
    keyPrefix: key.slice(0, 8),
    keyHash: hashBotRoomKey(key),
    createdAt,
    createdBy: input.createdBy.slice(0, 120),
    revokedAt: null,
    lastUsedAt: null,
  };
  const ref = botRoomDb().collection(BOT_ROOM_KEYS).doc();
  record.id = ref.id;
  await ref.set(record);
  return { key, record: publicBotRoomKey(record) };
}

export async function listBotRoomKeys(): Promise<BotRoomKeyRecord[]> {
  const snap = await botRoomDb().collection(BOT_ROOM_KEYS).get();
  return snap.docs
    .map((doc) => publicBotRoomKey(toKey(doc.id, doc.data() || {})))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function revokeBotRoomKey(id: string): Promise<BotRoomKeyRecord> {
  if (!isBotRoomDocId(id)) throw new BotRoomError(400, "Key id is not valid.");
  const ref = botRoomDb().collection(BOT_ROOM_KEYS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new BotRoomError(404, "Key not found.");
  const current = toKey(id, snap.data() || {});
  if (!current.revokedAt) {
    current.revokedAt = new Date().toISOString();
    await ref.update({ revokedAt: current.revokedAt });
  }
  return publicBotRoomKey(current);
}

export function requestSecrets(presented: string): string[] {
  return secretsInPlay(presented);
}

export { BOT_ROOM_HUMAN_SENDER };
