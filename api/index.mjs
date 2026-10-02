import "dotenv/config";
import express, { Router } from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import twilio from "twilio";
import { google } from "googleapis";
import Stripe from "stripe";
import crypto, { randomUUID, randomBytes } from "crypto";
import fs$1 from "node:fs/promises";
import path$1 from "node:path";
const STAFF_ROLES$1 = ["admin", "coordinator", "photographer", "editor"];
function isStaffRole$1(role) {
  return typeof role === "string" && STAFF_ROLES$1.includes(role);
}
function isActiveStaffRecord(data) {
  if (!data) return false;
  if (data.isActive === false) return false;
  return isStaffRole$1(data.role);
}
function isHostedDeployment(env) {
  if (env.VERCEL === "1" || env.VERCEL_ENV) return true;
  return env.NODE_ENV === "production";
}
function isTempAdminEnabled(env = liveServerEnv()) {
  if (env.ENABLE_TEMP_ADMIN !== "true") return false;
  return !isHostedDeployment(env);
}
function liveServerEnv(env = process.env) {
  return {
    ENABLE_TEMP_ADMIN: env.ENABLE_TEMP_ADMIN,
    VERCEL: env.VERCEL,
    VERCEL_ENV: env.VERCEL_ENV,
    // Bracket access so production server bundles keep the runtime value.
    NODE_ENV: env["NODE_ENV"]
  };
}
function tempAdminAllowed() {
  return isTempAdminEnabled(liveServerEnv());
}
function roleAtLeast(role, minimum) {
  if (!role) return false;
  if (role === "admin") return true;
  if (role === "coordinator") return minimum !== "admin";
  return role === "photographer";
}
async function resolveRole(uid, decoded) {
  if (tempAdminAllowed() && uid === "temp-admin-uid") {
    return "admin";
  }
  try {
    const staffDoc = await admin.firestore().collection("staff").doc(uid).get();
    if (!staffDoc.exists) return null;
    const data = staffDoc.data();
    if (!isActiveStaffRecord(data)) return null;
    return data.role;
  } catch (err) {
    console.error("[Auth] Firestore staff lookup failed:", err);
    const claimRole = decoded.role;
    if (decoded.isStaff === true && isActiveStaffRecord({ role: claimRole, isActive: true })) {
      return claimRole;
    }
    return null;
  }
}
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (tempAdminAllowed() && authHeader === "Bearer temp-admin-token") {
    req.user = {
      uid: "temp-admin-uid",
      email: "temp-admin@iconicimagestx.com"
    };
    return next();
  }
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No authentication token provided." });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
async function requireStaff(req, res, next) {
  await requireAuth(req, res, async () => {
    const role = await resolveRole(req.user.uid, req.user);
    if (!role) return res.status(403).json({ error: "Staff access required." });
    req.staffRole = role;
    req.isAdmin = role === "admin";
    req.isCoordinator = role === "admin" || role === "coordinator";
    req.isPhotographer = roleAtLeast(role, "photographer");
    next();
  });
}
async function requireAdmin(req, res, next) {
  await requireStaff(req, res, () => {
    if (!req.isAdmin) return res.status(403).json({ error: "Admin access required." });
    next();
  });
}
async function requireCoordinator(req, res, next) {
  await requireStaff(req, res, () => {
    if (!req.isCoordinator) return res.status(403).json({ error: "Coordinator access required." });
    next();
  });
}
async function requirePhotographer(req, res, next) {
  await requireStaff(req, res, () => {
    if (!req.isPhotographer) return res.status(403).json({ error: "Photographer access required." });
    next();
  });
}
const ORDER_RECEIVED_EMAIL_TEMPLATE = "booking_received";
const ORDER_RECEIVED_SMS_KIND = "booking_confirmation";
const STAFF_INBOUND_EMAIL_TEMPLATE = "live_chat";
const STAFF_INBOUND_SMS_KIND = "staff_inbound";
const STAFF_INBOUND_SMS_TO = "+12813560965";
function clientNotifyLive(env = process.env) {
  if (env.CLIENT_COMMS_ZONE === "RED") return false;
  return env.CLIENT_NOTIFY_LIVE === "true";
}
function emailAllowed(template, env = process.env, audience) {
  if (template === ORDER_RECEIVED_EMAIL_TEMPLATE) return true;
  if (audience === "staff" && template === STAFF_INBOUND_EMAIL_TEMPLATE) return true;
  return clientNotifyLive(env);
}
function smsAllowed(kind, env = process.env) {
  if (kind === ORDER_RECEIVED_SMS_KIND) return true;
  if (kind === STAFF_INBOUND_SMS_KIND) return true;
  return clientNotifyLive(env);
}
function isStaffInboundSmsDestination(to) {
  const digits = to.replace(/\D/g, "");
  return digits === "12813560965" || digits === "2813560965";
}
function clientNotifyBlockReason(env = process.env) {
  if (env.CLIENT_COMMS_ZONE === "RED") return "CLIENT_COMMS_ZONE=RED";
  return "CLIENT_NOTIFY_LIVE is not exactly true";
}
const db$k = () => admin.firestore();
class EmailNotConfiguredError extends Error {
  code = "email_not_configured";
  constructor() {
    super("SMTP is not configured. Set SMTP_USER and SMTP_PASS.");
    this.name = "EmailNotConfiguredError";
  }
}
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
    auth: { user, pass }
  });
}
async function sendEmail(options) {
  const { to, bcc, cc, template, audience, variables = {}, subject: subjectOverride, attachments } = options;
  if (!to) {
    console.warn("[Email] No recipient specified, skipping.");
    return { sent: false };
  }
  if (!emailAllowed(template, process.env, audience)) {
    console.warn(
      `[Email] Suppressed '${template}' to ${to} — ${clientNotifyBlockReason()}. No message sent.`
    );
    return { sent: false };
  }
  let subject = subjectOverride || `Message from Iconic Images`;
  let htmlBody = getFallbackTemplate(template, variables);
  try {
    if (admin.apps.length) {
      const templateDoc = await db$k().collection("emailTemplates").where("category", "==", template).where("isActive", "==", true).limit(1).get();
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
      subject,
      html: htmlBody,
      attachments
    });
    console.log(`[Email] Sent '${template}' to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Email] Failed to send '${template}' to ${to}:`, err);
    throw err;
  } finally {
    transporter.close();
  }
}
function interpolate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}
function getFallbackTemplate(type, vars) {
  const base = (content) => `
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
  const templates = {
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
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;">Order Total</td><td style="padding:10px 14px;font-weight:bold;color:#0d9488;">${vars.total}</td></tr>
      </table>

      <p style="color:#888;font-size:13px;">Confirmation ID: <strong>${vars.requestId}</strong> — keep this for your records.</p>
      <p style="color:#888;font-size:13px;">If any details look incorrect, simply reply to this email and we'll sort it out.</p>
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
      <p>We typically respond to inquiries within 24 business hours. If your question is urgent, feel free to call us at <strong>281-356-0965</strong>.</p>
      <p style="margin-top:30px;color:#888;font-size:12px;">
        If you have any additional information to add, simply reply to this email or visit <strong>iconicimagestx.com</strong>.
      </p>
    `)
  };
  return templates[type] || base(`<p>You have a new notification from Iconic Images.</p>`);
}
let _client = null;
function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  }
  _client = twilio(sid, token);
  return _client;
}
function normalisePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
async function sendSMS({ to, body, from, kind }) {
  if (kind === STAFF_INBOUND_SMS_KIND && !isStaffInboundSmsDestination(to)) {
    console.error(`[SMS] Refused staff_inbound to ${to}. Only the office Google Voice number is allowed.`);
    return { sid: "", status: "refused", suppressed: true };
  }
  if (!smsAllowed(kind)) {
    console.warn(`[SMS] Suppressed to ${to} — ${clientNotifyBlockReason()}. No message sent.`);
    return { sid: "", status: "suppressed", suppressed: true };
  }
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) throw new Error("TWILIO_PHONE_NUMBER not set.");
  const client = getClient();
  const message = await client.messages.create({
    to: normalisePhone(to),
    from: fromNumber,
    body
  });
  console.log(`[SMS] Sent to ${to} — SID: ${message.sid}`);
  return { sid: message.sid, status: message.status };
}
async function sendSMSCampaign(recipients, bodyTemplate, messagingServiceSid) {
  if (!clientNotifyLive()) {
    console.warn(`[SMS] Suppressed campaign to ${recipients.length} recipients — ${clientNotifyBlockReason()}.`);
    return recipients.map((recipient) => ({ phone: recipient.phone, error: "suppressed" }));
  }
  const client = getClient();
  const sid = messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const results = [];
  for (const recipient of recipients) {
    if (!recipient.phone) continue;
    const body = bodyTemplate.replace(/\{\{name\}\}/gi, recipient.name || "there");
    try {
      const msg = await client.messages.create({
        to: normalisePhone(recipient.phone),
        ...sid ? { messagingServiceSid: sid } : { from: fromNumber },
        body
      });
      results.push({ phone: recipient.phone, sid: msg.sid });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[SMS] Campaign send failed for ${recipient.phone}:`, errorMessage);
      results.push({ phone: recipient.phone, error: errorMessage });
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return results;
}
async function createMaskedConversation(friendlyName, photographer, client, webhookUrl) {
  if (!clientNotifyLive()) {
    console.warn(`[SMS] Suppressed masked conversation — ${clientNotifyBlockReason()}. No SMS sent.`);
    throw new Error("Client notifications are off.");
  }
  const client_sdk = getClient();
  const conversation = await client_sdk.conversations.v1.conversations.create({
    friendlyName,
    timers: {
      inactive: "P30D",
      // auto-close after 30 days inactive
      closed: "P60D"
    }
  });
  const conversationSid = conversation.sid;
  if (webhookUrl) {
    await client_sdk.conversations.v1.conversations(conversationSid).webhooks.create({
      target: "webhook",
      "configuration.method": "post",
      "configuration.url": webhookUrl,
      "configuration.filters": ["onMessageAdded"]
    });
  }
  const photographerParticipant = await client_sdk.conversations.v1.conversations(conversationSid).participants.create({
    "messagingBinding.type": "sms",
    "messagingBinding.address": normalisePhone(photographer.phone),
    identity: `photographer_${normalisePhone(photographer.phone).replace("+", "")}`
  });
  const clientParticipant = await client_sdk.conversations.v1.conversations(conversationSid).participants.create({
    "messagingBinding.type": "sms",
    "messagingBinding.address": normalisePhone(client.phone),
    identity: `client_${normalisePhone(client.phone).replace("+", "")}`
  });
  console.log(`[Conversations] Created: ${conversationSid} (${friendlyName})`);
  return {
    conversationSid,
    photographerParticipantSid: photographerParticipant.sid,
    clientParticipantSid: clientParticipant.sid
  };
}
async function sendConversationMessage(conversationSid, body, author = "Iconic Images") {
  if (!clientNotifyLive()) {
    console.warn(`[SMS] Suppressed conversation message — ${clientNotifyBlockReason()}. No SMS sent.`);
    throw new Error("Client notifications are off.");
  }
  const client_sdk = getClient();
  const message = await client_sdk.conversations.v1.conversations(conversationSid).messages.create({ body, author });
  return { sid: message.sid };
}
async function closeConversation(conversationSid) {
  const client_sdk = getClient();
  await client_sdk.conversations.v1.conversations(conversationSid).update({ state: "closed" });
  console.log(`[Conversations] Closed: ${conversationSid}`);
}
const SMS_TEMPLATES = {
  bookingConfirmation: (name, date, address, total) => `Hi ${name}! We've received your booking request for ${address}.

⚠️ THIS IS NOT A CONFIRMATION. Our team will review your request and reach out shortly to confirm your appointment.

Requested date: ${date}
Estimated total: ${total}

Questions? Reply to this text! — Iconic Images 📸`,
  appointmentReminder24h: (name, date, time, address) => `Hey ${name}, reminder! Your Iconic Images shoot is tomorrow 📸

🕐 ${time}
📍 ${address}

Reply CONFIRM to confirm or call us to reschedule.`,
  appointmentReminder1h: (name, time) => `Hi ${name}! Your photographer is on the way — arriving around ${time} 📸
Reply to this text with any last-minute notes!`,
  photosDelivered: (name, galleryUrl) => `🎉 ${name}, your photos are ready!

View your gallery: ${galleryUrl}

Questions or edits? Just reply here. — Iconic Images`,
  photographerIntro: (photographerName, clientName, date) => `Hi ${clientName}! I'm ${photographerName}, your Iconic Images photographer for ${date}. Feel free to text me here with any questions before the shoot! 📸`,
  newBookingAlert: (address, date, services2) => `🔔 NEW BOOKING — Iconic Images

📍 ${address}
📅 ${date}
🏠 ${services2}

Check dashboard for details.`
};
function getPrivateKey() {
  return (process.env.GOOGLE_CALENDAR_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}
function getAuth() {
  const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  if (!clientEmail || !privateKey) return null;
  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });
}
function parseTime(time) {
  if (!time) return { hours: 9, minutes: 0 };
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return { hours: 9, minutes: 0 };
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridian = match[3]?.toUpperCase();
  if (meridian === "PM" && hours < 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}
function eventTimes(date, time) {
  if (!date) return null;
  const { hours, minutes } = parseTime(time);
  const datePart = date.toISOString().slice(0, 10);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + Number(process.env.DEFAULT_APPOINTMENT_DURATION_MINUTES || 90);
  const hhmm = (totalMinutes) => {
    const dayMinutes = (totalMinutes % 1440 + 1440) % 1440;
    const hh = Math.floor(dayMinutes / 60).toString().padStart(2, "0");
    const mm = (dayMinutes % 60).toString().padStart(2, "0");
    return `${hh}:${mm}:00`;
  };
  return {
    start: `${datePart}T${hhmm(startMinutes)}`,
    end: `${datePart}T${hhmm(endMinutes)}`
  };
}
async function createCalendarBookingEvent(booking) {
  const auth = getAuth();
  const times = eventTimes(booking.scheduledDate, booking.scheduledTime);
  if (!auth || !times) return null;
  const calendarId = booking.photographerCalendarId || booking.photographerEmail || process.env.GOOGLE_CALENDAR_ID || "primary";
  const calendar = google.calendar({ version: "v3", auth });
  const summary = `Iconic Images: ${booking.clientName}`;
  const description = [
    `Order: ${booking.orderId}`,
    `Client: ${booking.clientName}`,
    booking.clientEmail ? `Email: ${booking.clientEmail}` : "",
    booking.clientPhone ? `Phone: ${booking.clientPhone}` : "",
    booking.photographerName ? `Photographer: ${booking.photographerName}` : "",
    booking.services.length ? `Services: ${booking.services.join(", ")}` : "",
    booking.notes ? `Notes: ${booking.notes}` : ""
  ].filter(Boolean).join("\n");
  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody: {
      summary,
      location: booking.address,
      description,
      start: { dateTime: times.start, timeZone: "America/Chicago" },
      end: { dateTime: times.end, timeZone: "America/Chicago" },
      extendedProperties: {
        private: {
          orderId: booking.orderId,
          source: "iconicimagestx"
        }
      }
    }
  });
  return {
    calendarId,
    eventId: response.data.id || null,
    htmlLink: response.data.htmlLink || null
  };
}
async function verifyCalendarWriteAccess() {
  const auth = getAuth();
  if (!auth) {
    throw new Error("Google Calendar service account is not configured.");
  }
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date(Date.now() + 24 * 60 * 60 * 1e3);
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 5);
  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody: {
      summary: "Iconic Calendar Health Check",
      description: "Temporary event created by Iconic Images to verify booking calendar write access.",
      start: { dateTime: start.toISOString(), timeZone: "America/Chicago" },
      end: { dateTime: end.toISOString(), timeZone: "America/Chicago" },
      extendedProperties: {
        private: {
          source: "iconicimagestx-health-check"
        }
      }
    }
  });
  const eventId = response.data.id;
  if (eventId) {
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: "none"
    });
  }
  return {
    calendarId,
    eventId: eventId || null
  };
}
async function listCalendarScheduleEvents({
  calendars,
  timeMin,
  timeMax
}) {
  const auth = getAuth();
  if (!auth) return [];
  const calendar = google.calendar({ version: "v3", auth });
  const uniqueCalendars = Array.from(
    new Map(
      calendars.filter((item) => item.id).map((item) => [item.id.toLowerCase(), item])
    ).values()
  );
  const results = await Promise.allSettled(
    uniqueCalendars.map(async (source) => {
      const response = await calendar.events.list({
        calendarId: source.id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250
      });
      return (response.data.items || []).map((event) => ({
        id: event.id || `${source.id}-${event.iCalUID || event.htmlLink || event.summary}`,
        calendarId: source.id,
        photographerName: source.name || source.id,
        summary: event.summary || "Untitled appointment",
        location: event.location || "",
        description: event.description || "",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        htmlLink: event.htmlLink || null
      }));
    })
  );
  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    console.error(`[Calendar] Failed to read ${uniqueCalendars[index]?.id}:`, result.reason);
    return [];
  });
}
function lifeOfTheListingCareSelected(value) {
  return value === true;
}
const PLAYTEST_ADDRESS = "100 Playtest Lane, Austin, TX 78701";
const STAFF_ROLES = ["admin", "coordinator", "photographer", "editor"];
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
function cleanPersonName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}
function isStaffRole(value) {
  return STAFF_ROLES.includes(value);
}
function safeStorageFileName(fileName) {
  const base = String(fileName || "upload").split(/[/\\]/).pop() || "upload";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 180) || "upload";
}
function contentTypeForUpload(fileName, provided) {
  const raw = String(provided || "").trim().toLowerCase();
  if (/^[\w.+-]+\/[\w.+-]+$/.test(raw) && raw.length <= 120 && raw !== "application/octet-stream") {
    return raw;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return raw && /^[\w.+-]+\/[\w.+-]+$/.test(raw) ? raw : "application/octet-stream";
}
function isListingStoragePath(listingId, storagePath) {
  if (!listingId || typeof storagePath !== "string") return false;
  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false;
  const prefix = `listings/${listingId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return rest.startsWith("photos/") || rest.startsWith("raw/") || rest.startsWith("finals/");
}
function staffCanAccessListing(role, uid, listing) {
  if (!listing || !uid) return false;
  if (role === "admin" || role === "coordinator") return true;
  if (listing.photographerUid === uid) return true;
  if (Array.isArray(listing.photographerIds) && listing.photographerIds.includes(uid)) return true;
  if (Array.isArray(listing.assignedProviders)) {
    return listing.assignedProviders.some(
      (provider) => provider?.providerId === uid || provider?.uid === uid || provider?.id === uid
    );
  }
  return false;
}
function clientCanViewListing(listing, identity) {
  if (!listing || !identity?.uid) return false;
  const ids = /* @__PURE__ */ new Set([identity.uid, ...identity.ids || []]);
  if (listing.clientId && ids.has(String(listing.clientId))) return true;
  const email = normalizeEmail(identity.email);
  const listingEmail = normalizeEmail(listing.clientEmail);
  return Boolean(email && listingEmail && email === listingEmail);
}
const services = [
  // Listings
  {
    id: "listing-essentials",
    name: "The Essentials",
    category: "listings",
    price: 249,
    description: "Clean, bright, and ready to post. Perfect for quick turnarounds.",
    features: [
      "30 Images",
      "The 'Snap' Reel (15s)",
      "Trending Audio",
      "Pre-Launch Delivery Packet",
      "1 Iconic Twilight Render",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-showcase",
    name: "The Showcase",
    category: "listings",
    price: 549,
    description: "A complete visual deep-dive. We capture the details, the angles, and the atmosphere.",
    isPopular: true,
    features: [
      "50 Images",
      "5 Aerials",
      "The 'Snap' Reel (15s)",
      "1 'Iconic' 3D Animated Reel (60s Vert)",
      "2D Floorplan",
      "Pre-Launch Delivery Packet",
      "2 Iconic Twilight Renders",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-legacy",
    name: "The Legacy",
    category: "listings",
    price: 899,
    description: "Our highest level of care. We create a cinematic experience.",
    features: [
      "Full Images",
      "Full Aerials",
      "The 'Snap' Reel (15s)",
      "1 'Iconic' 3D Animated Reel (60s Vert)",
      "90s 4K Cinematic Property Video (with Aerial)",
      "Pre-Launch Delivery Packet",
      "5 Iconic Twilight Renders",
      "Agent On Camera Intro/Outro",
      "3D Motion Graphics and Animations",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-market-leader",
    name: "The Market Leader",
    category: "listings",
    price: 1599,
    description: "Total market saturation strategy. Full-cycle media partner.",
    features: [
      "Full Images (Next-Day)",
      "Full Aerials (Same-Day by 7PM)",
      "The 'Snap' Reel (15s) (Same-Day by 7PM)",
      "1 'Iconic' Animated Reel (60s Vert) (Next-Day)",
      "2D Floorplan (Next-Day)",
      "Pre-Launch Delivery Packet (Same-Day by 7PM)",
      "5 Iconic Twilight Renders (Same-Day by 7PM)",
      "90s 4K Cinematic Video (Next-Day)",
      "VR / Matterport (Vision Pro Ready) & 2D Floorplan (Next-Day)",
      "The Iconic Finish - Complimentary Premium Editing",
      "Post-Sale Marketing Package (Scheduled)"
    ]
  },
  // Branding
  {
    id: "branding-refresh",
    name: "The Refresh",
    category: "branding",
    price: 349,
    description: "The Modern Portrait. Approachable, professional, and uniquely you.",
    features: [
      "60-Minute Session",
      "10 High-End 'Lifestyle' Portraits",
      "The Woodlands/Spring Locations",
      "AI Digital Twin Lite Setup",
      "Voice and Likeness Cloning"
    ]
  },
  {
    id: "branding-content-partner",
    name: "The Content Partner",
    category: "branding",
    price: 999,
    description: "30 days of content in 2 hours. Never wonder what to post again.",
    isPopular: true,
    features: [
      "2-Hour Monthly Filming Session",
      "Full Strategy, Scripting & Direction",
      "20 Custom Reels for Socials",
      "Trending Audio & Personal Branding"
    ]
  },
  {
    id: "branding-local-legend",
    name: "The Local Legend",
    category: "branding",
    price: 2499,
    description: "The Market Takeover Campaign. Your Story, Told Cinematically.",
    features: [
      "6-8 Hour Signature Production Day",
      "90-Second 4K Bio Film",
      '5 "Local Authority" Neighborhood Spotlights',
      'Pre-Production "Vibe Check" and Professional Scripting',
      "Post-Production Guidance and Marketing Review"
    ]
  },
  // Business (Social Monopoly)
  {
    id: "business-baseline",
    name: "The Baseline",
    category: "business",
    price: 500,
    description: "The Professional Foundation. Establish consistency with 8 edited reels per month.",
    phase: 1,
    features: [
      "8 Professionally Edited Reels (2/week)",
      'Signature "Iconic" 2026 Editing Style',
      "Trending Audio & Brand Integration"
    ]
  },
  {
    id: "business-growth-engine",
    name: "The Growth Engine",
    category: "business",
    price: 850,
    description: "Turning Views into Conversations. 12 edited reels with high-conversion hooks.",
    phase: 1,
    isPopular: true,
    features: [
      "12 Professionally Edited Reels (3/week)",
      "The Hook Suite: High-conversion captions & strategic hashtags.",
      "Scroll-Stopping Visual Flow.",
      "Conversion-Focused Copywriting"
    ]
  },
  {
    id: "studio-noir",
    name: "Studio Noir",
    category: "studio",
    price: 0,
    description: "Dark, dramatic room at Studio 105. Rate confirmed when the hold is set."
  },
  {
    id: "studio-blanc",
    name: "Studio Blanc",
    category: "studio",
    price: 0,
    description: "Bright white room at Studio 105. Rate confirmed when the hold is set."
  }
];
const APPRENTICESHIP_RULES = [
  "Apprentices are learning.",
  "We do not make additional trips.",
  "We do not edit out anything additional — you get what you pay for.",
  "You're helping us help you.",
  "Once apprentices graduate we will have new apprentices. Graduates become vetted Iconic shooters, just like the OGs. It's a lifetime cycle — clients help all along the way.",
  "But we don't play: be prepped and ready to go when we arrive."
];
function isApprenticeshipPackage(id) {
  return id.startsWith("apprentice-");
}
const basicsList = [
  {
    id: "photos-20",
    name: "20 Photos",
    price: 99,
    description: "Essential photo package for smaller listings.",
    features: [
      "20 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "photos-35",
    name: "35 Photos",
    price: 150,
    description: "Standard photo package for most residential listings.",
    features: [
      "35 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "photos-50",
    name: "50 Photos",
    price: 200,
    description: "Complete photo package for large homes and detailed spaces.",
    features: [
      "50 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "apprentice-25",
    name: "The Apprenticeship Program — 25 Photos",
    cardTitle: "25 photos",
    price: 75,
    kicker: "The cheap one",
    appointmentLimit: "20 Minute Appointment ONLY",
    aside: "Twenty-five photos. Twenty minutes. You'll feel the savings — and the stopwatch.",
    description: "25 photos, shot by an apprentice. 20 Minute Appointment ONLY. Overages billed at $25 per 15-minute increment.",
    features: [
      "25 Photos",
      "20 Minute Appointment ONLY",
      "Photos only",
      "Overages: $25 per 15-minute increment"
    ],
    rules: APPRENTICESHIP_RULES
  },
  {
    id: "apprentice-50",
    name: "The Apprenticeship Program — 50 Photos",
    cardTitle: "50 photos",
    price: 125,
    kicker: "Slightly less cheap",
    appointmentLimit: "1 Hour Appointment ONLY",
    aside: "Fifty photos and a full hour. You still walked past the real packages.",
    description: "50 photos, shot by an apprentice. 1 Hour Appointment ONLY. Overages billed at $25 per 15-minute increment.",
    features: [
      "50 Photos",
      "1 Hour Appointment ONLY",
      "Photos only",
      "Overages: $25 per 15-minute increment"
    ],
    rules: APPRENTICESHIP_RULES
  }
];
basicsList.filter((item) => isApprenticeshipPackage(item.id));
basicsList.filter((item) => !isApprenticeshipPackage(item.id));
function orderTotalLabel(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}
function normalizeBookingLineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const price = Number(item.price) || 0;
    const qty = Number(item.qty) > 0 ? Number(item.qty) : 1;
    const unitPrice = item.unitPrice == null || item.unitPrice === "" ? price / qty : Number(item.unitPrice) || 0;
    const line = {
      name: String(item.name || ""),
      unitPrice,
      qty,
      price
    };
    if (item.id != null && item.id !== "") line.id = String(item.id);
    return line;
  });
}
function buildBookingInvoiceDraft(input) {
  const total = Number(input.total) || 0;
  const lineItems = normalizeBookingLineItems(input.lineItems);
  return {
    orderRequestId: input.orderRequestId || null,
    orderId: null,
    clientId: input.clientId || null,
    clientEmail: normalizeEmail(input.clientEmail),
    clientName: input.clientName,
    lineItems,
    subtotal: Number(input.pricing?.subtotal ?? total) || 0,
    tax: Number(input.pricing?.tax) || 0,
    total,
    amountPaid: 0,
    amountDue: total,
    status: "draft",
    paymentProvider: "square",
    promoCode: input.promoCode || null,
    promoDiscount: Number(input.promoDiscount) || 0
  };
}
function existingInvoiceId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id ? id : null;
}
function nonEmptyId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id ? id : null;
}
function orderInvoiceDocId(orderRequestId) {
  return `ordreq_${orderRequestId}`;
}
function listingInvoiceDocId(listingId) {
  return `listing_${listingId}`;
}
function compact(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value) out[key] = value;
  }
  return out;
}
function planInvoiceLink(anchor) {
  const orderRequestId = nonEmptyId(anchor.orderRequestId);
  const orderId = nonEmptyId(anchor.orderId);
  const listingId = nonEmptyId(anchor.listingId);
  const orderInvoiceId = nonEmptyId(anchor.orderInvoiceId);
  const listingInvoiceId = nonEmptyId(anchor.listingInvoiceId);
  const found = (anchor.foundInvoiceIds || []).map(nonEmptyId).filter((id) => Boolean(id));
  const invoiceId = orderInvoiceId || listingInvoiceId || found[0] || null;
  const createId = invoiceId || (orderRequestId ? orderInvoiceDocId(orderRequestId) : null) || (listingId ? listingInvoiceDocId(listingId) : null);
  if (!createId) {
    throw new Error("An order or project is required to link an invoice.");
  }
  const invoiceFields = compact({
    orderRequestId,
    orderId,
    listingId
  });
  return {
    invoiceId,
    attached: Boolean(invoiceId),
    createId,
    invoiceFields,
    orderRequestFields: orderRequestId ? compact({ invoiceId: createId, listingId, orderId }) : null,
    listingFields: listingId ? compact({ invoiceId: createId, orderRequestId, orderId }) : null,
    orderFields: orderId ? compact({ invoiceId: createId, orderRequestId, listingId }) : null
  };
}
const CLOSED_STATUSES = /* @__PURE__ */ new Set(["void", "voided", "cancelled", "canceled"]);
const SETTLED_STATUSES = /* @__PURE__ */ new Set(["paid", "comped"]);
function statusOf$1(invoice) {
  return String(invoice?.status || "").toLowerCase();
}
function numeric(value) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
function invoiceBalance(invoice) {
  const total = numeric(invoice?.total) ?? 0;
  const amountPaid = numeric(invoice?.amountPaid) ?? 0;
  const statedDue = numeric(invoice?.amountDue);
  const computedDue = Math.max(0, total - amountPaid);
  const amountDue = statedDue == null ? computedDue : Math.max(0, statedDue);
  return { total, amountPaid, amountDue };
}
function invoiceAllowsDownload(invoice) {
  if (!invoice) return false;
  const status = statusOf$1(invoice);
  if (CLOSED_STATUSES.has(status)) return false;
  if (SETTLED_STATUSES.has(status)) return true;
  const { total, amountPaid, amountDue } = invoiceBalance(invoice);
  const statedDue = numeric(invoice.amountDue);
  if (total <= 0 && (statedDue == null || statedDue <= 0)) return true;
  if (statedDue != null && statedDue <= 0 && amountPaid <= 0 && total > 0) return false;
  return amountDue <= 0 && amountPaid > 0;
}
function amountStillDue(invoice) {
  if (!invoice) return 0;
  const status = statusOf$1(invoice);
  if (SETTLED_STATUSES.has(status) || CLOSED_STATUSES.has(status)) return 0;
  const { total, amountPaid, amountDue } = invoiceBalance(invoice);
  const computedDue = Math.max(0, total - amountPaid);
  const statedDue = numeric(invoice.amountDue);
  if (statedDue != null && statedDue <= 0 && computedDue > 0 && amountPaid <= 0) return computedDue;
  return amountDue;
}
function squarePaymentNote(invoiceId, invoiceNumber) {
  const label = invoiceNumber ? `Iconic Images invoice ${invoiceNumber}` : "Iconic Images invoice";
  return `${label} invoiceId:${invoiceId}`;
}
function invoiceIdFromSquareNote(note) {
  if (typeof note !== "string") return null;
  const match = note.match(/invoiceId:([A-Za-z0-9_-]+)/);
  return match?.[1] || null;
}
const LINK_MEDIA_TYPES = /* @__PURE__ */ new Set(["video", "reel", "tour", "matterport"]);
function publicMediaItem(item, canDownload) {
  const type = String(item.type || "photo");
  const title = item.title || item.fileName || "Media";
  const base = {
    id: item.id,
    fileName: item.fileName || title,
    title,
    type,
    width: item.width || null,
    height: item.height || null,
    canDownload: Boolean(canDownload && item.downloadable !== false && !LINK_MEDIA_TYPES.has(type)),
    locked: !canDownload
  };
  if (!canDownload) {
    return { ...base, url: null, shareUrl: null, embedUrl: null };
  }
  const url = item.shareUrl || item.embedUrl || item.url || null;
  return {
    ...base,
    url,
    shareUrl: item.shareUrl || item.url || item.embedUrl || null,
    embedUrl: item.embedUrl || item.url || null
  };
}
const SQUARE_VERSION_FALLBACK = "2026-08-20";
const SYNC_BUDGET_MS = 8e3;
function squareApiBaseUrl(environment) {
  return environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}
function squareConfigured(env) {
  return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}
function squareInvoiceAlreadySynced(invoice) {
  return typeof invoice.squareInvoiceId === "string" && invoice.squareInvoiceId.trim().length > 0;
}
function preferredSquareCheckoutUrl(invoice) {
  if (typeof invoice.squareInvoiceUrl !== "string") return null;
  const url = invoice.squareInvoiceUrl.trim();
  if (!url.startsWith("https://")) return null;
  return url;
}
function resolveSquareCheckoutUrl(input) {
  const fresh = preferredSquareCheckoutUrl({ squareInvoiceUrl: input.freshUrl });
  if (fresh) return fresh;
  return preferredSquareCheckoutUrl({ squareInvoiceUrl: input.storedUrl });
}
function squareInvoiceDueDate(now) {
  const due = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1e3);
  return due.toISOString().slice(0, 10);
}
function toCents(amount) {
  return Math.round((Number(amount) || 0) * 100);
}
function buildSquareOrderPricing(lineItems, total, paymentNote) {
  const normalized = normalizeBookingLineItems(lineItems);
  const lines = [];
  const discounts = [];
  normalized.forEach((item, index) => {
    const extendedCents = toCents(item.price);
    if (extendedCents < 0) {
      const name = item.name.trim() || "Discount";
      discounts.push({
        uid: `discount-${index}`,
        name: name.slice(0, 255),
        type: "FIXED_AMOUNT",
        scope: "ORDER",
        amount_money: { amount: Math.abs(extendedCents), currency: "USD" }
      });
      return;
    }
    if (extendedCents === 0) return;
    const qty = Number.isInteger(item.qty) && item.qty > 0 ? item.qty : 1;
    const unitCents = toCents(item.unitPrice);
    const pricedAsQty = unitCents > 0 && unitCents * qty === extendedCents;
    const line = {
      uid: `line-${index}`,
      name: (item.name.trim() || "Service").slice(0, 512),
      quantity: pricedAsQty ? String(qty) : "1",
      base_price_money: {
        amount: pricedAsQty ? unitCents : extendedCents,
        currency: "USD"
      }
    };
    if (index === 0 && paymentNote) line.note = paymentNote.slice(0, 500);
    lines.push(line);
  });
  if (lines.length === 0) return null;
  const lineSum = lines.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0);
  const discountSum = discounts.reduce((sum, discount) => sum + discount.amount_money.amount, 0);
  const amountCents = lineSum - discountSum;
  if (amountCents <= 0) return null;
  if (amountCents !== toCents(Number(total) || 0)) return null;
  return { lineItems: lines, discounts, amountCents };
}
function stableKey(prefix, value) {
  let h1 = 2166136261;
  let h2 = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h1 = Math.imul(h1 ^ value.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ value.charCodeAt(value.length - 1 - i), 16777619);
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  return `${prefix}${hex}`.slice(0, 45);
}
function idempotencyKey(prefix, invoiceId) {
  const key = `${prefix}${invoiceId}`;
  return key.length <= 45 ? key : stableKey(prefix, invoiceId);
}
function splitName(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { given_name: parts[0].slice(0, 300) };
  return {
    given_name: parts[0].slice(0, 300),
    family_name: parts.slice(1).join(" ").slice(0, 300)
  };
}
function squareError(body, fallback) {
  const errors = body && typeof body === "object" && "errors" in body ? body.errors : null;
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object" && "detail" in errors[0]) {
    const detail = errors[0].detail;
    if (typeof detail === "string" && detail) return detail;
  }
  if (body && typeof body === "object" && "error" in body) {
    const error = body.error;
    if (typeof error === "string" && error) return error;
  }
  return fallback;
}
async function squareRequest(deps, path2, init, deadline) {
  const token = deps.env.SQUARE_ACCESS_TOKEN;
  if (!token) return { ok: false, status: 0, body: { error: "Square is not configured" } };
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { ok: false, status: 0, body: { error: "Square invoice sync timed out" } };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await deps.fetchImpl(`${squareApiBaseUrl(deps.env.SQUARE_ENVIRONMENT)}${path2}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        "Square-Version": deps.env.SQUARE_VERSION || SQUARE_VERSION_FALLBACK,
        Authorization: `Bearer ${token}`
      },
      body: init.body === void 0 ? void 0 : JSON.stringify(init.body),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      ok: false,
      status: 0,
      body: { error: aborted ? "Square invoice sync timed out" : err instanceof Error ? err.message : "Square request failed" }
    };
  } finally {
    clearTimeout(timer);
  }
}
function publicUrlOf(body) {
  return preferredSquareCheckoutUrl({ squareInvoiceUrl: body?.invoice?.public_url });
}
async function fetchPublishedSquareInvoiceUrl(squareInvoiceId, deps) {
  const id = squareInvoiceId.trim();
  if (!id || !squareConfigured(deps.env)) return null;
  const result = await squareRequest(
    deps,
    `/v2/invoices/${encodeURIComponent(id)}`,
    { method: "GET" },
    Date.now() + (deps.timeoutMs ?? 5e3)
  );
  if (!result.ok) return null;
  return publicUrlOf(result.body);
}
async function syncSquareInvoice(invoice, deps) {
  try {
    if (squareInvoiceAlreadySynced(invoice)) return { ok: true, skipped: true, reason: "already-synced" };
    if (String(invoice.paymentProvider || "").toLowerCase() === "stripe") {
      return { ok: true, skipped: true, reason: "stripe" };
    }
    const total = Number(invoice.total) || 0;
    if (total <= 0) return { ok: true, skipped: true, reason: "nothing-due" };
    if (!squareConfigured(deps.env)) return { ok: true, skipped: true, reason: "not-configured" };
    const email = typeof invoice.clientEmail === "string" ? invoice.clientEmail.trim().toLowerCase() : "";
    if (!email) return { ok: true, skipped: true, reason: "missing-email" };
    const invoiceNumber = typeof invoice.invoiceNumber === "string" ? invoice.invoiceNumber.trim() : "";
    const paymentNote = squarePaymentNote(invoice.id, invoiceNumber || void 0);
    const pricing = buildSquareOrderPricing(invoice.lineItems, total, paymentNote);
    if (!pricing) return { ok: true, skipped: true, reason: "total-mismatch" };
    const deadline = Date.now() + (deps.timeoutMs ?? SYNC_BUDGET_MS);
    const locationId = deps.env.SQUARE_LOCATION_ID || "";
    const clientName = typeof invoice.clientName === "string" ? invoice.clientName : "";
    const search = await squareRequest(
      deps,
      "/v2/customers/search",
      {
        method: "POST",
        body: {
          query: { filter: { email_address: { exact: email } } },
          limit: 1
        }
      },
      deadline
    );
    if (!search.ok && search.body?.error === "Square invoice sync timed out") {
      return { ok: false, error: "Square invoice sync timed out" };
    }
    let customerId = search.ok && Array.isArray(search.body?.customers) ? search.body.customers[0]?.id : "";
    if (!customerId) {
      const createdCustomer = await squareRequest(
        deps,
        "/v2/customers",
        {
          method: "POST",
          body: {
            idempotency_key: stableKey("ii-cus-", email),
            email_address: email,
            ...splitName(clientName)
          }
        },
        deadline
      );
      if (!createdCustomer.ok) {
        return { ok: false, error: squareError(createdCustomer.body, "Square customer create failed") };
      }
      customerId = createdCustomer.body?.customer?.id || "";
    }
    if (!customerId) return { ok: false, error: "Square customer create failed" };
    const order = await squareRequest(
      deps,
      "/v2/orders",
      {
        method: "POST",
        body: {
          idempotency_key: idempotencyKey("ii-ord-", invoice.id),
          order: {
            location_id: locationId,
            customer_id: customerId,
            reference_id: invoice.id.slice(0, 40),
            line_items: pricing.lineItems,
            ...pricing.discounts.length ? { discounts: pricing.discounts } : {}
          }
        }
      },
      deadline
    );
    const orderId = order.ok ? order.body?.order?.id : "";
    if (!orderId) return { ok: false, error: squareError(order.body, "Square order create failed") };
    const invoiceBody = {
      location_id: locationId,
      order_id: orderId,
      primary_recipient: { customer_id: customerId },
      payment_requests: [
        {
          request_type: "BALANCE",
          due_date: squareInvoiceDueDate(deps.now ? deps.now() : /* @__PURE__ */ new Date())
        }
      ],
      delivery_method: "SHARE_MANUALLY",
      accepted_payment_methods: { card: true },
      title: `Iconic Images Invoice ${invoiceNumber || invoice.id}`.slice(0, 255),
      description: paymentNote
    };
    if (/^[A-Za-z0-9-]{1,40}$/.test(invoiceNumber)) invoiceBody.invoice_number = invoiceNumber;
    const createdInvoice = await squareRequest(
      deps,
      "/v2/invoices",
      {
        method: "POST",
        body: {
          idempotency_key: idempotencyKey("ii-inv-", invoice.id),
          invoice: invoiceBody
        }
      },
      deadline
    );
    const squareInvoice = createdInvoice.ok ? createdInvoice.body?.invoice : null;
    const squareInvoiceId = typeof squareInvoice?.id === "string" ? squareInvoice.id : "";
    if (!squareInvoiceId) {
      return { ok: false, error: squareError(createdInvoice.body, "Square invoice create failed") };
    }
    let url = publicUrlOf(createdInvoice.body);
    const status = typeof squareInvoice?.status === "string" ? squareInvoice.status : "DRAFT";
    if (!url || status === "DRAFT") {
      const published = await squareRequest(
        deps,
        `/v2/invoices/${encodeURIComponent(squareInvoiceId)}/publish`,
        {
          method: "POST",
          body: {
            version: Number(squareInvoice?.version) || 0,
            idempotency_key: idempotencyKey("ii-pub-", invoice.id)
          }
        },
        deadline
      );
      url = publicUrlOf(published.body) || url;
      if (!url) {
        const retrieved = await squareRequest(
          deps,
          `/v2/invoices/${encodeURIComponent(squareInvoiceId)}`,
          { method: "GET" },
          deadline
        );
        url = publicUrlOf(retrieved.body);
      }
    }
    if (!url) {
      return { ok: false, error: "Square invoice published without a public URL" };
    }
    return {
      ok: true,
      skipped: false,
      squareInvoiceId,
      squareInvoiceUrl: url,
      squareOrderId: typeof squareInvoice?.order_id === "string" && squareInvoice.order_id ? squareInvoice.order_id : orderId,
      squareCustomerId: customerId
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Square invoice sync failed" };
  }
}
const db$j = () => admin.firestore();
function squareInvoiceSynced(result) {
  return result.ok === true && result.skipped === false;
}
async function attachSquareInvoiceAfterBooking(invoiceId) {
  const ref = db$j().collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("[Square] Invoice sync skipped: invoice missing", invoiceId);
    return { ok: false, error: "Invoice missing" };
  }
  const data = snap.data() || {};
  const result = await syncSquareInvoice(
    {
      id: invoiceId,
      clientEmail: data.clientEmail,
      clientName: data.clientName,
      invoiceNumber: data.invoiceNumber,
      lineItems: data.lineItems,
      total: data.total,
      paymentProvider: data.paymentProvider,
      squareInvoiceId: data.squareInvoiceId
    },
    { fetchImpl: fetch, env: process.env }
  );
  if (squareInvoiceSynced(result)) {
    await ref.update({
      squareInvoiceId: result.squareInvoiceId,
      squareInvoiceUrl: result.squareInvoiceUrl,
      squareOrderId: result.squareOrderId,
      squareCustomerId: result.squareCustomerId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return result;
  }
  if ("error" in result) {
    console.error("[Square] Invoice sync failed:", result.error);
  } else if (result.reason === "total-mismatch" || result.reason === "missing-email") {
    console.error("[Square] Invoice sync skipped:", result.reason, invoiceId);
  }
  return result;
}
const router$h = Router();
const db$i = () => admin.firestore();
function appUrl$2() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}
function addressLabel$3(address) {
  if (!address) return "Address not provided";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address;
    if (typeof a.formatted === "string" && a.formatted) return a.formatted;
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "Address not provided";
  }
  return String(address);
}
function toDate$1(value) {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
    const parsed2 = new Date(normalized);
    return Number.isNaN(parsed2.getTime()) ? null : parsed2;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function money$1(value) {
  return orderTotalLabel(value);
}
router$h.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      lineItems,
      pricing,
      total,
      vibeNote,
      promoCode,
      promoDiscount,
      scheduledDate,
      scheduledTime,
      photographerPreference,
      squareFootage,
      accessMethod,
      lockboxCode,
      propertyStatus,
      furnishingStatus,
      // Additional fields from booking form (previously dropped)
      specializedPhotography,
      virtualStagingCredits,
      selectedService,
      selectedBasics,
      selectedAddOns,
      leadSource,
      marketingDoing,
      resultsBothering,
      perfectBusiness,
      businessSource,
      investmentWilling,
      lifeOfTheListingCare
    } = req.body;
    if (!firstName || !lastName || !email || !phone || !address) {
      return res.status(400).json({ error: "Missing required fields." });
    }
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ error: "No services selected." });
    }
    const clientName = `${firstName} ${lastName}`.trim();
    const displayAddress = addressLabel$3(address);
    const orderRequest = {
      firstName,
      lastName,
      clientName,
      email: email.toLowerCase().trim(),
      phone,
      address,
      lineItems,
      pricing: pricing || {},
      total: Number(total) || 0,
      vibeNote: vibeNote || "",
      promoCode: promoCode || null,
      promoDiscount: Number(promoDiscount) || 0,
      scheduledDate: scheduledDate || null,
      scheduledTime: scheduledTime || null,
      photographerPreference: photographerPreference || null,
      squareFootage: squareFootage || null,
      accessMethod: accessMethod || null,
      lockboxCode: lockboxCode || null,
      propertyStatus: propertyStatus || null,
      furnishingStatus: furnishingStatus || null,
      // Booking form fields — previously dropped
      specializedPhotography: specializedPhotography || null,
      virtualStagingCredits: Number(virtualStagingCredits) || 0,
      selectedService: selectedService || null,
      selectedBasics: Array.isArray(selectedBasics) ? selectedBasics : [],
      selectedAddOns: Array.isArray(selectedAddOns) ? selectedAddOns : [],
      leadSource: leadSource || null,
      marketingDoing: marketingDoing || null,
      resultsBothering: resultsBothering || null,
      perfectBusiness: perfectBusiness || null,
      businessSource: businessSource || null,
      investmentWilling: investmentWilling || null,
      // Draft add-on. Quote only — do not price it or mention it in client email/SMS.
      lifeOfTheListingCare: lifeOfTheListingCareSelected(lifeOfTheListingCare),
      status: "new",
      source: "booking_form",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db$i().collection("orderRequests").add(orderRequest);
    let invoiceId = null;
    try {
      const created = await createBookingInvoiceDraft({
        orderRequestId: docRef.id,
        email,
        clientName,
        lineItems,
        pricing,
        total,
        promoCode,
        promoDiscount
      });
      invoiceId = created.invoiceId;
      try {
        await docRef.update({
          invoiceId: created.invoiceId,
          ...created.clientId ? { clientId: created.clientId } : {}
        });
      } catch (linkErr) {
        console.error("[Bookings] Invoice link update failed:", linkErr);
      }
    } catch (err) {
      console.error("[Bookings] Invoice draft create failed:", err);
      invoiceId = null;
    }
    const accessLine = accessMethod ? `${accessMethod}${lockboxCode ? ` — Code: ${lockboxCode}` : ""}` : "Not specified";
    await sendEmail({
      to: email,
      template: "booking_received",
      variables: {
        clientName,
        address: displayAddress,
        total: money$1(total),
        requestId: docRef.id,
        scheduledDate: scheduledDate || "TBD — we'll confirm shortly",
        scheduledTime: scheduledTime || "",
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        dashboardUrl: `${appUrl$2()}/admin/order-request/${docRef.id}`
      }
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));
    await sendEmail({
      to: "photos@iconicimagestx.com",
      template: "booking_received",
      variables: {
        clientName,
        address: displayAddress,
        total: money$1(total),
        requestId: docRef.id,
        scheduledDate: scheduledDate || "TBD — we'll confirm shortly",
        scheduledTime: scheduledTime || "",
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        dashboardUrl: `${appUrl$2()}/admin/order-request/${docRef.id}`
      }
    }).catch((err) => console.error("[Bookings] Office notification email failed:", err));
    if (phone) {
      await sendSMS({
        to: phone,
        kind: "booking_confirmation",
        body: SMS_TEMPLATES.bookingConfirmation(
          firstName,
          scheduledDate || "TBD — we'll confirm shortly",
          displayAddress,
          money$1(total)
        )
      }).catch((err) => console.error("[Bookings] Confirmation SMS failed:", err));
    }
    if (process.env.ADMIN_PHONE) {
      const serviceNames = lineItems.map((i) => i.name).join(", ");
      await sendSMS({
        to: process.env.ADMIN_PHONE,
        body: SMS_TEMPLATES.newBookingAlert(
          displayAddress,
          scheduledDate || "TBD",
          serviceNames
        )
      }).catch((err) => console.error("[Bookings] Admin SMS alert failed:", err));
    }
    if (invoiceId) {
      try {
        await attachSquareInvoiceAfterBooking(invoiceId);
      } catch (err) {
        console.error("[Bookings] Square invoice sync failed:", err);
      }
    }
    return res.status(201).json({
      success: true,
      requestId: docRef.id,
      invoiceId,
      message: "Booking request received. We'll confirm shortly!"
    });
  } catch (err) {
    console.error("[Bookings] Submission error:", err);
    return res.status(500).json({ error: "Failed to submit booking request." });
  }
});
router$h.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$i().collection("orderRequests").orderBy("createdAt", "desc").limit(100).get();
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    return res.json(requests);
  } catch (err) {
    console.error("[Bookings] List error:", err);
    return res.status(500).json({ error: "Failed to fetch booking requests." });
  }
});
router$h.get("/:id", requireCoordinator, async (req, res) => {
  try {
    const doc = await db$i().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("[Bookings] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch booking request." });
  }
});
router$h.patch("/:id/confirm", requireCoordinator, async (req, res) => {
  try {
    const { assignedPhotographerId, assignedPhotographerName, scheduledDate, scheduledTime, internalNotes } = req.body;
    const requestDoc = await db$i().collection("orderRequests").doc(req.params.id).get();
    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    const request = requestDoc.data();
    if (request.convertedToOrderId) {
      try {
        await stampDurableLinks({
          invoiceId: existingInvoiceId(request.invoiceId),
          orderRequestId: req.params.id,
          orderId: String(request.convertedToOrderId),
          listingId: existingInvoiceId(request.listingId)
        });
      } catch (err) {
        console.error("[Bookings] Order/project/invoice link failed:", err);
      }
      return res.json({
        success: true,
        orderId: request.convertedToOrderId,
        clientId: request.clientId || null,
        invoiceId: existingInvoiceId(request.invoiceId),
        message: "Booking was already confirmed."
      });
    }
    const requestEmail = String(request.email || request.clientEmail || "").toLowerCase().trim();
    const requestPhone = request.phone || request.clientPhone || "";
    const requestFirstName = request.firstName || request.clientName?.split(" ")?.[0] || "Client";
    const requestLastName = request.lastName || request.clientName?.split(" ")?.slice(1).join(" ") || "";
    const requestClientName = request.clientName || `${requestFirstName} ${requestLastName}`.trim() || "Client";
    const requestAddress = request.address || request.propertyAddress || "";
    const requestAddressLabel = addressLabel$3(requestAddress);
    const requestLineItems = Array.isArray(request.lineItems) && request.lineItems.length > 0 ? request.lineItems : Array.isArray(request.services) ? request.services.map((service) => typeof service === "string" ? { name: service, price: 0 } : service) : [];
    const requestTotal = Number(request.total ?? request.pricing?.total ?? 0) || 0;
    const confirmDate = toDate$1(scheduledDate || request.scheduledDate || request.appointmentDate || request.requestedDate);
    const confirmTime = scheduledTime || request.scheduledTime || request.appointmentTime || request.requestedTime || null;
    if (!requestEmail) {
      return res.status(400).json({ error: "Client email is missing on this booking request." });
    }
    let photographer = null;
    if (assignedPhotographerId) {
      const staffDoc = await db$i().collection("staff").doc(assignedPhotographerId).get();
      photographer = staffDoc.exists ? staffDoc.data() : null;
    }
    let clientId;
    const existingClients = await db$i().collection("clients").where("email", "==", requestEmail).limit(1).get();
    if (!existingClients.empty) {
      clientId = existingClients.docs[0].id;
      await existingClients.docs[0].ref.update({
        totalOrders: admin.firestore.FieldValue.increment(1),
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const clientRef = await db$i().collection("clients").add({
        firstName: requestFirstName,
        lastName: requestLastName,
        email: requestEmail,
        phone: requestPhone,
        address: request.address,
        totalOrders: 1,
        totalSpend: 0,
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
        portalAccess: false,
        tags: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      clientId = clientRef.id;
    }
    const orderData = {
      orderRequestId: req.params.id,
      clientId,
      clientName: requestClientName,
      clientEmail: requestEmail,
      clientPhone: requestPhone,
      address: requestAddress,
      addressLabel: requestAddressLabel,
      services: requestLineItems,
      addOns: [],
      pricing: request.pricing || {},
      total: requestTotal,
      depositPaid: 0,
      balanceDue: requestTotal,
      status: "confirmed",
      assignedPhotographerId: assignedPhotographerId || null,
      assignedPhotographerName: assignedPhotographerName || null,
      scheduledDate: confirmDate ? admin.firestore.Timestamp.fromDate(confirmDate) : null,
      scheduledTime: confirmTime,
      squareFootage: request.squareFootage || null,
      accessMethod: request.accessMethod || null,
      propertyStatus: request.propertyStatus || null,
      furnishingStatus: request.furnishingStatus || null,
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      lifeOfTheListingCare: lifeOfTheListingCareSelected(request.lifeOfTheListingCare),
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const orderRef = await db$i().collection("orders").add(orderData);
    const appointmentRef = await db$i().collection("appointments").add({
      orderId: orderRef.id,
      clientId,
      clientName: requestClientName,
      address: requestAddress,
      addressLabel: requestAddressLabel,
      scheduledDate: confirmDate ? admin.firestore.Timestamp.fromDate(confirmDate) : null,
      scheduledTime: confirmTime,
      photographerId: assignedPhotographerId || null,
      photographerName: assignedPhotographerName || null,
      services: requestLineItems,
      status: "confirmed",
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const galleryRef = await db$i().collection("galleries").add({
      orderId: orderRef.id,
      clientId,
      clientName: requestClientName,
      address: requestAddress,
      addressLabel: requestAddressLabel,
      title: `${requestAddressLabel} — Gallery`,
      status: "pending_upload",
      mediaItems: [],
      downloadEnabled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const calendarResult = await createCalendarBookingEvent({
      orderId: orderRef.id,
      clientName: requestClientName,
      clientEmail: requestEmail,
      clientPhone: requestPhone,
      address: requestAddressLabel,
      services: requestLineItems.map((item) => item.name || String(item)).filter(Boolean),
      scheduledDate: confirmDate,
      scheduledTime: confirmTime,
      photographerEmail: photographer?.email || null,
      photographerCalendarId: photographer?.googleCalendarId || photographer?.calendarId || null,
      photographerName: assignedPhotographerName || photographer?.name || null,
      notes: internalNotes || request.vibeNote || ""
    }).catch(async (err) => {
      console.error("[Bookings] Calendar event creation failed:", err);
      await db$i().collection("agentLogs").add({
        agent: "nora",
        action: "Calendar event failed",
        summary: `Google Calendar event was not created for order ${orderRef.id}`,
        status: "flagged",
        relatedId: orderRef.id,
        relatedType: "order",
        priority: "high",
        requiresHumanReview: true,
        details: err instanceof Error ? err.message : String(err),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return null;
    });
    if (calendarResult?.eventId) {
      await Promise.all([
        orderRef.update({
          googleCalendarEventId: calendarResult.eventId,
          googleCalendarId: calendarResult.calendarId,
          googleCalendarUrl: calendarResult.htmlLink,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }),
        appointmentRef.update({
          googleCalendarEventId: calendarResult.eventId,
          googleCalendarId: calendarResult.calendarId,
          googleCalendarUrl: calendarResult.htmlLink,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
      ]);
    }
    const linkedInvoiceId = existingInvoiceId(request.invoiceId);
    const listingId = existingInvoiceId(request.listingId);
    let invoiceId = linkedInvoiceId;
    if (linkedInvoiceId) {
      const existingInvoice = await db$i().collection("invoices").doc(linkedInvoiceId).get();
      if (existingInvoice.exists) {
        await existingInvoice.ref.update({
          orderId: orderRef.id,
          clientId,
          galleryId: galleryRef.id,
          clientName: requestClientName,
          clientEmail: requestEmail,
          ...listingId ? { listingId } : {},
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        console.error(`[Bookings] Confirm kept invoiceId ${linkedInvoiceId} but the invoice doc is missing. Not creating a second invoice.`);
      }
    } else {
      const invoiceRef = db$i().collection("invoices").doc();
      const draft = buildBookingInvoiceDraft({
        lineItems: requestLineItems,
        total: requestTotal,
        pricing: request.pricing,
        clientEmail: requestEmail,
        clientId,
        clientName: requestClientName,
        orderRequestId: req.params.id,
        promoCode: request.promoCode,
        promoDiscount: request.promoDiscount
      });
      await invoiceRef.set({
        ...draft,
        orderId: orderRef.id,
        galleryId: galleryRef.id,
        ...listingId ? { listingId } : {},
        invoiceNumber: await generateInvoiceNumber(),
        paymentUrl: `${appUrl$2()}/invoice/${invoiceRef.id}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      invoiceId = invoiceRef.id;
    }
    await galleryRef.update({
      invoiceId,
      deliveryUrl: `${appUrl$2()}/gallery/${galleryRef.id}`
    });
    await requestDoc.ref.update({
      status: "confirmed",
      convertedToOrderId: orderRef.id,
      clientId,
      galleryId: galleryRef.id,
      invoiceId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    try {
      await stampDurableLinks({
        invoiceId,
        orderRequestId: req.params.id,
        orderId: orderRef.id,
        listingId
      });
    } catch (err) {
      console.error("[Bookings] Order/project/invoice link failed:", err);
    }
    await sendEmail({
      to: requestEmail,
      template: "order_confirmed",
      variables: {
        clientName: requestClientName,
        address: requestAddressLabel,
        scheduledDate: confirmDate ? confirmDate.toLocaleDateString("en-US") : "To be confirmed",
        scheduledTime: confirmTime || "To be confirmed",
        photographerName: assignedPhotographerName || "Our team",
        orderId: orderRef.id,
        portalUrl: `${appUrl$2()}/portal`
      }
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));
    if (invoiceId) {
      try {
        await attachSquareInvoiceAfterBooking(invoiceId);
      } catch (err) {
        console.error("[Bookings] Square invoice sync failed:", err);
      }
    }
    return res.json({
      success: true,
      orderId: orderRef.id,
      clientId,
      invoiceId,
      message: "Booking confirmed and order created."
    });
  } catch (err) {
    console.error("[Bookings] Confirm error:", err);
    return res.status(500).json({ error: "Failed to confirm booking." });
  }
});
router$h.patch("/:id/decline", requireCoordinator, async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await db$i().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found." });
    await doc.ref.update({
      status: "declined",
      declineReason: reason || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to decline booking." });
  }
});
async function stampDurableLinks(input) {
  if (!input.invoiceId || !input.orderId) return;
  const plan = planInvoiceLink({
    orderRequestId: input.orderRequestId,
    orderId: input.orderId,
    listingId: input.listingId,
    orderInvoiceId: input.invoiceId
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  const invoiceRef = db$i().collection("invoices").doc(plan.createId);
  const invoiceSnap = await invoiceRef.get();
  if (invoiceSnap.exists && Object.keys(plan.invoiceFields).length > 0) {
    await invoiceRef.update({ ...plan.invoiceFields, updatedAt: now });
  }
  if (plan.orderFields) {
    await db$i().collection("orders").doc(input.orderId).update({ ...plan.orderFields, updatedAt: now });
  }
  if (input.listingId && plan.listingFields) {
    await db$i().collection("listings").doc(input.listingId).update({ ...plan.listingFields, updatedAt: now });
  }
}
async function linkClientIdByEmail(email) {
  try {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const snap = await db$i().collection("clients").where("email", "==", normalized).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
  } catch (err) {
    console.error("[Bookings] Client lookup for invoice failed:", err);
    return null;
  }
}
async function createBookingInvoiceDraft(input) {
  const clientId = await linkClientIdByEmail(input.email);
  const draft = buildBookingInvoiceDraft({
    lineItems: input.lineItems,
    total: input.total,
    pricing: input.pricing,
    clientEmail: input.email,
    clientId,
    clientName: input.clientName,
    orderRequestId: input.orderRequestId,
    promoCode: input.promoCode,
    promoDiscount: input.promoDiscount
  });
  const invoiceRef = db$i().collection("invoices").doc();
  await invoiceRef.set({
    ...draft,
    invoiceNumber: await generateInvoiceNumber(),
    paymentUrl: `${appUrl$2()}/invoice/${invoiceRef.id}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { invoiceId: invoiceRef.id, clientId };
}
async function generateInvoiceNumber() {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const snapshot = await db$i().collection("invoices").where("invoiceNumber", ">=", `INV-${year}-`).orderBy("invoiceNumber", "desc").limit(1).get().catch((err) => {
    console.error("[Bookings] Invoice number lookup failed:", err);
    return null;
  });
  if (!snapshot || snapshot.empty) {
    return `INV-${year}-0001`;
  }
  const last = snapshot.docs[0].data().invoiceNumber;
  const num = parseInt(last.split("-")[2] || "0") + 1;
  return `INV-${year}-${String(num).padStart(4, "0")}`;
}
const router$g = Router();
const db$h = () => admin.firestore();
router$g.get("/", requireStaff, async (req, res) => {
  try {
    const { status, photographerId, limit = "50", startAfter } = req.query;
    let query = db$h().collection("orders").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (photographerId) {
      query = query.where("assignedPhotographerId", "==", photographerId);
    }
    const limitNum = Math.min(Number(limit), 200);
    query = query.limit(limitNum);
    if (startAfter) {
      const cursorDoc = await db$h().collection("orders").doc(startAfter).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    const snapshot = await query.get();
    const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({
      orders,
      hasMore: orders.length === limitNum,
      lastId: orders[orders.length - 1]?.id || null
    });
  } catch (err) {
    console.error("[Orders] List error:", err);
    return res.status(500).json({ error: "Failed to fetch orders." });
  }
});
router$g.get("/dashboard", requireStaff, async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [allOrders, todayOrders, monthTransactions, pendingRequests] = await Promise.all([
      db$h().collection("orders").get(),
      db$h().collection("orders").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(todayStart)).get(),
      db$h().collection("transactions").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(monthStart)).where("status", "==", "completed").get(),
      db$h().collection("orderRequests").where("status", "==", "new").get()
    ]);
    const statusCounts = {};
    allOrders.docs.forEach((d) => {
      const s = d.data().status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const monthRevenue = monthTransactions.docs.reduce(
      (sum, d) => sum + (d.data().amount || 0),
      0
    );
    return res.json({
      totalOrders: allOrders.size,
      todayOrders: todayOrders.size,
      pendingRequests: pendingRequests.size,
      monthRevenue,
      statusBreakdown: statusCounts,
      activeOrders: (statusCounts["confirmed"] || 0) + (statusCounts["scheduled"] || 0) + (statusCounts["in_progress"] || 0)
    });
  } catch (err) {
    console.error("[Orders] Dashboard error:", err);
    return res.status(500).json({ error: "Failed to fetch dashboard stats." });
  }
});
router$g.get("/:id", requireStaff, async (req, res) => {
  try {
    const orderDoc = await db$h().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = { id: orderDoc.id, ...orderDoc.data() };
    const [gallery, invoice, appointment, messages] = await Promise.all([
      db$h().collection("galleries").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Gallery lookup failed:", err);
        return null;
      }),
      db$h().collection("invoices").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Invoice lookup failed:", err);
        return null;
      }),
      db$h().collection("appointments").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Appointment lookup failed:", err);
        return null;
      }),
      db$h().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "desc").limit(20).get().catch((err) => {
        console.error("[Orders] Messages lookup failed:", err);
        return null;
      })
    ]);
    return res.json({
      order,
      gallery: !gallery || gallery.empty ? null : { id: gallery.docs[0].id, ...gallery.docs[0].data() },
      invoice: !invoice || invoice.empty ? null : { id: invoice.docs[0].id, ...invoice.docs[0].data() },
      appointment: !appointment || appointment.empty ? null : { id: appointment.docs[0].id, ...appointment.docs[0].data() },
      messages: messages ? messages.docs.map((d) => ({ id: d.id, ...d.data() })) : []
    });
  } catch (err) {
    console.error("[Orders] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch order." });
  }
});
router$g.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = [
      "status",
      "assignedPhotographerId",
      "assignedPhotographerName",
      "scheduledDate",
      "scheduledTime",
      "internalNotes",
      "notes",
      "accessMethod",
      "squareFootage"
    ];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((key) => {
      if (key in req.body) updates[key] = req.body[key];
    });
    if (updates.scheduledDate && typeof updates.scheduledDate === "string") {
      updates.scheduledDate = admin.firestore.Timestamp.fromDate(
        new Date(updates.scheduledDate)
      );
    }
    await db$h().collection("orders").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    console.error("[Orders] Update error:", err);
    return res.status(500).json({ error: "Failed to update order." });
  }
});
const VALID_TRANSITIONS = {
  confirmed: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["shot_complete", "cancelled"],
  shot_complete: ["editing"],
  editing: ["ready_for_delivery"],
  ready_for_delivery: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: []
};
router$g.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, note } = req.body;
    const orderDoc = await db$h().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const currentStatus = orderDoc.data().status;
    const validNext = VALID_TRANSITIONS[currentStatus] || [];
    if (!validNext.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${currentStatus}' to '${status}'.`,
        validTransitions: validNext
      });
    }
    const updates = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (status === "completed") {
      updates.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await orderDoc.ref.update(updates);
    const apptSnapshot = await db$h().collection("appointments").where("orderId", "==", req.params.id).limit(1).get();
    if (!apptSnapshot.empty) {
      const apptStatus = status === "in_progress" ? "in_progress" : status === "shot_complete" || status === "editing" ? "completed" : status === "cancelled" ? "cancelled" : void 0;
      if (apptStatus) {
        await apptSnapshot.docs[0].ref.update({ status: apptStatus });
      }
    }
    await db$h().collection("agentLogs").add({
      agent: "nora",
      action: `Order status changed: ${currentStatus} → ${status}`,
      summary: `Order ${req.params.id} transitioned to ${status}`,
      status: "completed",
      relatedId: req.params.id,
      relatedType: "order",
      priority: "low",
      requiresHumanReview: false,
      details: note || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, status });
  } catch (err) {
    console.error("[Orders] Status update error:", err);
    return res.status(500).json({ error: "Failed to update order status." });
  }
});
router$g.get("/:id/timeline", requireStaff, async (req, res) => {
  try {
    const [messages, editRequests, agentLogs] = await Promise.all([
      db$h().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$h().collection("editRequests").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$h().collection("agentLogs").where("relatedId", "==", req.params.id).orderBy("createdAt", "asc").get()
    ]);
    const timeline = [
      ...messages.docs.map((d) => ({ type: "message", ...d.data(), id: d.id })),
      ...editRequests.docs.map((d) => ({ type: "editRequest", ...d.data(), id: d.id })),
      ...agentLogs.docs.map((d) => ({ type: "agentLog", ...d.data(), id: d.id }))
    ].sort((a, b) => {
      const aTime = a.createdAt?.toMillis() || 0;
      const bTime = b.createdAt?.toMillis() || 0;
      return aTime - bTime;
    });
    return res.json(timeline);
  } catch (err) {
    console.error("[Orders] Timeline error:", err);
    return res.status(500).json({ error: "Failed to fetch timeline." });
  }
});
const AI_EDIT_PRESETS = [
  {
    id: "virtual_stage",
    label: "Virtual stage",
    prompt: "Virtually stage this room with photoreal furniture, a rug, and simple decor scaled to the space. Leave the walls, windows, floors, ceiling, and camera angle unchanged."
  },
  {
    id: "remove_clutter",
    label: "Remove clutter",
    prompt: "Remove clutter, personal items, cords, and small mess. Rebuild only the cleared floor and surfaces so they look clean. Keep the furniture that belongs, plus the architecture and lighting."
  },
  {
    id: "remove_cars",
    label: "Remove cars",
    prompt: "Remove vehicles from the driveway, garage apron, and street. Rebuild the pavement, curb, and landscaping so the empty space looks natural."
  },
  {
    id: "add_fire",
    label: "Add fire",
    prompt: "Add a realistic burning fire inside the existing fireplace only. Do not move the fireplace or change the rest of the room."
  },
  {
    id: "add_tv",
    label: "Add TV",
    prompt: "Add one realistic flat-screen television on the main wall, sized to the room, with a dark screen. Do not change the wall, furniture, or camera."
  },
  {
    id: "add_people",
    label: "Add people",
    prompt: "Add two or three casually dressed adults, small in the frame, who look natural in a listing photo and do not block the room. Keep faces generic and the architecture unchanged."
  },
  {
    id: "twilight",
    label: "Twilight",
    prompt: "Convert this exterior listing photo into a photoreal twilight. Turn on warm interior and landscape lights. Keep the architecture and camera angle. Use a natural evening sky."
  },
  {
    id: "free_text",
    label: "AI edit",
    prompt: ""
  }
];
const AI_EDIT_MISSING_KEY_NOTE = "OPENAI_API_KEY is not configured on the server, so this photo was not edited.";
const AI_EDIT_TIMEOUT_NOTE = "OpenAI took too long to edit this photo. The job was marked failed. Queue it again.";
const AI_EDIT_READY_NOTE = "OpenAI edit is ready for review.";
const RAW_EXT$1 = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq)$/i;
const PREVIEW_EXT = /\.(jpe?g|png|webp|gif)$/i;
function ingestJobId(listingId) {
  return `ingest_${listingId}`;
}
function shouldBumpStudioQueue(storagePath) {
  return storagePath.includes("/raw/");
}
function isRawStudioFile(name, contentType) {
  if (RAW_EXT$1.test(name)) return true;
  const type = String(contentType || "").toLowerCase();
  return type.includes("raw") || type.includes("dng") || type.includes("canon-cr") || type.includes("nikon");
}
function isStudioPreviewable(name, contentType) {
  if (isRawStudioFile(name, contentType)) return false;
  const type = String(contentType || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif") return true;
  return PREVIEW_EXT.test(name);
}
function finalsObjectPath(listingId, fileName, now = Date.now()) {
  return `listings/${listingId}/finals/${now}_${safeStorageFileName(fileName)}`;
}
function listingAddressLabel(listing) {
  const source = listing?.address ?? listing?.shootLocation;
  if (!source) return "Untitled listing";
  if (typeof source === "string" && source.trim()) return source.trim();
  if (typeof source === "object") {
    const row = source;
    const parts = [row.street, row.city, row.state, row.zip].map((part) => String(part || "").trim()).filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return "Untitled listing";
}
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}
function clampAdjustments(input) {
  const source = input || {};
  const rotate = source.rotate === 90 || source.rotate === 180 || source.rotate === 270 ? source.rotate : 0;
  const crop = source.crop === "1:1" || source.crop === "4:5" || source.crop === "16:9" ? source.crop : "original";
  return {
    exposure: clamp(Number(source.exposure), -100, 100),
    shadows: clamp(Number(source.shadows), -100, 100),
    saturation: clamp(Number(source.saturation), -100, 100),
    sharpness: clamp(Number(source.sharpness), 0, 100),
    tint: clamp(Number(source.tint), -100, 100),
    rotate,
    crop
  };
}
function presetPrompt(type) {
  return AI_EDIT_PRESETS.find((preset) => preset.id === type)?.prompt || "";
}
function realEstateEditPrompt(userPrompt) {
  const request = userPrompt.trim().replace(/\s+/g, " ");
  return [
    "Photoreal real-estate listing photo.",
    "Edit only the supplied photograph.",
    "Keep the same camera angle, architecture, windows, doors, flooring, and lighting.",
    "Do not add text, logos, watermarks, borders, or an illustrated style.",
    `Requested change: ${request}`
  ].join(" ");
}
function listingPhotoEditSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1536x1024";
  }
  const ratio = width / height;
  if (ratio >= 1.15) return "1536x1024";
  if (ratio <= 0.87) return "1024x1536";
  return "1024x1024";
}
function resolveStudioApprovePath(job, fallbackPath = "") {
  const fallback = String(fallbackPath || "").trim();
  if (job.kind === "ai_edit") {
    if (job.status === "failed") {
      return { ok: false, error: "This AI edit failed. Queue it again before approving." };
    }
    if (job.status === "rejected") {
      return { ok: false, error: "This AI edit was rejected." };
    }
    const resultPath2 = typeof job.resultPath === "string" ? job.resultPath.trim() : "";
    if (job.placeholder === true || !resultPath2) {
      return { ok: false, error: "This AI edit has no finished image to approve." };
    }
    return { ok: true, sourcePath: resultPath2 };
  }
  const resultPath = typeof job.resultPath === "string" ? job.resultPath.trim() : "";
  const sourcePath = typeof job.sourcePath === "string" ? job.sourcePath.trim() : "";
  const path2 = resultPath || sourcePath || fallback;
  if (!path2) return { ok: false, error: "sourcePath is required." };
  return { ok: true, sourcePath: path2 };
}
function parseAiEditRequest(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body is required." };
  const row = body;
  const listingId = String(row.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return { ok: false, error: "A valid listing id is required." };
  }
  const type = String(row.type || "");
  if (!AI_EDIT_PRESETS.some((preset) => preset.id === type)) {
    return { ok: false, error: "Unknown AI edit type." };
  }
  const fallback = presetPrompt(type);
  const prompt = String(row.prompt ?? fallback).trim().slice(0, 2e3);
  if (type === "free_text" && prompt.length < 3) {
    return { ok: false, error: "Describe the AI edit." };
  }
  const imageUrl = String(row.imageUrl || "").trim();
  if (!/^https:\/\/.+/i.test(imageUrl)) {
    return { ok: false, error: "imageUrl must be an https URL." };
  }
  const sourcePath = String(row.sourcePath || "").trim();
  if (!isListingStoragePath(listingId, sourcePath)) {
    return { ok: false, error: "sourcePath must be a photo, raw, or finals file on this listing." };
  }
  return {
    ok: true,
    value: {
      listingId,
      type,
      prompt: prompt || fallback,
      imageUrl,
      sourcePath
    }
  };
}
function galleryStatusAfterStudioAdd(current) {
  if (!current || current === "pending_upload" || current === "raw_uploaded" || current === "editing") {
    return "ready_for_review";
  }
  return current;
}
function frameFromListingImage(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw;
  const path2 = typeof item.path === "string" ? item.path : "";
  const url = typeof item.url === "string" ? item.url : "";
  if (!path2 && !url) return null;
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : path2.split("/").pop() || `photo-${index + 1}`;
  const contentType = typeof item.contentType === "string" ? item.contentType : "";
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : path2 || `idx-${index}`,
    name,
    path: path2,
    url,
    contentType,
    raw: isRawStudioFile(name, contentType),
    previewable: isStudioPreviewable(name, contentType),
    studioApproved: item.studioApproved === true || path2.includes("/finals/"),
    studioRole: typeof item.studioRole === "string" ? item.studioRole : void 0
  };
}
const RELEASED_GALLERY_STATUSES = ["delivered", "approved"];
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
function invalidGalleryLinkMessage(id) {
  if (ID_PATTERN.test(id)) return null;
  return `“${id}” is not a gallery or project id. Shared links use the id from Copy Studio Link (/studio/{project id}) or the delivery URL (/gallery/{gallery id}).`;
}
function statusOf(doc) {
  return typeof doc?.status === "string" ? doc.status : "";
}
function isReleased(doc) {
  return RELEASED_GALLERY_STATUSES.includes(statusOf(doc));
}
function text$2(value) {
  return typeof value === "string" ? value.trim() : "";
}
function httpUrl(value) {
  const url = text$2(value);
  return url.startsWith("https://") || url.startsWith("http://") ? url : "";
}
function galleryResult(doc, via) {
  const status = statusOf(doc) || "unknown";
  const released = isReleased(doc);
  const prefix = via ? `${via} ` : "";
  const staffNote = released ? `${prefix}Gallery ${doc.id} is ${status}. Open /gallery/${doc.id}.` : `${prefix}Gallery ${doc.id} exists, but its status is “${status}”. Photos stay hidden until a coordinator sets it to delivered or approved. This is not a missing link. The delivery URL is /gallery/${doc.id}.`;
  return {
    ok: true,
    kind: "gallery",
    galleryId: doc.id,
    released,
    status,
    staffNote
  };
}
function addressOf(listing) {
  const property = text$2(listing.propertyAddress);
  if (property) return property;
  const labeled = listingAddressLabel({
    address: listing.address,
    shootLocation: listing.shootLocation
  });
  return labeled === "Untitled listing" ? "" : labeled;
}
function servicesOf(listing) {
  if (!Array.isArray(listing.services)) return [];
  return listing.services.map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object" && typeof item.name === "string") {
      return item.name.trim();
    }
    return "";
  }).filter(Boolean).slice(0, 24);
}
function publicImages(listing) {
  if (!Array.isArray(listing.images)) return [];
  const images = [];
  listing.images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    const url = httpUrl(frame?.url);
    if (!frame || frame.raw || !url) return;
    if (frame.path.includes("/raw/")) return;
    images.push({ url, name: frame.name });
  });
  return images.slice(0, 200);
}
function publicVideos(listing) {
  if (!Array.isArray(listing.videos)) return [];
  const videos = [];
  for (const item of listing.videos) {
    if (!item || typeof item !== "object") continue;
    const row = item;
    const url = httpUrl(row.url);
    if (!url || url.includes("/raw/")) continue;
    videos.push({ url, name: text$2(row.name) || "Video" });
  }
  return videos.slice(0, 40);
}
function publicRevisions(listing) {
  if (!Array.isArray(listing.revisions)) return [];
  return listing.revisions.slice(0, 40).map((item, index) => {
    const row = item && typeof item === "object" ? item : {};
    const photoIndex = typeof row.photoIndex === "number" ? row.photoIndex : null;
    return {
      id: text$2(row.id) || `revision-${index + 1}`,
      type: text$2(row.type) || "gallery",
      photoIndex,
      description: text$2(row.description),
      status: text$2(row.status) || "pending",
      createdAt: text$2(row.createdAt)
    };
  });
}
function invoiceOf(listing) {
  const nested = listing.invoice;
  if (nested && typeof nested === "object" && typeof nested.status === "string") {
    return { status: nested.status };
  }
  const status = text$2(listing.invoiceStatus);
  return status ? { status } : null;
}
function pickReleasedGallery(listing, related) {
  const preferred = text$2(listing.galleryId) || text$2(listing.playtestGalleryId);
  const released = related.filter((doc) => isReleased(doc));
  if (preferred) {
    const match = released.find((doc) => doc.id === preferred);
    if (match) return match;
  }
  return released[0] || null;
}
function listingBlock(listing, related) {
  const linked = related.slice(0, 3).map((doc) => `${doc.id} (${statusOf(doc) || "unknown"})`).join(", ");
  const linkedSentence = linked ? ` Linked gallery: ${linked}.` : " No gallery document is linked to this project.";
  if (listing.lockStudio === true) {
    return {
      ok: false,
      httpStatus: 403,
      code: "studio_locked",
      message: `Project ${listing.id} exists in listings, but Lock Studio is on. Turn Lock Studio off on the project file before /studio/${listing.id} will open. This id is not missing.${linkedSentence}`
    };
  }
  if (listing.studioEnabled === false) {
    return {
      ok: false,
      httpStatus: 403,
      code: "studio_disabled",
      message: `Project ${listing.id} exists in listings, but Client Studio is turned off, so /studio/${listing.id} stays closed. Turn Client Studio on from the project file.${linkedSentence}`
    };
  }
  return null;
}
function listingResult(listing, related) {
  const blocked = listingBlock(listing, related);
  if (blocked) return blocked;
  const released = pickReleasedGallery(listing, related);
  if (released) {
    return {
      ok: true,
      kind: "listing",
      openGalleryId: released.id,
      project: publicProject(listing, related, null)
    };
  }
  const pending = related.find((doc) => !isReleased(doc));
  const notice = pending ? "Photos on the delivery gallery are not public yet. This page is the project studio." : null;
  return {
    ok: true,
    kind: "listing",
    openGalleryId: null,
    project: publicProject(listing, related, notice)
  };
}
function publicProject(listing, _related, notice) {
  return {
    id: listing.id,
    address: addressOf(listing),
    clientName: text$2(listing.clientName),
    services: servicesOf(listing),
    images: publicImages(listing),
    videos: publicVideos(listing),
    tourUrl: httpUrl(listing.tourUrl),
    revisions: publicRevisions(listing),
    lockDownloads: listing.lockDownloads === true,
    requirePayment: listing.requirePayment === true,
    invoice: invoiceOf(listing),
    notice,
    view: "public"
  };
}
function pointerMessage(id, via, galleryId, listingId) {
  const target = galleryId ? `gallery ${galleryId}` : listingId ? `project ${listingId}` : "a linked record";
  return `${id} is ${via}, not a gallery link. It points at ${target}, and that document does not exist. Copy Studio Link from the project file, or use the delivery URL /gallery/{gallery id}.`;
}
function decideClientGalleryLink(input) {
  const invalid = invalidGalleryLinkMessage(input.id);
  if (invalid) {
    return { ok: false, httpStatus: 400, code: "invalid_id", message: invalid };
  }
  if (input.gallery) return galleryResult(input.gallery);
  if (input.listing) return listingResult(input.listing, input.relatedGalleries);
  const releasedRelated = input.relatedGalleries.find((doc) => isReleased(doc));
  if (releasedRelated) {
    return galleryResult(releasedRelated, `No listings/${input.id} document. `);
  }
  if (input.relatedGalleries[0]) {
    return galleryResult(
      input.relatedGalleries[0],
      `No listings/${input.id} document. A gallery is linked to that project id. `
    );
  }
  const orderGallery = input.galleriesByOrderId.find((doc) => isReleased(doc)) || input.galleriesByOrderId[0] || null;
  if (orderGallery) {
    return galleryResult(orderGallery, `${input.id} is an order id. `);
  }
  if (input.pointedGallery) {
    return galleryResult(input.pointedGallery, `${input.id} points at this gallery. `);
  }
  if (input.pointedListing) return listingResult(input.pointedListing, input.relatedGalleries);
  if (input.order) {
    const galleryId = text$2(input.order.galleryId);
    const listingId = text$2(input.order.listingId);
    if (galleryId || listingId) {
      return {
        ok: false,
        httpStatus: 404,
        code: "dangling_pointer",
        message: pointerMessage(input.id, "an order", galleryId, listingId)
      };
    }
    return {
      ok: false,
      httpStatus: 404,
      code: "dangling_pointer",
      message: `${input.id} is an order, not a client gallery link. It has no gallery id and no project id. Open the order in admin and copy the project studio link (/studio/{project id}) or the delivery link (/gallery/{gallery id}).`
    };
  }
  if (input.orderRequest) {
    const galleryId = text$2(input.orderRequest.galleryId);
    const listingId = text$2(input.orderRequest.listingId);
    if (galleryId || listingId) {
      return {
        ok: false,
        httpStatus: 404,
        code: "dangling_pointer",
        message: pointerMessage(input.id, "an order request", galleryId, listingId)
      };
    }
    return {
      ok: false,
      httpStatus: 404,
      code: "dangling_pointer",
      message: `${input.id} is an order request, not a client gallery link. It has no gallery id and no project id yet. Confirm the request or open the project, then share /studio/{project id} or /gallery/{gallery id}.`
    };
  }
  return {
    ok: false,
    httpStatus: 404,
    code: "unknown",
    message: `No gallery and no project uses ${input.id}. Checked galleries/${input.id}, listings/${input.id}, galleries with listingId ${input.id}, orders/${input.id}, and orderRequests/${input.id}. /studio/${input.id} opens a project whose Client Studio link is on. /gallery/${input.id} opens a delivery gallery. This app does not resolve Fotello ids. Copy the link from the project file or the gallery delivery URL.`
  };
}
const db$g = () => admin.firestore();
function text$1(value) {
  return typeof value === "string" ? value.trim() : "";
}
function docRecord(snap) {
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() || {} };
}
async function galleriesWhere(field, id) {
  try {
    const snap = await db$g().collection("galleries").where(field, "==", id).limit(8).get();
    return snap.docs.map((doc) => docRecord(doc)).filter((doc) => Boolean(doc));
  } catch (err) {
    console.error(`[Galleries] ${field} lookup failed:`, err);
    return [];
  }
}
async function galleryById(id) {
  if (!id) return null;
  return docRecord(await db$g().collection("galleries").doc(id).get());
}
async function relatedForListing(listing) {
  const related = await galleriesWhere("listingId", listing.id);
  const extras = [text$1(listing.galleryId), text$1(listing.playtestGalleryId)];
  for (const galleryId of extras) {
    if (!galleryId || related.some((doc) => doc.id === galleryId)) continue;
    const extra = await galleryById(galleryId);
    if (extra) related.push(extra);
  }
  return related;
}
async function resolveClientGalleryLink(id) {
  const [gallerySnap, listingSnap] = await Promise.all([
    db$g().collection("galleries").doc(id).get(),
    db$g().collection("listings").doc(id).get()
  ]);
  const gallery = docRecord(gallerySnap);
  const listing = docRecord(listingSnap);
  if (gallery) {
    return decideClientGalleryLink({
      id,
      gallery,
      listing: null,
      relatedGalleries: [],
      order: null,
      orderRequest: null,
      pointedGallery: null,
      pointedListing: null,
      galleriesByOrderId: []
    });
  }
  if (listing) {
    return decideClientGalleryLink({
      id,
      gallery: null,
      listing,
      relatedGalleries: await relatedForListing(listing),
      order: null,
      orderRequest: null,
      pointedGallery: null,
      pointedListing: null,
      galleriesByOrderId: []
    });
  }
  const relatedGalleries = await galleriesWhere("listingId", id);
  const [orderSnap, requestSnap] = await Promise.all([
    db$g().collection("orders").doc(id).get(),
    db$g().collection("orderRequests").doc(id).get()
  ]);
  const order = docRecord(orderSnap);
  const orderRequest = docRecord(requestSnap);
  const galleriesByOrderId = order ? await galleriesWhere("orderId", id) : [];
  const pointedGalleryId = text$1(orderRequest?.galleryId) || text$1(order?.galleryId);
  const pointedListingId = text$1(orderRequest?.listingId) || text$1(order?.listingId);
  const pointedGallery = pointedGalleryId ? await galleryById(pointedGalleryId) : null;
  let pointedListing = null;
  let pointedRelated = relatedGalleries;
  if (!pointedGallery && pointedListingId) {
    pointedListing = docRecord(await db$g().collection("listings").doc(pointedListingId).get());
    if (pointedListing) pointedRelated = await relatedForListing(pointedListing);
  }
  return decideClientGalleryLink({
    id,
    gallery: null,
    listing: null,
    relatedGalleries: pointedRelated,
    order,
    orderRequest,
    pointedGallery,
    pointedListing,
    galleriesByOrderId
  });
}
const handlePublicGalleryLink = async (req, res) => {
  const id = String(req.params.id || "");
  const invalid = invalidGalleryLinkMessage(id);
  if (invalid) {
    return res.status(400).json({ code: "invalid_id", error: invalid, message: invalid });
  }
  if (!admin.apps.length) {
    const message = "Gallery lookup is not configured on this server (Firebase Admin). This is not a missing gallery id.";
    return res.status(503).json({ code: "lookup_unavailable", error: message, message });
  }
  try {
    const result = await resolveClientGalleryLink(id);
    if (result.ok === false) {
      return res.status(result.httpStatus).json({
        code: result.code,
        error: result.message,
        message: result.message
      });
    }
    return res.json(result);
  } catch (err) {
    console.error("[Galleries] Link resolve error:", err);
    const message = "Could not resolve this gallery link.";
    return res.status(500).json({ code: "lookup_failed", error: message, message });
  }
};
const router$f = Router();
const db$f = () => admin.firestore();
const storage = () => admin.storage().bucket();
function appUrl$1() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}
function addressLabel$2(address) {
  if (!address) return "the property";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address;
    if (typeof a.formatted === "string" && a.formatted) return a.formatted;
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "the property";
  }
  return String(address);
}
async function invoiceForGallery(gallery) {
  if (typeof gallery.invoiceId === "string" && gallery.invoiceId) {
    const doc = await db$f().collection("invoices").doc(gallery.invoiceId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
  }
  if (typeof gallery.orderId === "string" && gallery.orderId) {
    const snap = await db$f().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}
router$f.get("/", requireStaff, async (req, res) => {
  try {
    const { status, orderId } = req.query;
    let query = db$f().collection("galleries").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (orderId) query = query.where("orderId", "==", orderId);
    const snapshot = await query.limit(100).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch galleries." });
  }
});
router$f.get("/public/:id", async (req, res) => {
  try {
    const doc = await db$f().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = doc.data();
    const invoice = await invoiceForGallery(gallery);
    const invoiceStatus = invoice?.status || null;
    const paid = invoiceAllowsDownload(invoice);
    const canDownload = paid;
    return res.json({
      id: doc.id,
      title: gallery.title,
      address: gallery.address,
      clientName: gallery.clientName,
      status: gallery.status,
      deliveredAt: gallery.deliveredAt || null,
      expiresAt: gallery.expiresAt || null,
      downloadEnabled: canDownload,
      paymentRequired: !paid,
      invoiceId: invoice?.id || null,
      invoiceStatus,
      mediaItems: ["delivered", "approved"].includes(gallery.status) ? [
        ...gallery.mediaItems || [],
        ...gallery.videoLinks || [],
        ...gallery.tourLinks || []
      ].map((item) => publicMediaItem(item, canDownload)) : []
    });
  } catch (err) {
    console.error("[Galleries] Public fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch gallery." });
  }
});
router$f.get("/link/:id", handlePublicGalleryLink);
router$f.get("/:id", requireAuth, async (req, res) => {
  try {
    const doc = await db$f().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = doc.data();
    const staffDoc = await db$f().collection("staff").doc(req.user.uid).get();
    if (!staffDoc.exists) {
      if (gallery.clientId !== req.user.uid) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (!["delivered", "approved"].includes(gallery.status)) {
        return res.status(403).json({ error: "Gallery not yet available." });
      }
    }
    return res.json({ id: doc.id, ...gallery });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch gallery." });
  }
});
router$f.post("/:id/upload-url", requirePhotographer, async (req, res) => {
  try {
    const { fileName, fileType, isRaw = false } = req.body;
    if (!fileName || !fileType) {
      return res.status(400).json({ error: "fileName and fileType required." });
    }
    const galleryDoc = await db$f().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const folder = isRaw ? "raw" : "edited";
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path2 = `galleries/${req.params.id}/${folder}/${Date.now()}_${safeName}`;
    const file = storage().file(path2);
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1e3,
      // 15 minutes
      contentType: fileType
    });
    return res.json({ uploadUrl, path: path2, fileName: safeName });
  } catch (err) {
    console.error("[Galleries] Upload URL error:", err);
    return res.status(500).json({ error: "Failed to generate upload URL." });
  }
});
router$f.post("/:id/media", requirePhotographer, async (req, res) => {
  try {
    const {
      storagePath,
      fileName,
      type = "photo",
      width,
      height,
      fileSize,
      isRaw = false
    } = req.body;
    if (!storagePath || !fileName) {
      return res.status(400).json({ error: "storagePath and fileName required." });
    }
    const galleryDoc = await db$f().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const file = storage().file(storagePath);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1e3
    });
    const mediaItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url,
      storagePath,
      fileName,
      type,
      width: width || null,
      height: height || null,
      fileSize: fileSize || null,
      isRaw,
      isEdited: !isRaw,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.Timestamp.now()
    };
    await galleryDoc.ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(mediaItem),
      status: isRaw ? "raw_uploaded" : "editing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, mediaItem });
  } catch (err) {
    console.error("[Galleries] Media register error:", err);
    return res.status(500).json({ error: "Failed to register media." });
  }
});
router$f.post("/:id/media-link", requireCoordinator, async (req, res) => {
  try {
    const { url, title, type = "video", embedUrl, thumbnailUrl, downloadable = false } = req.body;
    if (!url) return res.status(400).json({ error: "url required." });
    const galleryDoc = await db$f().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      url,
      shareUrl: url,
      embedUrl: embedUrl || url,
      thumbnailUrl: thumbnailUrl || null,
      title: title || (type === "tour" ? "3D Tour" : "Video"),
      fileName: title || url,
      type,
      downloadable,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.Timestamp.now()
    };
    await galleryDoc.ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(item),
      status: "ready_for_review",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ success: true, mediaItem: item });
  } catch (err) {
    console.error("[Galleries] Media link register error:", err);
    return res.status(500).json({ error: "Failed to register media link." });
  }
});
router$f.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending_upload", "raw_uploaded", "editing", "ready_for_review", "approved", "delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    await db$f().collection("galleries").doc(req.params.id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update gallery status." });
  }
});
router$f.post("/:id/deliver", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db$f().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = galleryDoc.data();
    const linkedInvoice = await invoiceForGallery(gallery);
    const paid = invoiceAllowsDownload(linkedInvoice);
    const downloadEnabled = paid;
    const expiresInDays = Number(req.body?.expiresInDays) > 0 ? Number(req.body.expiresInDays) : 30;
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1e3)
    );
    const deliveryUrl = `${appUrl$1()}/gallery/${req.params.id}`;
    await galleryDoc.ref.update({
      status: "delivered",
      deliveryUrl,
      downloadEnabled,
      expiresAt,
      deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    if (gallery.orderId) {
      await db$f().collection("orders").doc(gallery.orderId).update({
        status: "delivered",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    const clientDoc = await db$f().collection("clients").doc(gallery.clientId).get();
    const client = clientDoc.data();
    if (client?.email) {
      const invoiceSnap = await db$f().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
      const invoice = invoiceSnap.empty ? null : invoiceSnap.docs[0].data();
      await sendEmail({
        to: client.email,
        template: "gallery_delivery",
        variables: {
          clientName: gallery.clientName,
          address: gallery.addressLabel || addressLabel$2(gallery.address),
          galleryUrl: deliveryUrl,
          invoiceAmount: invoice ? `$${invoice.total.toFixed(2)}` : "",
          paymentUrl: invoice ? `${appUrl$1()}/invoice/${invoiceSnap.docs[0].id}` : "",
          expiresAt: `${expiresInDays} days`
        }
      });
    }
    if (client?.phone) {
      await sendSMS({
        to: client.phone,
        body: SMS_TEMPLATES.photosDelivered(gallery.clientName || client.name || "there", deliveryUrl)
      }).catch((err) => console.error("[Galleries] Delivery SMS failed:", err));
    }
    return res.json({ success: true, deliveryUrl });
  } catch (err) {
    console.error("[Galleries] Deliver error:", err);
    return res.status(500).json({ error: "Failed to deliver gallery." });
  }
});
router$f.delete("/:id/media/:mediaId", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db$f().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = galleryDoc.data();
    const mediaItems = (gallery.mediaItems || []).filter(
      (item) => item.id !== req.params.mediaId
    );
    await galleryDoc.ref.update({
      mediaItems,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to remove media item." });
  }
});
const router$e = Router();
const db$e = () => admin.firestore();
const stripe$1 = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});
function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}
function stripeReady() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
function squareReady() {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}
function squareBaseUrl() {
  return squareApiBaseUrl(process.env.SQUARE_ENVIRONMENT);
}
function invoiceProvider(invoice) {
  const explicit = String(invoice.paymentProvider || invoice.processor || "").toLowerCase();
  if (explicit === "stripe" || explicit === "square") return explicit;
  const channel = String(invoice.channel || invoice.brand || invoice.bookingType || "").toLowerCase();
  return channel.includes("studio noir") || channel.includes("studionoir") ? "stripe" : "square";
}
function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}
async function paymentAlreadyRecorded({
  squarePaymentId,
  stripePaymentIntentId
}) {
  if (squarePaymentId) {
    const existing = await db$e().collection("transactions").where("squarePaymentId", "==", squarePaymentId).limit(1).get();
    if (!existing.empty) return true;
  }
  if (stripePaymentIntentId) {
    const existing = await db$e().collection("transactions").where("stripePaymentIntentId", "==", stripePaymentIntentId).limit(1).get();
    if (!existing.empty) return true;
  }
  return false;
}
async function unlockGalleriesForInvoice({
  invoiceId,
  orderId,
  galleryId
}) {
  const refs = /* @__PURE__ */ new Map();
  if (galleryId) refs.set(galleryId, db$e().collection("galleries").doc(galleryId));
  const lookups = [
    db$e().collection("galleries").where("invoiceId", "==", invoiceId).get()
  ];
  if (orderId) lookups.push(db$e().collection("galleries").where("orderId", "==", orderId).get());
  const snaps = await Promise.all(lookups);
  snaps.forEach((snap) => snap.docs.forEach((doc) => refs.set(doc.id, doc.ref)));
  await Promise.all([...refs.values()].map((ref) => ref.update({
    downloadEnabled: true,
    paymentStatus: "paid",
    unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }).catch((err) => console.error("[Payments] Gallery unlock failed:", err))));
}
async function applySuccessfulPayment({
  invoiceId,
  orderId,
  clientId,
  clientName,
  amount,
  method,
  squarePaymentId,
  stripePaymentIntentId
}) {
  const invoiceRef = db$e().collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) return;
  const invoice = invoiceDoc.data();
  const resolvedOrderId = orderId || invoice.orderId || "";
  const resolvedClientId = clientId || invoice.clientId || "";
  const sameSquare = Boolean(squarePaymentId) && invoice.squarePaymentId === squarePaymentId;
  const sameStripe = Boolean(stripePaymentIntentId) && invoice.stripePaymentIntentId === stripePaymentIntentId;
  const duplicate = sameSquare || sameStripe || await paymentAlreadyRecorded({ squarePaymentId, stripePaymentIntentId });
  if (duplicate) {
    if (invoiceAllowsDownload(invoice)) {
      await unlockGalleriesForInvoice({
        invoiceId,
        orderId: resolvedOrderId,
        galleryId: typeof invoice.galleryId === "string" ? invoice.galleryId : void 0
      });
    }
    return;
  }
  const currentPaid = Number(invoice.amountPaid) || 0;
  const total = Number(invoice.total) || 0;
  const newAmountPaid = currentPaid + amount;
  const newAmountDue = Math.max(0, total - newAmountPaid);
  await invoiceRef.update({
    amountPaid: newAmountPaid,
    amountDue: newAmountDue,
    status: newAmountDue <= 0 ? "paid" : "partial",
    paidAt: newAmountDue <= 0 ? admin.firestore.FieldValue.serverTimestamp() : null,
    paymentMethod: method,
    ...squarePaymentId ? { squarePaymentId } : {},
    ...stripePaymentIntentId ? { stripePaymentIntentId } : {},
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  if (resolvedOrderId) {
    await db$e().collection("orders").doc(resolvedOrderId).update({
      depositPaid: admin.firestore.FieldValue.increment(amount),
      balanceDue: newAmountDue,
      paymentStatus: newAmountDue <= 0 ? "paid" : "partial",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch((err) => console.error("[Payments] Order balance update failed:", err));
  }
  if (resolvedClientId) {
    await db$e().collection("clients").doc(resolvedClientId).update({
      totalSpend: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch((err) => console.error("[Payments] Client spend update failed:", err));
  }
  if (newAmountDue <= 0) {
    await unlockGalleriesForInvoice({
      invoiceId,
      orderId: resolvedOrderId,
      galleryId: typeof invoice.galleryId === "string" ? invoice.galleryId : void 0
    });
  }
  await db$e().collection("transactions").add({
    type: "payment",
    orderId: resolvedOrderId,
    invoiceId,
    clientId: resolvedClientId,
    clientName: clientName || invoice.clientName,
    amount,
    paymentMethod: method,
    status: "completed",
    ...squarePaymentId ? { squarePaymentId } : {},
    ...stripePaymentIntentId ? { stripePaymentIntentId } : {},
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  if (invoice.clientEmail) {
    await sendEmail({
      to: invoice.clientEmail,
      template: "payment_receipt",
      variables: {
        clientName: invoice.clientName,
        amount: money(amount),
        invoiceNumber: invoice.invoiceNumber,
        balance: money(newAmountDue)
      }
    }).catch(console.error);
  }
}
router$e.post("/create-intent", requireAuth, async (req, res) => {
  try {
    if (!stripeReady()) {
      return res.status(503).json({ error: "Studio Noir Stripe payments are not configured yet." });
    }
    const { invoiceId, amount, currency = "usd" } = req.body;
    if (!invoiceId || !amount) return res.status(400).json({ error: "invoiceId and amount required." });
    const invoiceDoc = await db$e().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    if (invoiceProvider(invoice) !== "stripe") {
      return res.status(400).json({ error: "This invoice is configured for Square, not Stripe." });
    }
    const paymentIntent = await stripe$1.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      metadata: {
        invoiceId,
        orderId: invoice.orderId || "",
        clientId: invoice.clientId || "",
        clientName: invoice.clientName || ""
      },
      description: `Studio Noir - Invoice ${invoice.invoiceNumber}`,
      ...clientNotifyLive() && invoice.clientEmail ? { receipt_email: invoice.clientEmail } : {}
    });
    await invoiceDoc.ref.update({
      paymentProvider: "stripe",
      stripePaymentIntentId: paymentIntent.id,
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error("[Payments] Create intent error:", err);
    return res.status(500).json({ error: "Failed to create payment intent." });
  }
});
router$e.post("/send-invoice", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });
    const invoiceDoc = await db$e().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    const provider = invoiceProvider(invoice);
    const paymentUrl = `${appUrl()}/invoice/${invoiceId}`;
    await sendEmail({
      to: invoice.clientEmail,
      template: "invoice",
      variables: {
        clientName: invoice.clientName,
        invoiceNumber: invoice.invoiceNumber,
        amount: money(invoice.total),
        paymentUrl,
        dueDate: invoice.dueDate ? invoice.dueDate.toDate().toLocaleDateString() : "Upon receipt"
      }
    });
    await invoiceDoc.ref.update({
      status: "sent",
      paymentProvider: provider,
      paymentUrl,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, paymentUrl, provider });
  } catch (err) {
    console.error("[Payments] Send invoice error:", err);
    return res.status(500).json({ error: "Failed to send invoice." });
  }
});
router$e.post("/send-receipt", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });
    const invoiceDoc = await db$e().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    if (!invoiceAllowsDownload(invoice)) {
      return res.status(409).json({ error: "Invoice is not paid. Send the pay link instead." });
    }
    await sendEmail({
      to: invoice.clientEmail,
      template: "payment_receipt",
      variables: {
        clientName: invoice.clientName,
        amount: money(invoice.amountPaid || invoice.total),
        invoiceNumber: invoice.invoiceNumber,
        balance: money(amountStillDue(invoice))
      }
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("[Payments] Send receipt error:", err);
    return res.status(500).json({ error: "Failed to send receipt." });
  }
});
router$e.get("/invoice/:id", async (req, res) => {
  try {
    const invoiceDoc = await db$e().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    const provider = invoiceProvider(invoice);
    return res.json({
      id: invoiceDoc.id,
      paid: invoiceAllowsDownload(invoice),
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      status: invoice.status,
      paymentProvider: provider,
      stripePaymentIntentId: invoice.stripePaymentIntentId || null,
      squarePaymentId: invoice.squarePaymentId || null,
      squarePaymentLinkId: invoice.squarePaymentLinkId || null,
      galleryId: invoice.galleryId || null,
      paymentUrl: invoice.paymentUrl || `${appUrl()}/invoice/${invoiceDoc.id}`,
      canPayOnline: provider === "stripe" ? stripeReady() : squareReady()
    });
  } catch (err) {
    console.error("[Payments] Invoice fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch invoice." });
  }
});
router$e.post("/invoice/:id/checkout", async (req, res) => {
  try {
    const invoiceDoc = await db$e().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    const amountDue = amountStillDue(invoice);
    const provider = invoiceProvider(invoice);
    if (invoiceAllowsDownload(invoice)) {
      return res.json({
        paid: true,
        provider,
        redirectUrl: invoice.galleryId ? `${appUrl()}/gallery/${invoice.galleryId}` : `${appUrl()}/invoice/${invoiceDoc.id}`
      });
    }
    if (amountDue <= 0) {
      return res.status(400).json({ error: "This invoice cannot be paid online." });
    }
    if (provider === "square") {
      const freshUrl = squareReady() && invoice.squareInvoiceId ? await fetchPublishedSquareInvoiceUrl(String(invoice.squareInvoiceId), {
        fetchImpl: fetch,
        env: process.env,
        timeoutMs: 5e3
      }) : null;
      const publishedUrl = resolveSquareCheckoutUrl({
        freshUrl,
        storedUrl: invoice.squareInvoiceUrl
      });
      if (publishedUrl) {
        if (freshUrl && freshUrl !== invoice.squareInvoiceUrl) {
          await invoiceDoc.ref.update({
            squareInvoiceUrl: freshUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }).catch((err) => console.error("[Payments] Square invoice URL save failed:", err));
        }
        return res.json({ checkoutUrl: publishedUrl, provider: "square" });
      }
      if (!squareReady()) return res.status(503).json({ error: "Square payments are not configured yet." });
      const response = await fetch(`${squareBaseUrl()}/v2/online-checkout/payment-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Square-Version": process.env.SQUARE_VERSION || "2026-08-20",
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          idempotency_key: `${invoiceDoc.id}-${Date.now()}`,
          quick_pay: {
            name: `Iconic Images Invoice ${invoice.invoiceNumber || invoiceDoc.id}`,
            price_money: {
              amount: Math.round(amountDue * 100),
              currency: "USD"
            },
            location_id: process.env.SQUARE_LOCATION_ID
          },
          checkout_options: {
            redirect_url: `${appUrl()}/invoice/${invoiceDoc.id}?paid=1`
          },
          pre_populated_data: {
            buyer_email: invoice.clientEmail || void 0
          },
          payment_note: squarePaymentNote(invoiceDoc.id, invoice.invoiceNumber)
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("[Payments] Square checkout error:", result);
        return res.status(500).json({ error: "Failed to start Square checkout." });
      }
      const link = result.payment_link;
      await invoiceDoc.ref.update({
        status: "sent",
        paymentProvider: "square",
        paymentUrl: link?.url || `${appUrl()}/invoice/${invoiceDoc.id}`,
        squarePaymentLinkId: link?.id || null,
        squareOrderId: link?.order_id || null,
        sentAt: invoice.sentAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ checkoutUrl: link?.url, provider: "square" });
    }
    if (!stripeReady()) {
      return res.status(503).json({ error: "Studio Noir Stripe payments are not configured yet." });
    }
    const session = await stripe$1.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: invoice.clientEmail || void 0,
      client_reference_id: invoiceDoc.id,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amountDue * 100),
          product_data: {
            name: `Studio Noir Invoice ${invoice.invoiceNumber || invoiceDoc.id}`,
            description: invoice.address || invoice.clientName || void 0
          }
        },
        quantity: 1
      }],
      payment_intent_data: {
        ...clientNotifyLive() && invoice.clientEmail ? { receipt_email: invoice.clientEmail } : {},
        metadata: {
          invoiceId: invoiceDoc.id,
          orderId: invoice.orderId || "",
          clientId: invoice.clientId || "",
          clientName: invoice.clientName || ""
        }
      },
      metadata: {
        invoiceId: invoiceDoc.id,
        orderId: invoice.orderId || "",
        clientId: invoice.clientId || ""
      },
      success_url: `${appUrl()}/invoice/${invoiceDoc.id}?paid=1`,
      cancel_url: `${appUrl()}/invoice/${invoiceDoc.id}?cancelled=1`
    });
    await invoiceDoc.ref.update({
      status: "sent",
      paymentProvider: "stripe",
      paymentUrl: `${appUrl()}/invoice/${invoiceDoc.id}`,
      stripeCheckoutSessionId: session.id,
      sentAt: invoice.sentAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ checkoutUrl: session.url, provider: "stripe" });
  } catch (err) {
    console.error("[Payments] Checkout error:", err);
    return res.status(500).json({ error: "Failed to start checkout." });
  }
});
router$e.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  let event;
  try {
    event = stripe$1.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[Payments] Stripe webhook signature verification failed:", err);
    return res.status(400).json({ error: "Invalid webhook signature." });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_intent) {
          const intent = await stripe$1.paymentIntents.retrieve(
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id
          );
          await handleStripePaymentSucceeded(intent);
        }
        break;
      }
      case "payment_intent.succeeded":
        await handleStripePaymentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handleStripePaymentFailed(event.data.object);
        break;
      case "charge.refunded":
        await handleStripeRefund(event.data.object);
        break;
    }
    return res.json({ received: true });
  } catch (err) {
    console.error("[Payments] Stripe webhook handler error:", err);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
});
function squareNotificationUrls() {
  const explicit = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  const urls = [
    explicit,
    `${appUrl()}/api/payments/square-webhook`,
    process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/$/, "")}/api/payments/square-webhook` : ""
  ].filter((url) => Boolean(url));
  return [...new Set(urls)];
}
function squareSignatureValid(rawBody, received, key) {
  if (!received) return false;
  const receivedBuf = Buffer.from(received);
  return squareNotificationUrls().some((url) => {
    const expected = crypto.createHmac("sha256", key).update(url + rawBody).digest("base64");
    const expectedBuf = Buffer.from(expected);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  });
}
async function findInvoiceForSquarePayment(payment) {
  const noteId = invoiceIdFromSquareNote(payment.note || payment.payment_note);
  if (noteId) {
    const byNote = await db$e().collection("invoices").doc(noteId).get();
    if (byNote.exists) return byNote;
  }
  const referenceId = typeof payment.reference_id === "string" ? payment.reference_id : "";
  if (referenceId) {
    const byReference = await db$e().collection("invoices").doc(referenceId).get();
    if (byReference.exists) return byReference;
  }
  if (typeof payment.order_id === "string" && payment.order_id) {
    const bySquareOrder = await db$e().collection("invoices").where("squareOrderId", "==", payment.order_id).limit(1).get();
    if (!bySquareOrder.empty) return bySquareOrder.docs[0];
  }
  const linkId = payment.payment_link_id || payment.paymentLinkId;
  if (typeof linkId === "string" && linkId) {
    const byLink = await db$e().collection("invoices").where("squarePaymentLinkId", "==", linkId).limit(1).get();
    if (!byLink.empty) return byLink.docs[0];
  }
  if (typeof payment.id === "string" && payment.id) {
    const byPayment = await db$e().collection("invoices").where("squarePaymentId", "==", payment.id).limit(1).get();
    if (!byPayment.empty) return byPayment.docs[0];
  }
  return null;
}
router$e.post("/square-webhook", async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!signatureKey) {
      console.error("[Payments] Square webhook rejected: SQUARE_WEBHOOK_SIGNATURE_KEY is not set.");
      return res.status(401).json({ error: "Square webhook signature key is not configured." });
    }
    const received = Array.isArray(req.headers["x-square-hmacsha256-signature"]) ? req.headers["x-square-hmacsha256-signature"][0] : req.headers["x-square-hmacsha256-signature"];
    if (!squareSignatureValid(rawBody, received, signatureKey)) {
      return res.status(400).json({ error: "Invalid Square webhook signature." });
    }
    const event = JSON.parse(rawBody);
    const payment = event?.data?.object?.payment || event?.data?.object;
    if (!payment?.id || payment.status !== "COMPLETED") return res.json({ received: true });
    const invoiceDoc = await findInvoiceForSquarePayment(payment);
    if (!invoiceDoc) {
      await db$e().collection("agentLogs").add({
        agent: "travis",
        action: "Unmatched Square payment",
        summary: `Square payment ${payment.id} could not be matched to an invoice`,
        status: "flagged",
        relatedType: "invoice",
        priority: "high",
        requiresHumanReview: true,
        details: payment.order_id || payment.note || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ received: true, unmatched: true });
    }
    const invoice = invoiceDoc.data() || {};
    if (invoiceProvider(invoice) === "stripe") {
      return res.json({ received: true, ignored: "stripe-invoice" });
    }
    const amountCents = Number(payment.amount_money?.amount ?? payment.total_money?.amount ?? 0);
    const amount = amountCents / 100;
    if (amount <= 0) return res.json({ received: true, ignored: "zero-amount" });
    await applySuccessfulPayment({
      invoiceId: invoiceDoc.id,
      orderId: invoice.orderId,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      amount,
      method: "square",
      squarePaymentId: payment.id
    });
    return res.json({ received: true });
  } catch (err) {
    console.error("[Payments] Square webhook error:", err);
    return res.status(500).json({ error: "Square webhook handler failed." });
  }
});
router$e.get("/transactions", requireCoordinator, async (req, res) => {
  try {
    const { startDate, endDate, limit = "50" } = req.query;
    let query = db$e().collection("transactions").orderBy("createdAt", "desc");
    if (startDate) {
      query = query.where(
        "createdAt",
        ">=",
        admin.firestore.Timestamp.fromDate(new Date(startDate))
      );
    }
    if (endDate) {
      query = query.where(
        "createdAt",
        "<=",
        admin.firestore.Timestamp.fromDate(new Date(endDate))
      );
    }
    const snapshot = await query.limit(Number(limit)).get();
    const transactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const totalRevenue = transactions.filter((t) => t.status === "completed" && t.type === "payment").reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return res.json({ transactions, totalRevenue });
  } catch (err) {
    console.error("[Payments] Transactions error:", err);
    return res.status(500).json({ error: "Failed to fetch transactions." });
  }
});
async function handleStripePaymentSucceeded(intent) {
  const { invoiceId, orderId, clientId, clientName } = intent.metadata;
  if (!invoiceId) return;
  const invoiceDoc = await db$e().collection("invoices").doc(invoiceId).get();
  if (!invoiceDoc.exists) return;
  if (invoiceProvider(invoiceDoc.data() || {}) !== "stripe") {
    console.warn(`[Payments] Ignored Stripe payment ${intent.id} for non-Stripe invoice ${invoiceId}`);
    return;
  }
  await applySuccessfulPayment({
    invoiceId,
    orderId,
    clientId,
    clientName,
    amount: intent.amount_received / 100,
    method: "stripe",
    stripePaymentIntentId: intent.id
  });
}
async function handleStripePaymentFailed(intent) {
  const { invoiceId } = intent.metadata;
  if (!invoiceId) return;
  await db$e().collection("agentLogs").add({
    agent: "travis",
    action: "Studio Noir payment failed",
    summary: `Stripe payment failed for invoice ${invoiceId}`,
    status: "flagged",
    relatedId: invoiceId,
    relatedType: "invoice",
    priority: "high",
    requiresHumanReview: true,
    details: intent.last_payment_error?.message || "Unknown error",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
async function handleStripeRefund(charge) {
  if (!charge.payment_intent) return;
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id;
  const invoiceSnap = await db$e().collection("invoices").where("stripePaymentIntentId", "==", intentId).limit(1).get();
  if (invoiceSnap.empty) return;
  const invoiceDoc = invoiceSnap.docs[0];
  const refundAmount = charge.amount_refunded / 100;
  await db$e().collection("transactions").add({
    type: "refund",
    invoiceId: invoiceDoc.id,
    clientId: invoiceDoc.data().clientId,
    clientName: invoiceDoc.data().clientName,
    amount: -refundAmount,
    paymentMethod: "stripe",
    status: "completed",
    stripePaymentIntentId: intentId,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
const router$d = Router();
const db$d = () => admin.firestore();
const VSAI_API_BASE = "https://api.virtualstagingai.app/v1";
const VSAI_API_KEY = process.env.VSAI_API_KEY || process.env.VIRTUAL_STAGING_AI_API_KEY || "";
const VSAI_PRICE_CENTS = parseInt(process.env.VSAI_PRICE_CENTS || "1500", 10);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});
router$d.post("/create", requireAuth, async (req, res) => {
  try {
    if (!VSAI_API_KEY) {
      console.error("[VSAI] VSAI_API_KEY is not set");
      return res.status(500).json({ error: "VSAI API key not configured." });
    }
    const {
      imageUrl,
      roomType = "living",
      style = "modern"
    } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required." });
    }
    const userId = req.user.uid;
    const payload = {
      image_url: imageUrl,
      room_type: roomType,
      style,
      wait_for_completion: false,
      add_virtually_staged_watermark: false
    };
    console.log("[VSAI] Creating render:", JSON.stringify(payload));
    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Create response ${vsaiResponse.status}:`, responseText);
    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI API error: ${responseText}`
      });
    }
    let vsaiData;
    try {
      vsaiData = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "Invalid VSAI response format." });
    }
    const vsaiRenderId = vsaiData.id || vsaiData.render_id || vsaiData.renderId || null;
    if (!vsaiRenderId) {
      console.error("[VSAI] No render ID in response:", vsaiData);
      return res.status(500).json({
        error: `VSAI returned no render ID. Response: ${responseText}`
      });
    }
    const jobRef = await db$d().collection("vsaiJobs").add({
      userId,
      imageUrl,
      roomType,
      style,
      vsaiRenderId,
      status: "processing",
      isPaid: false,
      resultUrl: null,
      resultUrls: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[VSAI] Job created: ${jobRef.id} → vsaiRenderId: ${vsaiRenderId}`);
    return res.status(200).json({
      jobId: jobRef.id,
      vsaiRenderId,
      status: "processing"
    });
  } catch (err) {
    console.error("[VSAI] Create error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$d.get("/result/:jobId", requireAuth, async (req, res) => {
  try {
    const jobDoc = await db$d().collection("vsaiJobs").doc(req.params.jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });
    const job = jobDoc.data();
    if (job.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    if (job.status === "completed" && job.resultUrl) {
      return res.json({
        jobId: req.params.jobId,
        status: "completed",
        resultUrl: job.resultUrl,
        resultUrls: job.resultUrls || [job.resultUrl]
      });
    }
    if (job.status === "failed") {
      return res.json({
        jobId: req.params.jobId,
        status: "failed",
        error: job.error || "Render failed."
      });
    }
    if (!VSAI_API_KEY) {
      return res.status(500).json({ error: "VSAI API key not configured." });
    }
    const pollUrl = `${VSAI_API_BASE}/render?render_id=${encodeURIComponent(job.vsaiRenderId)}`;
    const vsaiResponse = await fetch(pollUrl, {
      headers: { Authorization: `Api-Key ${VSAI_API_KEY}` }
    });
    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Poll ${job.vsaiRenderId} → ${vsaiResponse.status}: ${responseText}`);
    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI poll error (${vsaiResponse.status}): ${responseText}`
      });
    }
    let vsaiData;
    try {
      vsaiData = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "Invalid VSAI response format." });
    }
    const rawStatus = (vsaiData.status || "").toLowerCase();
    const isFailed = rawStatus === "error" || rawStatus === "failed";
    const outputIndex = typeof job.outputIndex === "number" ? job.outputIndex : 0;
    const outputs = vsaiData.outputs || vsaiData.output_urls || [];
    const isComplete = (rawStatus === "done" || rawStatus === "completed") && outputs.length > outputIndex;
    const normalizedStatus = isComplete ? "completed" : isFailed ? "failed" : "processing";
    const resultUrl = outputs[outputIndex] || vsaiData.output_url || vsaiData.rendered_image || vsaiData.result_url || null;
    const resultUrls = outputs.length ? [outputs[outputIndex]].filter(Boolean) : resultUrl ? [resultUrl] : [];
    const updates = {
      status: normalizedStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (isComplete && resultUrl) {
      updates.resultUrl = resultUrl;
      updates.resultUrls = resultUrls;
    }
    if (isFailed) {
      updates.error = vsaiData.error || vsaiData.message || "Render failed on VSAI.";
    }
    await jobDoc.ref.update(updates);
    return res.json({
      jobId: req.params.jobId,
      status: normalizedStatus,
      resultUrl: resultUrl || null,
      resultUrls: resultUrls.length ? resultUrls : null,
      error: isFailed ? vsaiData.error || vsaiData.message || "Render failed." : void 0
    });
  } catch (err) {
    console.error("[VSAI] Poll error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$d.post("/variation", requireAuth, async (req, res) => {
  try {
    const { jobId, style: newStyle, roomType: newRoomType } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: "jobId required." });
    }
    let rootJobDoc = await db$d().collection("vsaiJobs").doc(jobId).get();
    if (!rootJobDoc.exists) return res.status(404).json({ error: "Job not found." });
    let rootJob = rootJobDoc.data();
    if (rootJob.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    while (rootJob.parentJobId) {
      const parentDoc = await db$d().collection("vsaiJobs").doc(rootJob.parentJobId).get();
      if (!parentDoc.exists) break;
      rootJob = parentDoc.data();
    }
    const vsaiRenderId = rootJob.vsaiRenderId;
    const resolvedStyle = newStyle || rootJob.style;
    const resolvedRoomType = newRoomType || rootJob.roomType;
    const currentStateRes = await fetch(
      `${VSAI_API_BASE}/render?render_id=${encodeURIComponent(vsaiRenderId)}`,
      { headers: { Authorization: `Api-Key ${VSAI_API_KEY}` } }
    );
    const currentStateText = await currentStateRes.text();
    console.log(`[VSAI] Current render state before variation:`, currentStateText);
    let currentOutputCount = 1;
    if (currentStateRes.ok) {
      try {
        const current = JSON.parse(currentStateText);
        currentOutputCount = current.outputs?.length ?? 1;
      } catch {
      }
    }
    const varUrl = `${VSAI_API_BASE}/render/create-variation?render_id=${encodeURIComponent(vsaiRenderId)}`;
    const varBody = {
      wait_for_completion: false,
      roomType: resolvedRoomType,
      style: resolvedStyle,
      add_virtually_staged_watermark: false
    };
    console.log("[VSAI] create-variation →", varUrl, JSON.stringify(varBody));
    const vsaiResponse = await fetch(varUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`
      },
      body: JSON.stringify(varBody)
    });
    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] create-variation response ${vsaiResponse.status}:`, responseText);
    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI variation error: ${responseText}`
      });
    }
    const variationRef = await db$d().collection("vsaiJobs").add({
      userId: req.user.uid,
      imageUrl: rootJob.imageUrl,
      roomType: resolvedRoomType,
      style: resolvedStyle,
      vsaiRenderId,
      // same render — no new credit consumed
      outputIndex: currentOutputCount,
      // poll waits for outputs[this index]
      status: "processing",
      isPaid: false,
      parentJobId: jobId,
      resultUrl: null,
      resultUrls: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({
      jobId: variationRef.id,
      vsaiRenderId,
      status: "processing"
    });
  } catch (err) {
    console.error("[VSAI] Variation error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$d.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { jobIds, successUrl, cancelUrl } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "jobIds array required." });
    }
    const userId = req.user.uid;
    const jobDocs = await Promise.all(
      jobIds.map((id) => db$d().collection("vsaiJobs").doc(id).get())
    );
    for (let i = 0; i < jobDocs.length; i++) {
      const doc = jobDocs[i];
      if (!doc.exists) {
        return res.status(404).json({ error: `Job ${jobIds[i]} not found.` });
      }
      const data = doc.data();
      if (data.userId !== userId) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (data.status !== "completed") {
        return res.status(400).json({ error: `Job ${jobIds[i]} is not completed yet.` });
      }
      if (data.isPaid) {
        return res.status(400).json({ error: `Job ${jobIds[i]} is already paid.` });
      }
    }
    const origin = process.env.FRONTEND_URL || req.headers.origin || "https://iconicimagestx.com";
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: jobDocs.map((doc) => {
        const job = doc.data();
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Virtual Staging — ${capitalize(job.roomType)} (${capitalize(job.style)})`,
              description: "AI-staged photo delivered in full resolution",
              images: job.resultUrl ? [job.resultUrl] : void 0
            },
            unit_amount: VSAI_PRICE_CENTS
          },
          quantity: 1
        };
      }),
      mode: "payment",
      success_url: successUrl || `${origin}/services/virtual-staging/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/services/virtual-staging`,
      metadata: {
        jobIds: JSON.stringify(jobIds),
        userId,
        type: "vsai_renders"
      },
      customer_email: req.user.email || void 0
    });
    await Promise.all(
      jobDocs.map(
        (doc) => doc.ref.update({
          stripeSessionId: session.id,
          paymentStatus: "pending",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
      )
    );
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[VSAI] Checkout error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$d.post(
  "/webhook/stripe",
  // Raw body needed — mount before express.json() parses it
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_VSAI_WEBHOOK_SECRET || "";
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody || req.body,
        sig,
        webhookSecret
      );
    } catch (err) {
      console.error("[VSAI Webhook] Signature verification failed:", err);
      return res.status(400).send("Webhook signature failed.");
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata?.type === "vsai_renders") {
        const jobIds = JSON.parse(session.metadata.jobIds || "[]");
        await Promise.all(
          jobIds.map(
            (id) => db$d().collection("vsaiJobs").doc(id).update({
              isPaid: true,
              paymentStatus: "paid",
              stripeSessionId: session.id,
              paidAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            })
          )
        );
        console.log(`[VSAI Webhook] Marked ${jobIds.length} jobs as paid for session ${session.id}`);
      }
    }
    res.json({ received: true });
  }
);
router$d.get("/options", (_req, res) => {
  return res.json({
    roomTypes: [
      { value: "living", label: "Living Room" },
      { value: "bed", label: "Bedroom" },
      { value: "dining", label: "Dining Room" },
      { value: "kitchen", label: "Kitchen" },
      { value: "home_office", label: "Home Office" },
      { value: "bathroom", label: "Bathroom" },
      { value: "outdoor", label: "Outdoor / Patio" },
      { value: "kids_room", label: "Kids Room" }
    ],
    styles: [
      { value: "modern", label: "Modern" },
      { value: "scandinavian", label: "Scandinavian" },
      { value: "industrial", label: "Industrial" },
      { value: "mid-century modern", label: "Mid-Century" },
      { value: "coastal", label: "Coastal" },
      { value: "american", label: "American" },
      { value: "southwestern", label: "Southwestern" },
      { value: "farmhouse", label: "Farmhouse" },
      { value: "luxury", label: "Luxury" },
      { value: "standard", label: "Standard" }
    ],
    pricePerPhoto: VSAI_PRICE_CENTS / 100
  });
});
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
const router$c = Router();
const db$c = () => admin.firestore();
router$c.post("/email", requireStaff, async (req, res) => {
  try {
    const { to, subject, body, orderId, clientId } = req.body;
    if (!to || !body?.trim()) {
      return res.status(400).json({ error: "Email recipient and body required." });
    }
    await sendEmail({
      to,
      template: "manual_message",
      subject: subject || "Message from Iconic Images",
      variables: {
        message: body.trim()
      }
    });
    await db$c().collection("messages").add({
      orderId: orderId || null,
      clientId: clientId || null,
      senderId: req.user.uid,
      senderType: "staff",
      senderName: req.user.email || "Iconic Images",
      recipient: to,
      content: body.trim(),
      channel: "email",
      isRead: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("[Messages] Email send error:", err);
    return res.status(500).json({ error: "Failed to send email." });
  }
});
router$c.get("/:orderId", requireAuth, async (req, res) => {
  try {
    const orderDoc = await db$c().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$c().collection("staff").doc(req.user.uid).get();
    const isStaff = staffDoc.exists;
    if (!isStaff && order.clientId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    const snapshot = await db$c().collection("messages").where("orderId", "==", req.params.orderId).orderBy("createdAt", "asc").limit(100).get();
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const unread = snapshot.docs.filter(
      (d) => !d.data().isRead && d.data().senderId !== req.user.uid
    );
    const batch = db$c().batch();
    unread.forEach((d) => {
      batch.update(d.ref, {
        isRead: true,
        readAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    if (unread.length > 0) await batch.commit();
    return res.json(messages);
  } catch (err) {
    console.error("[Messages] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch messages." });
  }
});
router$c.post("/:orderId", requireAuth, async (req, res) => {
  try {
    const { content, attachments } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content required." });
    }
    const orderDoc = await db$c().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$c().collection("staff").doc(req.user.uid).get();
    const isStaff = staffDoc.exists;
    if (!isStaff && order.clientId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    let senderName = "Unknown";
    let senderType = "client";
    if (isStaff) {
      const staff = staffDoc.data();
      senderName = `${staff.firstName} ${staff.lastName}`.trim();
      senderType = "staff";
    } else {
      const clientDoc = await db$c().collection("clients").doc(order.clientId).get();
      if (clientDoc.exists) {
        const client = clientDoc.data();
        senderName = `${client.firstName} ${client.lastName}`.trim();
      }
    }
    const message = {
      orderId: req.params.orderId,
      senderId: req.user.uid,
      senderType,
      senderName,
      content: content.trim(),
      attachments: attachments || [],
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db$c().collection("messages").add(message);
    await db$c().collection("agentLogs").add({
      agent: "nora",
      action: "New message",
      summary: `New message on order ${req.params.orderId} from ${senderName}`,
      status: "completed",
      relatedId: req.params.orderId,
      relatedType: "order",
      priority: "low",
      requiresHumanReview: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: docRef.id, ...message });
  } catch (err) {
    console.error("[Messages] Send error:", err);
    return res.status(500).json({ error: "Failed to send message." });
  }
});
router$c.get("/unread/count", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$c().collection("messages").where("isRead", "==", false).where("senderType", "==", "client").get();
    return res.json({ unreadCount: snapshot.size });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get unread count." });
  }
});
function visibleToPortalClient(record, identity) {
  if (!record) return false;
  if (record.clientId && identity.ids.includes(String(record.clientId))) return true;
  const email = normalizeEmail(identity.email);
  if (!email) return false;
  return [record.email, record.clientEmail].some((value) => normalizeEmail(value) === email);
}
const db$b = () => admin.firestore();
async function upsertPortalClient(input) {
  const email = normalizeEmail(input.email);
  const firstName = cleanPersonName(input.firstName);
  const lastName = cleanPersonName(input.lastName);
  const phone = String(input.phone || "").trim().slice(0, 40);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const existing = email ? await db$b().collection("clients").where("email", "==", email).limit(5).get() : null;
  const linked = existing?.docs.find((doc) => doc.id !== input.uid);
  const linkedData = linked?.data() || {};
  const uidRef = db$b().collection("clients").doc(input.uid);
  const uidSnap = await uidRef.get();
  const previous = uidSnap.exists ? uidSnap.data() || {} : {};
  await uidRef.set({
    firebaseUid: input.uid,
    firstName: firstName || previous.firstName || "Client",
    lastName: lastName || previous.lastName || "",
    email: email || previous.email || "",
    phone: phone || previous.phone || linkedData.phone || "",
    company: previous.company || linkedData.company || "",
    address: previous.address || linkedData.address || "",
    status: "active",
    portalAccess: true,
    totalOrders: previous.totalOrders ?? linkedData.totalOrders ?? 0,
    totalSpend: previous.totalSpend ?? linkedData.totalSpend ?? 0,
    tags: previous.tags || linkedData.tags || [],
    notes: previous.notes || linkedData.notes || "",
    linkedClientId: linked?.id || previous.linkedClientId || null,
    createdAt: previous.createdAt || now,
    updatedAt: now
  }, { merge: true });
  if (linked) {
    await linked.ref.set({
      firebaseUid: input.uid,
      portalAccess: true,
      updatedAt: now
    }, { merge: true });
  }
  return { id: input.uid, linkedClientId: linked?.id || null, email };
}
async function resolveClientIdentity(uid, email) {
  const ids = /* @__PURE__ */ new Set([uid]);
  const direct = await db$b().collection("clients").doc(uid).get();
  let profile = direct.exists ? { id: direct.id, ...direct.data() } : null;
  const redirectId = typeof profile?._redirect === "string" ? profile._redirect : "";
  if (redirectId) ids.add(redirectId);
  const linkedId = typeof profile?.linkedClientId === "string" ? profile.linkedClientId : "";
  if (linkedId) ids.add(linkedId);
  const normalized = normalizeEmail(email || profile?.email);
  if (normalized) {
    const matches = await db$b().collection("clients").where("email", "==", normalized).limit(10).get();
    for (const doc of matches.docs) {
      ids.add(doc.id);
      if (!profile) profile = { id: doc.id, ...doc.data() };
    }
  }
  if (redirectId && profile && !profile.email) {
    const real = await db$b().collection("clients").doc(redirectId).get();
    if (real.exists) profile = { id: real.id, ...real.data(), portalDocId: uid };
  }
  return { ids: [...ids], profile, email: normalized };
}
function jsonSafe(value) {
  if (value == null) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = jsonSafe(nested);
    }
    return out;
  }
  return value;
}
const router$b = Router();
const db$a = () => admin.firestore();
function addressText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const address = value;
    if (typeof address.formatted === "string" && address.formatted) return address.formatted;
    return [address.street, address.city, address.state, address.zip].filter(Boolean).join(", ");
  }
  return String(value);
}
router$b.get("/", requireStaff, async (req, res) => {
  try {
    const { status, search, limit = "50" } = req.query;
    let query = db$a().collection("clients").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    const snapshot = await query.limit(Number(limit)).get();
    let clients = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (search) {
      const s = search.toLowerCase();
      clients = clients.filter((c) => {
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const email = (c.email || "").toLowerCase();
        return name.includes(s) || email.includes(s);
      });
    }
    return res.json(clients);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch clients." });
  }
});
function adminReady$2(res) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT."
  });
  return false;
}
router$b.post("/register", async (req, res) => {
  if (!adminReady$2(res)) return;
  const firstName = cleanPersonName(req.body?.firstName);
  const lastName = cleanPersonName(req.body?.lastName);
  const phone = String(req.body?.phone || "").trim().slice(0, 40);
  if (!firstName || !lastName) {
    return res.status(400).json({ error: "First and last name are required." });
  }
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice("Bearer ".length));
      const staffDoc = await db$a().collection("staff").doc(decoded.uid).get();
      if (staffDoc.exists && staffDoc.data()?.isActive !== false) {
        return res.status(403).json({ error: "Staff accounts cannot register as clients." });
      }
      const email2 = normalizeEmail(decoded.email || req.body?.email);
      if (!email2) return res.status(400).json({ error: "A valid email is required." });
      const result = await upsertPortalClient({ uid: decoded.uid, email: email2, firstName, lastName, phone });
      return res.status(201).json(result);
    }
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const staffHit = await db$a().collection("staff").where("email", "==", email).limit(1).get();
    if (!staffHit.empty) {
      return res.status(403).json({ error: "This email is a staff login. Use the staff sign-in page." });
    }
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`
      });
    } catch (err) {
      const code = err.code;
      if (code === "auth/email-already-exists") {
        return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
      }
      if (code === "auth/invalid-password" || code === "auth/weak-password") {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      throw err;
    }
    try {
      const result = await upsertPortalClient({ uid: userRecord.uid, email, firstName, lastName, phone });
      return res.status(201).json(result);
    } catch (err) {
      await admin.auth().deleteUser(userRecord.uid).catch(() => void 0);
      throw err;
    }
  } catch (err) {
    console.error("[Clients] Register error:", err);
    return res.status(500).json({ error: "Could not create the client account." });
  }
});
router$b.get("/me/home", requireAuth, async (req, res) => {
  if (!adminReady$2(res)) return;
  try {
    const identity = await resolveClientIdentity(req.user.uid, req.user.email);
    if (!identity.profile) {
      return res.status(404).json({ error: "Client profile not found." });
    }
    const galleries = [];
    const invoices = [];
    const projects = [];
    const seenGallery = /* @__PURE__ */ new Set();
    const seenInvoice = /* @__PURE__ */ new Set();
    const seenProject = /* @__PURE__ */ new Set();
    const pushInvoice = (entry) => {
      if (seenInvoice.has(entry.id)) return;
      seenInvoice.add(entry.id);
      const data = entry.data();
      invoices.push({
        id: entry.id,
        invoiceNumber: data.invoiceNumber || entry.id,
        status: data.status || "draft",
        total: data.total || 0,
        amountDue: data.amountDue ?? data.total ?? 0,
        href: `/invoice/${entry.id}`
      });
    };
    for (const clientId of identity.ids) {
      const [gallerySnap, invoiceSnap, projectSnap] = await Promise.all([
        db$a().collection("galleries").where("clientId", "==", clientId).limit(20).get(),
        db$a().collection("invoices").where("clientId", "==", clientId).limit(20).get(),
        db$a().collection("listings").where("clientId", "==", clientId).limit(20).get()
      ]);
      for (const doc of gallerySnap.docs) {
        if (seenGallery.has(doc.id)) continue;
        seenGallery.add(doc.id);
        const data = doc.data();
        galleries.push({
          id: doc.id,
          title: data.title || addressText(data.address) || "Gallery",
          address: addressText(data.address),
          status: data.status || "pending_upload",
          href: `/gallery/${doc.id}`
        });
      }
      invoiceSnap.docs.forEach(pushInvoice);
      for (const doc of projectSnap.docs) {
        if (seenProject.has(doc.id)) continue;
        seenProject.add(doc.id);
        const data = doc.data();
        projects.push({
          id: doc.id,
          address: addressText(data.propertyAddress || data.address || data.shootLocation) || "Project",
          status: data.status || "scheduled",
          imageCount: Array.isArray(data.images) ? data.images.length : 0,
          href: `/studio/${doc.id}`
        });
      }
    }
    const orders = [];
    const seenOrder = /* @__PURE__ */ new Set();
    const pushOrder = (entry) => {
      if (seenOrder.has(entry.id)) return;
      const data = entry.data();
      if (!visibleToPortalClient(
        { clientId: data.clientId, email: data.email, clientEmail: data.clientEmail },
        { ids: identity.ids, email: identity.email }
      )) return;
      seenOrder.add(entry.id);
      const listingId = typeof data.listingId === "string" ? data.listingId : "";
      orders.push({
        id: entry.id,
        address: addressText(data.address || data.shootLocation) || "Order",
        status: data.status || "new",
        href: listingId ? `/studio/${listingId}` : ""
      });
    };
    try {
      for (const clientId of identity.ids) {
        const snap = await db$a().collection("orderRequests").where("clientId", "==", clientId).limit(20).get();
        snap.docs.forEach(pushOrder);
      }
      if (identity.email) {
        const [byEmail, byClientEmail] = await Promise.all([
          db$a().collection("orderRequests").where("email", "==", identity.email).limit(20).get(),
          db$a().collection("orderRequests").where("clientEmail", "==", identity.email).limit(20).get()
        ]);
        byEmail.docs.forEach(pushOrder);
        byClientEmail.docs.forEach(pushOrder);
      }
    } catch (orderErr) {
      console.error("[Clients] Order lookup failed:", orderErr);
    }
    if (identity.email) {
      try {
        const byInvoiceEmail = await db$a().collection("invoices").where("clientEmail", "==", identity.email).limit(20).get();
        byInvoiceEmail.docs.forEach(pushInvoice);
      } catch (invoiceErr) {
        console.error("[Clients] Invoice email lookup failed:", invoiceErr);
      }
    }
    if (identity.email) {
      const byEmail = await db$a().collection("listings").where("clientEmail", "==", identity.email).limit(20).get();
      for (const doc of byEmail.docs) {
        if (seenProject.has(doc.id)) continue;
        seenProject.add(doc.id);
        const data = doc.data();
        projects.push({
          id: doc.id,
          address: addressText(data.propertyAddress || data.address || data.shootLocation) || "Project",
          status: data.status || "scheduled",
          imageCount: Array.isArray(data.images) ? data.images.length : 0,
          href: `/studio/${doc.id}`
        });
      }
    }
    return res.json({
      profile: jsonSafe(identity.profile),
      orders,
      galleries,
      invoices,
      projects
    });
  } catch (err) {
    console.error("[Clients] Home error:", err);
    return res.status(500).json({ error: "Failed to load your portal." });
  }
});
router$b.get("/me", requireAuth, async (req, res) => {
  try {
    const directDoc = await db$a().collection("clients").doc(req.user.uid).get();
    if (directDoc.exists) {
      const data = directDoc.data();
      if (data._redirect) {
        const realDoc = await db$a().collection("clients").doc(data._redirect).get();
        if (realDoc.exists) return res.json({ id: realDoc.id, ...realDoc.data() });
      }
      return res.json({ id: directDoc.id, ...data });
    }
    return res.status(404).json({ error: "Client profile not found." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch profile." });
  }
});
router$b.get("/:id", requireStaff, async (req, res) => {
  try {
    const doc = await db$a().collection("clients").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found." });
    const [orders, invoices] = await Promise.all([
      db$a().collection("orders").where("clientId", "==", req.params.id).orderBy("createdAt", "desc").limit(10).get(),
      db$a().collection("invoices").where("clientId", "==", req.params.id).orderBy("createdAt", "desc").limit(10).get()
    ]);
    return res.json({
      client: { id: doc.id, ...doc.data() },
      orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })),
      invoices: invoices.docs.map((d) => ({ id: d.id, ...d.data() }))
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch client." });
  }
});
router$b.post("/", requireCoordinator, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, notes, tags } = req.body;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "firstName, lastName, and email required." });
    }
    const existing = await db$a().collection("clients").where("email", "==", email.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: "Client with this email already exists.", id: existing.docs[0].id });
    }
    const ref = await db$a().collection("clients").add({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      address: address || "",
      totalOrders: 0,
      totalSpend: 0,
      status: "active",
      portalAccess: false,
      notes: notes || "",
      tags: tags || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create client." });
  }
});
router$b.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "address", "status", "notes", "tags", "company"];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => {
      if (k in req.body) updates[k] = req.body[k];
    });
    await db$a().collection("clients").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update client." });
  }
});
function secretsMatch(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}
function readSetupSecret(headerValue) {
  if (typeof headerValue === "string") return headerValue.trim();
  if (Array.isArray(headerValue) && typeof headerValue[0] === "string") return headerValue[0].trim();
  return "";
}
const db$9 = () => admin.firestore();
function httpError$1(status, error) {
  return Object.assign(new Error(error), { status });
}
async function bootstrapPlaytest(input) {
  const photographerInput = input.photographer || {};
  const email = normalizeEmail(photographerInput.email);
  const password = String(photographerInput.password || "");
  const firstName = String(photographerInput.firstName || "Playtest").trim().slice(0, 80);
  const lastName = String(photographerInput.lastName || "Photographer").trim().slice(0, 80);
  const role = photographerInput.role || "photographer";
  const seedListing = input.seedListing !== false;
  const seedGallery = input.seedGallery !== false;
  const clientEmail = normalizeEmail(input.clientEmail);
  if (!email || !email.includes("@")) throw httpError$1(400, "Photographer email is required.");
  if (password.length < 6) throw httpError$1(400, "Photographer password must be at least 6 characters.");
  if (!isStaffRole(role)) throw httpError$1(400, "Role must be admin, coordinator, photographer, or editor.");
  const photographer = await ensurePlaytestStaff({
    email,
    password,
    firstName,
    lastName,
    role,
    phone: String(photographerInput.phone || "").trim()
  });
  let client = null;
  let clientStatus = clientEmail ? "not_found" : "skipped";
  if (clientEmail) {
    const matches = await db$9().collection("clients").where("email", "==", clientEmail).limit(5).get();
    const preferred = matches.docs.find((doc) => doc.data().firebaseUid === doc.id) || matches.docs[0];
    if (preferred) {
      client = {
        id: preferred.id,
        email: clientEmail,
        name: `${preferred.data().firstName || ""} ${preferred.data().lastName || ""}`.trim() || clientEmail
      };
      clientStatus = "linked";
    }
  }
  let listing = null;
  if (seedListing) {
    listing = await upsertPlaytestListing(photographer.uid, client);
  }
  let gallery = null;
  let invoice = null;
  if (seedGallery && client && listing) {
    const seeded = await upsertPlaytestDelivery(photographer.uid, client, listing.id);
    gallery = seeded.gallery;
    invoice = seeded.invoice;
  }
  const origin = process.env.APP_URL || "https://iconicimagestx.vercel.app";
  return {
    photographer,
    client: client ? { ...client, status: clientStatus } : { status: clientStatus, email: clientEmail || null },
    listing,
    gallery: gallery ? { ...gallery, url: `${origin}${gallery.urlPath}` } : null,
    invoice: invoice ? { ...invoice, url: `${origin}${invoice.urlPath}` } : null,
    next: [
      `Sign in as the photographer at ${origin}/admin/login`,
      `Upload at ${origin}/admin/upload or ${origin}/admin/photographer`,
      client ? `Client signs in at ${origin}/portal and opens ${origin}/portal/home` : `Create the client at ${origin}/portal, then re-run this request with clientEmail to attach a gallery and invoice`
    ]
  };
}
async function ensurePlaytestStaff(input) {
  let created = false;
  let user;
  try {
    user = await admin.auth().createUser({
      email: input.email,
      password: input.password,
      displayName: `${input.firstName} ${input.lastName}`.trim(),
      emailVerified: true
    });
    created = true;
  } catch (err) {
    const code = err.code;
    if (code !== "auth/email-already-exists") throw err;
    user = await admin.auth().getUserByEmail(input.email);
    const existing = await db$9().collection("staff").doc(user.uid).get();
    if (existing.exists && existing.data()?.playtest !== true) {
      throw httpError$1(409, "That email already belongs to a staff account that is not a playtest login. Use a different email.");
    }
    await admin.auth().updateUser(user.uid, {
      password: input.password,
      displayName: `${input.firstName} ${input.lastName}`.trim(),
      disabled: false
    });
  }
  const now = admin.firestore.FieldValue.serverTimestamp();
  const staffPayload = {
    firebaseUid: user.uid,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    isActive: true,
    playtest: true,
    updatedAt: now
  };
  if (created) {
    staffPayload.createdAt = now;
    staffPayload.assignedOrders = [];
  }
  await db$9().collection("staff").doc(user.uid).set(staffPayload, { merge: true });
  try {
    await admin.auth().setCustomUserClaims(user.uid, { isStaff: true, role: input.role });
  } catch (err) {
    console.warn("[Staff] Playtest claims were not set. Firestore role is still used.", err);
  }
  return {
    uid: user.uid,
    email: input.email,
    role: input.role,
    created,
    playtest: true
  };
}
async function upsertPlaytestListing(photographerUid, client) {
  const id = `playtest-job-${photographerUid}`;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const when = admin.firestore.Timestamp.now();
  const ref = db$9().collection("listings").doc(id);
  const existing = await ref.get();
  const previousImages = existing.exists && Array.isArray(existing.data()?.images) ? existing.data().images : [];
  await ref.set({
    playtest: true,
    propertyAddress: PLAYTEST_ADDRESS,
    address: PLAYTEST_ADDRESS,
    shootLocation: PLAYTEST_ADDRESS,
    clientName: client?.name || "Playtest Client",
    clientEmail: client?.email || "",
    clientId: client?.id || "",
    photographerUid,
    photographerIds: [photographerUid],
    assignedProviders: [{ providerId: photographerUid, role: "photographer" }],
    status: "scheduled",
    shootDate: when,
    apptDate: when,
    apptTime: "10:00 AM",
    services: ["Photography"],
    images: previousImages,
    notes: "Playtest job created for portal upload. Safe to ignore in production scheduling.",
    createdAt: existing.exists ? existing.data()?.createdAt || now : now,
    updatedAt: now
  }, { merge: true });
  return { id, address: PLAYTEST_ADDRESS, status: "scheduled" };
}
async function upsertPlaytestDelivery(photographerUid, client, listingId) {
  const orderId = `playtest-order-${client.id}`;
  const galleryId = `playtest-gallery-${client.id}`;
  const invoiceId = `playtest-invoice-${client.id}`;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const listingSnap = await db$9().collection("listings").doc(listingId).get();
  const images = listingSnap.exists && Array.isArray(listingSnap.data()?.images) ? listingSnap.data().images : [];
  const mediaItems = images.filter((image) => image?.url).map((image, index) => ({
    id: `playtest-media-${index}-${image.path || image.name || "photo"}`,
    url: image.url,
    shareUrl: image.url,
    fileName: image.name || `Photo ${index + 1}`,
    title: image.name || `Photo ${index + 1}`,
    type: String(image.contentType || "").startsWith("video/") ? "video" : "photo",
    storagePath: image.path || "",
    downloadable: true,
    uploadedBy: image.uploadedBy || photographerUid,
    uploadedAt: image.uploadedAt || (/* @__PURE__ */ new Date()).toISOString()
  }));
  await db$9().collection("galleries").doc(galleryId).set({
    playtest: true,
    listingId,
    orderId,
    title: "Playtest Gallery",
    address: PLAYTEST_ADDRESS,
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    status: "delivered",
    downloadEnabled: true,
    mediaItems,
    deliveredAt: now,
    createdAt: now,
    updatedAt: now
  }, { merge: true });
  await db$9().collection("invoices").doc(invoiceId).set({
    playtest: true,
    invoiceNumber: `PLAY-${client.id.slice(0, 6).toUpperCase()}`,
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    orderId,
    galleryId,
    listingId,
    address: PLAYTEST_ADDRESS,
    lineItems: [{ name: "Playtest photography", price: 150, qty: 1, category: "service" }],
    subtotal: 150,
    tax: 0,
    total: 150,
    amountPaid: 0,
    amountDue: 150,
    status: "sent",
    createdAt: now,
    updatedAt: now
  }, { merge: true });
  await db$9().collection("listings").doc(listingId).set({
    playtestGalleryId: galleryId,
    clientId: client.id,
    clientEmail: client.email,
    clientName: client.name,
    updatedAt: now
  }, { merge: true });
  return {
    gallery: { id: galleryId, urlPath: `/gallery/${galleryId}` },
    invoice: { id: invoiceId, urlPath: `/invoice/${invoiceId}`, status: "sent", amountDue: 150 }
  };
}
const router$a = Router();
const db$8 = () => admin.firestore();
router$a.get("/", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$8().collection("staff").where("isActive", "==", true).orderBy("firstName").get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch staff." });
  }
});
router$a.post("/", requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, tempPassword } = req.body;
    if (!firstName || !lastName || !email || !role || !tempPassword) {
      return res.status(400).json({ error: "All fields required." });
    }
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password: tempPassword,
      displayName: `${firstName} ${lastName}`
    });
    await db$8().collection("staff").doc(userRecord.uid).set({
      firebaseUid: userRecord.uid,
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      role,
      isActive: true,
      assignedOrders: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({
      id: userRecord.uid,
      message: "Staff member created. They must change their password on first login."
    });
  } catch (err) {
    const code = err.code;
    if (code === "auth/email-already-exists") {
      return res.status(409).json({ error: "Email already in use." });
    }
    console.error("[Staff] Create error:", err);
    return res.status(500).json({ error: "Failed to create staff member." });
  }
});
router$a.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "role", "isActive"];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => {
      if (k in req.body) updates[k] = req.body[k];
    });
    await db$8().collection("staff").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update staff member." });
  }
});
function requireSetupSecret(req, res) {
  const expected = process.env.STAFF_SETUP_SECRET;
  if (!expected) {
    res.status(503).json({
      error: "STAFF_SETUP_SECRET is not set. Add it to Vercel Production, then redeploy."
    });
    return false;
  }
  const provided = readSetupSecret(req.header("x-staff-setup-secret") || req.header("x-setup-secret"));
  if (!secretsMatch(provided, expected)) {
    res.status(401).json({ error: "Invalid staff setup secret." });
    return false;
  }
  return true;
}
router$a.post("/playtest", async (req, res) => {
  if (!requireSetupSecret(req, res)) return;
  if (!admin.apps.length) {
    return res.status(503).json({
      error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET."
    });
  }
  try {
    const result = await bootstrapPlaytest(req.body || {});
    return res.status(201).json(result);
  } catch (err) {
    const status = err.status;
    if (status && status >= 400 && status < 500) {
      return res.status(status).json({ error: err instanceof Error ? err.message : "Playtest setup failed." });
    }
    console.error("[Staff] Playtest bootstrap error:", err);
    return res.status(500).json({ error: "Playtest setup failed." });
  }
});
router$a.post("/setup", async (req, res) => {
  try {
    if (isHostedDeployment(liveServerEnv())) {
      const secret = process.env.STAFF_SETUP_SECRET;
      const provided = req.header("x-setup-secret");
      if (!secret || provided !== secret) {
        return res.status(403).json({ error: "Staff setup is disabled." });
      }
    }
    const existing = await db$8().collection("staff").limit(1).get();
    if (!existing.empty) {
      return res.status(403).json({ error: "Staff already configured." });
    }
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "All fields required." });
    }
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password,
      displayName: `${firstName} ${lastName}`
    });
    await db$8().collection("staff").doc(userRecord.uid).set({
      firebaseUid: userRecord.uid,
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone: "",
      role: "admin",
      isActive: true,
      assignedOrders: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({
      message: "Admin account created successfully.",
      uid: userRecord.uid
    });
  } catch (err) {
    console.error("[Staff] Setup error:", err);
    return res.status(500).json({ error: "Setup failed." });
  }
});
const db$7 = () => admin.firestore();
const bucket$1 = () => admin.storage().bucket();
const BROWSER_ORIGINS = [
  "https://iconicimagestx.vercel.app",
  "https://iconicimagestx.com",
  "https://www.iconicimagestx.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];
let corsAttempt = null;
function ensureBucketCors() {
  if (!corsAttempt) {
    corsAttempt = bucket$1().setCorsConfiguration([{
      origin: BROWSER_ORIGINS,
      method: ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
      responseHeader: ["Content-Type", "Authorization", "Content-Length", "x-goog-resumable"],
      maxAgeSeconds: 3600
    }]).then(() => {
      console.log("[Storage] Bucket CORS allows portal photo uploads.");
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[Storage] Could not update bucket CORS:", message);
    });
  }
  return corsAttempt;
}
function firebaseDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}
async function createListingUploadUrl(listingId, fileName, contentType, folder) {
  await ensureBucketCors();
  const safeName = safeStorageFileName(fileName);
  const resolvedType = contentTypeForUpload(safeName, contentType);
  const storagePath = `listings/${listingId}/${folder}/${Date.now()}_${safeName}`;
  const file = bucket$1().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1e3,
    contentType: resolvedType
  });
  return { uploadUrl, storagePath, contentType: resolvedType };
}
async function saveListingBytes(listingId, fileName, contentType, folder, bytes) {
  const safeName = safeStorageFileName(fileName);
  const resolvedType = contentTypeForUpload(safeName, contentType);
  const storagePath = `listings/${listingId}/${folder}/${Date.now()}_${safeName}`;
  const token = randomUUID();
  const file = bucket$1().file(storagePath);
  await file.save(bytes, {
    resumable: false,
    metadata: {
      contentType: resolvedType,
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
  const url = firebaseDownloadUrl(bucket$1().name, storagePath, token);
  return { storagePath, contentType: resolvedType, url, token };
}
async function registerListingPhoto(options) {
  const { listingId, storagePath, fileName, uploadedBy } = options;
  if (!isListingStoragePath(listingId, storagePath)) {
    throw Object.assign(new Error("Storage path is not inside this listing."), { status: 400 });
  }
  const listingRef = db$7().collection("listings").doc(listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) {
    throw Object.assign(new Error("Listing not found."), { status: 404 });
  }
  const file = bucket$1().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw Object.assign(new Error("Uploaded file was not found in storage."), { status: 400 });
  }
  let url = options.existingUrl || "";
  if (!url) {
    const [metadata] = await file.getMetadata();
    const current = metadata.metadata?.firebaseStorageDownloadTokens;
    const token = typeof current === "string" && current ? current.split(",")[0] : randomUUID();
    if (!current) {
      await file.setMetadata({
        metadata: { firebaseStorageDownloadTokens: token },
        contentType: contentTypeForUpload(fileName, options.contentType || metadata.contentType)
      });
    }
    url = firebaseDownloadUrl(bucket$1().name, storagePath, token);
  }
  const image = {
    url,
    name: safeStorageFileName(fileName),
    path: storagePath,
    contentType: contentTypeForUpload(fileName, options.contentType),
    uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
    uploadedBy,
    ...studioImageExtra(options.extra)
  };
  const listing = listingSnap.data() || {};
  const images = Array.isArray(listing.images) ? listing.images : [];
  const already = images.find((item) => item?.path === storagePath);
  if (!already) {
    await listingRef.update({
      images: admin.firestore.FieldValue.arrayUnion(image),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await syncPlaytestGallery(listingId, listing, image);
  }
  return { image: already || image, listingId };
}
function studioImageExtra(extra) {
  if (!extra || typeof extra !== "object") return {};
  const src = extra;
  const out = {};
  if (src.studioApproved === true) out.studioApproved = true;
  if (src.studioRole === "adjusted" || src.studioRole === "final") out.studioRole = src.studioRole;
  if (typeof src.sourcePath === "string" && src.sourcePath.length <= 500) out.sourcePath = src.sourcePath;
  return out;
}
async function syncPlaytestGallery(listingId, listing, image) {
  const galleryIds = /* @__PURE__ */ new Set();
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) {
    galleryIds.add(listing.playtestGalleryId);
  }
  if (listing.playtest === true) {
    const snap = await db$7().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    snap.docs.forEach((doc) => {
      if (doc.data().playtest === true) galleryIds.add(doc.id);
    });
  }
  if (galleryIds.size === 0) return;
  const mediaItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url: image.url,
    shareUrl: image.url,
    fileName: image.name,
    title: image.name,
    type: image.contentType?.startsWith("video/") ? "video" : "photo",
    storagePath: image.path,
    downloadable: true,
    uploadedBy: image.uploadedBy,
    uploadedAt: image.uploadedAt
  };
  for (const galleryId of galleryIds) {
    const ref = db$7().collection("galleries").doc(galleryId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.playtest !== true) continue;
    const items = Array.isArray(snap.data()?.mediaItems) ? snap.data().mediaItems : [];
    if (items.some((item) => item?.storagePath === image.path)) continue;
    await ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(mediaItem),
      status: "delivered",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}
function serializeDoc(id, data) {
  return jsonSafe({ id, ...data });
}
const ORDER_GALLERY_RELEASE = "hold_until_order_complete";
const ICONIC_POLISH_INSTRUCTION = "Iconic Polish: if a fireplace is visible, add a realistic fire; if a driveway, street, or curb is visible, remove vehicles and debris and repair the pavement; remove clutter and personal items. Keep the architecture.";
const PHOTO_BASE = "Prepare this listing photo. Balance color, clear window glare, and replace a blown-out sky when the sky is visible. Keep the architecture, furnishings, and camera angle.";
function asItems(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const name2 = entry.trim();
      return name2 ? [{ id: "", name: name2 }] : [];
    }
    if (!entry || typeof entry !== "object") return [];
    const row = entry;
    const id = String(row.id || "").trim();
    const name = String(row.name || row.label || "").trim();
    return id || name ? [{ id, name }] : [];
  });
}
function asIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}
function packageByIdOrName(id, name) {
  const idKey = id.toLowerCase();
  const nameKey = name.toLowerCase();
  return services.find((service) => service.id === id || nameKey && service.name.toLowerCase() === nameKey || service.id === idKey);
}
function twilightPrompt(role, polish) {
  const place = role === "front" ? "front exterior" : role === "back" ? "rear exterior" : "exterior";
  const request = [
    `Convert this ${place} listing photo into a photoreal twilight.`,
    "Turn on warm interior lights and landscape lighting.",
    "Keep the architecture, landscaping, and camera angle.",
    "Use a natural evening sky. Do not add people or text."
  ];
  if (polish) request.push(ICONIC_POLISH_INSTRUCTION);
  return request.join(" ");
}
function photoPrompt(polish) {
  return polish ? `${PHOTO_BASE} ${ICONIC_POLISH_INSTRUCTION}` : PHOTO_BASE;
}
function twilightRole(index) {
  if (index === 0) return "front";
  if (index === 1) return "back";
  return `exterior-${index + 1}`;
}
function collectTexts(input) {
  const texts = [];
  const packageNames = [];
  let polishFromOrder = false;
  const items = [...asItems(input.lineItems), ...asItems(input.services)];
  for (const id of asIds(input.serviceIds)) items.push({ id, name: "" });
  for (const item of items) {
    if (item.name) texts.push(item.name);
    const catalog = packageByIdOrName(item.id, item.name);
    if (catalog) {
      packageNames.push(catalog.name);
      for (const feature of catalog.features || []) texts.push(feature);
    }
    const blob = `${item.id} ${item.name}`.toLowerCase();
    if (blob.includes("iconic finish") || blob.includes("iconic polish") || blob.includes("iconic-finish")) {
      polishFromOrder = true;
    }
  }
  return {
    texts,
    packageName: packageNames[0] || items.find((item) => item.name)?.name || "Custom order",
    polishFromOrder
  };
}
function planOrderEdits(input = {}) {
  const collected = collectTexts(input);
  let twilightCount = 0;
  let photoCount = null;
  let photoFull = false;
  let polishFromOrder = collected.polishFromOrder;
  const deliverables = /* @__PURE__ */ new Map();
  for (const text2 of collected.texts) {
    const twilight2 = text2.match(/(\d+)\s+(?:iconic\s+)?twilight/i);
    if (twilight2) twilightCount = Math.max(twilightCount, Number(twilight2[1]));
    else if (/twilight/i.test(text2)) twilightCount = Math.max(twilightCount, 1);
    const photos = text2.match(/(\d+)\s+(?:high-end\s+|iconic\s+)?(?:images|photos)\b/i);
    if (photos) photoCount = Math.max(photoCount || 0, Number(photos[1]));
    if (/full images/i.test(text2)) photoFull = true;
    const aerials = text2.match(/(\d+)\s+aerial/i);
    if (aerials || /full aerials|aerial drone/i.test(text2)) {
      deliverables.set("aerials", {
        id: "aerials",
        label: aerials ? `${aerials[1]} aerial stills` : "Aerial stills",
        kind: "capture"
      });
    }
    if (/snap/i.test(text2) && /reel/i.test(text2)) {
      deliverables.set("snap-reel", { id: "snap-reel", label: "Snap reel", kind: "video" });
    }
    if (/animated reel|walk-?through reel|3d animated/i.test(text2)) {
      deliverables.set("animated-reel", { id: "animated-reel", label: "Animated walk-through reel", kind: "video" });
    }
    if (/cinematic/i.test(text2) && /video/i.test(text2)) {
      deliverables.set("cinematic-video", { id: "cinematic-video", label: "Cinematic property video", kind: "video" });
    }
    if (/floor\s*plan|floorplan/i.test(text2)) {
      deliverables.set("floorplan", { id: "floorplan", label: "Floor plan", kind: "floorplan" });
    }
    if (/matterport|\b3d tour\b/i.test(text2)) {
      deliverables.set("tour-3d", { id: "tour-3d", label: "3D tour", kind: "capture" });
    }
    if (/same[- ]day/i.test(text2)) {
      deliverables.set("same-day", { id: "same-day", label: "Same-day delivery", kind: "delivery" });
    }
    if (/iconic finish|iconic polish/i.test(text2)) polishFromOrder = true;
  }
  const iconicPolish = input.iconicPolish === true || polishFromOrder;
  const count = Math.min(8, Math.max(0, twilightCount));
  const twilight = Array.from({ length: count }, (_, index) => {
    const role = twilightRole(index);
    return { slot: `twilight-${role}`, role, prompt: twilightPrompt(role, iconicPolish) };
  });
  return {
    packageName: collected.packageName,
    iconicPolish,
    polishFromOrder,
    photoPrompt: photoPrompt(iconicPolish),
    photoCount: photoFull ? null : photoCount,
    twilight,
    deliverables: [...deliverables.values()],
    galleryRelease: ORDER_GALLERY_RELEASE,
    notes: [
      "Image edits use the order. Photographers do not pick a preset per photo.",
      "Reels, aerial capture, floor plans, and delivery are not OpenAI image edits.",
      "The gallery stays held until the order is complete. This plan does not send it."
    ]
  };
}
function sourceScore(name, role) {
  const normalized = name.toLowerCase();
  if (role === "front" && /front|facade|elevation/.test(normalized)) return 5;
  if (role === "back" && /back|rear|pool/.test(normalized)) return 5;
  if (/exterior|outside/.test(normalized)) {
    if (role === "front" || role === "back") return 2;
    return 4;
  }
  if (/aerial|drone/.test(normalized)) return 0;
  return 0;
}
function previewable(frame) {
  if (frame.raw) return false;
  if (frame.previewable === false) return false;
  return Boolean(frame.path);
}
function orderEditDrafts(plan, frames) {
  const usable = frames.filter(previewable);
  const used = /* @__PURE__ */ new Set();
  const drafts = [];
  for (const slot of plan.twilight) {
    let best = null;
    let bestScore = 0;
    for (const frame of usable) {
      if (used.has(frame.path)) continue;
      const score = sourceScore(frame.name || frame.path, slot.role);
      if (score > bestScore) {
        best = frame;
        bestScore = score;
      }
    }
    if (best && bestScore > 0) used.add(best.path);
    const waiting = !best;
    drafts.push({
      slot: slot.slot,
      origin: "order",
      type: "twilight",
      label: `Twilight · ${slot.role}`,
      prompt: slot.prompt,
      sourcePath: best?.path || "",
      imageUrl: best?.url || "",
      fileName: best?.name || `${slot.slot}.jpg`,
      waitingNote: waiting ? `Waiting for a ${slot.role} exterior. The photographer is not asked to pick the edit.` : ""
    });
  }
  for (const frame of usable) {
    drafts.push({
      slot: photoSlot(frame.path),
      origin: "order",
      type: "photo",
      label: plan.iconicPolish ? "Photo · Iconic Polish" : "Photo",
      prompt: plan.photoPrompt,
      sourcePath: frame.path,
      imageUrl: frame.url,
      fileName: frame.name || "photo.jpg",
      waitingNote: ""
    });
  }
  return drafts;
}
function photoSlot(storagePath) {
  let hash = 2166136261;
  for (const char of storagePath) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `photo_${(hash >>> 0).toString(16)}`;
}
function orderEditDocId(listingId, slot) {
  const clean = `${listingId}_${slot}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 700);
  return `order_${clean}`;
}
const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_EDIT_MODEL = "gpt-image-1";
const OPENAI_IMAGE_EDIT_TIMEOUT_MS = 45e3;
const MAX_SOURCE_BYTES = 2e7;
class OpenAiEditError extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "OpenAiEditError";
    this.status = status;
  }
}
function readOpenAiApiKey(env) {
  return typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : "";
}
function imageSize(bytes) {
  if (bytes.length >= 24 && bytes[0] === 137 && bytes.toString("ascii", 1, 4) === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const format = bytes.toString("ascii", 12, 16);
    if (format === "VP8X" && bytes.length >= 30) {
      return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    }
    if (format === "VP8 " && bytes.length >= 30) {
      return { width: bytes.readUInt16LE(26) & 16383, height: bytes.readUInt16LE(28) & 16383 };
    }
    if (format === "VP8L" && bytes.length >= 25) {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 16383) + 1, height: (bits >> 14 & 16383) + 1 };
    }
  }
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 216 || marker === 217) {
        offset += 2;
        continue;
      }
      const size = bytes.readUInt16BE(offset + 2);
      if (marker >= 192 && marker <= 195) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (size < 2) break;
      offset += 2 + size;
    }
  }
  return null;
}
function editSizeForImage(bytes) {
  const size = imageSize(bytes);
  return listingPhotoEditSize(size?.width ?? 0, size?.height ?? 0);
}
function imagePart(bytes, contentType) {
  const type = contentType.includes("png") ? "image/png" : contentType.includes("webp") ? "image/webp" : "image/jpeg";
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return {
    blob: new Blob([new Uint8Array(bytes)], { type }),
    filename: `source.${extension}`
  };
}
function isTimeoutError(err) {
  if (!err || typeof err !== "object") return false;
  const name = err.name;
  return name === "TimeoutError" || name === "AbortError";
}
function openAiErrorNote(status, body) {
  let message = "";
  let code = "";
  try {
    const parsed = JSON.parse(body);
    message = String(parsed.error?.message || "").trim();
    code = String(parsed.error?.code || "").trim();
  } catch {
    message = "";
  }
  if (code === "moderation_blocked" || /moderation/i.test(message)) {
    return "OpenAI blocked this edit. Revise the prompt and queue it again.";
  }
  if (status === 401) return "OpenAI rejected the API key. Check OPENAI_API_KEY on the server.";
  if (status === 429) return "OpenAI rate limit reached. Wait a moment and queue the edit again.";
  const detail = message.replace(/\s+/g, " ").slice(0, 180);
  if (detail) return `OpenAI could not edit this photo (${status}). ${detail}`;
  return `OpenAI could not edit this photo (${status}). Queue the edit again.`;
}
async function editListingPhotoWithOpenAI(input) {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new OpenAiEditError("OPENAI_API_KEY is not configured on the server, so this photo was not edited.");
  if (!input.bytes.length) throw new OpenAiEditError("The source photo was empty.");
  if (input.bytes.length > MAX_SOURCE_BYTES) {
    throw new OpenAiEditError("That photo is over 20 MB. Export a smaller JPEG and queue the edit again.");
  }
  const prompt = input.prompt.trim();
  if (prompt.length < 3) throw new OpenAiEditError("Describe the AI edit.");
  const file = imagePart(input.bytes, input.contentType);
  const form = new FormData();
  form.append("model", OPENAI_IMAGE_EDIT_MODEL);
  form.append("prompt", prompt);
  form.append("image", file.blob, file.filename);
  form.append("n", "1");
  form.append("size", editSizeForImage(input.bytes));
  form.append("quality", "medium");
  form.append("output_format", "jpeg");
  form.append("output_compression", "85");
  form.append("input_fidelity", "high");
  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = input.timeoutMs ?? OPENAI_IMAGE_EDIT_TIMEOUT_MS;
  let response;
  try {
    response = await fetchImpl(OPENAI_IMAGE_EDITS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (isTimeoutError(err)) throw new OpenAiEditError(AI_EDIT_TIMEOUT_NOTE);
    throw new OpenAiEditError("Iconic Studio could not reach OpenAI. Queue the edit again.");
  }
  const body = await response.text();
  if (!response.ok) throw new OpenAiEditError(openAiErrorNote(response.status, body), response.status);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new OpenAiEditError("OpenAI returned an unreadable image edit.");
  }
  const encoded = parsed.data?.[0]?.b64_json || "";
  if (!encoded) throw new OpenAiEditError("OpenAI returned no edited image.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 32) throw new OpenAiEditError("OpenAI returned an empty edited image.");
  return { bytes, contentType: "image/jpeg" };
}
const db$6 = () => admin.firestore();
const bucket = () => admin.storage().bucket();
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
async function bumpRawIngestJob(input) {
  const file = {
    path: input.image.path,
    url: input.image.url || "",
    name: input.image.name || input.image.path.split("/").pop() || "raw",
    contentType: input.image.contentType || ""
  };
  const ref = db$6().collection("editJobs").doc(ingestJobId(input.listingId));
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      kind: "raw_ingest",
      type: "raw_ingest",
      listingId: input.listingId,
      status: "pending",
      note: "Edits begin",
      sourceFiles: [file],
      fileCount: 1,
      createdBy: input.uploadedBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { id: ref.id, created: true, fileCount: 1 };
  }
  const data = snap.data() || {};
  const files = Array.isArray(data.sourceFiles) ? data.sourceFiles : [];
  if (files.some((item) => item?.path === file.path)) {
    return { id: ref.id, created: false, fileCount: files.length };
  }
  await ref.update({
    sourceFiles: admin.firestore.FieldValue.arrayUnion(file),
    fileCount: admin.firestore.FieldValue.increment(1),
    status: "pending",
    note: "Edits begin",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { id: ref.id, created: false, fileCount: files.length + 1 };
}
async function loadListing$1(listingId) {
  const snap = await db$6().collection("listings").doc(listingId).get();
  if (!snap.exists) throw httpError(404, "Listing not found.");
  return { id: snap.id, ref: snap.ref, data: snap.data() || {} };
}
async function listingsForRole(uid, role) {
  if (role === "photographer") {
    const [byUid, byIds] = await Promise.all([
      db$6().collection("listings").where("photographerUid", "==", uid).limit(50).get(),
      db$6().collection("listings").where("photographerIds", "array-contains", uid).limit(50).get()
    ]);
    const merged = /* @__PURE__ */ new Map();
    for (const doc of [...byUid.docs, ...byIds.docs]) merged.set(doc.id, doc);
    return [...merged.values()].map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  const snap = await db$6().collection("listings").limit(80).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}
async function assertStudioAccess(uid, role, listingId) {
  if (role !== "photographer") {
    await loadListing$1(listingId);
    return;
  }
  const mine = await listingsForRole(uid, "photographer");
  if (!mine.some((item) => item.id === listingId)) {
    throw httpError(403, "This job is not assigned to you.");
  }
}
function listingFrames(data) {
  return (Array.isArray(data.images) ? data.images : []).map((item, index) => frameFromListingImage(item, index)).filter((frame) => Boolean(frame));
}
async function downloadListingImage(listingId, sourcePath, fileName, contentType) {
  if (!isListingStoragePath(listingId, sourcePath)) {
    throw new OpenAiEditError("That photo is not stored on this listing.");
  }
  if (!isStudioPreviewable(fileName, contentType)) {
    throw new OpenAiEditError("OpenAI can edit a JPEG, PNG, or WebP. RAW files stay in the queue until a preview exists.");
  }
  const file = bucket().file(sourcePath);
  const [exists] = await file.exists();
  if (!exists) throw new OpenAiEditError("Source photo was not found in storage.");
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  if (size > 2e7) {
    throw new OpenAiEditError("That photo is over 20 MB. Export a smaller JPEG and queue the edit again.");
  }
  const resolved = contentTypeForUpload(fileName, String(metadata.contentType || contentType || ""));
  if (resolved !== "image/jpeg" && resolved !== "image/png" && resolved !== "image/webp") {
    throw new OpenAiEditError("OpenAI can edit a JPEG, PNG, or WebP. RAW files stay in the queue until a preview exists.");
  }
  const [bytes] = await file.download();
  return { bytes, contentType: resolved };
}
async function runOpenAiEdit(input) {
  const apiKey = readOpenAiApiKey(process.env);
  if (!apiKey) throw new OpenAiEditError(AI_EDIT_MISSING_KEY_NOTE);
  const source = await downloadListingImage(input.listingId, input.sourcePath, input.fileName, input.contentType);
  const edited = await editListingPhotoWithOpenAI({
    apiKey,
    prompt: realEstateEditPrompt(input.prompt),
    bytes: source.bytes,
    contentType: source.contentType
  });
  const base = input.fileName.replace(/\.\w+$/, "") || "edit";
  const saved = await saveListingBytes(input.listingId, `${base}-ai.jpg`, "image/jpeg", "photos", edited.bytes);
  return { afterUrl: saved.url, resultPath: saved.storagePath };
}
function failureNote(err) {
  if (err instanceof OpenAiEditError) return err.message;
  return "The AI edit failed before a finished image was saved.";
}
async function loadOrderEditContext(listingId) {
  const listing = await loadListing$1(listingId);
  let order = null;
  const orderId = typeof listing.data.orderId === "string" ? listing.data.orderId : "";
  if (orderId) {
    const snap = await db$6().collection("orders").doc(orderId).get();
    if (snap.exists) order = snap.data() || {};
  }
  const plan = planOrderEdits({
    lineItems: listing.data.lineItems || order?.lineItems || order?.services,
    services: listing.data.services,
    serviceIds: listing.data.serviceIds,
    iconicPolish: listing.data.iconicPolish === true
  });
  return { listing, plan };
}
async function setIconicPolish(input) {
  const listing = await loadListing$1(input.listingId);
  await listing.ref.update({
    iconicPolish: input.iconicPolish,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  const { plan } = await loadOrderEditContext(input.listingId);
  return { iconicPolish: plan.iconicPolish, plan };
}
async function queueOrderEdits(input) {
  const { listing, plan } = await loadOrderEditContext(input.listingId);
  const frames = listingFrames(listing.data);
  const drafts = orderEditDrafts(plan, frames);
  const settled = /* @__PURE__ */ new Set(["review", "approved", "rejected", "processing"]);
  let prepared = 0;
  for (const draft of drafts) {
    const ref = db$6().collection("editJobs").doc(orderEditDocId(input.listingId, draft.slot));
    const snap = await ref.get();
    const current = snap.data() || {};
    if (snap.exists && settled.has(String(current.status || ""))) continue;
    const payload = {
      kind: "ai_edit",
      origin: "order",
      slot: draft.slot,
      type: draft.type,
      label: draft.label,
      listingId: input.listingId,
      status: "pending",
      provider: "openai",
      model: OPENAI_IMAGE_EDIT_MODEL,
      prompt: draft.prompt,
      sourcePath: draft.sourcePath,
      sourceUrl: draft.imageUrl,
      beforeUrl: draft.imageUrl,
      afterUrl: "",
      resultPath: "",
      placeholder: false,
      iconicPolish: plan.iconicPolish,
      note: draft.sourcePath ? "Queued from the order. OpenAI has not run this photo yet." : draft.waitingNote,
      createdBy: input.createdBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (!snap.exists) payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(payload, { merge: true });
    prepared += 1;
  }
  const jobSnap = await db$6().collection("editJobs").where("listingId", "==", input.listingId).limit(200).get();
  const pending = jobSnap.docs.filter((doc) => {
    const data2 = doc.data() || {};
    return data2.origin === "order" && data2.status === "pending" && typeof data2.sourcePath === "string" && data2.sourcePath;
  });
  const waiting = jobSnap.docs.filter((doc) => {
    const data2 = doc.data() || {};
    return data2.origin === "order" && data2.status === "pending" && !data2.sourcePath;
  }).length;
  pending.sort((a, b) => {
    const rank = (doc) => doc.data().type === "twilight" ? 0 : 1;
    return rank(a) - rank(b);
  });
  const next = pending[0];
  if (!next) {
    return { plan, prepared, ran: null, remaining: 0, waiting };
  }
  const data = next.data() || {};
  await next.ref.update({
    status: "processing",
    note: "Editing this photo with OpenAI.",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  const fileName = String(data.sourcePath || "").split("/").pop() || "photo.jpg";
  try {
    const saved = await runOpenAiEdit({
      listingId: input.listingId,
      sourcePath: String(data.sourcePath),
      fileName,
      contentType: "",
      prompt: String(data.prompt || plan.photoPrompt)
    });
    await next.ref.update({
      status: "review",
      beforeUrl: data.beforeUrl || data.sourceUrl || "",
      afterUrl: saved.afterUrl,
      resultPath: saved.resultPath,
      placeholder: false,
      note: AI_EDIT_READY_NOTE,
      pipeline: ["pending", "processing", "review"],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      plan,
      prepared,
      remaining: Math.max(0, pending.length - 1),
      waiting,
      ran: {
        jobId: next.id,
        status: "review",
        beforeUrl: String(data.beforeUrl || data.sourceUrl || ""),
        afterUrl: saved.afterUrl,
        resultPath: saved.resultPath,
        placeholder: false,
        note: AI_EDIT_READY_NOTE
      }
    };
  } catch (err) {
    const note = failureNote(err);
    console.error("[Studio AI]", err instanceof Error ? err.message : err);
    await next.ref.update({
      status: "failed",
      placeholder: false,
      afterUrl: "",
      note,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      plan,
      prepared,
      remaining: Math.max(0, pending.length - 1),
      waiting,
      ran: {
        jobId: next.id,
        status: "failed",
        beforeUrl: String(data.beforeUrl || data.sourceUrl || ""),
        afterUrl: "",
        placeholder: false,
        note
      }
    };
  }
}
async function enqueueAiEdit(input) {
  const listing = await loadListing$1(input.listingId);
  const frame = listingFrames(listing.data).find((item) => item.path === input.sourcePath);
  if (!frame) throw httpError(404, "That file is not on this listing.");
  if (!isStudioPreviewable(frame.name, frame.contentType)) {
    throw httpError(400, "Choose a JPEG, PNG, or WebP. RAW stays in the queue until a preview exists.");
  }
  const beforeUrl = frame.url || input.imageUrl;
  const ref = await db$6().collection("editJobs").add({
    kind: "ai_edit",
    origin: "staff_override",
    type: input.type,
    listingId: input.listingId,
    status: "processing",
    provider: "openai",
    model: OPENAI_IMAGE_EDIT_MODEL,
    prompt: input.prompt,
    sourcePath: input.sourcePath,
    sourceUrl: beforeUrl,
    beforeUrl,
    afterUrl: "",
    placeholder: false,
    note: "Editing this photo with OpenAI.",
    createdBy: input.createdBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  try {
    const saved = await runOpenAiEdit({
      listingId: input.listingId,
      sourcePath: input.sourcePath,
      fileName: frame.name,
      contentType: frame.contentType,
      prompt: input.prompt
    });
    await ref.update({
      status: "review",
      afterUrl: saved.afterUrl,
      resultPath: saved.resultPath,
      placeholder: false,
      note: AI_EDIT_READY_NOTE,
      pipeline: ["pending", "processing", "review"],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      id: ref.id,
      status: "review",
      provider: "openai",
      beforeUrl,
      afterUrl: saved.afterUrl,
      resultPath: saved.resultPath,
      placeholder: false,
      note: AI_EDIT_READY_NOTE
    };
  } catch (err) {
    const note = failureNote(err);
    console.error("[Studio AI]", err instanceof Error ? err.message : err);
    await ref.update({
      status: "failed",
      placeholder: false,
      afterUrl: "",
      note,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return {
      id: ref.id,
      status: "failed",
      provider: "openai",
      beforeUrl,
      afterUrl: "",
      placeholder: false,
      note
    };
  }
}
async function rejectStudioJob(input) {
  const ref = db$6().collection("editJobs").doc(input.jobId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "Edit job not found.");
  const job = snap.data() || {};
  if (job.listingId !== input.listingId) throw httpError(400, "That job is for a different listing.");
  if (job.status === "approved") throw httpError(400, "Approved finals stay on the listing.");
  const note = job.status === "failed" ? String(job.note || "Rejected.") : "Rejected before approval. The edited image was not added to the gallery.";
  await ref.set({
    status: "rejected",
    rejectedBy: input.rejectedBy,
    note,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { id: input.jobId, status: "rejected", note };
}
async function saveAdjustedJpeg(input) {
  if (!input.bytes.length) throw httpError(400, "Adjusted JPEG was empty.");
  if (input.bytes.length > 45e5) throw httpError(413, "Adjusted JPEG is too large.");
  if (!isListingStoragePath(input.listingId, input.sourcePath)) {
    throw httpError(400, "sourcePath must belong to this listing.");
  }
  const adjustments = clampAdjustments(input.adjustments);
  const saved = await saveListingBytes(
    input.listingId,
    input.fileName.replace(/\.\w+$/, "") + "-adjusted.jpg",
    "image/jpeg",
    "photos",
    input.bytes
  );
  const registered = await registerListingPhoto({
    listingId: input.listingId,
    storagePath: saved.storagePath,
    fileName: input.fileName.replace(/\.\w+$/, "") + "-adjusted.jpg",
    contentType: "image/jpeg",
    uploadedBy: input.uploadedBy,
    existingUrl: saved.url,
    extra: { studioRole: "adjusted", sourcePath: input.sourcePath }
  });
  const job = await db$6().collection("editJobs").add({
    kind: "adjust",
    type: "adjust",
    listingId: input.listingId,
    status: "review",
    sourcePath: input.sourcePath,
    resultPath: saved.storagePath,
    beforeUrl: "",
    afterUrl: saved.url,
    adjustments,
    provider: "canvas",
    note: "Client-side JPEG saved to the listing photos folder.",
    createdBy: input.uploadedBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { jobId: job.id, image: registered.image, adjustments };
}
async function copyToFinals(listingId, sourcePath, fileName) {
  if (!isListingStoragePath(listingId, sourcePath)) {
    throw httpError(400, "That file is not stored on this listing.");
  }
  if (sourcePath.includes("/finals/")) {
    const file = bucket().file(sourcePath);
    const [exists2] = await file.exists();
    if (!exists2) throw httpError(400, "Final file was not found in storage.");
    const [metadata2] = await file.getMetadata();
    const current = metadata2.metadata?.firebaseStorageDownloadTokens;
    const token2 = typeof current === "string" && current ? current.split(",")[0] : randomUUID();
    return {
      storagePath: sourcePath,
      url: firebaseDownloadUrl(bucket().name, sourcePath, token2),
      contentType: metadata2.contentType || "image/jpeg",
      copied: false
    };
  }
  if (isRawStudioFile(fileName, "")) {
    throw httpError(400, `${fileName} is RAW. Import it for the AI queue, then approve a JPEG, PNG, or WebP final.`);
  }
  if (!isStudioPreviewable(fileName)) {
    throw httpError(400, "Approve a JPEG, PNG, or WebP. RAW stays in the AI queue.");
  }
  const destPath = finalsObjectPath(listingId, fileName);
  const source = bucket().file(sourcePath);
  const [exists] = await source.exists();
  if (!exists) throw httpError(400, "Source file was not found in storage.");
  const dest = bucket().file(destPath);
  await source.copy(dest);
  const [metadata] = await source.getMetadata();
  const token = randomUUID();
  const contentType = metadata.contentType || "image/jpeg";
  await dest.setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: token }
  });
  return {
    storagePath: destPath,
    url: firebaseDownloadUrl(bucket().name, destPath, token),
    contentType,
    copied: true
  };
}
async function addFinalToGalleries(listingId, listing, image) {
  const ids = /* @__PURE__ */ new Set();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  const snap = await db$6().collection("galleries").where("listingId", "==", listingId).limit(10).get();
  snap.docs.forEach((doc) => ids.add(doc.id));
  const updated = [];
  for (const galleryId of ids) {
    const ref = db$6().collection("galleries").doc(galleryId);
    const gallerySnap = await ref.get();
    if (!gallerySnap.exists) continue;
    const data = gallerySnap.data() || {};
    const items = Array.isArray(data.mediaItems) ? data.mediaItems : [];
    if (items.some((item) => item?.storagePath === image.path)) {
      updated.push(galleryId);
      continue;
    }
    const mediaItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: image.url,
      shareUrl: image.url,
      fileName: image.name,
      title: image.name,
      type: "photo",
      storagePath: image.path,
      downloadable: true,
      isEdited: true,
      isRaw: false,
      uploadedBy: image.uploadedBy,
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await ref.update({
      mediaItems: [...items, mediaItem],
      status: galleryStatusAfterStudioAdd(typeof data.status === "string" ? data.status : void 0),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    updated.push(galleryId);
  }
  return updated;
}
async function approveStudioFinal(input) {
  const listing = await loadListing$1(input.listingId);
  const name = safeStorageFileName(input.fileName || input.sourcePath.split("/").pop() || "final.jpg");
  const copied = await copyToFinals(input.listingId, input.sourcePath, name);
  const registered = await registerListingPhoto({
    listingId: input.listingId,
    storagePath: copied.storagePath,
    fileName: name,
    contentType: copied.contentType,
    uploadedBy: input.uploadedBy,
    existingUrl: copied.url,
    extra: { studioApproved: true, studioRole: "final", sourcePath: input.sourcePath }
  });
  const galleries = await addFinalToGalleries(input.listingId, listing.data, {
    url: copied.url,
    name,
    path: copied.storagePath,
    contentType: copied.contentType,
    uploadedBy: input.uploadedBy
  });
  if (input.jobId) {
    await db$6().collection("editJobs").doc(input.jobId).set({
      status: "approved",
      resultPath: copied.storagePath,
      resultUrl: copied.url,
      afterUrl: copied.url,
      approvedBy: input.uploadedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return {
    image: registered.image,
    galleries,
    copied: copied.copied,
    note: galleries.length ? "Final copied onto the listing and added to the gallery. No client email was sent." : "Final copied onto the listing images. No gallery is linked yet, and no client email was sent."
  };
}
async function loadStudioWorkspace(input) {
  const listings = await listingsForRole(input.uid, input.role);
  const allowed = new Set(listings.map((item) => item.id));
  const jobSnap = await db$6().collection("editJobs").limit(150).get();
  const jobs = jobSnap.docs.map((doc) => jsonSafe({ id: doc.id, ...doc.data() })).filter((job) => {
    const listingId = String(job.listingId || "");
    if (input.role === "photographer") return allowed.has(listingId);
    return true;
  }).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  let listing = null;
  if (input.listingId) {
    if (input.role === "photographer" && !allowed.has(input.listingId)) {
      throw httpError(403, "This job is not assigned to you.");
    }
    const loaded = await loadListing$1(input.listingId);
    const images = listingFrames(loaded.data);
    let editPlan = null;
    try {
      editPlan = (await loadOrderEditContext(input.listingId)).plan;
    } catch (err) {
      console.error("[Studio AI] Order plan failed:", err instanceof Error ? err.message : err);
    }
    listing = {
      id: loaded.id,
      address: listingAddressLabel(loaded.data),
      status: loaded.data.status || "",
      galleryId: loaded.data.galleryId || loaded.data.playtestGalleryId || "",
      iconicPolish: loaded.data.iconicPolish === true,
      images,
      editPlan
    };
  }
  return {
    flags: {
      teamStudio: true,
      agentUpsell: false,
      outsidePhotographerSaas: false,
      canvaBrand: false
    },
    listings: listings.map((item) => ({
      id: item.id,
      address: listingAddressLabel(item.data),
      status: item.data.status || "",
      imageCount: Array.isArray(item.data.images) ? item.data.images.length : 0
    })),
    jobs,
    listing
  };
}
const router$9 = Router();
const db$5 = () => admin.firestore();
const DIRECT_UPLOAD_LIMIT = 3e6;
function adminReady$1(res) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET."
  });
  return false;
}
function folderFrom(value) {
  return value === "raw" ? "raw" : "photos";
}
async function loadListing(id) {
  const snap = await db$5().collection("listings").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}
async function assertListingAccess(req, listingId) {
  const listing = await loadListing(listingId);
  if (!listing) {
    const error = Object.assign(new Error("Listing not found."), { status: 404 });
    throw error;
  }
  const staffDoc = await db$5().collection("staff").doc(req.user.uid).get();
  if (staffDoc.exists && staffDoc.data()?.isActive !== false) {
    const role = String(staffDoc.data()?.role || req.staffRole || "");
    if (!staffCanAccessListing(role, req.user.uid, listing)) {
      throw Object.assign(new Error("This job is not assigned to you."), { status: 403 });
    }
    return listing;
  }
  const identity = await resolveClientIdentity(req.user.uid, req.user.email);
  if (!clientCanViewListing(listing, { uid: req.user.uid, email: identity.email, ids: identity.ids })) {
    throw Object.assign(new Error("You do not have access to this project."), { status: 403 });
  }
  return listing;
}
async function noteRawUpload(listingId, image, uploadedBy) {
  if (!image?.path || !shouldBumpStudioQueue(image.path)) return;
  try {
    await bumpRawIngestJob({ listingId, image: { ...image, path: image.path }, uploadedBy });
  } catch (err) {
    console.error("[Studio] Raw upload saved, but the edit queue was not bumped.", err);
  }
}
function sendKnownError$1(res, err, fallback) {
  const status = err.status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Listings]", err);
  return res.status(500).json({ error: fallback });
}
router$9.get("/assigned", requirePhotographer, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const uid = req.user.uid;
    const role = req.staffRole || "";
    let docs = [];
    if (role === "admin" || role === "coordinator") {
      const snap = await db$5().collection("listings").limit(100).get();
      docs = snap.docs;
    } else {
      const [byUid, byIds] = await Promise.all([
        db$5().collection("listings").where("photographerUid", "==", uid).limit(50).get(),
        db$5().collection("listings").where("photographerIds", "array-contains", uid).limit(50).get()
      ]);
      const merged = /* @__PURE__ */ new Map();
      for (const doc of [...byUid.docs, ...byIds.docs]) merged.set(doc.id, doc);
      docs = [...merged.values()];
    }
    const listings = docs.map((doc) => serializeDoc(doc.id, doc.data())).sort((a, b) => {
      const aTime = Date.parse(String(a.apptDate || a.shootDate || "")) || 0;
      const bTime = Date.parse(String(b.apptDate || b.shootDate || "")) || 0;
      return bTime - aTime;
    });
    return res.json({ listings });
  } catch (err) {
    console.error("[Listings] Assigned fetch error:", err);
    return res.status(500).json({ error: "Failed to load assigned jobs." });
  }
});
router$9.get("/:id", requireAuth, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const listing = await assertListingAccess(req, req.params.id);
    const staffDoc = await db$5().collection("staff").doc(req.user.uid).get();
    const payload = serializeDoc(listing.id, listing);
    if (!staffDoc.exists) {
      delete payload.notes;
      delete payload.internalNotes;
    }
    return res.json(payload);
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to load listing.");
  }
});
router$9.post("/:id/photos/upload-url", requirePhotographer, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const fileName = safeStorageFileName(req.body?.fileName);
    if (!fileName) ;
    await assertListingAccess(req, req.params.id);
    const folder = folderFrom(req.body?.folder);
    const ticket = await createListingUploadUrl(
      req.params.id,
      fileName,
      contentTypeForUpload(fileName, req.body?.contentType),
      folder
    );
    return res.json(ticket);
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to prepare the upload. Check FIREBASE_STORAGE_BUCKET.");
  }
});
router$9.post("/:id/photos", requirePhotographer, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const listingId = req.params.id;
    await assertListingAccess(req, listingId);
    const fileName = safeStorageFileName(req.body?.fileName || "upload");
    const folder = folderFrom(req.body?.folder);
    if (typeof req.body?.dataBase64 === "string" && req.body.dataBase64) {
      const bytes = Buffer.from(req.body.dataBase64, "base64");
      if (!bytes.length) return res.status(400).json({ error: "Upload body was empty." });
      if (bytes.length > DIRECT_UPLOAD_LIMIT) {
        return res.status(413).json({ error: "File is too large for a direct API upload. Use the signed upload URL." });
      }
      const saved = await saveListingBytes(listingId, fileName, req.body?.contentType, folder, bytes);
      const registered2 = await registerListingPhoto({
        listingId,
        storagePath: saved.storagePath,
        fileName,
        contentType: saved.contentType,
        uploadedBy: req.user.uid,
        existingUrl: saved.url
      });
      await noteRawUpload(listingId, registered2.image, req.user.uid);
      return res.status(201).json({ success: true, ...registered2 });
    }
    const storagePath = req.body?.storagePath;
    if (!isListingStoragePath(listingId, storagePath)) {
      return res.status(400).json({ error: "storagePath must be a photos or raw path for this listing." });
    }
    const registered = await registerListingPhoto({
      listingId,
      storagePath,
      fileName,
      contentType: req.body?.contentType,
      uploadedBy: req.user.uid
    });
    await noteRawUpload(listingId, registered.image, req.user.uid);
    return res.status(201).json({ success: true, ...registered });
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to save the uploaded photo.");
  }
});
const router$8 = Router();
const db$4 = () => admin.firestore();
function mailchimpConfig() {
  const apiKey = process.env.MAILCHIMP_API_KEY || "";
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX || apiKey.split("-").pop() || "";
  return { apiKey, serverPrefix };
}
async function mailchimpRequest(path2, init = {}) {
  const { apiKey, serverPrefix } = mailchimpConfig();
  if (!apiKey || !serverPrefix) {
    throw new Error("Mailchimp is not configured. Set MAILCHIMP_API_KEY.");
  }
  const auth = Buffer.from(`iconic:${apiKey}`).toString("base64");
  const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0${path2}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Mailchimp request failed.";
    throw new Error(detail);
  }
  return data;
}
router$8.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$4().collection("campaigns").orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch campaigns." });
  }
});
router$8.get("/mailchimp/status", requireCoordinator, async (_req, res) => {
  try {
    const { apiKey, serverPrefix } = mailchimpConfig();
    if (!apiKey || !serverPrefix) {
      return res.json({
        connected: false,
        message: "Add MAILCHIMP_API_KEY to enable Mailchimp.",
        lists: []
      });
    }
    const account = await mailchimpRequest("/");
    const listsData = await mailchimpRequest("/lists?count=20&fields=lists.id,lists.name,lists.stats.member_count,lists.stats.unsubscribe_count");
    return res.json({
      connected: true,
      accountName: account.account_name || account.username || "Mailchimp",
      serverPrefix,
      lists: (listsData.lists || []).map((list) => ({
        id: list.id,
        name: list.name,
        memberCount: list.stats?.member_count || 0,
        unsubscribeCount: list.stats?.unsubscribe_count || 0
      }))
    });
  } catch (err) {
    console.error("[Campaigns] Mailchimp status error:", err);
    return res.status(500).json({
      connected: false,
      error: err instanceof Error ? err.message : "Mailchimp connection failed."
    });
  }
});
router$8.post("/mailchimp/sync", requireCoordinator, async (req, res) => {
  try {
    const { listId, audience = "all" } = req.body;
    if (!listId) return res.status(400).json({ error: "listId required." });
    let recipientQuery = db$4().collection("clients").where("status", "==", "active");
    if (audience === "vip") {
      recipientQuery = db$4().collection("clients").where("status", "==", "vip");
    }
    const clientsSnap = await recipientQuery.get();
    const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((client) => client.email && client.emailMarketingOptOut !== true);
    let synced = 0;
    const errors = [];
    for (const client of clients) {
      const email = String(client.email).toLowerCase().trim();
      const hash = crypto.createHash("md5").update(email).digest("hex");
      const mergeFields = {
        FNAME: client.firstName || "",
        LNAME: client.lastName || ""
      };
      const tags = ["Iconic Images", audience === "vip" ? "VIP" : "Client"].filter(Boolean);
      try {
        await mailchimpRequest(`/lists/${listId}/members/${hash}`, {
          method: "PUT",
          body: JSON.stringify({
            email_address: email,
            status_if_new: "subscribed",
            status: client.mailchimpStatus || "subscribed",
            merge_fields: mergeFields
          })
        });
        await mailchimpRequest(`/lists/${listId}/members/${hash}/tags`, {
          method: "POST",
          body: JSON.stringify({
            tags: tags.map((name) => ({ name, status: "active" }))
          })
        });
        synced++;
      } catch (err) {
        errors.push({
          email,
          error: err instanceof Error ? err.message : "Sync failed"
        });
      }
    }
    await db$4().collection("agentLogs").add({
      agent: "remmi",
      action: "Mailchimp sync",
      summary: `Synced ${synced} clients to Mailchimp list ${listId}`,
      status: errors.length ? "flagged" : "completed",
      relatedType: "campaign",
      priority: errors.length ? "medium" : "low",
      requiresHumanReview: errors.length > 0,
      details: { listId, audience, synced, failed: errors.length, errors: errors.slice(0, 20) },
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {
    });
    return res.json({ success: true, synced, failed: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error("[Campaigns] Mailchimp sync error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to sync Mailchimp." });
  }
});
router$8.post("/", requireCoordinator, async (req, res) => {
  try {
    const { name, type, subject, body, audience, audienceIds, scheduledAt } = req.body;
    if (!name || !body || !audience) {
      return res.status(400).json({ error: "name, body, and audience required." });
    }
    const ref = await db$4().collection("campaigns").add({
      name,
      type: type || "email",
      status: "draft",
      subject: subject || "",
      body,
      audience,
      audienceIds: audienceIds || [],
      scheduledAt: scheduledAt ? admin.firestore.Timestamp.fromDate(new Date(scheduledAt)) : null,
      stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create campaign." });
  }
});
router$8.post("/:id/send", requireCoordinator, async (req, res) => {
  try {
    const campaignDoc = await db$4().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });
    const campaign = campaignDoc.data();
    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Campaign already sent." });
    }
    if (!clientNotifyLive()) {
      console.warn(`[Campaigns] Suppressed send for ${req.params.id} — ${clientNotifyBlockReason()}.`);
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }
    let recipientQuery = db$4().collection("clients").where("status", "==", "active");
    if (campaign.audience === "vip") {
      recipientQuery = db$4().collection("clients").where("status", "==", "vip");
    }
    const clientsSnap = await recipientQuery.get();
    let clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (campaign.audience === "custom" && campaign.audienceIds?.length) {
      clients = clients.filter((c) => campaign.audienceIds.includes(c.id));
    }
    await campaignDoc.ref.update({ status: "sending", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    let sentCount = 0;
    if (campaign.type === "sms") {
      const recipients = clients.filter((c) => c.phone && c.smsOptIn !== false).map((c) => ({
        phone: c.phone,
        name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || "there"
      }));
      const results = await sendSMSCampaign(
        recipients,
        campaign.body,
        campaign.messagingServiceSid || void 0
      );
      sentCount = results.filter((r) => r.sid).length;
    } else {
      for (const client of clients) {
        if (!client.email) continue;
        try {
          await sendEmail({
            to: client.email,
            template: "marketing",
            subject: campaign.subject,
            variables: {
              clientName: `${client.firstName} ${client.lastName}`,
              body: campaign.body
            }
          });
          sentCount++;
        } catch {
        }
      }
    }
    await campaignDoc.ref.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      "stats.sent": sentCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, sent: sentCount });
  } catch (err) {
    console.error("[Campaigns] Send error:", err);
    await db$4().collection("campaigns").doc(req.params.id).update({ status: "draft" }).catch(() => {
    });
    return res.status(500).json({ error: "Failed to send campaign." });
  }
});
const router$7 = Router();
const db$3 = () => admin.firestore();
function isAgentAuthorized(req) {
  const serviceKey = req.headers["x-agent-key"];
  const auth = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const agentKey = process.env.AGENT_SERVICE_KEY;
  const keyOk = Boolean(agentKey) && serviceKey === agentKey;
  const cronOk = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`;
  return keyOk || cronOk;
}
function toDate(value) {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function addressLabel$1(address) {
  if (!address) return "the property";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address;
    if (typeof a.formatted === "string" && a.formatted) return a.formatted;
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "the property";
  }
  return String(address);
}
function combineDateAndTime(date, time) {
  if (!date) return null;
  const combined = new Date(date);
  if (typeof time !== "string" || !time.trim()) return combined;
  const trimmed = time.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return combined;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hours < 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}
function sameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
async function loadOrderForAppointment(appointment) {
  if (!appointment.orderId) return null;
  const orderDoc = await db$3().collection("orders").doc(String(appointment.orderId)).get();
  return orderDoc.exists ? { id: orderDoc.id, ref: orderDoc.ref, data: orderDoc.data() || {} } : null;
}
router$7.get("/briefing", requireStaff, async (_req, res) => {
  try {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = admin.firestore.Timestamp.fromDate(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTs = admin.firestore.Timestamp.fromDate(yesterday);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTs = admin.firestore.Timestamp.fromDate(tomorrow);
    const [
      pendingRequests,
      todayAppointments,
      tomorrowAppointments,
      unreviewedFlags,
      urgentFlags,
      pendingGalleries,
      overdueInvoices,
      recentLogs
    ] = await Promise.all([
      db$3().collection("orderRequests").where("status", "==", "new").get(),
      db$3().collection("appointments").where("scheduledDate", ">=", todayTs).where("scheduledDate", "<", tomorrowTs).where("status", "in", ["confirmed", "scheduled"]).get(),
      db$3().collection("appointments").where("scheduledDate", ">=", tomorrowTs).where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(
        new Date(tomorrow.getTime() + 24 * 60 * 60 * 1e3)
      )).where("status", "in", ["confirmed", "scheduled"]).get(),
      db$3().collection("agentLogs").where("requiresHumanReview", "==", true).where("reviewedAt", "==", null).orderBy("createdAt", "desc").limit(20).get(),
      db$3().collection("agentLogs").where("priority", "==", "urgent").where("requiresHumanReview", "==", true).orderBy("createdAt", "desc").limit(5).get(),
      db$3().collection("galleries").where("status", "in", ["raw_uploaded", "editing"]).get(),
      db$3().collection("invoices").where("status", "==", "overdue").get(),
      db$3().collection("agentLogs").where("createdAt", ">=", yesterdayTs).orderBy("createdAt", "desc").limit(50).get()
    ]);
    const agentSummaries = {
      nora: {
        name: "Nora",
        role: "Operations",
        emoji: "⚙️",
        items: [
          `${pendingRequests.size} pending booking request${pendingRequests.size !== 1 ? "s" : ""} awaiting review`,
          `${todayAppointments.size} appointment${todayAppointments.size !== 1 ? "s" : ""} scheduled today`,
          `${tomorrowAppointments.size} appointment${tomorrowAppointments.size !== 1 ? "s" : ""} tomorrow`,
          `${pendingGalleries.size} galler${pendingGalleries.size !== 1 ? "ies" : "y"} in editing pipeline`
        ],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "nora").map((d) => ({ id: d.id, ...d.data() }))
      },
      travis: {
        name: "Travis",
        role: "Accounting & Finance",
        emoji: "💰",
        items: [
          `${overdueInvoices.size} overdue invoice${overdueInvoices.size !== 1 ? "s" : ""}`
        ],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "travis").map((d) => ({ id: d.id, ...d.data() }))
      },
      brady: {
        name: "Brady",
        role: "Quality Control",
        emoji: "🔍",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "brady").map((d) => ({ id: d.id, ...d.data() }))
      },
      lena: {
        name: "Lena",
        role: "Sales",
        emoji: "🎯",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "lena").map((d) => ({ id: d.id, ...d.data() }))
      },
      remmi: {
        name: "Remmi",
        role: "Marketing & Social",
        emoji: "📱",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "remmi").map((d) => ({ id: d.id, ...d.data() }))
      },
      grant: {
        name: "Grant",
        role: "Training & Onboarding",
        emoji: "📚",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "grant").map((d) => ({ id: d.id, ...d.data() }))
      }
    };
    return res.json({
      briefingDate: (/* @__PURE__ */ new Date()).toISOString(),
      urgentCount: urgentFlags.size,
      urgentItems: urgentFlags.docs.map((d) => ({ id: d.id, ...d.data() })),
      agents: agentSummaries,
      recentActivity: recentLogs.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() })),
      todayAppointments: todayAppointments.docs.map((d) => ({ id: d.id, ...d.data() }))
    });
  } catch (err) {
    console.error("[Agents] Briefing error:", err);
    return res.status(500).json({ error: "Failed to generate briefing." });
  }
});
async function runReminderSweep(req, res) {
  try {
    if (!isAgentAuthorized(req)) {
      return res.status(401).json({ error: "Invalid agent key." });
    }
    const now = /* @__PURE__ */ new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const twoDaysOut = new Date(today);
    twoDaysOut.setDate(twoDaysOut.getDate() + 2);
    const appointments = await db$3().collection("appointments").where("scheduledDate", ">=", admin.firestore.Timestamp.fromDate(today)).where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(twoDaysOut)).get();
    const results = [];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    for (const appointmentDoc of appointments.docs) {
      const appointment = appointmentDoc.data();
      const status = String(appointment.status || "").toLowerCase();
      if (!["confirmed", "scheduled"].includes(status)) continue;
      const scheduledDate = toDate(appointment.scheduledDate);
      if (!scheduledDate) continue;
      const orderRecord = await loadOrderForAppointment(appointment);
      const order = orderRecord?.data || {};
      const merged = { ...appointment, ...order };
      const sent = appointment.remindersSent || {};
      const orderId = String(appointment.orderId || orderRecord?.id || appointmentDoc.id);
      const phone = merged.clientPhone || merged.phone;
      const name = merged.firstName || merged.clientName?.split(" ")?.[0] || "there";
      const time = merged.scheduledTime || merged.appointmentTime || "your appointment time";
      const address = merged.addressLabel || addressLabel$1(merged.address || merged.propertyAddress);
      const dueTypes = [];
      if (!sent["24h"] && sameCalendarDay(scheduledDate, tomorrow)) {
        dueTypes.push("24h");
      }
      const scheduledAt = combineDateAndTime(scheduledDate, time);
      const minutesUntil = scheduledAt ? (scheduledAt.getTime() - now.getTime()) / 6e4 : Number.POSITIVE_INFINITY;
      if (!sent["1h"] && minutesUntil >= 45 && minutesUntil <= 75) {
        dueTypes.push("1h");
      }
      let sentMap = { ...sent };
      for (const type of dueTypes) {
        if (!phone) {
          results.push({ appointmentId: appointmentDoc.id, orderId, type, skipped: "missing_phone" });
          continue;
        }
        const body = type === "1h" ? SMS_TEMPLATES.appointmentReminder1h(name, String(time)) : SMS_TEMPLATES.appointmentReminder24h(name, scheduledDate.toLocaleDateString("en-US"), String(time), String(address));
        try {
          const result = await sendSMS({ to: String(phone), body });
          if (result.suppressed) {
            results.push({ appointmentId: appointmentDoc.id, orderId, type, skipped: "client_notify_off" });
            continue;
          }
          sentMap = { ...sentMap, [type]: true };
          const update = {
            remindersSent: sentMap,
            [`reminder${type === "24h" ? "24h" : "1h"}SentAt`]: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          await Promise.all([
            appointmentDoc.ref.update(update),
            orderRecord?.ref.update(update) || Promise.resolve(),
            db$3().collection("smsLogs").add({
              direction: "outbound",
              to: normalisePhone(String(phone)),
              body,
              sid: result.sid,
              status: result.status,
              type: `reminder_${type}`,
              orderId,
              appointmentId: appointmentDoc.id,
              sentBy: "aicon-reminder-runner",
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            })
          ]);
          results.push({ appointmentId: appointmentDoc.id, orderId, type, sent: true, sid: result.sid });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db$3().collection("agentLogs").add({
            agent: "nora",
            action: "Reminder send failed",
            summary: `Reminder ${type} failed for order ${orderId}`,
            status: "flagged",
            relatedId: orderId,
            relatedType: "order",
            priority: "high",
            requiresHumanReview: true,
            details: message,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.push({ appointmentId: appointmentDoc.id, orderId, type, error: message });
        }
      }
    }
    return res.json({
      success: true,
      checked: appointments.size,
      sent: results.filter((r) => r.sent).length,
      results
    });
  } catch (err) {
    console.error("[Agents] Reminder sweep error:", err);
    return res.status(500).json({ error: "Failed to run reminder sweep." });
  }
}
router$7.get("/run-reminders", runReminderSweep);
router$7.post("/run-reminders", runReminderSweep);
router$7.get("/logs", requireStaff, async (req, res) => {
  try {
    const { agent, status, requiresReview, limit = "50" } = req.query;
    let query = db$3().collection("agentLogs").orderBy("createdAt", "desc");
    if (agent) query = query.where("agent", "==", agent);
    if (status) query = query.where("status", "==", status);
    if (requiresReview === "true") {
      query = query.where("requiresHumanReview", "==", true);
    }
    const snapshot = await query.limit(Number(limit)).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch agent logs." });
  }
});
router$7.patch("/logs/:id/resolve", requireCoordinator, async (req, res) => {
  try {
    const { notes } = req.body;
    await db$3().collection("agentLogs").doc(req.params.id).update({
      requiresHumanReview: false,
      status: "completed",
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: req.user.uid,
      resolvedNotes: notes || ""
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to resolve flag." });
  }
});
router$7.post("/log", async (req, res) => {
  try {
    if (!isAgentAuthorized(req)) {
      return res.status(401).json({ error: "Invalid agent key." });
    }
    const {
      agent,
      action,
      summary,
      status,
      relatedId,
      relatedType,
      priority,
      requiresHumanReview,
      details
    } = req.body;
    if (!agent || !action || !summary) {
      return res.status(400).json({ error: "agent, action, and summary required." });
    }
    const ref = await db$3().collection("agentLogs").add({
      agent,
      action,
      summary,
      status: status || "completed",
      relatedId: relatedId || null,
      relatedType: relatedType || null,
      priority: priority || "normal",
      requiresHumanReview: requiresHumanReview || false,
      details: details || "",
      reviewedAt: null,
      reviewedBy: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to log agent action." });
  }
});
const router$6 = Router();
const db$2 = () => admin.firestore();
router$6.get("/", requireStaff, async (req, res) => {
  try {
    const { status, listingId, orderId, limit = "100" } = req.query;
    let q = db$2().collection("mediaJobs").orderBy("createdAt", "desc");
    if (status) q = q.where("status", "==", status);
    if (listingId) q = q.where("listingId", "==", listingId);
    if (orderId) q = q.where("orderId", "==", orderId);
    const snapshot = await q.limit(Math.min(Number(limit), 200)).get();
    return res.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.error("[MediaJobs] List error:", err);
    return res.status(500).json({ error: "Failed to fetch media jobs." });
  }
});
router$6.post("/", requireStaff, async (req, res) => {
  try {
    const {
      listingId,
      orderId,
      galleryId,
      provider = process.env.AI_PHOTO_PROVIDER || "aicon",
      preset = "real_estate_standard",
      notes = "",
      mediaItems = [],
      requirements = {}
    } = req.body;
    if (!listingId && !orderId && !galleryId) {
      return res.status(400).json({ error: "listingId, orderId, or galleryId required." });
    }
    if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
      return res.status(400).json({ error: "At least one media item is required." });
    }
    const ref = await db$2().collection("mediaJobs").add({
      listingId: listingId || null,
      orderId: orderId || null,
      galleryId: galleryId || null,
      provider,
      preset,
      notes,
      requirements,
      mediaItems: mediaItems.map((item, index) => ({
        id: item.id || item.path || item.name || `media_${index + 1}`,
        name: item.name || item.fileName || `Media ${index + 1}`,
        url: item.url || null,
        storagePath: item.path || item.storagePath || null,
        type: item.type || "photo",
        status: "queued"
      })),
      status: "queued",
      priority: requirements.priority || "normal",
      attempts: 0,
      createdBy: req.user?.uid || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await db$2().collection("agentLogs").add({
      agent: "aicon-editor",
      action: "Media job queued",
      summary: `${mediaItems.length} item(s) queued for ${provider}`,
      status: "queued",
      relatedId: ref.id,
      relatedType: "mediaJob",
      priority: requirements.priority || "normal",
      requiresHumanReview: true,
      details: notes,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ success: true, jobId: ref.id });
  } catch (err) {
    console.error("[MediaJobs] Create error:", err);
    return res.status(500).json({ error: "Failed to create media job." });
  }
});
router$6.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, resultItems = [], error = "", requiresHumanReview } = req.body;
    const valid = ["queued", "processing", "ready_for_review", "completed", "failed", "cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status." });
    await db$2().collection("mediaJobs").doc(req.params.id).update({
      status,
      resultItems,
      error,
      requiresHumanReview: requiresHumanReview ?? status !== "completed",
      completedAt: status === "completed" ? admin.firestore.FieldValue.serverTimestamp() : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("[MediaJobs] Status update error:", err);
    return res.status(500).json({ error: "Failed to update media job." });
  }
});
const router$5 = Router();
function adminReady(res) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET."
  });
  return false;
}
function sendKnownError(res, err, fallback) {
  const status = err.status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Studio]", err);
  return res.status(500).json({ error: fallback });
}
router$5.get("/workspace", requireStaff, async (req, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = typeof req.query.listingId === "string" ? req.query.listingId : "";
    const payload = await loadStudioWorkspace({
      uid: req.user.uid,
      role: req.staffRole || "",
      listingId: listingId || void 0
    });
    return res.json(payload);
  } catch (err) {
    return sendKnownError(res, err, "Failed to load Iconic Studio.");
  }
});
router$5.post("/order-edits", requireStaff, async (req, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!adminReady(res)) return;
  try {
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    const result = await queueOrderEdits({ listingId, createdBy: req.user.uid });
    return res.status(201).json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to queue the order edits.");
  }
});
router$5.post("/iconic-polish", requireStaff, async (req, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (typeof req.body?.iconicPolish !== "boolean") {
    return res.status(400).json({ error: "iconicPolish must be true or false." });
  }
  if (!adminReady(res)) return;
  try {
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    const result = await setIconicPolish({ listingId, iconicPolish: req.body.iconicPolish });
    return res.json(result);
  } catch (err) {
    return sendKnownError(res, err, "Failed to save Iconic Polish.");
  }
});
router$5.post("/ai-edit", requireStaff, async (req, res) => {
  const parsed = parseAiEditRequest(req.body);
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
  if (!adminReady(res)) return;
  try {
    await assertStudioAccess(req.user.uid, req.staffRole || "", parsed.value.listingId);
    const job = await enqueueAiEdit({ ...parsed.value, createdBy: req.user.uid });
    return res.status(201).json({
      jobId: job.id,
      status: job.status,
      provider: job.provider,
      beforeUrl: job.beforeUrl,
      afterUrl: job.afterUrl,
      placeholder: job.placeholder,
      note: job.note
    });
  } catch (err) {
    return sendKnownError(res, err, "Failed to enqueue the AI edit.");
  }
});
router$5.post("/adjust", requireStaff, async (req, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const sourcePath = String(req.body?.sourcePath || "");
    const fileName = String(req.body?.fileName || "adjusted.jpg");
    const dataBase64 = String(req.body?.dataBase64 || "");
    if (!dataBase64) return res.status(400).json({ error: "Adjusted JPEG data is required." });
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    const bytes = Buffer.from(dataBase64, "base64");
    const saved = await saveAdjustedJpeg({
      listingId,
      sourcePath,
      fileName,
      adjustments: req.body?.adjustments || {},
      bytes,
      uploadedBy: req.user.uid
    });
    return res.status(201).json({ success: true, ...saved });
  } catch (err) {
    return sendKnownError(res, err, "Failed to save the adjustment.");
  }
});
router$5.post("/reject", requireStaff, async (req, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const jobId = String(req.body?.jobId || "");
    if (!jobId) return res.status(400).json({ error: "jobId is required." });
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    const result = await rejectStudioJob({
      listingId,
      jobId,
      rejectedBy: req.user.uid
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return sendKnownError(res, err, "Failed to reject the edit.");
  }
});
router$5.post("/approve", requireStaff, async (req, res) => {
  if (!adminReady(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
    let sourcePath = String(req.body?.sourcePath || "");
    let fileName = typeof req.body?.fileName === "string" ? req.body.fileName : "";
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    if (jobId) {
      const jobSnap = await admin.firestore().collection("editJobs").doc(jobId).get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Edit job not found." });
      const job = jobSnap.data() || {};
      if (job.listingId !== listingId) return res.status(400).json({ error: "That job is for a different listing." });
      const resolved = resolveStudioApprovePath(job, sourcePath);
      if (resolved.ok === false) return res.status(400).json({ error: resolved.error });
      sourcePath = resolved.sourcePath;
      if (!fileName) fileName = sourcePath.split("/").pop() || "final.jpg";
    }
    if (!sourcePath) return res.status(400).json({ error: "sourcePath is required." });
    const result = await approveStudioFinal({
      listingId,
      sourcePath,
      fileName,
      uploadedBy: req.user.uid,
      jobId: jobId || void 0
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return sendKnownError(res, err, "Failed to approve the final.");
  }
});
const router$4 = Router();
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
function fromGoogle(p) {
  return {
    place_id: p.place_id,
    description: p.description,
    main_text: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || ""
  };
}
function fromNominatim(r, idx) {
  const parts = [];
  const a = r.address || {};
  if (a.house_number && a.road) parts.push(`${a.house_number} ${a.road}`);
  else if (a.road) parts.push(a.road);
  if (a.city || a.town || a.village || a.county)
    parts.push(a.city || a.town || a.village || a.county);
  if (a.state) parts.push(a.state);
  if (a.postcode) parts.push(a.postcode);
  const description = parts.length ? parts.join(", ") : r.display_name;
  return {
    place_id: `nominatim_${idx}`,
    description,
    main_text: parts[0] || description,
    secondary: parts.slice(1).join(", ")
  };
}
router$4.get("/autocomplete", async (req, res) => {
  const input = (req.query.input || "").trim();
  if (!input || input.length < 2) {
    return res.json({ suggestions: [] });
  }
  if (GOOGLE_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:us&types=address&key=${GOOGLE_KEY}`;
      const r = await fetch(url);
      const data = await r.json();
      if (data.status === "OK" && data.predictions?.length) {
        return res.json({ suggestions: data.predictions.map(fromGoogle), source: "google" });
      }
    } catch (err) {
      console.warn("[Places] Google autocomplete failed, falling back to Nominatim:", err);
    }
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&countrycodes=us&addressdetails=1&limit=6`;
    const r = await fetch(url, {
      headers: { "User-Agent": "IconicImages/1.0 (iconicimagestx.com)" }
    });
    const data = await r.json();
    const filtered = data.filter((d) => {
      const a = d.address || {};
      return a.house_number || a.road;
    });
    return res.json({
      suggestions: (filtered.length ? filtered : data.slice(0, 5)).map(fromNominatim),
      source: "nominatim"
    });
  } catch (err) {
    console.error("[Places] Nominatim failed:", err);
    return res.json({ suggestions: [] });
  }
});
router$4.get("/distance", async (req, res) => {
  const destination = (req.query.destination || "").trim();
  const origin = (req.query.origin || process.env.STUDIO_ADDRESS || "The Woodlands, TX 77380").trim();
  if (!destination) {
    return res.status(400).json({ error: "destination is required" });
  }
  if (!GOOGLE_KEY) {
    return res.status(503).json({ error: "Distance calculation requires a Google Maps API key." });
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&key=${GOOGLE_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      return res.json({ distanceMiles: null, distanceText: null, durationText: null });
    }
    const meters = element.distance.value;
    const distanceMiles = Math.round(meters / 1609.34 * 10) / 10;
    const distanceText = element.distance.text;
    const durationText = element.duration.text;
    return res.json({ distanceMiles, distanceText, durationText });
  } catch (err) {
    console.error("[Places] Distance matrix error:", err);
    return res.status(500).json({ error: "Failed to calculate distance." });
  }
});
const router$3 = Router();
const db$1 = () => admin.firestore();
function addressLabel(address) {
  if (!address) return "the property";
  if (typeof address === "string") return address;
  if (typeof address === "object") {
    const a = address;
    if (typeof a.formatted === "string" && a.formatted) return a.formatted;
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "the property";
  }
  return String(address);
}
async function findOrderLikeDocument(id) {
  const orderRequestDoc = await db$1().collection("orderRequests").doc(id).get();
  if (orderRequestDoc.exists) return orderRequestDoc;
  const orderDoc = await db$1().collection("orders").doc(id).get();
  if (orderDoc.exists) return orderDoc;
  return null;
}
router$3.post("/send", requireStaff, async (req, res) => {
  try {
    const { to, body, orderId } = req.body;
    if (!to || !body) return res.status(400).json({ error: "to and body required." });
    const result = await sendSMS({ to, body });
    if (result.suppressed) {
      console.warn(`[SMS] Suppressed staff send to ${to} — ${clientNotifyBlockReason()}.`);
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }
    await db$1().collection("smsLogs").add({
      direction: "outbound",
      to: normalisePhone(to),
      body,
      sid: result.sid,
      status: result.status,
      orderId: orderId || null,
      sentBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    if (orderId) {
      await db$1().collection("messages").add({
        orderId,
        senderId: req.user.uid,
        senderType: "staff",
        senderName: "Iconic Images",
        content: body,
        channel: "sms",
        isRead: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    return res.json({ success: true, ...result });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Send error:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
});
router$3.post("/remind/:orderId", requireStaff, async (req, res) => {
  try {
    const { type = "24h" } = req.body;
    const orderDoc = await findOrderLikeDocument(req.params.orderId);
    if (!orderDoc) {
      return res.status(404).json({ error: "Order not found." });
    }
    const order = orderDoc.data();
    const phone = order.phone || order.clientPhone;
    if (!phone) return res.status(400).json({ error: "No phone number on order." });
    const name = order.firstName || order.clientName?.split(" ")[0] || "there";
    const date = order.scheduledDate || "your scheduled date";
    const time = order.scheduledTime || "your appointment time";
    const address = order.addressLabel || addressLabel(order.address || order.propertyAddress);
    let body;
    if (type === "1h") {
      body = SMS_TEMPLATES.appointmentReminder1h(name, time);
    } else {
      body = SMS_TEMPLATES.appointmentReminder24h(name, date, time, address);
    }
    const result = await sendSMS({ to: phone, body });
    if (result.suppressed) {
      console.warn(`[SMS] Suppressed reminder to ${phone} — ${clientNotifyBlockReason()}.`);
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }
    await db$1().collection("smsLogs").add({
      direction: "outbound",
      to: normalisePhone(phone),
      body,
      sid: result.sid,
      type: `reminder_${type}`,
      orderId: req.params.orderId,
      sentBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Reminder error:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
});
router$3.post("/conversation", requireStaff, async (req, res) => {
  try {
    const { orderId, photographerPhone, photographerName, clientPhone, clientName } = req.body;
    if (!orderId || !photographerPhone || !clientPhone) {
      return res.status(400).json({ error: "orderId, photographerPhone, clientPhone required." });
    }
    const existing = await db$1().collection("conversations").where("orderId", "==", orderId).where("status", "==", "active").limit(1).get();
    if (!existing.empty) {
      return res.json({ conversationSid: existing.docs[0].data().conversationSid, existing: true });
    }
    const appUrl2 = process.env.APP_URL || process.env.VERCEL_URL || "";
    const webhookUrl = appUrl2 ? `${appUrl2}/api/sms/webhook` : void 0;
    const result = await createMaskedConversation(
      `Order ${orderId} — ${photographerName || "Photographer"} + ${clientName || "Client"}`,
      { phone: photographerPhone, name: photographerName },
      { phone: clientPhone, name: clientName },
      webhookUrl
    );
    await db$1().collection("conversations").add({
      orderId,
      conversationSid: result.conversationSid,
      photographerPhone: normalisePhone(photographerPhone),
      photographerName: photographerName || null,
      photographerParticipantSid: result.photographerParticipantSid,
      clientPhone: normalisePhone(clientPhone),
      clientName: clientName || null,
      clientParticipantSid: result.clientParticipantSid,
      status: "active",
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await sendConversationMessage(
      result.conversationSid,
      `Hi! This is a private message channel for your Iconic Images appointment. ${photographerName || "Your photographer"} and ${clientName || "your client"} are connected here. Neither party can see each other's phone number. 📸`
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Conversation error:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
});
router$3.get("/conversations", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$1().collection("conversations").orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch conversations." });
  }
});
router$3.post("/conversation/:id/close", requireStaff, async (req, res) => {
  try {
    const convoDoc = await db$1().collection("conversations").doc(req.params.id).get();
    if (!convoDoc.exists) return res.status(404).json({ error: "Conversation not found." });
    await closeConversation(convoDoc.data().conversationSid);
    await convoDoc.ref.update({ status: "closed", closedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: errorMessage });
  }
});
router$3.post("/webhook", express_raw_or_json, async (req, res) => {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken && process.env.NODE_ENV === "production") {
      const signature = req.headers["x-twilio-signature"];
      const url = `${process.env.APP_URL}/api/sms/webhook`;
      const valid = twilio.validateRequest(authToken, signature, url, req.body);
      if (!valid) {
        console.warn("[SMS Webhook] Invalid Twilio signature");
        return res.status(403).send("Forbidden");
      }
    }
    const {
      ConversationSid,
      Body,
      Author,
      ParticipantSid,
      MessageSid
    } = req.body;
    if (!ConversationSid || !Body) {
      return res.status(200).send("OK");
    }
    const convoSnap = await db$1().collection("conversations").where("conversationSid", "==", ConversationSid).limit(1).get();
    const orderId = convoSnap.empty ? null : convoSnap.docs[0].data().orderId;
    const convoData = convoSnap.empty ? null : convoSnap.docs[0].data();
    let senderType = "client";
    if (convoData && Author === convoData.photographerParticipantSid) {
      senderType = "photographer";
    } else if (Author === "Iconic Images") {
      senderType = "staff";
    }
    await db$1().collection("smsLogs").add({
      direction: "inbound",
      conversationSid: ConversationSid,
      messageSid: MessageSid,
      from: Author,
      body: Body,
      senderType,
      orderId,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    if (orderId) {
      await db$1().collection("messages").add({
        orderId,
        senderId: Author,
        senderType,
        senderName: senderType === "photographer" ? convoData?.photographerName || "Photographer" : convoData?.clientName || "Client",
        content: Body,
        channel: "sms",
        conversationSid: ConversationSid,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    return res.status(200).send("");
  } catch (err) {
    console.error("[SMS Webhook] Error:", err);
    return res.status(200).send("");
  }
});
router$3.post("/campaign/:id/send", requireCoordinator, async (req, res) => {
  try {
    const campaignDoc = await db$1().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });
    const campaign = campaignDoc.data();
    if (campaign.status === "sent") return res.status(400).json({ error: "Campaign already sent." });
    if (campaign.type !== "sms") return res.status(400).json({ error: "Not an SMS campaign." });
    if (!clientNotifyLive()) {
      console.warn(`[SMS] Suppressed campaign ${req.params.id} — ${clientNotifyBlockReason()}.`);
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }
    const clientsSnap = await db$1().collection("clients").where("smsOptIn", "==", true).get();
    let clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (campaign.audience === "custom" && campaign.audienceIds?.length) {
      clients = clients.filter((c) => campaign.audienceIds.includes(c.id));
    }
    const recipients = clients.filter((c) => c.phone).map((c) => ({
      phone: c.phone,
      name: (c.firstName || "") + " " + (c.lastName || "")
    }));
    await campaignDoc.ref.update({ status: "sending" });
    const results = await sendSMSCampaign(
      recipients,
      campaign.body,
      campaign.messagingServiceSid || void 0
    );
    const sent = results.filter((r) => r.sid).length;
    const failed = results.filter((r) => r.error).length;
    await campaignDoc.ref.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      "stats.sent": sent,
      "stats.failed": failed
    });
    return res.json({ success: true, sent, failed });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS Campaign] Error:", errorMessage);
    await db$1().collection("campaigns").doc(req.params.id).update({ status: "draft" }).catch(() => {
    });
    return res.status(500).json({ error: errorMessage });
  }
});
router$3.post("/opt-out", async (req, res) => {
  try {
    const { From, Body } = req.body;
    if (!From) return res.status(200).send("");
    const keyword = (Body || "").trim().toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword)) {
      const snap = await db$1().collection("clients").where("phone", "==", From).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({ smsOptIn: false });
      }
    }
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  } catch (err) {
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }
});
function express_raw_or_json(req, _res, next) {
  next();
}
const router$2 = Router();
router$2.post("/", async (req, res) => {
  try {
    const { name, email, subject, message, phone } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        error: "Missing required fields: name, email, subject, message"
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    const adminEmail = process.env.CONTACT_FORM_EMAIL || "photos@iconicimagestx.com";
    await sendEmail({
      to: adminEmail,
      template: "contact_form",
      subject: `New Contact Form: ${subject}`,
      variables: {
        senderName: name,
        senderEmail: email,
        senderPhone: phone || "Not provided",
        subject,
        message
      }
    });
    await sendEmail({
      to: email,
      template: "contact_confirmation",
      subject: "We received your message",
      variables: {
        name
      }
    });
    res.json({
      success: true,
      message: "Your message has been sent successfully. We'll get back to you soon!"
    });
  } catch (error) {
    console.error("[Contact] Error:", error);
    res.status(500).json({
      error: "Failed to send message. Please try again later."
    });
  }
});
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0].trim().slice(0, 80);
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
function createRateLimiter(options) {
  const hits = /* @__PURE__ */ new Map();
  return {
    check(key) {
      const now = options.now ? options.now() : Date.now();
      const windowStart = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);
      if (recent.length >= options.max) {
        const retryAfterSec = Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1e3));
        hits.set(key, recent);
        return { allowed: false, retryAfterSec };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5e3) {
        const oldest = hits.keys().next().value;
        if (oldest) hits.delete(oldest);
      }
      return { allowed: true, retryAfterSec: 0 };
    },
    reset() {
      hits.clear();
    }
  };
}
const LIVE_CHAT_STAFF_EMAIL_DEFAULT = "photos@iconicimagestx.com";
const LIVE_CHAT_WINDOW_MS = 15 * 60 * 1e3;
const LIVE_CHAT_MAX_PER_WINDOW = 8;
const MAX_NAME = 80;
const MAX_MESSAGE = 2e3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function liveChatStaffEmail(env = process.env) {
  const configured = env.CONTACT_FORM_EMAIL?.trim();
  return configured || LIVE_CHAT_STAFF_EMAIL_DEFAULT;
}
function parseLiveChatBody(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Please enter a message." };
  }
  const raw = body;
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
      ...email ? { email } : {},
      ...phone ? { phone } : {},
      message
    }
  };
}
function oneLine(value) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}
function escapeHtml$3(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function liveChatSmsBody(input) {
  const reply = [input.email, input.phone].filter(Boolean).join(" | ") || "no reply path";
  const text2 = input.message.replace(/\s+/g, " ").trim().slice(0, 280);
  return `Iconic live chat
${oneLine(input.name).slice(0, 80)}
${reply}
${text2}`.slice(0, 640);
}
class LiveChatDeliveryError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.name = "LiveChatDeliveryError";
    this.code = code;
  }
}
function isMissingTransport(err) {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  if (code === "email_not_configured") return true;
  const message = err instanceof Error ? err.message : "";
  return /Twilio credentials not configured|TWILIO_PHONE_NUMBER not set|SMTP is not configured/i.test(message);
}
async function deliverLiveChat(input) {
  const to = liveChatStaffEmail();
  let emailDelivered = false;
  let emailError;
  try {
    const emailResult = await sendEmail({
      to,
      template: STAFF_INBOUND_EMAIL_TEMPLATE,
      audience: "staff",
      subject: `Live chat from ${oneLine(input.name).slice(0, 80)}`,
      variables: {
        senderName: escapeHtml$3(input.name),
        senderEmail: escapeHtml$3(input.email || "Not provided"),
        senderPhone: escapeHtml$3(input.phone || "Not provided"),
        message: escapeHtml$3(input.message)
      }
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
  let smsError;
  try {
    const sms = await sendSMS({
      to: STAFF_INBOUND_SMS_TO,
      kind: STAFF_INBOUND_SMS_KIND,
      body: liveChatSmsBody(input)
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
    notConfigured ? "Live chat delivery is not configured. Set SMTP_USER, SMTP_PASS, and the Twilio credentials." : "Staff live-chat email and SMS were not sent.",
    notConfigured ? "not_configured" : "failed"
  );
}
const router$1 = Router();
const liveChatLimiter = createRateLimiter({
  windowMs: LIVE_CHAT_WINDOW_MS,
  max: LIVE_CHAT_MAX_PER_WINDOW
});
router$1.post("/live-chat", async (req, res) => {
  const parsed = parseLiveChatBody(req.body);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }
  const limit = liveChatLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: "Too many messages. Please wait a few minutes or call us at 281-356-0965."
    });
  }
  try {
    const delivery = await deliverLiveChat(parsed.value);
    return res.json({
      success: true,
      emailDelivered: delivery.emailDelivered,
      smsDelivered: delivery.smsDelivered,
      message: "We got your message. A teammate will reply by email or phone."
    });
  } catch (error) {
    console.error("[LiveChat] Delivery failed:", error);
    if (error instanceof LiveChatDeliveryError && error.code === "not_configured") {
      return res.status(503).json({
        error: "Chat delivery isn't set up on this server yet. Please call 281-356-0965."
      });
    }
    return res.status(500).json({
      error: "We couldn't deliver your message. Please try again, or call 281-356-0965."
    });
  }
});
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "iconic-images-aicon.firebasestorage.app";
const CONFIG_ERROR = "Gallery upload is not configured on this server. In the Vercel project, set FIREBASE_SERVICE_ACCOUNT to the iconic-images-aicon service account JSON (Preview environment is enough) and FIREBASE_STORAGE_BUCKET to iconic-images-aicon.firebasestorage.app. Redeploy the preview. Do not change Storage rules to public write.";
function safeFileName(raw) {
  const name = typeof raw === "string" && raw.trim() ? raw.trim() : "photo.jpg";
  const base = name.split(/[/\\]/).pop() || "photo.jpg";
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "photo.jpg";
}
const handleListingPhotoUpload = async (req, res) => {
  const { id } = req.params;
  if (!id || !/^[A-Za-z0-9_-]{8,}$/.test(id)) {
    return res.status(400).json({ error: "A valid project id is required.", code: "invalid-project" });
  }
  if (!admin.apps.length) {
    return res.status(503).json({ error: CONFIG_ERROR, code: "storage/not-configured" });
  }
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "No image data was received.", code: "empty-upload" });
  }
  if (body.length > 45e5) {
    return res.status(413).json({
      error: "This photo is too large for the preview upload limit. It should have been resized before upload.",
      code: "file-too-large"
    });
  }
  const contentType = (req.header("content-type") || "image/jpeg").split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
    return res.status(415).json({ error: "Upload a JPG, PNG, or WebP image.", code: "unsupported-type" });
  }
  const fileName = safeFileName(req.query.name);
  const objectPath = `listings/${id}/photos/${Date.now()}_${fileName.replace(/\.\w+$/, "")}.jpg`;
  const token = randomUUID();
  try {
    const file = admin.storage().bucket(BUCKET).file(objectPath);
    await file.save(body, {
      resumable: false,
      metadata: {
        contentType: "image/jpeg",
        metadata: { firebaseStorageDownloadTokens: token }
      }
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    const image = {
      url,
      name: fileName,
      path: objectPath,
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
      uploadedBy: req.user?.uid || "staff"
    };
    await admin.firestore().collection("listings").doc(id).update({
      images: admin.firestore.FieldValue.arrayUnion(image),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ image });
  } catch (err) {
    console.error("[listingPhotos] upload failed:", err);
    const message = err instanceof Error ? err.message : "Upload failed.";
    const missingBucket = /bucket|credential|app\/no-app|default/i.test(message);
    return res.status(missingBucket ? 503 : 500).json({
      error: missingBucket ? CONFIG_ERROR : `Gallery upload failed: ${message}`,
      code: missingBucket ? "storage/not-configured" : "storage/upload-failed"
    });
  }
};
const PRESENTATION_PREVIEW_TOKEN = "preview";
const PRESENTATION_PATH = "/present";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,80}$/;
const RAW_EXT = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const SKIP_TYPES = /* @__PURE__ */ new Set(["video", "reel", "tour", "matterport", "file", "document"]);
function presentationPath(token) {
  return `${PRESENTATION_PATH}/${encodeURIComponent(token)}`;
}
function isPresentationToken(value) {
  return value === PRESENTATION_PREVIEW_TOKEN || TOKEN_PATTERN.test(value);
}
function createPresentationToken(randomBytes2) {
  return randomBytes2(18).toString("base64url");
}
function safePresentationUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;
  if (trimmed.startsWith("/")) {
    if (trimmed.includes("..")) return null;
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return null;
  }
  return null;
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function roomFromFields(row, folders) {
  for (const key of ["room", "roomName", "roomType", "scene"]) {
    const value = text(row[key]);
    if (value && value.length <= 48 && !IMAGE_EXT.test(value) && !RAW_EXT.test(value)) return value;
  }
  const folderId = text(row.folderId);
  if (folderId && folders.has(folderId)) return folders.get(folderId) || "";
  return "";
}
function folderMap(listing) {
  const map = /* @__PURE__ */ new Map();
  const folders = listing?.mediaFolders;
  if (!Array.isArray(folders)) return map;
  for (const item of folders) {
    if (!item || typeof item !== "object") continue;
    const row = item;
    const id = text(row.id);
    const name = text(row.name);
    if (id && name) map.set(id, name);
  }
  return map;
}
function isRawPath(path2, name) {
  return RAW_EXT.test(name) || RAW_EXT.test(path2) || path2.includes("/raw/");
}
function pushDraft(drafts, row, index, folders, fallbackRoom = "") {
  const path2 = text(row.path) || text(row.storagePath);
  const name = text(row.name) || text(row.fileName) || text(row.title) || path2.split("/").pop() || "";
  const type = text(row.type).toLowerCase();
  if (type && SKIP_TYPES.has(type)) return;
  if (isRawPath(path2, name)) return;
  const contentType = text(row.contentType).toLowerCase();
  const looksLikeImage = !contentType || contentType.startsWith("image/") || IMAGE_EXT.test(name) || IMAGE_EXT.test(path2);
  if (!looksLikeImage) return;
  if (contentType && !contentType.startsWith("image/") && !IMAGE_EXT.test(name)) return;
  const url = safePresentationUrl(row.url) || safePresentationUrl(row.shareUrl);
  if (!url) return;
  const room = roomFromFields(row, folders) || fallbackRoom;
  const order = typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index;
  const final = row.studioApproved === true || text(row.studioRole) === "final" || path2.includes("/finals/");
  drafts.push({
    id: text(row.id) || path2 || url,
    url,
    alt: room ? `${room} photograph` : "Listing photograph",
    room,
    order,
    index,
    path: path2,
    sourcePath: text(row.sourcePath),
    final
  });
}
function listingDrafts(listing) {
  if (!listing || !Array.isArray(listing.images)) return [];
  const folders = folderMap(listing);
  const drafts = [];
  listing.images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    if (!frame || frame.raw || !frame.previewable) return;
    const row = item && typeof item === "object" ? { ...item } : {};
    row.url = row.url || frame.url;
    row.path = row.path || frame.path;
    row.name = row.name || frame.name;
    row.contentType = row.contentType || frame.contentType;
    row.id = row.id || frame.id;
    pushDraft(drafts, row, index, folders);
  });
  return drafts;
}
function galleryDrafts(galleries, start) {
  const drafts = [];
  let index = start;
  for (const gallery of galleries || []) {
    const buckets = [gallery.mediaItems, gallery.images];
    for (const bucket2 of buckets) {
      if (!Array.isArray(bucket2)) continue;
      for (const item of bucket2) {
        if (!item || typeof item !== "object") continue;
        pushDraft(drafts, item, index, /* @__PURE__ */ new Map());
        index += 1;
      }
    }
  }
  return drafts;
}
function preferFinals(drafts) {
  const finals = drafts.filter((item) => item.final);
  if (finals.length === 0) return drafts;
  const replaced = new Set(finals.map((item) => item.sourcePath).filter(Boolean));
  const finalPaths = new Set(finals.map((item) => item.path).filter(Boolean));
  return drafts.filter((item) => {
    if (item.final) return true;
    if (item.path && replaced.has(item.path)) return false;
    if (item.path && finalPaths.has(item.path)) return false;
    return true;
  });
}
function dedupe(drafts) {
  const seen = /* @__PURE__ */ new Set();
  const photos = [];
  const sorted = [...drafts].sort((a, b) => a.order - b.order || a.index - b.index);
  for (const item of sorted) {
    const key = item.path || item.url;
    if (seen.has(key) || seen.has(item.url)) continue;
    seen.add(key);
    seen.add(item.url);
    photos.push({
      id: item.id,
      url: item.url,
      alt: item.alt,
      room: item.room
    });
  }
  return photos.slice(0, 200);
}
function collectPresentationPhotos(source) {
  const fromListing = listingDrafts(source.listing);
  const fromGalleries = galleryDrafts(source.galleries, fromListing.length);
  return dedupe(preferFinals([...fromListing, ...fromGalleries]));
}
function presentationRooms(photos) {
  const rooms = [];
  for (const photo of photos) {
    const name = photo.room.trim();
    if (!name) continue;
    const last = rooms[rooms.length - 1];
    if (last && last.name.toLowerCase() === name.toLowerCase()) last.count += 1;
    else rooms.push({ name, count: 1 });
  }
  return rooms;
}
function addressParts(listing) {
  const source = listing?.address ?? listing?.shootLocation ?? listing?.propertyAddress;
  if (typeof source === "string" && source.trim()) {
    return { address: source.trim(), street: source.trim(), locality: "" };
  }
  if (source && typeof source === "object") {
    const row = source;
    const street = text(row.street);
    const locality = [text(row.city), [text(row.state), text(row.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const formatted = text(row.formatted);
    const address = formatted || [street, locality].filter(Boolean).join(", ");
    if (address) return { address, street: street || address, locality: street ? locality : "" };
  }
  const property = text(listing?.propertyAddress);
  if (property) return { address: property, street: property, locality: "" };
  const labeled = listingAddressLabel({
    address: listing?.address,
    shootLocation: listing?.shootLocation
  });
  if (labeled && labeled !== "Untitled listing") return { address: labeled, street: labeled, locality: "" };
  return { address: "", street: "", locality: "" };
}
function agentNameOf(listing) {
  if (!listing) return "";
  const direct = text(listing.agentName) || text(listing.listingAgent);
  if (direct) return direct;
  const agent = listing.agent;
  if (agent && typeof agent === "object") return text(agent.name);
  if (typeof agent === "string") return agent.trim();
  return "";
}
function priceOf(listing) {
  const raw = listing?.listPrice ?? listing?.price;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(raw);
  }
  const value = text(raw);
  if (!value) return "";
  if (value.startsWith("$")) return value;
  const numeric2 = Number(value.replace(/[$,]/g, ""));
  if (Number.isFinite(numeric2) && numeric2 > 0) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric2);
  }
  return "";
}
function countOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const raw = text(value);
  return raw;
}
function absoluteUrl(origin, url) {
  if (!url) return "";
  if (url.startsWith("/")) return `${origin.replace(/\/$/, "")}${url}`;
  return url;
}
function buildPresentation(source) {
  const listing = source.listing || null;
  if (listing && listing.presentationEnabled === false) return null;
  const photos = collectPresentationPhotos(source);
  const { address, street, locality } = addressParts(listing);
  const agentName = agentNameOf(listing);
  const clientName = text(listing?.clientName);
  const origin = source.origin || "";
  const path2 = presentationPath(source.token);
  const pageUrl = origin ? `${origin.replace(/\/$/, "")}${path2}` : path2;
  const titleAddress = address || "Private presentation";
  const description = photos.length ? `${photos.length} photograph${photos.length === 1 ? "" : "s"}${address ? ` of ${address}` : ""}. A private presentation from Iconic Images.` : "A private listing presentation from Iconic Images.";
  return {
    token: source.token,
    listingId: text(listing?.id) || null,
    seeded: false,
    enabled: true,
    address,
    street,
    locality,
    agentName,
    clientName,
    price: priceOf(listing),
    beds: countOf(listing?.bedrooms),
    baths: countOf(listing?.bathrooms),
    photos,
    rooms: presentationRooms(photos),
    meta: {
      title: `${titleAddress} · Iconic Images`,
      description,
      image: absoluteUrl(origin, photos[0]?.url || ""),
      url: pageUrl
    }
  };
}
const SEEDED_PHOTOS = [
  { src: "/media/photos/luxury-exterior.jpg", room: "Exterior", alt: "Twilight exterior of a luxury home" },
  { src: "/media/photos/drone-hero.jpg", room: "Aerial", alt: "Aerial view over the property" },
  { src: "/media/before-after/aerial-estate.jpg", room: "Grounds", alt: "Aerial view of the estate and grounds" },
  { src: "/media/before-after/twilight-pool-lifestyle.jpg", room: "Rear pool", alt: "Rear pool and patio at twilight" },
  { src: "/media/before-after/pavilion-lifestyle.jpg", room: "Pavilion", alt: "Pool pavilion and outdoor lounge" },
  { src: "/media/photos/luxury-interior.jpg", room: "Interior", alt: "Interior of the home" },
  { src: "/media/photos/listing-living-01.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/listing-living-02.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/listing-living-03.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/listing-living-04.jpg", room: "Living room", alt: "Living room" },
  { src: "/media/photos/staged-living-room.jpg", room: "Living room", alt: "Staged living room" },
  { src: "/media/before-after/living-declutter.jpg", room: "Living room", alt: "Living room prepared for the listing" },
  { src: "/media/before-after/primary-suite-staged.jpg", room: "Primary suite", alt: "Primary suite" },
  { src: "/media/before-after/aerial-estate-close.jpg", room: "Aerial", alt: "Closer aerial of the home" }
];
function seededPresentation(origin = "") {
  const photos = SEEDED_PHOTOS.map((item, index) => ({
    id: `seed-${index + 1}`,
    url: item.src,
    alt: item.alt,
    room: item.room
  }));
  const path2 = presentationPath(PRESENTATION_PREVIEW_TOKEN);
  const pageUrl = origin ? `${origin.replace(/\/$/, "")}${path2}` : path2;
  return {
    token: PRESENTATION_PREVIEW_TOKEN,
    listingId: null,
    seeded: true,
    enabled: true,
    address: "",
    street: "",
    locality: "",
    agentName: "",
    clientName: "",
    price: "",
    beds: "",
    baths: "",
    photos,
    rooms: presentationRooms(photos),
    meta: {
      title: "Sample presentation · Iconic Images",
      description: `${photos.length} photographs. A private presentation from Iconic Images.`,
      image: absoluteUrl(origin, photos[0]?.url || ""),
      url: pageUrl
    }
  };
}
function injectPresentationMeta(html, meta) {
  const tags = [
    `<title>${escapeHtml$2(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml$2(meta.description)}" />`,
    `<meta name="robots" content="noindex, nofollow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml$2(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml$2(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml$2(meta.url)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml$2(meta.image)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml$2(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml$2(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml$2(meta.image)}" />` : ""
  ].filter(Boolean).join("\n    ");
  let next = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  if (next.includes("</head>")) {
    next = next.replace("</head>", `    ${tags}
  </head>`);
  } else {
    next = `${tags}
${next}`;
  }
  return next;
}
function escapeHtml$2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const router = Router();
const db = () => admin.firestore();
function originOf(req) {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : "";
}
function firebaseReady() {
  return admin.apps.length > 0;
}
async function galleriesForListing(listingId, listing) {
  const ids = /* @__PURE__ */ new Set();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  const docs = [];
  for (const id of ids) {
    const snap = await db().collection("galleries").doc(id).get();
    if (snap.exists) docs.push({ id: snap.id, ...snap.data() });
  }
  try {
    const linked = await db().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    linked.docs.forEach((doc) => {
      if (!docs.some((item) => item.id === doc.id)) docs.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.warn("[Presentation] Gallery lookup skipped.", err);
  }
  return docs;
}
async function listingByToken(token) {
  const snap = await db().collection("listings").where("presentationToken", "==", token).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}
async function loadPresentation(token, origin) {
  if (token === PRESENTATION_PREVIEW_TOKEN) return seededPresentation(origin);
  if (!firebaseReady()) return null;
  const listing = await listingByToken(token);
  if (!listing) return null;
  const galleries = await galleriesForListing(listing.id, listing);
  return buildPresentation({ token, listing, galleries, origin });
}
router.get("/presentations/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!isPresentationToken(token)) {
    return res.status(400).json({ error: "That presentation link is not valid." });
  }
  try {
    const presentation = await loadPresentation(token, originOf(req));
    if (!presentation) {
      return res.status(404).json({ error: "This presentation link is not active." });
    }
    return res.json(presentation);
  } catch (err) {
    console.error("[Presentation] Public read failed.", err);
    return res.status(500).json({ error: "This presentation could not be opened." });
  }
});
router.get("/presentations/shell/:token", async (req, res) => {
  const rendered = await renderPresentationShell(String(req.params.token || ""), originOf(req));
  res.status(rendered.status).type("html").send(rendered.html);
});
async function renderPresentationShell(token, origin) {
  if (!isPresentationToken(token)) {
    return { status: 400, html: "<!doctype html><title>Presentation</title><p>That presentation link is not valid.</p>" };
  }
  try {
    const presentation = await loadPresentation(token, origin);
    if (!presentation) {
      return { status: 404, html: "<!doctype html><title>Presentation</title><p>This presentation link is not active.</p>" };
    }
    const shell = await readSpaShell();
    const html = shell ? injectPresentationMeta(shell, presentation.meta) : standalonePresentation(presentation);
    return { status: 200, html };
  } catch (err) {
    console.error("[Presentation] Shell failed.", err);
    return { status: 500, html: "<!doctype html><title>Presentation</title><p>This presentation could not be opened.</p>" };
  }
}
router.post("/listings/:id/presentation", requireStaff, async (req, res) => {
  const listingId = String(req.params.id || "");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!firebaseReady()) {
    return res.status(503).json({
      error: "Firebase Admin is not configured, so a client link cannot be saved.",
      previewPath: presentationPath(PRESENTATION_PREVIEW_TOKEN),
      notified: false
    });
  }
  try {
    const ref = db().collection("listings").doc(listingId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Listing not found." });
    const data = snap.data() || {};
    const rotate = req.body?.rotate === true;
    const existing = typeof data.presentationToken === "string" ? data.presentationToken : "";
    const token = !rotate && isPresentationToken(existing) && existing !== PRESENTATION_PREVIEW_TOKEN ? existing : createPresentationToken(randomBytes);
    const created = token !== existing;
    await ref.update({
      presentationToken: token,
      presentationEnabled: true,
      presentationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...created ? { presentationCreatedAt: admin.firestore.FieldValue.serverTimestamp() } : {}
    });
    const listing = { id: listingId, ...data, presentationToken: token, presentationEnabled: true };
    const galleries = await galleriesForListing(listingId, listing);
    const presentation = buildPresentation({
      token,
      listing,
      galleries,
      origin: originOf(req)
    });
    const path2 = presentationPath(token);
    return res.json({
      token,
      path: path2,
      url: `${originOf(req)}${path2}`,
      photoCount: presentation?.photos.length || 0,
      created,
      notified: false
    });
  } catch (err) {
    console.error("[Presentation] Share link save failed.", err);
    return res.status(500).json({ error: "The presentation link could not be saved." });
  }
});
async function readSpaShell() {
  const candidates = [
    path.join(process.cwd(), "dist/spa/index.html")
  ];
  for (const file of candidates) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
  }
  return null;
}
function standalonePresentation(presentation) {
  const hero = presentation.photos[0];
  const title = presentation.address || (presentation.seeded ? "Sample presentation" : "Private presentation");
  const figures = presentation.photos.map((photo, index) => `
    <figure style="margin:0;min-height:100svh;position:relative;background:#070708">
      <img src="${escapeAttr(photo.url)}" alt="${escapeAttr(photo.alt)}" style="width:100%;height:100svh;object-fit:cover;display:block" />
      <figcaption style="position:absolute;left:1.25rem;bottom:1.5rem;color:#fff;font-family:Georgia,serif;font-size:2rem">${escapeHtml$1(photo.room || String(index + 1))}</figcaption>
    </figure>`).join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml$1(presentation.meta.title)}</title>
  </head>
  <body style="margin:0;background:#070708;color:#fff">
    <header style="min-height:100svh;display:flex;align-items:flex-end;padding:2rem;background:#111 url('${escapeAttr(hero?.url || "")}') center/cover">
      <div>
        <p style="letter-spacing:.28em;text-transform:uppercase;font:600 11px/1 sans-serif">Iconic Images</p>
        <h1 style="font:500 4rem/0.95 Georgia,serif;margin:.4rem 0">${escapeHtml$1(title)}</h1>
      </div>
    </header>
    ${figures}
  </body>
</html>`;
  return injectPresentationMeta(html, presentation.meta);
}
function escapeHtml$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(value) {
  return escapeHtml$1(value).replace(/"/g, "&quot;");
}
const BARE_CLIENT_ROUTE_TITLE = "Page not found";
const BARE_CLIENT_ROUTE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/contact", label: "Contact" },
  { href: "/login", label: "Client Login" }
];
function bareClientRouteKind(pathname) {
  const pathOnly = pathname.split("#")[0]?.split("?")[0] ?? "";
  if (pathOnly === "/studio" || pathOnly === "/studio/") return "studio";
  if (pathOnly === "/gallery" || pathOnly === "/gallery/") return "gallery";
  return null;
}
function bareClientRouteMessage(kind) {
  if (kind === "gallery") {
    return "A gallery link includes an ID. This address does not. Open the full link from your delivery, or sign in to the client portal.";
  }
  return "A studio link includes an ID. This address does not. Open the full link from your delivery, or sign in to the client portal.";
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const linkStyle = "display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 22px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;text-decoration:none";
function bareNotFoundFragment(kind) {
  const links = BARE_CLIENT_ROUTE_LINKS.map((link, index) => {
    const paint = index === 0 ? "background:#fff;color:#000" : link.href === "/login" ? "background:#2dd4bf;color:#000" : "border:1px solid rgba(255,255,255,.28);color:#fff";
    return `<a href="${link.href}" style="${linkStyle};${paint}">${escapeHtml(link.label)}</a>`;
  }).join("");
  const studioNote = kind === "studio" ? `<p style="margin:28px 0 0;color:#9ca3af;font-size:14px">Looking for the physical studio? <a href="/studio-105" style="color:#fff;font-weight:700">Studio 105</a></p>` : "";
  return `<main data-bare-not-found="page" style="min-height:100vh;box-sizing:border-box;margin:0;background:#000;color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;display:flex;flex-direction:column">
  <header style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:28px 24px">
    <a href="/" style="color:#fff;text-decoration:none;font-weight:800;letter-spacing:.12em;font-size:13px">ICONIC IMAGES</a>
    <a href="/login" style="color:rgba(255,255,255,.75);text-decoration:none;font-size:12px;font-weight:700">Log in</a>
  </header>
  <section style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="max-width:720px;text-align:center">
      <p style="color:#2dd4bf;font-size:11px;font-weight:800;letter-spacing:.45em;text-transform:uppercase;margin:0 0 16px">404</p>
      <h1 style="font-size:clamp(40px,8vw,72px);line-height:.95;letter-spacing:-.04em;text-transform:uppercase;margin:0">${BARE_CLIENT_ROUTE_TITLE}</h1>
      <p style="color:#d1d5db;font-size:18px;line-height:1.6;margin:24px auto 0;max-width:36rem">${escapeHtml(bareClientRouteMessage(kind))}</p>
      <nav aria-label="Helpful pages" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:36px">${links}</nav>
      ${studioNote}
    </div>
  </section>
</main>`;
}
function bareNotFoundDocument(kind) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${BARE_CLIENT_ROUTE_TITLE} | Iconic Images</title>
</head>
<body style="margin:0;background:#000;color:#fff">
${bareNotFoundFragment(kind)}
</body>
</html>`;
}
function applyBareNotFound(shell, pathname) {
  const kind = bareClientRouteKind(pathname) ?? "studio";
  if (!shell.includes('id="root"')) return bareNotFoundDocument(kind);
  let html = shell;
  if (!/name=["']robots["']/i.test(html)) {
    html = html.replace("</head>", `    <meta name="robots" content="noindex" />
  </head>`);
  }
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${BARE_CLIENT_ROUTE_TITLE} | Iconic Images</title>`);
  if (!html.includes('data-bare-not-found="style"')) {
    html = html.replace(
      "</head>",
      `    <style data-bare-not-found="style">html,body{background:#000;color:#fff}</style>
  </head>`
    );
  }
  const fragment = bareNotFoundFragment(kind);
  if (/<div id="root">\s*<\/div>/.test(html)) {
    html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${fragment}</div>`);
  } else if (!html.includes('data-bare-not-found="page"')) {
    html = html.replace("</body>", `${fragment}
  </body>`);
  }
  return html;
}
async function renderBareClientNotFound(pathname) {
  const shellPath = path$1.join(process.cwd(), "dist/spa/index.html");
  try {
    const shell = await fs$1.readFile(shellPath, "utf8");
    if (shell.includes('id="root"')) return applyBareNotFound(shell, pathname);
  } catch {
  }
  return bareNotFoundDocument(bareClientRouteKind(pathname) ?? "studio");
}
const SETTINGS_FILE = path.join(process.cwd(), "site_settings.json");
const API_BUILD_MARKER = "auth-square-2026-09-28";
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
    });
  } else {
    console.warn(
      "[Server] WARNING: No Firebase service account configured. Set FIREBASE_SERVICE_ACCOUNT env var with your service account JSON."
    );
  }
  if (admin.apps.length) {
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  }
}
function createServer() {
  const app = express();
  const configuredOrigin = process.env.APP_URL;
  const allowedOrigins = /* @__PURE__ */ new Set([
    "https://iconicimagestx.com",
    "https://www.iconicimagestx.com",
    "https://iconic-booking-test.cadi0224.chatgpt.site",
    ...configuredOrigin ? [configuredOrigin] : []
  ]);
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true
  }));
  app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
  app.use("/api/payments/square-webhook", express.raw({ type: "application/json" }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.post(
    "/api/listings/:id/photos",
    (req, _res, next) => {
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (type === "application/json") return next("route");
      next();
    },
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp", "application/octet-stream"],
      limit: "8mb"
    }),
    requireStaff,
    handleListingPhotoUpload
  );
  app.get("/api/ping", (_req, res) => {
    res.json({
      status: "ok",
      message: process.env.PING_MESSAGE ?? "Iconic Images API",
      build: API_BUILD_MARKER,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/health/calendar", async (req, res) => {
    const expectedSecret = process.env.CALENDAR_HEALTH_SECRET;
    const providedSecret = req.header("x-calendar-health-secret");
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await verifyCalendarWriteAccess();
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("[Health] Calendar write check failed:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Calendar write check failed"
      });
    }
  });
  app.post("/api/calendar/schedule", requireStaff, async (req, res) => {
    try {
      const calendars = Array.isArray(req.body?.calendars) ? req.body.calendars : [];
      const timeMin = typeof req.body?.timeMin === "string" ? req.body.timeMin : "";
      const timeMax = typeof req.body?.timeMax === "string" ? req.body.timeMax : "";
      if (!timeMin || !timeMax) {
        return res.status(400).json({ error: "timeMin and timeMax are required." });
      }
      const events = await listCalendarScheduleEvents({ calendars, timeMin, timeMax });
      return res.json({ events });
    } catch (error) {
      console.error("[Calendar] Schedule sync failed:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Calendar schedule sync failed."
      });
    }
  });
  app.get("/api/settings", async (_req, res) => {
    try {
      const data = await fs.readFile(SETTINGS_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch {
      res.status(404).json({ error: "Settings not found" });
    }
  });
  app.post("/api/settings", requireAdmin, async (req, res) => {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });
  app.get("/api/client-notify", (_req, res) => {
    res.json({ live: clientNotifyLive() });
  });
  app.get(["/studio", "/studio/", "/gallery", "/gallery/"], async (req, res, next) => {
    if (process.env.ICONIC_VITE_DEV === "1") return next();
    try {
      const html = await renderBareClientNotFound(req.path);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex");
      return res.status(404).type("html").send(html);
    } catch (err) {
      console.error("[BareRoute] Not-found page failed:", err);
      const kind = bareClientRouteKind(req.path) ?? "studio";
      return res.status(404).type("html").send(bareNotFoundDocument(kind));
    }
  });
  app.use("/api/bookings", router$h);
  app.use("/api/orders", router$g);
  app.use("/api/galleries", router$f);
  app.use("/api/payments", router$e);
  app.use("/api/vsai", router$d);
  app.use("/api/messages", router$c);
  app.use("/api/clients", router$b);
  app.use("/api/staff", router$a);
  app.use("/api", router);
  app.use("/api/listings", router$9);
  app.use("/api/campaigns", router$8);
  app.use("/api/agents", router$7);
  app.use("/api/media-jobs", router$6);
  app.use("/api/studio", router$5);
  app.use("/api/places", router$4);
  app.use("/api/sms", router$3);
  app.use("/api/contact", router$1);
  app.use("/api/contact", router$2);
  app.use(
    (err, _req, res, _next) => {
      console.error("[Server] Unhandled error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  );
  return app;
}
const vercelHandler = createServer();
export {
  vercelHandler as default
};
