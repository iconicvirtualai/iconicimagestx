/**
 * Staff-only alert for a brand-new saved order.
 * Recipients come from ADMIN_EMAIL and COORDINATOR_EMAIL.
 * The client address is never a To, Cc, or Bcc recipient.
 * Reply-To is that client's mailbox so a normal Reply reaches the agent.
 * The mailto control in the body only opens a draft. It does not send.
 */

import { emailAllowed, mailboxAddress } from "../../shared/clientNotify";
import { officeNewOrderEmail } from "../../shared/officeOrderEmail";
import { sendEmail } from "./email";

export const OFFICE_NEW_ORDER_EMAIL_TEMPLATE = "office_new_order";

export function officeStaffRecipients(env: Record<string, string | undefined> = process.env): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of [env.ADMIN_EMAIL, env.COORDINATOR_EMAIL]) {
    for (const part of String(raw || "").split(/[,;]/)) {
      const email = part.trim();
      const key = email.toLowerCase();
      if (!email || seen.has(key)) continue;
      seen.add(key);
      recipients.push(email);
    }
  }
  return recipients;
}

export async function notifyOfficeOfOrder(input: {
  isNewOrder: boolean;
  saved: Record<string, unknown>;
  adminUrl?: string;
  env?: Record<string, string | undefined>;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!input.isNewOrder) return { sent: false, reason: "not-new" };

  const env = input.env ?? process.env;
  const saved = input.saved || {};
  const clientEmails = clientMailboxSet(saved);
  const recipients = officeStaffRecipients(env).filter((email) => !isClientAddress(email, clientEmails));
  if (recipients.length === 0) {
    console.warn("[Bookings] Office new-order email skipped — ADMIN_EMAIL and COORDINATOR_EMAIL are not set.");
    return { sent: false, reason: "no-recipients" };
  }
  if (!emailAllowed(OFFICE_NEW_ORDER_EMAIL_TEMPLATE, env, "staff")) {
    return { sent: false, reason: "blocked" };
  }

  const message = officeNewOrderEmail(saved, { adminUrl: input.adminUrl });
  const replyTo = message.replyTo;
  const to = replyTo ? recipients.filter((email) => !sameMailbox(email, replyTo)) : recipients;
  if (to.length === 0) {
    console.warn("[Bookings] Office new-order email skipped — ADMIN_EMAIL and COORDINATOR_EMAIL are not set.");
    return { sent: false, reason: "no-recipients" };
  }
  const result = await sendEmail({
    to: to.join(", "),
    ...(replyTo ? { replyTo } : {}),
    template: OFFICE_NEW_ORDER_EMAIL_TEMPLATE,
    audience: "staff",
    subject: message.subject,
    html: message.html,
    text: message.text,
    variables: {
      subject: message.subject,
      body: message.text,
      orderNumber: message.orderNumber,
      packageName: message.packageName,
      serviceName: message.packageName,
    },
  });
  return { sent: result.sent };
}

/** Raw client fields plus the parsed mailbox, so a display name cannot sneak into To. */
function clientMailboxSet(saved: Record<string, unknown>): Set<string> {
  const found = new Set<string>();
  for (const value of [saved.email, saved.clientEmail]) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim().toLowerCase();
    if (trimmed) found.add(trimmed);
    const mailbox = mailboxAddress(value);
    if (mailbox) found.add(mailbox);
  }
  return found;
}

function isClientAddress(email: string, clientEmails: Set<string>): boolean {
  if (clientEmails.has(email.trim().toLowerCase())) return true;
  const mailbox = mailboxAddress(email);
  return Boolean(mailbox && clientEmails.has(mailbox));
}

function sameMailbox(email: string, replyTo: string): boolean {
  if (email.trim().toLowerCase() === replyTo) return true;
  return mailboxAddress(email) === replyTo;
}
