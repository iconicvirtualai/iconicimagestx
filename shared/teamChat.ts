/**
 * Iconic team chat.
 * Office channels, group chats, and direct messages, plus a client-to-shooter
 * thread. Phone numbers never appear in these types. Web push is the
 * notification. SMS is the fallback and stays off unless TEAM_SMS_LIVE is
 * exactly "true". This module does not send texts or email.
 */

export const TEAM_CHAT_INBOX = "teamChatInbox";
export const TEAM_THREAD_LIVE = "teamThreadLive";
export const TEAM_THREADS = "teamThreads";
export const TEAM_CHAT_PREFS = "teamChatPrefs";
export const TEAM_PUSH_SUBSCRIPTIONS = "teamPushSubscriptions";
export const TEAM_SMS_LOG = "teamSmsLog";
export const TEAM_SMS_ROUTES = "teamSmsRoutes";

/** Iconic Twilio number. TWILIO_PHONE_NUMBER overrides this when it is set. */
export const ICONIC_TEAM_SMS_FROM = "+18328438311";

export const TEAM_SMS_HELP =
  "Iconic team chat. Texts come from Iconic, not a coworker's phone. Start a reply with the 4-letter code to pick a thread. Reply STOP to opt out. Reply HELP for this message.";

export const TEAM_SMS_STOP =
  "You will no longer get Iconic team texts. Reply START to resume. The Shooter app and office chat still work.";

export const TEAM_SMS_START =
  "Iconic team texts are on again. Reply STOP to opt out. Reply HELP for help.";

export const TEAM_CHAT_ROLES = ["admin", "coordinator", "photographer", "editor"] as const;

export type TeamThreadKind = "channel" | "group" | "dm" | "order";
export type TeamNotifyChannel = "push" | "sms" | "dry-run" | "skip";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const CODE_LINE = /^#?([A-Za-z0-9]{4})(?:\s*[:\-]\s*|\s+)([\s\S]+)$/;
const CODE_ONLY = /^#?([A-Za-z0-9]{4})$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function teamSmsLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.TEAM_SMS_LIVE === "true";
}

/** US numbers compare on the last 10 digits so a stored (832) matches Twilio +1. */
export function phoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function canonicalPhone(raw: string): string {
  const digits = phoneDigits(raw);
  if (digits.length === 10) return `+1${digits}`;
  if (!digits) return "";
  return `+${raw.replace(/\D/g, "")}`;
}

export function teamSmsFrom(env: Record<string, string | undefined> = process.env): string {
  const configured = env.TWILIO_PHONE_NUMBER?.trim();
  return configured || ICONIC_TEAM_SMS_FROM;
}

export function teamThreadLabel(kind: TeamThreadKind, name: string): string {
  const trimmed = name.trim();
  if (kind === "channel") {
    if (!trimmed) return "#channel";
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  }
  return trimmed || "Iconic";
}

/** Outbound text. The link goes to the thread. The code lets a reply switch threads. */
export function formatTeamSms(input: { label: string; body: string; link: string; code: string }): string {
  const text = input.body.replace(/\s+/g, " ").trim().slice(0, 320);
  const link = input.link.trim();
  const code = input.code.trim().toUpperCase();
  return `[Iconic · ${input.label}] ${text}\n${link}\nCode ${code}`;
}

export function threadLink(origin: string, threadId: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/shooter?thread=${encodeURIComponent(threadId)}`;
}

export type ParsedTeamSms =
  | { type: "stop" }
  | { type: "start" }
  | { type: "help" }
  | { type: "switch"; code: string; text: string }
  | { type: "switch-empty"; code: string }
  | { type: "switch-unknown"; code: string }
  | { type: "message"; text: string };

/**
 * Route one inbound text.
 * A leading #code, or a code the person already belongs to, switches threads.
 * Anything else stays on the thread we most recently texted them about.
 * STOP and HELP match the whole message, the same way Twilio treats them.
 */
export function parseInboundTeamSms(body: string, ownCodes: ReadonlySet<string>): ParsedTeamSms {
  const trimmed = body.replace(/\u0000/g, "").trim();
  const keyword = trimmed.toUpperCase();
  if (STOP_WORDS.has(keyword)) return { type: "stop" };
  if (START_WORDS.has(keyword)) return { type: "start" };
  if (HELP_WORDS.has(keyword)) return { type: "help" };
  const only = CODE_ONLY.exec(trimmed);
  if (only) {
    const code = only[1].toUpperCase();
    if (trimmed.startsWith("#") || ownCodes.has(code)) {
      return ownCodes.has(code) ? { type: "switch-empty", code } : { type: "switch-unknown", code };
    }
  }
  const match = CODE_LINE.exec(trimmed);
  if (match) {
    const code = match[1].toUpperCase();
    const explicit = trimmed.startsWith("#") || ownCodes.has(code);
    if (explicit) {
      if (!ownCodes.has(code)) return { type: "switch-unknown", code };
      const text = match[2].trim().slice(0, 2000);
      if (!text) return { type: "switch-empty", code };
      return { type: "switch", code, text };
    }
  }
  return { type: "message", text: trimmed.slice(0, 2000) };
}

export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesInZone(now: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

/** Quiet hours may cross midnight. An empty or equal window is off. */
export function inQuietHours(
  now: Date,
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone: string,
): boolean {
  const from = parseClock(start);
  const to = parseClock(end);
  if (from == null || to == null || from === to) return false;
  const current = minutesInZone(now, timeZone || "America/Chicago");
  if (current == null) return false;
  if (from < to) return current >= from && current < to;
  return current >= from || current < to;
}

export function chooseStaffNotify(input: {
  hasPush: boolean;
  teamSmsLive: boolean;
  smsMuted: boolean;
  smsOptOut: boolean;
  quiet: boolean;
  isClient?: boolean;
}): { channel: TeamNotifyChannel; reason: string } {
  if (input.isClient) return { channel: "skip", reason: "Clients stay in the portal. No text and no email." };
  if (input.hasPush) return { channel: "push", reason: "Web push is on for this login." };
  if (input.smsOptOut) return { channel: "skip", reason: "This person replied STOP." };
  if (input.smsMuted) return { channel: "skip", reason: "Texts are muted." };
  if (input.quiet) return { channel: "skip", reason: "Quiet hours." };
  if (!input.teamSmsLive) return { channel: "dry-run", reason: "TEAM_SMS_LIVE is off." };
  return { channel: "sms", reason: "No push subscription, so the text is the fallback." };
}

export function makeThreadCode(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    let code = "";
    for (let index = 0; index < 4; index += 1) {
      code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)] || "A";
    }
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not assign a thread code.");
}

export interface TeamDirectoryPerson {
  uid: string;
  name: string;
  role: string;
}

export interface TeamChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: "staff" | "client";
  body: string;
  source: "app" | "sms" | "push";
  createdAt: string;
}

export interface TeamChatThreadSummary {
  id: string;
  kind: TeamThreadKind;
  name: string;
  code: string;
  preview: string;
  updatedAt: string;
  unread: number;
  memberIds?: string[];
}

export interface TeamSmsLogEntry {
  id: string;
  recipientUid: string;
  recipientName: string;
  threadId: string;
  threadLabel: string;
  body: string;
  status: "dry-run" | "sent" | "skipped" | "failed" | "push";
  reason: string;
  createdAt: string;
}

export interface TeamChatPrefs {
  smsMuted: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  timeZone: string;
  smsOptOut: boolean;
}

export function emptyTeamChatPrefs(): TeamChatPrefs {
  return {
    smsMuted: false,
    quietStart: null,
    quietEnd: null,
    timeZone: "America/Chicago",
    smsOptOut: false,
  };
}

/** Logs shown in admin. There is no phone field to render. */
export function presentSmsLog(entry: TeamSmsLogEntry): TeamSmsLogEntry {
  return {
    id: entry.id,
    recipientUid: entry.recipientUid,
    recipientName: entry.recipientName,
    threadId: entry.threadId,
    threadLabel: entry.threadLabel,
    body: entry.body,
    status: entry.status,
    reason: entry.reason,
    createdAt: entry.createdAt,
  };
}

export function presentDirectory(people: TeamDirectoryPerson[]): TeamDirectoryPerson[] {
  return people.map((person) => ({
    uid: person.uid,
    name: person.name,
    role: person.role,
  }));
}
