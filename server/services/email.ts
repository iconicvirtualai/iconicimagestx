/**
 * Iconic Images — Email Service
 * Sends transactional emails using Nodemailer + Firebase email templates.
 * Place at: server/services/email.ts
 */

import nodemailer from "nodemailer";
import admin from "firebase-admin";

const db = () => admin.firestore();

// ─── Transporter ──────────────────────────────────────────────────────────────

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_FROM,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendEmailOptions {
  to: string;
  template: string;
  variables?: Record<string, string>;
  subject?: string; // override template subject
  attachments?: Array<{ filename: string; path: string }>;
}

// ─── Main Send Function ───────────────────────────────────────────────────────

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { to, template, variables = {}, subject: subjectOverride, attachments } = options;

  if (!to) {
    console.warn("[Email] No recipient specified, skipping.");
    return;
  }

  try {
    // Look up template from Firestore
    const templateDoc = await db()
      .collection("emailTemplates")
      .where("category", "==", template)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    let subject = subjectOverride || `Message from Iconic Images`;
    let htmlBody = getFallbackTemplate(template, variables);

    if (!templateDoc.empty) {
      const tmpl = templateDoc.docs[0].data();
      subject = subjectOverride || interpolate(tmpl.subject, variables);
      htmlBody = interpolate(tmpl.htmlBody, variables);
    }

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Iconic Images" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlBody,
      attachments,
    });

    console.log(`[Email] Sent '${template}' to ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send '${template}' to ${to}:`, err);
    throw err;
  }
}

// ─── Template Variable Interpolation ─────────────────────────────────────────

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

// ─── Fallback Templates (used if Firestore template missing) ──────────────────

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
        <p>Iconic Images TX | iconicimagestx.com</p>
        <p>Questions? Reply to this email or message us through your client portal.</p>
      </div>
    </div>
  `;

  const templates: Record<string, string> = {
    booking_received: base(`
      <h2>We received your booking request!</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Thank you for choosing Iconic Images. We've received your booking request for <strong>${vars.address}</strong>.</p>
      <p>Our team will review and confirm your appointment within 1 business day. You'll receive a confirmation email once everything is set.</p>
      <p>Your order ID is: <strong>${vars.requestId}</strong></p>
    `),
    order_confirmed: base(`
      <h2>Your appointment is confirmed!</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Great news — your shoot at <strong>${vars.address}</strong> is confirmed!</p>
      <p><strong>Date:</strong> ${vars.scheduledDate}<br>
      <strong>Time:</strong> ${vars.scheduledTime}<br>
      <strong>Photographer:</strong> ${vars.photographerName}</p>
      <p><a href="${vars.portalUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Your Portal</a></p>
    `),
    gallery_delivery: base(`
      <h2>Your gallery is ready! 🎉</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Your photos for <strong>${vars.address}</strong> are edited and ready for download.</p>
      ${vars.invoiceAmount ? `<p>Please complete your payment of <strong>${vars.invoiceAmount}</strong> to download your files.</p>` : ""}
      <p><a href="${vars.galleryUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Gallery & Download</a></p>
      <p style="color:#999;font-size:12px;">Gallery available for ${vars.expiresAt}.</p>
    `),
    invoice: base(`
      <h2>Invoice from Iconic Images</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Your invoice <strong>${vars.invoiceNumber}</strong> for <strong>${vars.amount}</strong> is ready.</p>
      ${vars.dueDate ? `<p>Due: <strong>${vars.dueDate}</strong></p>` : ""}
      <p><a href="${vars.paymentUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Pay Invoice</a></p>
    `),
    payment_receipt: base(`
      <h2>Payment received ✓</h2>
      <p>Hi ${vars.clientName},</p>
      <p>We've received your payment of <strong>${vars.amount}</strong> for invoice ${vars.invoiceNumber}.</p>
      ${vars.balance && vars.balance !== "$0.00" ? `<p>Remaining balance: <strong>${vars.balance}</strong></p>` : "<p>Your account is paid in full. Thank you!</p>"}
    `),
    new_booking_alert: base(`
      <h2>🔔 New Booking Request</h2>
      <p><strong>Client:</strong> ${vars.clientName}<br>
      <strong>Email:</strong> ${vars.email}<br>
      <strong>Phone:</strong> ${vars.phone}<br>
      <strong>Address:</strong> ${vars.address}<br>
      <strong>Total:</strong> ${vars.total}</p>
      <p><a href="${vars.dashboardUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Review in Dashboard</a></p>
    `),
  };

  return templates[type] || base(`<p>You have a new notification from Iconic Images.</p>`);
}
