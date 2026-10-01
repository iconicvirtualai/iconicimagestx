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
export function liveChatSmsBody(input: LiveChatMessage): string {
  const reply = [input.email, input.phone].filter(Boolean).join(" | ") || "no reply path";
  const text = input.message.replace(/\s+/g, " ").trim().slice(0, 280);
  return `Iconic live chat\n${oneLine(input.name).slice(0, 80)}\n${reply}\n${text}`.slice(0, 640);
}

export interface LiveChatDelivery {
  emailDelivered: true;
  smsDelivered: boolean;
}

/**
 * Emails the office, then best-effort SMS to Google Voice.
 * Throws if the email does not send. SMS failure does not throw.
 * Does not email or text the visitor.
 */
export async function deliverLiveChat(input: LiveChatMessage): Promise<LiveChatDelivery> {
  const to = liveChatStaffEmail();
  const emailResult = await sendEmail({
    to,
    template: STAFF_INBOUND_EMAIL_TEMPLATE,
    audience: "staff",
    subject: `Live chat from ${oneLine(input.name).slice(0, 80)}`,
    variables: {
      senderName: escapeHtml(input.name),
      senderEmail: escapeHtml(input.email || "Not provided"),
      senderPhone: escapeHtml(input.phone || "Not provided"),
      message: escapeHtml(input.message),
    },
  });

  if (!emailResult.sent) {
    throw new Error("Staff live-chat email was not sent.");
  }

  let smsDelivered = false;
  try {
    const sms = await sendSMS({
      to: STAFF_INBOUND_SMS_TO,
      kind: STAFF_INBOUND_SMS_KIND,
      body: liveChatSmsBody(input),
    });
    smsDelivered = !sms.suppressed && Boolean(sms.sid);
    if (!smsDelivered) {
      console.warn(`[LiveChat] Staff SMS not sent (${sms.status}). Email to ${to} was delivered.`);
    }
  } catch (err) {
    console.error("[LiveChat] Staff SMS failed (best effort). Email was delivered.", err);
  }

  return { emailDelivered: true, smsDelivered };
}
