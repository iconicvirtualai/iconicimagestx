/**
 * Staff-only alert for a brand-new saved order.
 * Recipients come from ADMIN_EMAIL and COORDINATOR_EMAIL.
 * The client address is never a recipient.
 */

import { emailAllowed } from "../../shared/clientNotify";
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
  const clientEmails = new Set(
    [saved.email, saved.clientEmail]
      .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
      .filter(Boolean),
  );
  const recipients = officeStaffRecipients(env).filter((email) => !clientEmails.has(email.toLowerCase()));
  if (recipients.length === 0) {
    console.warn("[Bookings] Office new-order email skipped — ADMIN_EMAIL and COORDINATOR_EMAIL are not set.");
    return { sent: false, reason: "no-recipients" };
  }
  if (!emailAllowed(OFFICE_NEW_ORDER_EMAIL_TEMPLATE, env, "staff")) {
    return { sent: false, reason: "blocked" };
  }

  const message = officeNewOrderEmail(saved, { adminUrl: input.adminUrl });
  const result = await sendEmail({
    to: recipients.join(", "),
    template: OFFICE_NEW_ORDER_EMAIL_TEMPLATE,
    audience: "staff",
    subject: message.subject,
    html: message.html,
    variables: {
      subject: message.subject,
      body: message.text,
    },
  });
  return { sent: result.sent };
}
