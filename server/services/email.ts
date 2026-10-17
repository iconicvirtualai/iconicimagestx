/**
 * Iconic Images — Email Service
 * Sends transactional emails using Nodemailer + Firebase email templates.
 * Place at: server/services/email.ts
 */

import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "../../shared/businessContact";
import { clientEmailContactLineHtml } from "../../shared/clientEmailContact";
import {
  EMAIL_TEMPLATES_COLLECTION,
  builtinEmailSubject,
  clientBuiltinEmailHtml,
  fillEmailPlaceholders,
  readEmailTemplateOverride,
} from "../../shared/clientEmailTemplates";
import { clientNotifyBlockReason, emailAllowed, narrowGatedClientRecipients, notifyTestAllowlist } from "../../shared/clientNotify";
import { DEFAULT_PUBLIC_SITE_URL } from "../../shared/publicSiteUrl";

const db = () => admin.firestore();

// ─── Transporter ──────────────────────────────────────────────────────────────

export class EmailNotConfiguredError extends Error {
  readonly code = "email_not_configured";

  constructor() {
    super("SMTP is not configured. Set SMTP_USER and SMTP_PASS.");
    this.name = "EmailNotConfiguredError";
  }
}

/**
 * One connection per send. A pooled socket dies when a serverless instance
 * freezes, and the next live-chat send then fails before the office gets it.
 */
function createTransport() {
  const user = process.env.SMTP_USER || process.env.EMAIL_FROM;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new EmailNotConfiguredError();
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailDelivery = "sent" | "suppressed" | "allowlist";

interface SendEmailOptions {
  to: string;
  bcc?: string;
  cc?: string;
  replyTo?: string;
  template: string;
  /**
   * "staff" is required for the live_chat office alert and the new-order
   * office alert. Omit for client mail.
   * Visitor addresses must not be paired with audience "staff".
   */
  audience?: "client" | "staff";
  variables?: Record<string, string>;
  subject?: string; // override template subject
  /** When set, this HTML is the message unless a stored template override replaces it. */
  html?: string;
  /** Keep caller html even when emailTemplates/{template} has an override. */
  lockHtml?: boolean;
  /** Plain-text part. Receipts always send one. */
  text?: string;
  attachments?: Array<{ filename: string; path: string }>;
}

type EmailDeliveryOverride = (message: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
}) => Promise<void>;

/** Fixture and tests. Production leaves this unset and uses SMTP. */
let emailDeliveryOverride: EmailDeliveryOverride | null = null;

export function setEmailDeliveryOverride(sink: EmailDeliveryOverride | null): void {
  emailDeliveryOverride = sink;
}

// ─── Main Send Function ───────────────────────────────────────────────────────

/** Client copy sent when /book accepts the order. Address is the property line. */
export function clientOrderConfirmedSubject(address: string, orderNumber?: string): string {
  const code = orderNumber && /^#\d{3,}$/.test(orderNumber) ? ` ${orderNumber}` : "";
  return `Your Iconic order${code} is confirmed: ${address}`;
}

export { clientOrderReceivedSubject } from "../../shared/clientEmailTemplates";

export async function sendEmail(options: SendEmailOptions): Promise<{ sent: boolean; delivery: EmailDelivery }> {
  const { template, audience, variables = {}, subject: subjectOverride, html, attachments, lockHtml } = options;
  let to = options.to;
  let bcc = options.bcc;
  let cc = options.cc;
  let replyTo = options.replyTo;

  if (!to) {
    console.warn("[Email] No recipient specified, skipping.");
    return { sent: false, delivery: "suppressed" };
  }

  // booking_received (order-received confirmation) always sends.
  // live_chat and office_new_order send only with audience "staff".
  // Other client mail stays off unless CLIENT_NOTIFY_LIVE is exactly "true"
  // and the zone is not RED. NOTIFY_TEST_ALLOWLIST can still deliver those
  // gated messages, and only to exact addresses on that list, including in RED.
  if (!emailAllowed(template, process.env, audience)) {
    const narrowed = narrowGatedClientRecipients({ to, cc, bcc, replyTo }, process.env);
    if (!narrowed) {
      const why = notifyTestAllowlist().size > 0
        ? `${clientNotifyBlockReason()}. Recipient is not an exact NOTIFY_TEST_ALLOWLIST match.`
        : `${clientNotifyBlockReason()}.`;
      console.warn(
        `[Email] Suppressed '${template}' to ${to} — ${why} No message sent.`,
      );
      return { sent: false, delivery: "suppressed" };
    }
    to = narrowed.to;
    cc = narrowed.cc;
    bcc = narrowed.bcc;
    replyTo = narrowed.replyTo;
    if (narrowed.held.length > 0) {
      console.warn(
        `[Email] '${template}' sent only to NOTIFY_TEST_ALLOWLIST. Held: ${narrowed.held.join(", ")}.`,
      );
    }
  }

  const builtinSubject = builtinEmailSubject(template, variables);
  let subject = subjectOverride || builtinSubject || `Message from Iconic Images`;
  let htmlBody = html || builtinEmailHtml(template, variables);
  let textBody = options.text;

  // emailTemplates/{template key}. {{name}} placeholders.
  // A missing or invalid override keeps the built-in copy (or the caller HTML,
  // which is how the branded receipt is passed in).
  try {
    if (admin.apps.length) {
      const templateDoc = await db().collection(EMAIL_TEMPLATES_COLLECTION).doc(template).get();
      const override = templateDoc.exists ? readEmailTemplateOverride(templateDoc.data()) : null;
      if (override && !(lockHtml && html)) {
        subject = fillEmailPlaceholders(override.subject, variables);
        htmlBody = fillEmailPlaceholders(override.htmlBody, variables);
        textBody = undefined;
      }
    }
  } catch (err) {
    console.warn(`[Email] Template lookup failed for '${template}'. Using the built-in copy.`, err);
  }
  const delivery: EmailDelivery = emailAllowed(template, process.env, audience) ? "sent" : "allowlist";
  if (emailDeliveryOverride) {
    await emailDeliveryOverride({ to, cc, bcc, subject, html: htmlBody, text: textBody });
    console.log(`[Email] Sent '${template}' to ${to}`);
    return { sent: true, delivery };
  }

  const transporter = createTransport();
  try {
    await transporter.sendMail({
      from: `"Iconic Images" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      bcc,
      cc,
      ...(replyTo ? { replyTo } : {}),
      subject,
      html: htmlBody,
      ...(textBody ? { text: textBody } : {}),
      attachments,
    });

    console.log(`[Email] Sent '${template}' to ${to}`);
    return { sent: true, delivery };
  } catch (err) {
    console.error(`[Email] Failed to send '${template}' to ${to}:`, err);
    throw err;
  } finally {
    transporter.close();
  }
}

// ─── Template Variable Interpolation ─────────────────────────────────────────

// Client mail prints BUSINESS_CONTACT.line through clientEmailContactLineHtml (direct tel: and mailto:).

// ─── Fallback Templates (used if Firestore template missing) ──────────────────

export function builtinEmailHtml(
  type: string,
  vars: Record<string, string>,
): string {
  if (
    type === "booking_received"
    || type === "account_password_setup"
    || type === "order_confirmed"
    || type === "gallery_delivery"
    || type === "invoice"
    || type === "payment_receipt"
    || type === "contact_confirmation"
    || type === "clientConfirmation"
  ) {
    return clientBuiltinEmailHtml(type, vars);
  }
  return getFallbackTemplate(type, vars);
}

function getFallbackTemplate(
  type: string,
  vars: Record<string, string>
): string {
  const base = (content: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #000; padding: 20px; text-align: center; margin-bottom: 30px;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">ICONIC IMAGES</h1>
        <p style="color: #ccc; margin: 5px 0 0; font-size: 12px; letter-spacing: 2px;">REAL ESTATE MEDIA</p>
      </div>
      ${content}
      <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center; color: #999; font-size: 12px;">
        <p>${clientEmailContactLineHtml("#666666")}</p>
        <p>${LEGAL_BUSINESS_NAME}</p>
        <p><a href="${DEFAULT_PUBLIC_SITE_URL}" style="color:#999999;text-decoration:underline;">iconicimagestx.vercel.app</a></p>
        <p>Questions? Reply to this email or message us through your client portal.</p>
      </div>
    </div>
  `;

  const templates: Record<string, string> = {
    manual_message: base(`
      <h2>Message from Iconic Images</h2>
      <div style="line-height:1.6;color:#333;">
        ${(vars.message || "").replace(/\n/g, "<br>")}
      </div>
    `),
    new_booking_alert: base(`
      <h2>🔔 New Booking Request</h2>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;">Client</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.clientName}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Email</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><a href="mailto:${vars.email}">${vars.email}</a></td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Phone</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.phone}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Address</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><strong>${vars.address}</strong></td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Requested Date</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.scheduledDate || "TBD"} ${vars.scheduledTime || ""}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Property Status</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.propertyStatus || "—"} / ${vars.furnishingStatus || "—"}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Access Method</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><strong>${vars.accessMethod || "—"}</strong></td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Square Footage</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.squareFootage || "Not provided"}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Photographer</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.photographerPreference || "Auto-assign"}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;">Total</td><td style="padding:10px 14px;font-weight:bold;color:#0d9488;">${vars.total}</td></tr>
      </table>

      <p><a href="${vars.dashboardUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Review in Dashboard →</a></p>
    `),
    contact_form: base(`
      <h2 style="color:#0d9488;">New Contact Form Submission</h2>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;">From</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.senderName}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Email</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><a href="mailto:${vars.senderEmail}">${vars.senderEmail}</a></td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Phone</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.senderPhone}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Subject</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><strong>${vars.subject}</strong></td></tr>
      </table>

      <h3 style="color:#555;margin-top:30px;margin-bottom:10px;">Message:</h3>
      <div style="background:#f8fafc;padding:15px;border-left:4px solid #0d9488;font-style:italic;color:#666;line-height:1.6;">
        ${(vars.message || "").replace(/\n/g, "<br>")}
      </div>

      <p style="margin-top:30px;color:#999;font-size:12px;">
        <strong>To reply:</strong> Send an email directly to ${vars.senderEmail}
      </p>
    `),
    live_chat: base(`
      <h2 style="color:#0d9488;">Live chat message</h2>
      <p>A visitor sent a message from the website chat. Reply to them directly — this alert did not email or text the visitor.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;">From</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.senderName}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Email</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.senderEmail}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Phone</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.senderPhone}</td></tr>
      </table>

      <h3 style="color:#555;margin-top:30px;margin-bottom:10px;">Message:</h3>
      <div style="background:#f8fafc;padding:15px;border-left:4px solid #0d9488;color:#333;line-height:1.6;">
        ${(vars.message || "").replace(/\n/g, "<br>")}
      </div>
    `),
  };
  void BUSINESS_CONTACT.line;

  return templates[type] || base(`<p>You have a new notification from Iconic Images.</p>`);
}
