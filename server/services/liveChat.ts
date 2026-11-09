import {
  STAFF_INBOUND_EMAIL_TEMPLATE,
  STAFF_INBOUND_SMS_KIND,
  STAFF_INBOUND_SMS_TO,
} from "../../shared/clientNotify";
import { sendEmail } from "./email";
import { sendSMS } from "./sms";

export const LIVE_CHAT_STAFF_EMAIL_DEFAULT = "photos@iconicimagestx.com";
export const LIVE_CHAT_WINDOW_MS = 15 * 60 * 1000;
export const LIVE_CHAT_MAX_PER_WINDOW = 8;
const MAX_NAME = 80;
const MAX_MESSAGE = 2000;

export interface LiveChatMessage {
  name: string;
  email?: string;
  phone?: string;
  message: string;
}

export type LiveChatParseResult =
  | { ok: true; value: LiveChatMessage }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function liveChatStaffEmail(env: Record<string, string | undefined> = process.env): string {
  const configured = env.CONTACT_FORM_EMAIL?.trim();
  return configured || LIVE_CHAT_STAFF_EMAIL_DEFAULT;
}

export function parseLiveChatBody(body: unknown): LiveChatParseResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Please enter a message." };
  }

  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  const phone = typeof raw.phone === "string" ? raw.phone.trim() : "";
  const message = typeof raw.message === "string" ? raw.message.trim() : "";

  if (!name || name.length > MAX_NAME) {
    return { ok: false, error: "Please enter your name (80 characters or fewer)." };
  }
  if (!message) {
    return { ok: false, error: "Please enter a message." };
  }
  if (message.length > MAX_MESSAGE) {
    return { ok: false, error: "Message is too long. Please keep it under 2,000 characters." };
  }
  if (!email && !phone) {
    return { ok: false, error: "Add an email or phone number so we can reply." };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "Invalid email address." };
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return { ok: false, error: "Invalid phone number." };
    }
  }

  return {
    ok: true,
    value: {
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      message,
    },
  };
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text staff SMS. Short on purpose; the email carries the full message. */
export function liveChatSmsBody(input: LiveChatMessage, adminUrl?: string): string {
  const reply = [input.email, input.phone].filter(Boolean).join(" | ") || "no reply path";
  const text = input.message.replace(/\s+/g, " ").trim().slice(0, 280);
  const head = `Iconic live chat\n${oneLine(input.name).slice(0, 80)}\n${reply}\n${text}`;
  if (!adminUrl) return head.slice(0, 640);
  const link = oneLine(adminUrl);
  const room = Math.max(0, 640 - link.length - 1);
  return `${head.slice(0, room)}\n${link}`.slice(0, 640);
}

export interface LiveChatDeliveryOptions {
  /** Reply-To header only. Never a To, Cc, or Bcc recipient. */
  replyTo?: string;
  /** Absolute staff URL for this chat. Included in the email and SMS. */
  adminUrl?: string;
  /** Max characters of the visitor message copied into the staff email. */
  messageLimit?: number;
}

function clipStaffMessage(message: string, limit: number | undefined): string {
  if (!limit || message.length <= limit) return message;
  return `${message.slice(0, limit)}...`;
}

function withAdminLink(message: string, adminUrl: string | undefined): string {
  if (!adminUrl) return message;
  return `${message}\n\nOpen the chat: ${adminUrl}`;
}

function staffReplyTo(replyTo: string | undefined, staffTo: string): string | undefined {
  const candidate = replyTo?.trim();
  if (!candidate || !EMAIL_RE.test(candidate)) return undefined;
  if (candidate.toLowerCase() === staffTo.trim().toLowerCase()) return undefined;
  return candidate;
}

export interface LiveChatDelivery {
  emailDelivered: boolean;
  smsDelivered: boolean;
}

export class LiveChatDeliveryError extends Error {
  readonly code: "not_configured" | "failed";

  constructor(message: string, code: "not_configured" | "failed") {
    super(message);
    this.name = "LiveChatDeliveryError";
    this.code = code;
  }
}

function isMissingTransport(err: unknown): boolean {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code?: unknown }).code) : "";
  if (code === "email_not_configured") return true;
  const message = err instanceof Error ? err.message : "";
  return /Twilio credentials not configured|TWILIO_PHONE_NUMBER not set|SMTP is not configured/i.test(message);
}

/**
 * Emails the office and texts Google Voice.
 * Either channel reaching the office counts as delivered.
 * Throws only when both fail. Does not email or text the visitor.
 * `replyTo` is a header only. The visitor is never a recipient.
 */
export async function deliverLiveChat(
  input: LiveChatMessage,
  options: LiveChatDeliveryOptions = {},
): Promise<LiveChatDelivery> {
  const to = liveChatStaffEmail();
  if (input.email && to.trim().toLowerCase() === input.email.trim().toLowerCase()) {
    throw new LiveChatDeliveryError("Refusing to email the visitor.", "failed");
  }
  const replyTo = staffReplyTo(options.replyTo, to);
  const message = withAdminLink(clipStaffMessage(input.message, options.messageLimit), options.adminUrl);
  let emailDelivered = false;
  let emailError: unknown;

  try {
    const emailResult = await sendEmail({
      to,
      ...(replyTo ? { replyTo } : {}),
      template: STAFF_INBOUND_EMAIL_TEMPLATE,
      audience: "staff",
      subject: `Live chat from ${oneLine(input.name).slice(0, 80)}`,
      variables: {
        senderName: escapeHtml(input.name),
        senderEmail: escapeHtml(input.email || "Not provided"),
        senderPhone: escapeHtml(input.phone || "Not provided"),
        message: escapeHtml(message),
        ...(options.adminUrl ? { adminUrl: escapeHtml(options.adminUrl) } : {}),
      },
    });
    emailDelivered = emailResult.sent;
    if (!emailDelivered) {
      emailError = new Error("Staff live-chat email was not sent.");
    }
  } catch (err) {
    emailError = err;
    console.error(`[LiveChat] Staff email to ${to} failed.`, err);
  }

  let smsDelivered = false;
  let smsError: unknown;
  try {
    const sms = await sendSMS({
      to: STAFF_INBOUND_SMS_TO,
      kind: STAFF_INBOUND_SMS_KIND,
      body: liveChatSmsBody(input, options.adminUrl),
    });
    smsDelivered = !sms.suppressed && Boolean(sms.sid);
    if (!smsDelivered) {
      smsError = new Error(`Staff SMS not sent (${sms.status}).`);
      console.warn(`[LiveChat] Staff SMS not sent (${sms.status}).`);
    }
  } catch (err) {
    smsError = err;
    console.error("[LiveChat] Staff SMS failed.", err);
  }

  if (emailDelivered || smsDelivered) {
    return { emailDelivered, smsDelivered };
  }

  const notConfigured = isMissingTransport(emailError) && isMissingTransport(smsError);
  throw new LiveChatDeliveryError(
    notConfigured
      ? "Live chat delivery is not configured. Set SMTP_USER, SMTP_PASS, and the Twilio credentials."
      : "Staff live-chat email and SMS were not sent.",
    notConfigured ? "not_configured" : "failed",
  );
}
