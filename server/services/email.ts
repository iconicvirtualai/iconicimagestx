/**
 * Iconic Images — Email Service
 * Sends transactional emails using Nodemailer + Firebase email templates.
 * Place at: server/services/email.ts
 */

import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "../../shared/businessContact";
import { clientNotifyBlockReason, emailAllowed, narrowGatedClientRecipients, notifyTestAllowlist } from "../../shared/clientNotify";

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
  /** When set, this HTML is the message. A stored template cannot replace it. */
  html?: string;
  attachments?: Array<{ filename: string; path: string }>;
}

// ─── Main Send Function ───────────────────────────────────────────────────────

export async function sendEmail(options: SendEmailOptions): Promise<{ sent: boolean; delivery: EmailDelivery }> {
  const { template, audience, variables = {}, subject: subjectOverride, html, attachments } = options;
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

  let subject = subjectOverride || `Message from Iconic Images`;
  let htmlBody = html || getFallbackTemplate(template, variables);

  // A missing or broken Firestore template must not block the built-in copy.
  // A caller-supplied HTML body is the message; do not swap in a stored template.
  try {
    if (!html && admin.apps.length) {
      const templateDoc = await db()
        .collection("emailTemplates")
        .where("category", "==", template)
        .where("isActive", "==", true)
        .limit(1)
        .get();

      if (!templateDoc.empty) {
        const tmpl = templateDoc.docs[0].data();
        if (!subjectOverride && typeof tmpl.subject === "string" && tmpl.subject.trim()) {
          subject = interpolate(tmpl.subject, variables);
        }
        if (typeof tmpl.htmlBody === "string" && tmpl.htmlBody.trim()) {
          htmlBody = interpolate(tmpl.htmlBody, variables);
        }
      }
    }
  } catch (err) {
    console.warn(`[Email] Template lookup failed for '${template}'. Using the built-in copy.`, err);
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
      attachments,
    });

    console.log(`[Email] Sent '${template}' to ${to}`);
    const delivery: EmailDelivery = emailAllowed(template, process.env, audience) ? "sent" : "allowlist";
    return { sent: true, delivery };
  } catch (err) {
    console.error(`[Email] Failed to send '${template}' to ${to}:`, err);
    throw err;
  } finally {
    transporter.close();
  }
}

// ─── Template Variable Interpolation ─────────────────────────────────────────

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

// ─── Fallback Templates (used if Firestore template missing) ──────────────────

export function builtinEmailHtml(
  type: string,
  vars: Record<string, string>,
): string {
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
        <p>${BUSINESS_CONTACT.line}</p>
        <p>${LEGAL_BUSINESS_NAME}</p>
        <p>Iconic Images TX | iconicimagestx.com</p>
        <p>Questions? Reply to this email or message us through your client portal.</p>
      </div>
    </div>
  `;

  const templates: Record<string, string> = {
    booking_received: base(`
      <h2 style="color:#0d9488;">We received your booking request!</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Thank you for choosing Iconic Images. We've received your booking request for <strong>${vars.address}</strong> and our team will review and confirm your appointment within 1 business day.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;">Requested Date</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.scheduledDate || "TBD — we'll confirm shortly"}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Requested Time</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.scheduledTime || "—"}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Property Status</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.propertyStatus || "—"}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Furnishing</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.furnishingStatus || "—"}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Access Method</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><strong>${vars.accessMethod || "—"}</strong></td></tr>
        ${vars.squareFootage ? `<tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Square Footage</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.squareFootage}</td></tr>` : ""}
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Travel</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${vars.travelFee || "Travel quoted"}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;">Order Total</td><td style="padding:10px 14px;font-weight:bold;color:#0d9488;">${vars.total}</td></tr>
      </table>

      <p style="color:#888;font-size:13px;">Confirmation ID: <strong>${vars.requestId}</strong> — keep this for your records.</p>
      <p style="color:#888;font-size:13px;">If any details look incorrect, simply reply to this email and we'll sort it out.</p>
    `),
    account_password_setup: base(`
      <h2 style="color:#0d9488;">Set your portal password</h2>
      <p>Hi ${vars.clientName},</p>
      <p>We created a client portal login for <strong>${vars.clientEmail || "your email"}</strong> so you can see this appointment request.</p>
      <p>This email is only for your password. Your appointment request details are in a separate email.</p>
      <p><a href="${vars.setupUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Set your password</a></p>
      <p style="color:#888;font-size:13px;">After that, sign in at <a href="${vars.portalUrl}">${vars.portalUrl}</a>.</p>
    `),
    order_confirmed: base(`
      <h2>Your appointment is confirmed!</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Great news — your shoot at <strong>${vars.address}</strong> is confirmed!</p>
      <p><strong>Date:</strong> ${vars.scheduledDate}<br>
      <strong>Time:</strong> ${vars.scheduledTime}<br>
      <strong>Photographer:</strong> ${vars.photographerName}<br>
      <strong>Travel:</strong> ${vars.travelFee || "Travel quoted"}</p>
      <p><a href="${vars.portalUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Your Portal</a></p>
    `),
    gallery_delivery: base(`
      <h2>Your gallery is ready! 🎉</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Your photos for <strong>${vars.address}</strong> are edited and waiting in your Iconic Images gallery.</p>
      ${vars.invoiceAmount ? `<p>Iconic Images invoices after the shoot. Downloads stay locked until the <strong>${vars.invoiceAmount}</strong> invoice is paid.</p>` : `<p>Downloads open from your gallery once that invoice is paid, or when our team releases the files.</p>`}
      <p><a href="${vars.galleryUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Gallery</a></p>
      ${vars.paymentUrl ? `<p><a href="${vars.paymentUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Pay invoice</a></p>` : ""}
      <p style="color:#999;font-size:12px;">Gallery available for ${vars.expiresAt}.</p>
    `),
    invoice: base(`
      <h2>Invoice from Iconic Images</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Your invoice <strong>${vars.invoiceNumber}</strong> for <strong>${vars.amount}</strong> is ready.</p>
      ${vars.dueDate ? `<p>Due: <strong>${vars.dueDate}</strong></p>` : ""}
      ${vars.paymentUrl ? `<p><a href="${vars.paymentUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Pay Invoice</a></p>` : ""}
    `),
    payment_receipt: base(`
      <h2>Payment received ✓</h2>
      <p>Hi ${vars.clientName},</p>
      <p>We've received your payment of <strong>${vars.amount}</strong> for invoice ${vars.invoiceNumber}.</p>
      ${vars.balance && vars.balance !== "$0.00" ? `<p>Remaining balance: <strong>${vars.balance}</strong></p>` : "<p>Your account is paid in full. Thank you!</p>"}
    `),
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
    contact_confirmation: base(`
      <h2 style="color:#0d9488;">We received your message!</h2>
      <p>Hi ${vars.name},</p>
      <p>Thank you for reaching out to Iconic Images. We've received your message and our team will review it shortly.</p>
      <p>We typically respond to inquiries within 24 business hours. If your question is urgent, feel free to call us at <strong>${BUSINESS_CONTACT.phoneDisplay}</strong> or email <strong>${BUSINESS_CONTACT.email}</strong>.</p>
      <p style="margin-top:30px;color:#888;font-size:12px;">
        If you have any additional information to add, simply reply to this email or visit <strong>iconicimagestx.com</strong>.
      </p>
    `),
  };

  return templates[type] || base(`<p>You have a new notification from Iconic Images.</p>`);
}
