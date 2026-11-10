/**
 * Publish a team message and decide push vs SMS.
 * Clients are never texted and never emailed from this module.
 * SMS uses Twilio directly and only when TEAM_SMS_LIVE is exactly "true".
 * It does not call the client-notification SMS gate.
 */

import twilio from "twilio";
import { bumpAdminUnreadChannel } from "./adminUnread.ts";
import { sendTeamPush, type TeamPushPayload } from "./teamPush.ts";
import {
  getTeamChatRepo,
  newId,
  type PushSubscriptionRecord,
  type StoredThread,
  type TeamChatRepo,
  type TeamStaffRecord,
} from "./teamChatRepo.ts";
import {
  chooseStaffNotify,
  emptyTeamChatPrefs,
  formatTeamSms,
  inQuietHours,
  makeThreadCode,
  parseInboundTeamSms,
  presentDirectory,
  presentSmsLog,
  teamSmsFrom,
  teamSmsLive,
  teamThreadLabel,
  threadLink,
  TEAM_SMS_HELP,
  TEAM_SMS_START,
  TEAM_SMS_STOP,
  type ParsedTeamSms,
  type TeamChatMessage,
  type TeamChatPrefs,
  type TeamChatThreadSummary,
  type TeamDirectoryPerson,
  type TeamSmsLogEntry,
  type TeamThreadKind,
} from "../../shared/teamChat.ts";

export interface SmsSender {
  (to: string, body: string, from: string): Promise<{ sid: string }>;
}

let smsSender: SmsSender | null = null;
let pushSender: typeof sendTeamPush = sendTeamPush;

export function setTeamSmsSenderForTests(sender: SmsSender | null) {
  smsSender = sender;
}

export function setTeamPushSenderForTests(sender: typeof sendTeamPush | null) {
  pushSender = sender || sendTeamPush;
}

async function defaultSmsSender(to: string, body: string, from: string): Promise<{ sid: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio is not configured.");
  const client = twilio(sid, token);
  const message = await client.messages.create({ to, from, body });
  return { sid: message.sid };
}

function displayName(thread: StoredThread, viewerId: string): string {
  if (thread.kind === "dm") {
    const other = thread.memberIds.find((id) => id !== viewerId);
    return (other && thread.memberNames[other]) || "Direct message";
  }
  if (thread.kind === "order") {
    const who = viewerId === thread.clientId
      ? thread.memberNames[thread.photographerId || ""] || "Shooter"
      : thread.clientName || "Client";
    return thread.address ? `${who} · ${thread.address}` : who;
  }
  return thread.name;
}

function summaryFor(thread: StoredThread, viewerId: string, unread: number): TeamChatThreadSummary {
  return {
    id: thread.id,
    kind: thread.kind,
    name: displayName(thread, viewerId),
    code: thread.code,
    preview: thread.preview,
    updatedAt: thread.updatedAt,
    unread,
    memberIds: thread.memberIds,
  };
}

async function writeInbox(repo: TeamChatRepo, thread: StoredThread, unreadFor: (uid: string) => number) {
  const people = new Set(thread.memberIds);
  for (const uid of people) {
    const current = await repo.getInbox(uid);
    const next = current.filter((item) => item.id !== thread.id);
    next.unshift(summaryFor(thread, uid, unreadFor(uid)));
    next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    await repo.saveInbox(uid, next.slice(0, 40));
  }
}

export async function ensureMember(repo: TeamChatRepo, thread: StoredThread, uid: string): Promise<boolean> {
  if (thread.clientId && thread.clientId === uid) return true;
  return thread.memberIds.includes(uid);
}

export function publicThread(thread: StoredThread, viewerId: string) {
  return {
    ...summaryFor(thread, viewerId, 0),
    memberIds: thread.memberIds,
    memberNames: thread.memberNames,
    clientId: thread.clientId,
    address: thread.address,
    orderId: thread.orderId,
    listingId: thread.listingId,
  };
}

export async function createTeamThread(input: {
  repo?: TeamChatRepo;
  kind: Exclude<TeamThreadKind, "order">;
  name: string;
  creator: TeamStaffRecord;
  memberIds: string[];
  now?: Date;
}): Promise<StoredThread> {
  const repo = input.repo || getTeamChatRepo();
  const now = (input.now || new Date()).toISOString();
  const staff = await repo.listStaff();
  const allowed = new Set(staff.map((person) => person.uid));
  allowed.add(input.creator.uid);
  const memberIds = [...new Set([input.creator.uid, ...input.memberIds])].filter((id) => allowed.has(id));
  if (input.kind === "dm") {
    const other = memberIds.find((id) => id !== input.creator.uid);
    if (!other) throw new Error("Choose one teammate for a direct message.");
    const pair = [input.creator.uid, other].sort().join(":");
    const existing = (await repo.listThreads()).find((thread) =>
      thread.kind === "dm" && [...thread.memberIds].sort().join(":") === pair);
    if (existing) return existing;
  }
  if (input.kind !== "dm" && !input.name.trim()) throw new Error("Name the chat.");
  const taken = new Set((await repo.listThreads()).map((thread) => thread.code));
  const names: Record<string, string> = { [input.creator.uid]: input.creator.name };
  for (const person of staff) names[person.uid] = person.name;
  const thread: StoredThread = {
    id: newId(),
    kind: input.kind,
    name: input.kind === "dm" ? "" : input.name.trim().slice(0, 60),
    code: makeThreadCode(taken),
    memberIds: input.kind === "dm" ? memberIds.slice(0, 2) : memberIds,
    memberNames: names,
    clientId: null,
    clientName: null,
    photographerId: null,
    orderId: null,
    listingId: null,
    address: null,
    createdBy: input.creator.uid,
    preview: "",
    updatedAt: now,
  };
  if (input.kind === "dm") thread.memberIds = [...new Set(thread.memberIds)].slice(0, 2);
  await repo.saveThread(thread);
  await writeInbox(repo, thread, () => 0);
  return thread;
}

export async function updateMembers(input: {
  repo?: TeamChatRepo;
  threadId: string;
  actorId: string;
  add?: string[];
  remove?: string[];
}): Promise<StoredThread> {
  const repo = input.repo || getTeamChatRepo();
  const thread = await repo.getThread(input.threadId);
  if (!thread) throw new Error("That chat was not found.");
  if (thread.kind === "dm" || thread.kind === "order") throw new Error("This chat keeps its members.");
  if (!thread.memberIds.includes(input.actorId)) throw new Error("You are not in this chat.");
  const staff = await repo.listStaff();
  const allowed = new Set(staff.map((person) => person.uid));
  const next = new Set(thread.memberIds);
  for (const id of input.add || []) if (allowed.has(id)) next.add(id);
  for (const id of input.remove || []) next.delete(id);
  if (next.size === 0) throw new Error("A chat needs at least one person.");
  const names = { ...thread.memberNames };
  for (const person of staff) names[person.uid] = person.name;
  const saved = { ...thread, memberIds: [...next], memberNames: names, updatedAt: new Date().toISOString() };
  await repo.saveThread(saved);
  await preserveUnread(repo, saved);
  return saved;
}

async function preserveUnread(repo: TeamChatRepo, thread: StoredThread) {
  const unread = new Map<string, number>();
  for (const uid of thread.memberIds) {
    const inbox = await repo.getInbox(uid);
    unread.set(uid, inbox.find((item) => item.id === thread.id)?.unread || 0);
  }
  await writeInbox(repo, thread, (uid) => unread.get(uid) || 0);
}

async function unreadMap(repo: TeamChatRepo, thread: StoredThread, senderId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const uid of thread.memberIds) {
    const inbox = await repo.getInbox(uid);
    const prior = inbox.find((item) => item.id === thread.id)?.unread || 0;
    map.set(uid, uid === senderId ? 0 : prior + 1);
  }
  return map;
}

async function notifyOthers(input: {
  repo: TeamChatRepo;
  thread: StoredThread;
  message: TeamChatMessage;
  env: Record<string, string | undefined>;
  origin: string;
  now: Date;
}): Promise<TeamSmsLogEntry[]> {
  const logs: TeamSmsLogEntry[] = [];
  const link = threadLink(input.origin, input.thread.id);
  for (const uid of input.thread.memberIds) {
    if (uid === input.message.senderId) continue;
    const person = await input.repo.getStaff(uid);
    if (!person) continue;
    const label = teamThreadLabel(input.thread.kind, displayName(input.thread, uid));
    const smsBody = formatTeamSms({
      label,
      body: `${input.message.senderName}: ${input.message.body}`,
      link,
      code: input.thread.code,
    });
    const prefs = await input.repo.getPrefs(uid);
    const subs = await input.repo.listPush(uid);
    const quiet = inQuietHours(input.now, prefs.quietStart, prefs.quietEnd, prefs.timeZone);
    let decision = chooseStaffNotify({
      hasPush: subs.length > 0,
      teamSmsLive: teamSmsLive(input.env),
      smsMuted: prefs.smsMuted,
      smsOptOut: prefs.smsOptOut,
      quiet,
    });
    const payload: TeamPushPayload = {
      title: `Iconic · ${label}`,
      body: `${input.message.senderName}: ${input.message.body}`.slice(0, 180),
      url: link,
    };
    if (decision.channel === "push") {
      const delivered = await deliverPush(subs, payload, input.env);
      if (!delivered) {
        decision = chooseStaffNotify({
          hasPush: false,
          teamSmsLive: teamSmsLive(input.env),
          smsMuted: prefs.smsMuted,
          smsOptOut: prefs.smsOptOut,
          quiet,
        });
        decision = { ...decision, reason: `Push did not deliver. ${decision.reason}` };
      } else {
        logs.push(await recordLog(input.repo, person, input.thread, label, payload.body, "push", decision.reason, input.now));
        continue;
      }
    }
    if (decision.channel === "sms" && person.phone) {
      try {
        const send = smsSender || defaultSmsSender;
        await send(person.phone, smsBody, teamSmsFrom(input.env));
        await input.repo.setActiveThread(person.phone, input.thread.id);
        logs.push(await recordLog(input.repo, person, input.thread, label, smsBody, "sent", decision.reason, input.now));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Text failed.";
        logs.push(await recordLog(input.repo, person, input.thread, label, smsBody, "failed", reason, input.now));
      }
      continue;
    }
    if (decision.channel === "dry-run") {
      console.info(`[team-sms] Dry run for ${person.name} (${person.uid}) on ${label}. TEAM_SMS_LIVE is off.`);
      if (person.phone) await input.repo.setActiveThread(person.phone, input.thread.id);
      logs.push(await recordLog(input.repo, person, input.thread, label, smsBody, "dry-run", decision.reason, input.now));
      continue;
    }
    logs.push(await recordLog(input.repo, person, input.thread, label, smsBody, "skipped", decision.reason, input.now));
  }
  return logs;
}

async function deliverPush(
  subs: PushSubscriptionRecord[],
  payload: TeamPushPayload,
  env: Record<string, string | undefined>,
): Promise<boolean> {
  let ok = false;
  for (const sub of subs) {
    if (await pushSender(sub, payload, env)) ok = true;
  }
  return ok;
}

async function recordLog(
  repo: TeamChatRepo,
  person: TeamStaffRecord,
  thread: StoredThread,
  label: string,
  body: string,
  status: TeamSmsLogEntry["status"],
  reason: string,
  now: Date,
): Promise<TeamSmsLogEntry> {
  const entry = presentSmsLog({
    id: newId(),
    recipientUid: person.uid,
    recipientName: person.name,
    threadId: thread.id,
    threadLabel: label,
    body,
    status,
    reason,
    createdAt: now.toISOString(),
  });
  await repo.addSmsLog(entry);
  return entry;
}

export async function publishTeamMessage(input: {
  repo?: TeamChatRepo;
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: "staff" | "client";
  body: string;
  source: TeamChatMessage["source"];
  now?: Date;
  env?: Record<string, string | undefined>;
  origin?: string;
}): Promise<{ message: TeamChatMessage; log: TeamSmsLogEntry[] }> {
  const repo = input.repo || getTeamChatRepo();
  const thread = await repo.getThread(input.threadId);
  if (!thread) throw new Error("That chat was not found.");
  if (input.senderRole === "client") {
    if (thread.clientId !== input.senderId) throw new Error("That chat is not on this login.");
  } else if (!thread.memberIds.includes(input.senderId)) {
    throw new Error("You are not in this chat.");
  }
  const text = input.body.trim().slice(0, 2000);
  if (!text) throw new Error("Write a message.");
  const now = input.now || new Date();
  const message: TeamChatMessage = {
    id: newId(),
    threadId: thread.id,
    senderId: input.senderId,
    senderName: input.senderName,
    senderRole: input.senderRole,
    body: text,
    source: input.source,
    createdAt: now.toISOString(),
  };
  await repo.addMessage(message);
  const saved: StoredThread = { ...thread, preview: `${message.senderName}: ${text}`.slice(0, 180), updatedAt: message.createdAt };
  await repo.saveThread(saved);
  const unread = await unreadMap(repo, saved, input.senderRole === "client" ? "" : input.senderId);
  await writeInbox(repo, saved, (uid) => unread.get(uid) || 0);
  const messages = await repo.listMessages(saved.id, 40);
  await repo.saveLive(saved, messages);
  if (thread.memberIds.some((uid) => uid !== input.senderId)) {
    await bumpAdminUnreadChannel("chat");
  }
  const log = await notifyOthers({
    repo,
    thread: saved,
    message,
    env: input.env || process.env,
    origin: input.origin || process.env.APP_URL || process.env.PUBLIC_SITE_URL || "https://iconicimagestx.com",
    now,
  });
  return { message, log: log.map(presentSmsLog) };
}

export async function markThreadRead(repo: TeamChatRepo, uid: string, threadId: string) {
  const inbox = await repo.getInbox(uid);
  await repo.saveInbox(uid, inbox.map((item) => item.id === threadId ? { ...item, unread: 0 } : item));
}

export async function directory(repo: TeamChatRepo): Promise<TeamDirectoryPerson[]> {
  return presentDirectory(await repo.listStaff());
}

export interface InboundResult {
  status: number;
  twiml: string;
  routedThreadId?: string;
}

function xml(message?: string): string {
  const body = message ? `<Message>${message.replace(/[<>&]/g, "")}</Message>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

export async function acceptInboundTeamSms(input: {
  repo?: TeamChatRepo;
  from: string;
  body: string;
  messageSid?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  origin?: string;
}): Promise<InboundResult> {
  const repo = input.repo || getTeamChatRepo();
  if (input.messageSid && await repo.hasMessageSid(input.messageSid)) {
    return { status: 200, twiml: xml() };
  }
  if (input.messageSid) await repo.rememberMessageSid(input.messageSid);
  const person = await repo.findStaffByPhone(input.from);
  if (!person) {
    return { status: 200, twiml: xml("This number is not on the Iconic team chat.") };
  }
  const threads = (await repo.listThreads()).filter((thread) => thread.memberIds.includes(person.uid));
  const ownCodes = new Set(threads.map((thread) => thread.code.toUpperCase()));
  const parsed = parseInboundTeamSms(input.body || "", ownCodes);
  if (parsed.type === "stop" || parsed.type === "start" || parsed.type === "help") {
    return replyKeyword(repo, person, parsed);
  }
  const thread = await threadForInbound(repo, person, threads, parsed);
  if (!thread) {
    const note = parsed.type === "switch-unknown"
      ? "That code is not one of your chats. Send the 4-letter code from the Iconic text."
      : "Open the Shooter app to pick a chat, or start your text with its 4-letter code.";
    return { status: 200, twiml: xml(note) };
  }
  if (parsed.type === "switch-empty") {
    if (person.phone) await repo.setActiveThread(person.phone, thread.id);
    return { status: 200, twiml: xml(`You're on ${teamThreadLabel(thread.kind, displayName(thread, person.uid))}. Send the message after ${thread.code}.`) };
  }
  const text = parsed.type === "switch" ? parsed.text : parsed.type === "message" ? parsed.text : "";
  if (!text) return { status: 200, twiml: xml("Send a message after the code.") };
  await publishTeamMessage({
    repo,
    threadId: thread.id,
    senderId: person.uid,
    senderName: person.name,
    senderRole: "staff",
    body: text,
    source: "sms",
    now: input.now,
    env: input.env,
    origin: input.origin,
  });
  if (person.phone) await repo.setActiveThread(person.phone, thread.id);
  return { status: 200, twiml: xml(), routedThreadId: thread.id };
}

async function replyKeyword(repo: TeamChatRepo, person: TeamStaffRecord, parsed: ParsedTeamSms): Promise<InboundResult> {
  const prefs = await repo.getPrefs(person.uid);
  if (parsed.type === "stop") {
    await repo.savePrefs(person.uid, { ...prefs, smsOptOut: true });
    return { status: 200, twiml: xml(TEAM_SMS_STOP) };
  }
  if (parsed.type === "start") {
    await repo.savePrefs(person.uid, { ...prefs, smsOptOut: false, smsMuted: false });
    return { status: 200, twiml: xml(TEAM_SMS_START) };
  }
  return { status: 200, twiml: xml(TEAM_SMS_HELP) };
}

async function threadForInbound(
  repo: TeamChatRepo,
  person: TeamStaffRecord,
  threads: StoredThread[],
  parsed: ParsedTeamSms,
): Promise<StoredThread | null> {
  if (parsed.type === "switch" || parsed.type === "switch-empty") {
    return threads.find((thread) => thread.code.toUpperCase() === parsed.code) || null;
  }
  if (parsed.type !== "message") return null;
  if (!person.phone) return null;
  const active = await repo.getActiveThread(person.phone);
  return threads.find((thread) => thread.id === active) || null;
}

export async function saveTextPrefs(repo: TeamChatRepo, uid: string, patch: Partial<TeamChatPrefs>): Promise<TeamChatPrefs> {
  const current = await repo.getPrefs(uid);
  const next: TeamChatPrefs = {
    ...emptyTeamChatPrefs(),
    ...current,
    smsMuted: typeof patch.smsMuted === "boolean" ? patch.smsMuted : current.smsMuted,
    quietStart: patch.quietStart === undefined ? current.quietStart : patch.quietStart,
    quietEnd: patch.quietEnd === undefined ? current.quietEnd : patch.quietEnd,
    timeZone: typeof patch.timeZone === "string" && patch.timeZone.trim() ? patch.timeZone.trim().slice(0, 80) : current.timeZone,
    smsOptOut: current.smsOptOut,
  };
  await repo.savePrefs(uid, next);
  return next;
}

export async function openOrCreateOrderThread(input: {
  repo?: TeamChatRepo;
  clientId: string;
  clientName: string;
  photographer: TeamStaffRecord;
  orderId: string | null;
  listingId: string | null;
  address: string;
  now?: Date;
}): Promise<StoredThread> {
  const repo = input.repo || getTeamChatRepo();
  const existing = (await repo.listThreads()).find((thread) =>
    thread.kind === "order" && (input.listingId ? thread.listingId === input.listingId : thread.orderId === input.orderId));
  if (existing) return existing;
  const taken = new Set((await repo.listThreads()).map((thread) => thread.code));
  const thread: StoredThread = {
    id: newId(),
    kind: "order",
    name: input.address,
    code: makeThreadCode(taken),
    memberIds: [input.photographer.uid],
    memberNames: { [input.photographer.uid]: input.photographer.name },
    clientId: input.clientId,
    clientName: input.clientName,
    photographerId: input.photographer.uid,
    orderId: input.orderId,
    listingId: input.listingId,
    address: input.address,
    createdBy: input.clientId,
    preview: "",
    updatedAt: (input.now || new Date()).toISOString(),
  };
  await repo.saveThread(thread);
  await writeInbox(repo, thread, () => 0);
  return thread;
}
