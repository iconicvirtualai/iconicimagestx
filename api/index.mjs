import "dotenv/config";
import express, { Router } from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import twilio from "twilio";
import { google } from "googleapis";
import crypto, { randomBytes, randomUUID, createHmac, timingSafeEqual as timingSafeEqual$1 } from "crypto";
import Stripe from "stripe";
import * as XLSX from "xlsx";
import { randomBytes as randomBytes$1, timingSafeEqual } from "node:crypto";
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
const BUSINESS_CONTACT_LINE = "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com";
function parseContactLine(line) {
  const parts = line.split(" | ");
  if (parts.length !== 3) {
    throw new Error("BUSINESS_CONTACT_LINE must be address | phone | email");
  }
  const [address, phoneDisplay, email] = parts;
  const addressParts2 = address.split(", ");
  if (addressParts2.length !== 3) {
    throw new Error("Public address must be street, city, ST ZIP");
  }
  const [streetAddress, city, stateZip] = addressParts2;
  const [state, postalCode] = stateZip.split(" ");
  if (!streetAddress || !city || !state || !postalCode || !phoneDisplay || !email) {
    throw new Error("BUSINESS_CONTACT_LINE is missing a public contact field");
  }
  const phoneDigits = phoneDisplay.replace(/\D/g, "");
  return {
    line,
    address,
    streetAddress,
    addressLine2: `${city}, ${state} ${postalCode}`,
    city,
    state,
    postalCode,
    phoneDisplay,
    phoneHref: `tel:+1${phoneDigits}`,
    email,
    emailHref: `mailto:${email}`
  };
}
const BUSINESS_CONTACT = parseContactLine(BUSINESS_CONTACT_LINE);
const ORDER_RECEIVED_EMAIL_TEMPLATE = "booking_received";
const ORDER_RECEIVED_SMS_KIND = "booking_confirmation";
const STAFF_INBOUND_EMAIL_TEMPLATE = "live_chat";
const OFFICE_NEW_ORDER_EMAIL_TEMPLATE$1 = "office_new_order";
const STAFF_INBOUND_SMS_KIND = "staff_inbound";
const STAFF_INBOUND_SMS_TO = "+12813560965";
function clientNotifyLive(env = process.env) {
  if (env.CLIENT_COMMS_ZONE === "RED") return false;
  return env.CLIENT_NOTIFY_LIVE === "true";
}
function emailAllowed(template, env = process.env, audience) {
  if (template === ORDER_RECEIVED_EMAIL_TEMPLATE) return true;
  if (audience === "staff" && template === STAFF_INBOUND_EMAIL_TEMPLATE) return true;
  if (audience === "staff" && template === OFFICE_NEW_ORDER_EMAIL_TEMPLATE$1) return true;
  return clientNotifyLive(env);
}
function smsAllowed(kind, env = process.env) {
  if (kind === ORDER_RECEIVED_SMS_KIND) return true;
  if (kind === STAFF_INBOUND_SMS_KIND) return true;
  return clientNotifyLive(env);
}
function isStaffInboundSmsDestination(to) {
  const digits2 = to.replace(/\D/g, "");
  return digits2 === "12813560965" || digits2 === "2813560965";
}
function clientNotifyBlockReason(env = process.env) {
  if (env.CLIENT_COMMS_ZONE === "RED") return "CLIENT_COMMS_ZONE=RED";
  return "CLIENT_NOTIFY_LIVE is not exactly true";
}
const MAILBOX = /^[^\s@,;<>"]+@[^\s@,;<>"]+$/;
function mailboxAddress(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const wrapped = trimmed.match(/^(?:"[^"]*"|[^<"]*?)\s*<([^<>]+)>\s*$/);
  const candidate = (wrapped ? wrapped[1] : trimmed).trim().toLowerCase();
  if (!MAILBOX.test(candidate)) return null;
  return candidate;
}
function notifyTestAllowlist(env = process.env) {
  const raw = env.NOTIFY_TEST_ALLOWLIST;
  const allow = /* @__PURE__ */ new Set();
  if (!raw) return allow;
  for (const part of raw.split(",")) {
    const address = mailboxAddress(part);
    if (address) allow.add(address);
  }
  return allow;
}
function isNotifyTestAllowlisted(address, env = process.env) {
  const mailbox = mailboxAddress(address);
  if (!mailbox) return false;
  return notifyTestAllowlist(env).has(mailbox);
}
function recipientTokens(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}
function keepExact(value, allow, held) {
  const kept = [];
  const seen = /* @__PURE__ */ new Set();
  for (const token of recipientTokens(value)) {
    const mailbox = mailboxAddress(token);
    if (mailbox && allow.has(mailbox)) {
      if (!seen.has(mailbox)) {
        seen.add(mailbox);
        kept.push(mailbox);
      }
    } else {
      held.push(token);
    }
  }
  return kept;
}
function narrowGatedClientRecipients(input, env = process.env) {
  const allow = notifyTestAllowlist(env);
  if (allow.size === 0) return null;
  const held = [];
  let to = keepExact(input.to, allow, held);
  let cc = keepExact(input.cc, allow, held);
  let bcc = keepExact(input.bcc, allow, held);
  const replyTo = keepExact(input.replyTo, allow, held);
  if (to.length === 0 && cc.length > 0) {
    to = cc;
    cc = [];
  } else if (to.length === 0 && bcc.length > 0) {
    to = bcc;
    bcc = [];
  }
  if (to.length === 0) return null;
  return {
    to: to.join(", "),
    cc: cc.length > 0 ? cc.join(", ") : void 0,
    bcc: bcc.length > 0 ? bcc.join(", ") : void 0,
    replyTo: replyTo.length > 0 ? replyTo.join(", ") : void 0,
    held
  };
}
const db$r = () => admin.firestore();
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
  const { template, audience, variables = {}, subject: subjectOverride, html, attachments } = options;
  let to = options.to;
  let bcc = options.bcc;
  let cc = options.cc;
  let replyTo = options.replyTo;
  if (!to) {
    console.warn("[Email] No recipient specified, skipping.");
    return { sent: false };
  }
  if (!emailAllowed(template, process.env, audience)) {
    const narrowed = narrowGatedClientRecipients({ to, cc, bcc, replyTo }, process.env);
    if (!narrowed) {
      const why = notifyTestAllowlist().size > 0 ? `${clientNotifyBlockReason()}. Recipient is not an exact NOTIFY_TEST_ALLOWLIST match.` : `${clientNotifyBlockReason()}.`;
      console.warn(
        `[Email] Suppressed '${template}' to ${to} — ${why} No message sent.`
      );
      return { sent: false };
    }
    to = narrowed.to;
    cc = narrowed.cc;
    bcc = narrowed.bcc;
    replyTo = narrowed.replyTo;
    if (narrowed.held.length > 0) {
      console.warn(
        `[Email] '${template}' sent only to NOTIFY_TEST_ALLOWLIST. Held: ${narrowed.held.join(", ")}.`
      );
    }
  }
  let subject = subjectOverride || `Message from Iconic Images`;
  let htmlBody = html || getFallbackTemplate(template, variables);
  try {
    if (!html && admin.apps.length) {
      const templateDoc = await db$r().collection("emailTemplates").where("category", "==", template).where("isActive", "==", true).limit(1).get();
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
      ...replyTo ? { replyTo } : {},
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
        <p>${BUSINESS_CONTACT.line}</p>
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
      <p>We typically respond to inquiries within 24 business hours. If your question is urgent, feel free to call us at <strong>${BUSINESS_CONTACT.phoneDisplay}</strong> or email <strong>${BUSINESS_CONTACT.email}</strong>.</p>
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
  const digits2 = raw.replace(/\D/g, "");
  if (digits2.length === 10) return `+1${digits2}`;
  if (digits2.length === 11 && digits2.startsWith("1")) return `+${digits2}`;
  return `+${digits2}`;
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

Questions? Reply to this text, or reach us at ${BUSINESS_CONTACT.line}. — Iconic Images 📸`,
  appointmentReminder24h: (name, date, time, address) => `Hey ${name}, reminder! Your Iconic Images shoot is tomorrow 📸

🕐 ${time}
📍 ${address}

Reply CONFIRM to confirm or call us to reschedule.`,
  appointmentReminder1h: (name, time) => `Hi ${name}! Your photographer is on the way — arriving around ${time} 📸
Reply to this text with any last-minute notes!`,
  photosDelivered: (name, galleryUrl) => `🎉 ${name}, your photos are ready!

View your gallery: ${galleryUrl}

Questions or edits? Just reply here. — Iconic Images`,
  photographerIntro: (photographerName, clientName2, date) => `Hi ${clientName2}! I'm ${photographerName}, your Iconic Images photographer for ${date}. Feel free to text me here with any questions before the shoot! 📸`,
  newBookingAlert: (address, date, services2) => `🔔 NEW BOOKING — Iconic Images

📍 ${address}
📅 ${date}
🏠 ${services2}

Check dashboard for details.`
};
const RECORD_ADDRESS_KEYS = ["addressLabel", "address", "propertyAddress", "shootLocation", "location"];
function addressText(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object" || Array.isArray(value)) return "";
  const address = value;
  const formatted = text$c(address.formatted) || text$c(address.label);
  if (formatted) return formatted;
  return [address.street, address.city, address.state, address.zip].filter((part) => typeof part === "string" && part.trim()).join(", ");
}
function recordAddressText(record) {
  if (!record || typeof record !== "object") return addressText(record);
  const row = record;
  for (const key of RECORD_ADDRESS_KEYS) {
    const label = addressText(row[key]);
    if (label) return label;
  }
  return "";
}
function text$c(value) {
  return typeof value === "string" ? value.trim() : "";
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
const APPRENTICESHIP_OVERAGE_LABEL = "$25 per 15-minute increment";
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
const addOns = [
  {
    category: "Speed & Social",
    items: [
      {
        id: "same-day",
        name: "Same-Day Delivery",
        price: 50,
        description: "Photos, Twilight Render and Snap Reel by 7PM (Basic Edits).",
        features: ["Photos by 7PM", "Snap Reel by 7PM", "Twilight Renders by 7PM"]
      },
      {
        id: "basic-reel",
        name: "Basic Reel",
        price: 125,
        description: "A high-impact 15s vertical video optimized for social media.",
        features: ["15-Second Vertical Video", "Trending Audio Integration", "Fast-Paced Editing Style"]
      }
    ]
  },
  {
    category: "The Space",
    items: [
      {
        id: "aerial-drone",
        name: "Aerial Drone Stills",
        price: 99,
        description: "Capture the property and its surroundings from a unique perspective.",
        features: ["5 High-Res Aerial Photos", "Neighborhood Context Shots", "Professional Color Grading"]
      },
      {
        id: "matterport-3d",
        name: "Matterport 3D Tour",
        price: 200,
        description: "A fully immersive 3D walkthrough experience for remote buyers.",
        features: ["Full 3D Interior Model", "Dollhouse View", "Interactive Floor Navigation"]
      },
      {
        id: "basic-video",
        name: "Basic Video",
        price: 300,
        description: "A professional cinematic walkthrough of the property interior.",
        features: ["60-Second 4K Video", "Interior & Exterior Highlights", "Licensed Background Music"]
      },
      {
        id: "aerial-premium",
        name: "Aerial Premium Video",
        price: 550,
        description: "The ultimate drone experience with cinematic sweeps and tracking shots.",
        features: ["90-Second 4K Aerial Film", "Dynamic Tracking Shots", "Advanced Neighborhood Highlights"]
      },
      {
        id: "floorplan-2d",
        name: "2D Floor Plan",
        price: 75,
        description: "Accurate dimensions and layout visualization for buyers.",
        features: ["Precise Room Measurements", "Clean Schematic Layout", "PDF & JPG Deliverables"]
      },
      {
        id: "amenity-addon",
        name: "Amenity",
        price: 50,
        description: "Capture the shared spaces and community features that add value.",
        features: ["Pool & Clubhouse Shots", "Parks & Shared Spaces", "Community Context"]
      }
    ]
  },
  {
    category: "The Brand",
    items: [
      {
        id: "agent-intro",
        name: "Agent Intro/Outro",
        price: 75,
        description: "Put a face to the brand with a professional on-camera introduction.",
        features: ["On-Camera Greeting", "Professional Audio Setup", "Call-to-Action Closing"]
      }
    ]
  }
];
const ICONIC_FINISH_PRICE = 75;
const VIRTUAL_STAGING_UNIT_PRICE = 35;
const SPECIALIZED_SOCIAL_PRICE = 85;
const SPECIALIZED_BOTH_PRICE = 125;
const ICONIC_FINISH_NAME = "Iconic Finish (Premium Upgrade)";
const SPECIALIZED_SOCIAL_NAME = "Social Media Optimized Photography";
const SPECIALIZED_BOTH_NAME = "MLS + Social Media Optimized Photography";
const PROMO_DISCOUNTS = {
  ICONICAI: 35,
  NEWYEAR: 50
};
function promoDiscountFor(raw) {
  const code = raw.trim().toUpperCase();
  if (code === "ICONICAI") return { code, discount: PROMO_DISCOUNTS.ICONICAI };
  if (code === "NEWYEAR") return { code, discount: PROMO_DISCOUNTS.NEWYEAR };
  return null;
}
const UPGRADES = [
  {
    id: "iconic-finish",
    name: ICONIC_FINISH_NAME,
    price: ICONIC_FINISH_PRICE,
    description: "Premium digital finish charged at $75 when selected."
  },
  {
    id: "virtual-staging",
    name: "Virtual Staging",
    price: VIRTUAL_STAGING_UNIT_PRICE,
    description: "Per credit. The booking line extends this unit price by the credit count."
  },
  {
    id: "specialized-social",
    name: SPECIALIZED_SOCIAL_NAME,
    price: SPECIALIZED_SOCIAL_PRICE,
    description: "Social-optimized photo set."
  },
  {
    id: "specialized-both",
    name: SPECIALIZED_BOTH_NAME,
    price: SPECIALIZED_BOTH_PRICE,
    description: "MLS and social-optimized photo set."
  }
];
const publicBookingPackages = [
  {
    id: "hollywood",
    name: "Hollywood",
    price: 199,
    description: "A sharp, streamlined listing launch.",
    features: ["30 daytime listing photos", "Branded listing website", "Grass replacement included"]
  },
  {
    id: "hall-of-fame",
    name: "Hall of Fame",
    price: 299,
    description: "More coverage for homes that need to stand out.",
    features: ["35 listing photos", "5 aerial photos", "Branded listing website", "Grass replacement included"]
  },
  {
    id: "red-carpet",
    name: "Red Carpet",
    price: 599,
    description: "More story, more motion, more attention.",
    features: ["45 listing photos", "5 aerials", "Social reel", "Amenity coverage", "Branded listing website", "Grass replacement included"]
  },
  {
    id: "luxe-video",
    name: "Luxe Video",
    price: 785,
    description: "Standout-home coverage with a listing video.",
    features: ["50 listing photos", "5 aerials", "Listing video", "Premium editing package", "Grass replacement included"]
  },
  {
    id: "luxe-3d",
    name: "Luxe 3D Tour",
    price: 785,
    description: "Standout-home coverage with a 3D tour.",
    features: ["50 listing photos", "5 aerials", "3D tour", "Premium editing package", "Grass replacement included"]
  },
  {
    id: "photos-18",
    name: "Photos Only — 18 photos",
    price: 139,
    description: "Photography only. Next-day delivery.",
    features: ["18 photos", "Next-day delivery"]
  },
  {
    id: "photos-25-only",
    name: "Photos Only — 25 photos",
    price: 169,
    description: "Photography only. Next-day delivery.",
    features: ["25 photos", "Next-day delivery"]
  },
  {
    id: "photos-40",
    name: "Photos Only — 40 photos",
    price: 199,
    description: "Photography only. Next-day delivery.",
    features: ["40 photos", "Next-day delivery"]
  },
  {
    id: "aerial-only",
    name: "Aerial Only",
    price: 99,
    description: "Aerial photos without a photo package.",
    features: ["5 aerial photos"]
  },
  {
    id: "essentials-aerial",
    name: "Essentials Aerial Upgrade",
    price: 89,
    description: "Aerial upgrade for The Essentials.",
    features: ["Aerial photos"]
  },
  {
    id: "grass-replacement",
    name: "Grass replacement",
    price: 25,
    description: "Grass replacement for the appointment.",
    features: ["Grass replacement"]
  },
  {
    id: "iconic-polish",
    name: "Iconic Polish",
    price: 75,
    description: "Premium digital finish.",
    features: ["Premium digital finish"]
  },
  {
    id: "agent-intro-video",
    name: "Agent intro/outro",
    price: 59,
    description: "On-camera agent intro or outro, priced per video on the public booking page.",
    features: ["Agent intro/outro"]
  }
];
function serviceCategory(service) {
  if (service.category === "listings") return "photography";
  return "marketing";
}
function addonCategory(id) {
  if (id === "basic-reel" || id === "basic-video" || id === "aerial-premium") return "video";
  if (id === "matterport-3d") return "virtual_staging";
  return "addon";
}
function upgradeCategory(id) {
  if (id === "virtual-staging") return "virtual_staging";
  return "addon";
}
function bookingPackageSeedDocs() {
  const docs = [];
  let sortOrder = 0;
  for (const service of services) {
    docs.push({
      id: service.id,
      name: service.name,
      tier: "campaign",
      price: service.price,
      description: service.description,
      includedServices: service.features || [],
      isActive: true,
      sortOrder: sortOrder++,
      category: serviceCategory(service),
      bookingId: service.id,
      bookingKind: "service",
      source: "booking-form-hardcoded",
      serviceCategory: service.category
    });
  }
  for (const basic of basicsList) {
    docs.push({
      id: basic.id,
      name: basic.name,
      tier: "basic",
      price: basic.price,
      description: basic.description,
      includedServices: basic.features || [],
      isActive: true,
      sortOrder: sortOrder++,
      category: "photography",
      bookingId: basic.id,
      bookingKind: "basic",
      source: "booking-form-hardcoded",
      ...basic.cardTitle ? { cardTitle: basic.cardTitle } : {},
      ...basic.kicker ? { kicker: basic.kicker } : {},
      ...basic.aside ? { aside: basic.aside } : {},
      ...basic.appointmentLimit ? {
        appointmentLimit: basic.appointmentLimit,
        overage: APPRENTICESHIP_OVERAGE_LABEL,
        rules: basic.rules || []
      } : {}
    });
  }
  for (const category of addOns) {
    for (const item of category.items) {
      docs.push({
        id: item.id,
        name: item.name,
        tier: "addon",
        price: item.price,
        description: item.description,
        includedServices: item.features || [],
        isActive: true,
        sortOrder: sortOrder++,
        category: addonCategory(item.id),
        bookingId: item.id,
        bookingKind: "addon",
        source: "booking-form-hardcoded",
        addonGroup: category.category
      });
    }
  }
  for (const upgrade of UPGRADES) {
    docs.push({
      id: upgrade.id,
      name: upgrade.name,
      tier: "addon",
      price: upgrade.price,
      description: upgrade.description,
      includedServices: [],
      isActive: true,
      sortOrder: sortOrder++,
      category: upgradeCategory(upgrade.id),
      bookingId: upgrade.id,
      bookingKind: "upgrade",
      source: "booking-form-hardcoded"
    });
  }
  for (const item of publicBookingPackages) {
    docs.push({
      id: item.id,
      name: item.name,
      tier: "standard",
      price: item.price,
      description: item.description,
      includedServices: item.features || [],
      isActive: true,
      sortOrder: sortOrder++,
      category: "photography",
      bookingId: item.id,
      bookingKind: "service",
      source: "booking-form-hardcoded"
    });
  }
  return docs;
}
const BOOKING_PACKAGE_CATEGORY_ORDER = [
  "photography",
  "video",
  "virtual_staging",
  "marketing",
  "addon"
];
const PACKAGE_CATEGORIES = new Set(BOOKING_PACKAGE_CATEGORY_ORDER);
const PACKAGE_KINDS = /* @__PURE__ */ new Set(["service", "basic", "addon", "upgrade"]);
const PACKAGE_TIERS = /* @__PURE__ */ new Set(["basic", "standard", "premium", "campaign", "addon"]);
function finiteCatalogNumber(value) {
  if (value == null || value === "") return void 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : void 0;
}
function catalogText(value) {
  return typeof value === "string" ? value.trim() : "";
}
const SERVICE_CATEGORIES = /* @__PURE__ */ new Set(["listings", "branding", "business", "growth", "studio"]);
function catalogStringList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const list2 = value.map((entry2) => catalogText(entry2)).filter(Boolean);
  return list2.length > 0 ? list2 : fallback;
}
function catalogServiceCategory(value, fallback) {
  const raw = catalogText(value);
  if (SERVICE_CATEGORIES.has(raw)) return raw;
  return fallback;
}
function withCatalogNotes(item, doc, current) {
  const appointmentLimit = catalogText(doc.appointmentLimit) || current?.appointmentLimit;
  const overage = catalogText(doc.overage) || current?.overage;
  const cardTitle = catalogText(doc.cardTitle) || current?.cardTitle;
  const kicker = catalogText(doc.kicker) || current?.kicker;
  const aside = catalogText(doc.aside) || current?.aside;
  const addonGroup = catalogText(doc.addonGroup) || current?.addonGroup;
  const serviceCategory2 = catalogServiceCategory(doc.serviceCategory, current?.serviceCategory);
  const rules = catalogStringList(doc.rules, current?.rules);
  return {
    ...item,
    ...appointmentLimit ? { appointmentLimit } : {},
    ...overage ? { overage } : {},
    ...cardTitle ? { cardTitle } : {},
    ...kicker ? { kicker } : {},
    ...aside ? { aside } : {},
    ...addonGroup ? { addonGroup } : {},
    ...serviceCategory2 ? { serviceCategory: serviceCategory2 } : {},
    ...rules?.length ? { rules } : {}
  };
}
function packagesForStaffEditor(liveDocs = [], options) {
  const byId = /* @__PURE__ */ new Map();
  for (const seed of bookingPackageSeedDocs()) {
    byId.set(seed.id, withCatalogNotes(
      { ...seed, includedServices: [...seed.includedServices] },
      seed
    ));
  }
  for (const doc of liveDocs) {
    const id = catalogText(doc.id || doc.bookingId);
    if (!id) continue;
    const current = byId.get(id);
    const name = catalogText(doc.name) || current?.name || "";
    if (!name) continue;
    const categoryRaw = catalogText(doc.category);
    const kindRaw = catalogText(doc.bookingKind);
    const tierRaw = catalogText(doc.tier);
    const included = Array.isArray(doc.includedServices) ? doc.includedServices.map((entry2) => catalogText(entry2)).filter(Boolean) : current?.includedServices ?? [];
    byId.set(id, withCatalogNotes({
      id,
      name,
      price: finiteCatalogNumber(doc.price) ?? current?.price ?? 0,
      description: catalogText(doc.description) || current?.description || "",
      category: PACKAGE_CATEGORIES.has(categoryRaw) ? categoryRaw : current?.category ?? "addon",
      bookingKind: PACKAGE_KINDS.has(kindRaw) ? kindRaw : current?.bookingKind ?? "addon",
      tier: PACKAGE_TIERS.has(tierRaw) ? tierRaw : current?.tier ?? "addon",
      includedServices: included,
      sortOrder: finiteCatalogNumber(doc.sortOrder) ?? current?.sortOrder ?? 1e3,
      isActive: doc.isActive === false ? false : doc.isActive === true ? true : current?.isActive ?? true,
      bookingId: catalogText(doc.bookingId) || current?.bookingId || id
    }, doc, current));
  }
  const items = [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return options?.includeInactive ? items : items.filter((item) => item.isActive);
}
function chargeCatalog(input) {
  return input.catalog ?? packagesForStaffEditor([]);
}
function catalogMatchKey(raw) {
  return raw.trim().toLowerCase().replace(/[—–]/g, " ").replace(/\$/g, " ").replace(/[_/]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function stripTrailingPrice(key) {
  return key.replace(/\s+\d+\s+video$/, "").replace(/\s+\d[\d\s]*$/, "").trim();
}
function labeledPrice(raw) {
  const match = raw.match(/\$\s*([0-9][0-9,]*)/);
  if (!match) return void 0;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : void 0;
}
function findCatalogItem(catalog, id) {
  const key = id.trim();
  if (!key) return void 0;
  const active = catalog.filter((item) => item.isActive !== false);
  const direct = active.find((item) => item.id === key || item.bookingId === key);
  if (direct) return direct;
  const wanted = catalogMatchKey(key);
  const stripped = stripTrailingPrice(wanted);
  const matches = active.filter((item) => {
    const name = catalogMatchKey(item.name);
    const title = item.cardTitle ? catalogMatchKey(item.cardTitle) : "";
    return name === wanted || name === stripped || title !== "" && (title === wanted || title === stripped);
  });
  if (matches.length === 1) return matches[0];
  const price = labeledPrice(key);
  if (price == null) return void 0;
  const priced = matches.filter((item) => item.price === price);
  return priced.length === 1 ? priced[0] : void 0;
}
function roundMoney$5(value) {
  return Math.round(value * 100) / 100;
}
function catalogLineName(pkg, qty = 1) {
  if (pkg.id === "virtual-staging" || pkg.bookingId === "virtual-staging") {
    return qty === 1 ? pkg.name : `${pkg.name} (${qty} credits)`;
  }
  if (pkg.appointmentLimit && !pkg.name.includes(pkg.appointmentLimit)) {
    return `${pkg.name} (${pkg.appointmentLimit})`;
  }
  return pkg.name;
}
function catalogLine(pkg, qty = 1) {
  const count = qty > 0 ? qty : 1;
  const unitPrice = roundMoney$5(pkg.price);
  const line = {
    id: pkg.bookingId || pkg.id,
    name: catalogLineName(pkg, count),
    unitPrice,
    qty: count,
    price: roundMoney$5(unitPrice * count)
  };
  if (pkg.description) line.description = pkg.description;
  if (pkg.category) line.category = pkg.category;
  if (pkg.bookingKind) line.bookingKind = pkg.bookingKind;
  if (pkg.tier) line.tier = pkg.tier;
  return line;
}
function pushCatalogLine(items, pkg, qty = 1) {
  items.push(catalogLine(pkg, qty));
}
function warnUncatalogedPackage(name, price) {
  console.warn(`[Bookings] Package not in catalog; keeping submitted line "${name}" at ${price}.`);
}
function buildSubmittedLineItems(input) {
  const catalog = chargeCatalog(input);
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const pushOnce = (pkg, qty = 1) => {
    if (!pkg) return;
    const key = pkg.bookingId || pkg.id;
    if (seen.has(key)) return;
    seen.add(key);
    pushCatalogLine(items, pkg, qty);
  };
  pushOnce(findCatalogItem(catalog, input.selectedService || ""));
  for (const id of input.selectedBasics || []) {
    pushOnce(findCatalogItem(catalog, id));
  }
  for (const id of input.selectedAddOns || []) {
    pushOnce(findCatalogItem(catalog, id));
  }
  if (input.premiumUpgrade) pushOnce(findCatalogItem(catalog, "iconic-finish"));
  const credits = input.virtualStagingCredits || 0;
  if (credits > 0) pushOnce(findCatalogItem(catalog, "virtual-staging"), credits);
  if (input.specializedPhotography === "social") pushOnce(findCatalogItem(catalog, "specialized-social"));
  if (input.specializedPhotography === "both") pushOnce(findCatalogItem(catalog, "specialized-both"));
  if (input.promo) {
    items.push({
      id: `promo-${input.promo.code}`,
      name: `Promo Code: ${input.promo.code}`,
      unitPrice: -input.promo.discount,
      qty: 1,
      price: -input.promo.discount
    });
  }
  return items;
}
function sumLineItemPrices(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
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
    const description = optionalLineText(item.description);
    if (description) line.description = description;
    const category = optionalLineText(item.category);
    if (category) line.category = category;
    const bookingKind = optionalLineText(item.bookingKind);
    if (bookingKind) line.bookingKind = bookingKind;
    const tier = optionalLineText(item.tier);
    if (tier) line.tier = tier;
    return line;
  });
}
function optionalLineText(value) {
  return typeof value === "string" ? value.trim() : "";
}
function textList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry2) => optionalLineText(entry2)).filter(Boolean);
}
function rawPrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return void 0;
}
function pricedPostedLines(items) {
  if (!Array.isArray(items)) return [];
  return normalizeBookingLineItems(items).filter((item, index) => {
    if (!item.name.trim()) return false;
    const raw = items[index];
    if (!raw || typeof raw !== "object") return false;
    return rawPrice(raw.price) !== void 0;
  });
}
function nestedTotal$1(pricing) {
  if (!pricing || typeof pricing !== "object") return void 0;
  return rawPrice(pricing.total);
}
function postedLineForLabel(label, posted) {
  const wanted = catalogMatchKey(label);
  const stripped = stripTrailingPrice(wanted);
  return posted.find((item) => {
    const name = catalogMatchKey(item.name);
    return name === wanted || name === stripped || stripTrailingPrice(name) === stripped;
  });
}
function adoptPostedLine(catalog, item) {
  const match = item.id && findCatalogItem(catalog, item.id) || findCatalogItem(catalog, item.name);
  if (match) return catalogLine(match, item.qty);
  warnUncatalogedPackage(item.name, item.price);
  return item;
}
function fallbackSubmittedLine(label, posted, body) {
  const match = postedLineForLabel(label, posted);
  const price = match?.price ?? labeledPrice(label) ?? (chargedServiceLines(posted).length === 0 ? rawPrice(body.total) ?? nestedTotal$1(body.pricing) : void 0);
  if (price == null) return null;
  const name = match?.name?.trim() || label;
  warnUncatalogedPackage(name, price);
  return {
    name,
    unitPrice: match?.unitPrice ?? price,
    qty: match?.qty || 1,
    price
  };
}
function insertServiceLine(items, line) {
  const key = catalogMatchKey(line.name);
  if (items.some((item) => catalogMatchKey(item.name) === key || catalogMatchKey(item.id || "") === key)) {
    return items;
  }
  const promoAt = items.findIndex((item) => {
    const id = String(item.id || "");
    return id.startsWith("promo-") || item.name.startsWith("Promo Code:");
  });
  if (promoAt === -1) return [...items, line];
  return [...items.slice(0, promoAt), line, ...items.slice(promoAt)];
}
function resolveSubmittedBooking(body, catalog) {
  const list2 = catalog ?? packagesForStaffEditor([]);
  const posted = normalizeBookingLineItems(body.lineItems);
  const postedIds = posted.map((item) => item.id).filter((id) => Boolean(id));
  const kindIds = (kind) => postedIds.filter((id) => findCatalogItem(list2, id)?.bookingKind === kind);
  const selectedService = optionalLineText(body.selectedService) || kindIds("service")[0] || "";
  const selectedBasics = [.../* @__PURE__ */ new Set([...textList(body.selectedBasics), ...kindIds("basic")])].filter((id) => id !== selectedService);
  const claimed = /* @__PURE__ */ new Set([selectedService, ...selectedBasics]);
  const selectedAddOns = [.../* @__PURE__ */ new Set([...textList(body.selectedAddOns), ...kindIds("addon")])].filter((id) => !claimed.has(id));
  const premiumUpgrade = body.premiumUpgrade === true || postedIds.includes("iconic-finish");
  const creditsBody = Number(body.virtualStagingCredits);
  const creditsLine = posted.find((item) => item.id === "virtual-staging")?.qty || 0;
  const virtualStagingCredits = Number.isFinite(creditsBody) && creditsBody > 0 ? Math.round(creditsBody) : creditsLine;
  let specialized = optionalLineText(body.specializedPhotography);
  if (specialized !== "social" && specialized !== "both" && specialized !== "mls") {
    if (postedIds.includes("specialized-both")) specialized = "both";
    else if (postedIds.includes("specialized-social")) specialized = "social";
    else specialized = "";
  }
  const promo = promoDiscountFor(optionalLineText(body.promoCode));
  let lineItems = buildSubmittedLineItems({
    selectedService,
    selectedBasics,
    selectedAddOns,
    premiumUpgrade,
    virtualStagingCredits,
    specializedPhotography: specialized,
    promo,
    lifeOfTheListingCare: Boolean(body.lifeOfTheListingCare),
    catalog: list2
  });
  const pricedPosted = pricedPostedLines(body.lineItems);
  const unresolved2 = [selectedService, ...selectedBasics, ...selectedAddOns].filter((label) => label && !findCatalogItem(list2, label));
  for (const label of unresolved2) {
    const fallback = fallbackSubmittedLine(label, pricedPosted, body);
    if (!fallback) continue;
    lineItems = insertServiceLine(lineItems, fallback);
  }
  if (chargedServiceLines(lineItems).length === 0) {
    const temporary = pricedPosted.map((item) => adoptPostedLine(list2, item));
    const alreadyDiscounted = temporary.some((item) => {
      const id = String(item.id || "");
      return id.startsWith("promo-") || item.name.startsWith("Promo Code:");
    });
    if (chargedServiceLines(temporary).length > 0) {
      lineItems = promo && !alreadyDiscounted ? [
        ...temporary,
        {
          id: `promo-${promo.code}`,
          name: `Promo Code: ${promo.code}`,
          unitPrice: -promo.discount,
          qty: 1,
          price: -promo.discount
        }
      ] : temporary;
    }
  }
  if (chargedServiceLines(lineItems).length === 0 && selectedService) {
    const submitted = rawPrice(body.total) ?? nestedTotal$1(body.pricing) ?? labeledPrice(selectedService);
    if (submitted != null) {
      const name = selectedService;
      warnUncatalogedPackage(name, submitted);
      lineItems = insertServiceLine(lineItems, {
        name,
        unitPrice: submitted,
        qty: 1,
        price: submitted
      });
    }
  }
  return {
    lineItems,
    total: roundMoney$5(sumLineItemPrices(lineItems)),
    promoCode: promo?.code ?? null,
    promoDiscount: promo?.discount ?? 0,
    selectedService: selectedService || null,
    selectedBasics,
    selectedAddOns,
    specializedPhotography: specialized || null,
    virtualStagingCredits,
    premiumUpgrade
  };
}
function chargedServiceLines(items) {
  return items.filter((item) => {
    const id = String(item.id || "");
    const name = String(item.name || "");
    return !id.startsWith("promo-") && !name.startsWith("Promo Code:");
  });
}
const PLAYTEST_ADDRESS = "100 Playtest Lane, Austin, TX 78701";
const STAFF_ROLES = ["admin", "coordinator", "photographer", "editor"];
function normalizeEmail$1(value) {
  return String(value || "").trim().toLowerCase();
}
function cleanPersonName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}
function isStaffRole(value) {
  return STAFF_ROLES.includes(value);
}
function safeStorageFileName(fileName2) {
  const base = String(fileName2 || "upload").split(/[/\\]/).pop() || "upload";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 180) || "upload";
}
function contentTypeForUpload(fileName2, provided) {
  const raw = String(provided || "").trim().toLowerCase();
  if (/^[\w.+-]+\/[\w.+-]+$/.test(raw) && raw.length <= 120 && raw !== "application/octet-stream") {
    return raw;
  }
  const lower = fileName2.toLowerCase();
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
  const email = normalizeEmail$1(identity.email);
  const listingEmail = normalizeEmail$1(listing.clientEmail);
  return Boolean(email && listingEmail && email === listingEmail);
}
const ADDRESS_LIMIT = 300;
const PLACE_ID_LIMIT = 300;
function serviceLocationFromInput(value) {
  if (typeof value === "string") {
    const formatted2 = clip(value, ADDRESS_LIMIT);
    return formatted2 ? { kind: "text", formatted: formatted2 } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value;
  const formatted = clip(firstString(row, ["formatted", "description", "label"]), ADDRESS_LIMIT);
  const placeId = clip(firstString(row, ["placeId", "place_id"]), PLACE_ID_LIMIT);
  const lat = readCoord$1(row.lat ?? row.latitude, "lat");
  const lng = readCoord$1(row.lng ?? row.longitude, "lng");
  if (formatted && placeId && lat != null && lng != null) {
    return { kind: "picked", place: { placeId, formatted, lat, lng } };
  }
  if (formatted) return { kind: "text", formatted };
  return null;
}
function storedServiceLocationFields(value) {
  const location = serviceLocationFromInput(value);
  if (!location) return { address: "" };
  if (location.kind === "text") return { address: location.formatted };
  const { place } = location;
  return {
    address: place,
    lat: place.lat,
    lng: place.lng,
    latitude: place.lat,
    longitude: place.lng,
    placeId: place.placeId
  };
}
function storedRecordPin(record) {
  if (!record) return null;
  for (const key of ["address", "propertyAddress", "shootLocation"]) {
    const location = serviceLocationFromInput(record[key]);
    if (location?.kind === "picked") return { lat: location.place.lat, lng: location.place.lng };
  }
  const lat = readCoord$1(record.lat ?? record.latitude, "lat");
  const lng = readCoord$1(record.lng ?? record.longitude, "lng");
  if (lat != null && lng != null) return { lat, lng };
  return null;
}
function firstString(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}
function clip(value, limit) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}
function readCoord$1(value, axis) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  if (axis === "lat" && (number < -90 || number > 90)) return null;
  if (axis === "lng" && (number < -180 || number > 180)) return null;
  return number;
}
const TX_ZIP_CENTROIDS = {
  // Spring / The Woodlands — studio ZIP
  "77380": { lat: 30.1441, lng: -95.4703 },
  // Spring
  "77373": { lat: 30.0532, lng: -95.3773 },
  // Downtown Houston
  "77002": { lat: 29.7594, lng: -95.3594 },
  // Katy
  "77494": { lat: 29.7404, lng: -95.8304 },
  // Huntsville
  "77340": { lat: 30.6448, lng: -95.5798 },
  // Galveston
  "77550": { lat: 29.2983, lng: -94.793 },
  // Beaumont
  "77701": { lat: 30.0688, lng: -94.1039 },
  // Austin — past zone 6, so the quote is "Travel quoted"
  "78701": { lat: 30.2713, lng: -97.7426 }
};
const EARTH_RADIUS_MILES = 3958.7613;
const TRAVEL_ORIGIN = {
  lat: 30.145492547135,
  lng: -95.448893600358
};
const TRAVEL_ZONES = [
  { zone: 1, outerMiles: 17, feeCents: 0 },
  { zone: 2, outerMiles: 30, feeCents: 5e3 },
  { zone: 3, outerMiles: 42, feeCents: 7500 },
  { zone: 4, outerMiles: 55, feeCents: 1e4 },
  { zone: 5, outerMiles: 69, feeCents: 12500 },
  { zone: 6, outerMiles: 84, feeCents: 15e3 }
];
const TRAVEL_LINE_ID = "travel-fee";
const TRAVEL_QUOTED_NOTE = "Staff must price travel before publishing.";
const TX_ZIP = /\b(7[5-9]\d{3})(?:-\d{4})?\b/g;
const BOUNDARY_EPSILON_MILES = 1e-6;
function haversineMiles(from, to) {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
function assessTravel(value) {
  const pin = pinFrom(value);
  if (pin) return quoteFromMiles(haversineMiles(TRAVEL_ORIGIN, pin));
  const zip = zipFrom(value);
  if (zip) {
    const centroid = TX_ZIP_CENTROIDS[zip];
    if (centroid) return quoteFromMiles(haversineMiles(TRAVEL_ORIGIN, centroid));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value;
    if (row.address != null && row.address !== value) return assessTravel(row.address);
  }
  return unresolved();
}
function travelCustomerLine(travel) {
  if (travel.travelQuoted || travel.travelZone == null) {
    return { label: "Travel quoted", amount: null };
  }
  if (travel.travelZone === 1) {
    return { label: "Travel fee — Zone 1", amount: "FREE (Zone 1)" };
  }
  return {
    label: `Travel fee — Zone ${travel.travelZone}`,
    amount: sidebarMoney(travel.travelFeeCents ?? 0)
  };
}
function travelSummaryText(travel, options) {
  const line = travelCustomerLine(travel);
  const miles = options?.miles && travel.travelMiles != null ? ` (${travel.travelMiles.toFixed(2)} mi)` : "";
  if (travel.travelQuoted || travel.travelZone == null) return `${line.label}${miles}`;
  if (travel.travelZone === 1) return `FREE (Zone 1)${miles}`;
  return `${line.label} — ${emailMoney(travel.travelFeeCents ?? 0)}${miles}`;
}
function isTravelFeeLine(item) {
  if (!item) return false;
  if (String(item.id || "") === TRAVEL_LINE_ID) return true;
  const name = String(item.name || "").trim();
  return name === "Travel quoted" || name === "FREE (Zone 1)" || /^Travel fee\b/i.test(name);
}
function travelInvoiceLine(travel) {
  if (travel.travelQuoted || travel.travelZone == null) {
    return {
      id: TRAVEL_LINE_ID,
      name: "Travel quoted",
      description: TRAVEL_QUOTED_NOTE,
      unitPrice: 0,
      qty: 1,
      price: 0
    };
  }
  const price = travel.travelFeeCents == null ? 0 : travel.travelFeeCents / 100;
  return {
    id: TRAVEL_LINE_ID,
    name: `Travel fee — Zone ${travel.travelZone}`,
    unitPrice: price,
    qty: 1,
    price
  };
}
function applyServerTravel(lineItems, address, clientTravelFeeCents) {
  const travel = assessTravel(address);
  const kept = normalizeBookingLineItems(lineItems).filter((item) => !isTravelFeeLine(item));
  const next = [...kept, travelInvoiceLine(travel)];
  return {
    lineItems: next,
    total: roundMoney$4(sumLineItemPrices(next)),
    travel
  };
}
function travelFromRecord(record) {
  if (!record || typeof record.travelQuoted !== "boolean") return null;
  return {
    travelZone: finiteOrNull(record.travelZone),
    travelMiles: finiteOrNull(record.travelMiles),
    travelFeeCents: finiteOrNull(record.travelFeeCents),
    travelQuoted: record.travelQuoted
  };
}
function travelTextForRecord(record, options) {
  if (!record) return null;
  const stored = travelFromRecord(record);
  if (stored) return travelSummaryText(stored, options);
  const address = record.address ?? record.propertyAddress ?? record.shootLocation ?? record.addressLabel;
  if (address == null || address === "") return null;
  return travelSummaryText(assessTravel(address), options);
}
function quoteFromMiles(miles) {
  const travelMiles = roundMiles(miles);
  for (const zone of TRAVEL_ZONES) {
    if (miles <= zone.outerMiles + BOUNDARY_EPSILON_MILES) {
      return {
        travelZone: zone.zone,
        travelMiles,
        travelFeeCents: zone.feeCents,
        travelQuoted: false
      };
    }
  }
  return {
    travelZone: null,
    travelMiles,
    travelFeeCents: null,
    travelQuoted: true
  };
}
function unresolved() {
  return {
    travelZone: null,
    travelMiles: null,
    travelFeeCents: null,
    travelQuoted: true
  };
}
function pinFrom(value) {
  const location = serviceLocationFromInput(value);
  if (location?.kind === "picked") return { lat: location.place.lat, lng: location.place.lng };
  return null;
}
function zipFrom(value) {
  const text2 = addressText(value) || (typeof value === "string" ? value : "");
  if (!text2) return null;
  const matches = text2.match(TX_ZIP);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1].slice(0, 5);
}
function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function sidebarMoney(cents) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
function emailMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
function roundMiles(miles) {
  return Math.round(miles * 100) / 100;
}
function roundMoney$4(value) {
  return Math.round(value * 100) / 100;
}
function toRad(degrees) {
  return degrees * Math.PI / 180;
}
function buildBookingInvoiceDraft(input) {
  let lineItems = normalizeBookingLineItems(input.lineItems);
  let total = Number(input.total) || 0;
  const travelFields = {};
  if (input.travel) {
    lineItems = [...lineItems.filter((item) => !isTravelFeeLine(item)), travelInvoiceLine(input.travel)];
    total = Math.round(sumLineItemPrices(lineItems) * 100) / 100;
    travelFields.travelZone = input.travel.travelZone;
    travelFields.travelMiles = input.travel.travelMiles;
    travelFields.travelFeeCents = input.travel.travelFeeCents;
    travelFields.travelQuoted = input.travel.travelQuoted;
  }
  return {
    orderRequestId: input.orderRequestId || null,
    orderId: null,
    clientId: input.clientId || null,
    clientEmail: normalizeEmail$1(input.clientEmail),
    clientName: input.clientName,
    lineItems,
    subtotal: input.travel ? total : Number(input.pricing?.subtotal ?? total) || 0,
    tax: Number(input.pricing?.tax) || 0,
    total,
    amountPaid: 0,
    amountDue: total,
    status: "draft",
    paymentProvider: "square",
    promoCode: input.promoCode || null,
    promoDiscount: Number(input.promoDiscount) || 0,
    ...travelFields
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
function draftInvoiceNumber(invoiceId, now = /* @__PURE__ */ new Date()) {
  const year = now.getFullYear();
  const suffix = invoiceId.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "000001";
  return `INV-${year}-${suffix}`;
}
const HUMAN_INVOICE_NUMBER = /^INV-\d{4}-[A-Z0-9]+$/;
function isHumanInvoiceNumber(value) {
  return typeof value === "string" && HUMAN_INVOICE_NUMBER.test(value.trim()) && !/nan/i.test(value);
}
function nextSequentialInvoiceNumber(existing, year) {
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const value of existing) {
    if (typeof value !== "string" || !value.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const parsed = Number(suffix);
    if (!Number.isSafeInteger(parsed) || parsed < 0) continue;
    if (parsed > max) max = parsed;
  }
  const next = max + 1;
  const safe = Number.isSafeInteger(next) && next > 0 ? next : 1;
  return `${prefix}${String(safe).padStart(4, "0")}`;
}
function presentInvoiceNumber(stored, invoiceId, now = /* @__PURE__ */ new Date()) {
  if (typeof stored === "string") {
    const trimmed = stored.trim();
    if (isHumanInvoiceNumber(trimmed)) return trimmed;
  }
  const id = typeof invoiceId === "string" ? invoiceId.trim() : "";
  if (id) return draftInvoiceNumber(id, now);
  return `INV-${now.getFullYear()}-0001`;
}
const DIRECT_PACKAGE_KEYS = ["package", "packageName", "packageId", "selectedPackage", "selectedService", "serviceId"];
const PACKAGE_SKINS = [
  skin({
    look: "apprenticeship",
    ids: ["apprentice-25", "apprentice-50"],
    category: "listing",
    skinLabel: "Apprenticeship",
    title: "Apprenticeship",
    accent: "",
    badge: "Apprenticeship",
    features: "25 photos · 20 min · the cheap one",
    chips: [],
    price: "$75",
    priceNote: "",
    priceDisplay: "$75",
    tier: "entry",
    rank: 1,
    matchPriority: 20,
    match: /apprentice/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "just-photos",
    ids: ["photos-20", "photos-35", "photos-50"],
    category: "listing",
    skinLabel: "Just Photos",
    title: "Just Photos",
    accent: "",
    badge: "Just Photos",
    features: "Photo package · next-day basics",
    chips: [],
    price: "Basics",
    priceNote: "",
    priceDisplay: "Basics",
    tier: "entry",
    rank: 2,
    matchPriority: 10,
    match: /\bjust\s+photos\b|\bphotos?\s+only\b|^photos\s+\d+\b|\b\d+\s+photos?\b/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "essentials",
    ids: ["listing-essentials"],
    category: "listing",
    skinLabel: "Essentials",
    title: "The Essentials",
    accent: "",
    badge: "Essentials",
    features: "30 images · Snap Reel · twilight render",
    chips: [{ label: "Same-day" }, { label: "Reel" }],
    price: "$249",
    priceNote: "per listing",
    priceDisplay: "$249",
    tier: "mid",
    rank: 3,
    matchPriority: 30,
    match: /essentials\b/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "showcase",
    ids: ["listing-showcase"],
    category: "listing",
    skinLabel: "Showcase",
    title: "The Showcase",
    accent: "",
    badge: "The Showcase",
    features: "50 images · 5 aerials · 3D reel · floorplan",
    chips: [{ label: "Aerials" }, { label: "3D Reel" }],
    price: "$549",
    priceNote: "per listing",
    priceDisplay: "$549",
    tier: "mid",
    rank: 4,
    matchPriority: 40,
    match: /showcase/,
    foot: "shoot",
    amenities: true
  }),
  skin({
    look: "legacy",
    ids: ["listing-legacy"],
    category: "listing",
    skinLabel: "Legacy",
    title: "The Legacy",
    accent: "Legacy",
    badge: "Signature",
    features: "Full aerials · 90s 4K cinema · agent on camera",
    chips: [{ label: "4K Cinema" }, { label: "On Camera" }],
    price: "$899",
    priceNote: "per listing",
    priceDisplay: "$899",
    tier: "top",
    rank: 5,
    matchPriority: 50,
    match: /\blegacy\b/,
    foot: "shoot",
    amenities: true
  }),
  skin({
    look: "market-leader",
    ids: ["listing-market-leader"],
    category: "listing",
    skinLabel: "Market Leader",
    title: "Market Leader",
    accent: "Leader",
    badge: "VIP Priority",
    features: "Full-cycle takeover · VR · post-sale pack",
    chips: [
      { label: "VR / Matterport" },
      { label: "Post-Sale", tone: "gold" },
      { label: "Iconic Polish", tone: "gold" }
    ],
    price: "$1,599",
    priceNote: "per listing",
    priceDisplay: "$1,599",
    tier: "top",
    rank: 6,
    matchPriority: 160,
    match: /market\s+leader/,
    foot: "shoot",
    amenities: true
  }),
  skin({
    look: "refresh",
    ids: ["branding-refresh"],
    category: "human-brand",
    skinLabel: "Refresh",
    title: "The Refresh",
    accent: "",
    badge: "Portrait",
    features: "60-min session · 10 lifestyle portraits · AI Twin Lite",
    chips: [{ label: "Lifestyle" }, { label: "Locations" }],
    price: "$349",
    priceNote: "per session",
    priceDisplay: "$349",
    tier: "entry",
    rank: 7,
    matchPriority: 70,
    match: /\brefresh\b/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "content-partner",
    ids: ["branding-content-partner"],
    category: "human-brand",
    skinLabel: "Content Partner",
    title: "Content Partner",
    accent: "",
    badge: "Monthly",
    features: "2-hr film day · 20 custom reels · strategy & scripts",
    chips: [{ label: "20 Reels" }, { label: "Trending Audio" }, { label: "Direction" }],
    price: "$999",
    priceNote: "per month",
    priceDisplay: "$999/mo",
    tier: "mid",
    rank: 8,
    matchPriority: 80,
    match: /content\s+partner/,
    foot: "ongoing",
    amenities: false
  }),
  skin({
    look: "local-legend",
    ids: ["branding-local-legend"],
    category: "human-brand",
    skinLabel: "Local Legend",
    title: "The Local Legend",
    accent: "Legend",
    badge: "Market Takeover",
    features: "6–8 hr production · 90s 4K bio film · 5 neighborhood spotlights",
    chips: [{ label: "Day-in-the-Life" }, { label: "Authority Spots" }, { label: "Scripted" }],
    price: "$2,499",
    priceNote: "per campaign",
    priceDisplay: "$2,499",
    tier: "top",
    rank: 9,
    matchPriority: 150,
    match: /local\s+legend/,
    foot: "campaign",
    amenities: false
  }),
  skin({
    look: "baseline",
    ids: ["business-baseline"],
    category: "social",
    skinLabel: "Baseline",
    title: "The Baseline",
    accent: "",
    badge: "Baseline",
    features: "8 professionally edited reels · 2× / week",
    chips: [{ label: "Consistency" }],
    price: "$500",
    priceNote: "per month",
    priceDisplay: "$500/mo",
    tier: "entry",
    rank: 10,
    matchPriority: 60,
    match: /\bbaseline\b/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "growth-engine",
    ids: ["business-growth-engine"],
    category: "social",
    skinLabel: "Growth Engine",
    title: "Growth Engine",
    accent: "",
    badge: "Growth",
    features: "12 reels · hook suite · conversion captions",
    chips: [{ label: "12 Reels" }, { label: "Hooks" }],
    price: "$850",
    priceNote: "per month",
    priceDisplay: "$850/mo",
    tier: "mid",
    rank: 11,
    matchPriority: 90,
    match: /growth\s+engine/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "professional-suite",
    ids: ["business-professional-suite"],
    category: "social",
    skinLabel: "Professional Suite",
    title: "Professional Suite",
    accent: "",
    badge: "Pro Suite",
    features: "12 reels · full scheduling · multi-platform",
    chips: [{ label: "IG / FB / TikTok" }, { label: "Hands-off" }],
    price: "$1,500",
    priceNote: "per month",
    priceDisplay: "$1,500/mo",
    tier: "mid",
    rank: 12,
    matchPriority: 100,
    match: /professional\s+suite|\bpro\s+suite\b/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "connected-core",
    ids: ["business-connected-core"],
    category: "social",
    skinLabel: "Connected Core",
    title: "Connected Core",
    accent: "",
    badge: "Connected",
    features: "12 reels + management · SOI email · newsletter",
    chips: [{ label: "Social" }, { label: "Database" }],
    price: "$2,000",
    priceNote: "per month",
    priceDisplay: "$2,000/mo",
    tier: "mid",
    rank: 13,
    matchPriority: 110,
    match: /connected\s+core/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "signature-tier",
    ids: ["business-signature-tier"],
    category: "social",
    skinLabel: "Signature Tier",
    title: "Signature Tier",
    accent: "",
    badge: "Signature",
    features: "20 reels · monthly field shoot · lead flagging",
    chips: [{ label: "Daily M–F" }, { label: "Field Shoot" }],
    price: "$2,800",
    priceNote: "per month",
    priceDisplay: "$2,800/mo",
    tier: "mid",
    rank: 14,
    matchPriority: 120,
    match: /signature\s+tier/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "authority-stack",
    ids: ["business-authority-stack"],
    category: "social",
    skinLabel: "Authority Stack",
    title: "Authority Stack",
    accent: "Stack",
    badge: "Omni",
    features: "20+ reels · pro film · SMS + email automation",
    chips: [
      { label: "20+ Reels", tone: "teal" },
      { label: "SMS / Email" },
      { label: "Omni" }
    ],
    price: "$3,200",
    priceNote: "per month",
    priceDisplay: "$3,200/mo",
    tier: "top",
    rank: 15,
    matchPriority: 130,
    match: /authority\s+stack/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "iconic-partnership",
    ids: ["business-iconic-partnership"],
    category: "social",
    skinLabel: "Iconic Partnership",
    title: "Iconic Partnership",
    accent: "Partnership",
    badge: "Agency",
    features: "Unlimited reels · 2 field shoots · CRM + polish",
    chips: [{ label: "Unlimited" }, { label: "CRM" }, { label: "Polish" }],
    price: "$4,500",
    priceNote: "per month",
    priceDisplay: "$4,500/mo",
    tier: "top",
    rank: 16,
    matchPriority: 140,
    match: /iconic\s+partnership/,
    foot: "none",
    amenities: false
  })
];
const BY_LOOK = new Map(PACKAGE_SKINS.map((item) => [item.look, item]));
const MATCH_ORDER = [...PACKAGE_SKINS].sort((a, b) => b.matchPriority - a.matchPriority);
const ID_INDEX = /* @__PURE__ */ new Map();
for (const item of PACKAGE_SKINS) {
  for (const id of item.ids) ID_INDEX.set(normalizePackageText(id), item.look);
}
function packageSkin(look) {
  const found = BY_LOOK.get(look);
  if (!found) throw new Error(`Missing package skin: ${look}`);
  return found;
}
function resolvePackageSkin(value) {
  const look = lookFromUnknown(value);
  return look ? packageSkin(look) : null;
}
function resolvePackageSkinFromOrder(data) {
  for (const key of DIRECT_PACKAGE_KEYS) {
    if (!hasValue(data[key])) continue;
    return resolvePackageSkin(data[key]);
  }
  const look = bestLook(data.serviceIds, data.services, data.lineItems, data.selectedBasics);
  return look ? packageSkin(look) : null;
}
function matchPackageLook(raw) {
  const value = normalizePackageText(raw);
  if (!value) return null;
  const byId = ID_INDEX.get(value);
  if (byId) return byId;
  for (const item of MATCH_ORDER) {
    if (item.match.test(value)) return item.look;
  }
  return null;
}
function packageSkinRank(look) {
  return packageSkin(look).rank;
}
function skin(item) {
  return item;
}
function lookFromUnknown(value) {
  if (typeof value === "string" || typeof value === "number") return matchPackageLook(String(value));
  if (Array.isArray(value)) return bestLook(value);
  if (value && typeof value === "object") {
    const record = value;
    return bestLook(record.id, record.packageId, record.name, record.title, record.label);
  }
  return null;
}
function bestLook(...values) {
  let best = null;
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const look = value && typeof value === "object" ? lookFromUnknown(value) : matchPackageLook(value == null ? "" : String(value));
    if (look && (!best || packageSkinRank(look) > packageSkinRank(best))) best = look;
  };
  values.forEach(visit);
  return best;
}
function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
function normalizePackageText(raw) {
  return raw.trim().toLowerCase().replace(/[—–]/g, " ").replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function resolveListingCardLook(data) {
  return resolvePackageSkinFromOrder(data)?.look ?? null;
}
function listingCardAddress(data) {
  const records = addressRecords(data);
  let street = "";
  let city = "";
  let state = "";
  let zip = "";
  for (const record of records) {
    if (!street) street = firstText$3(record, ["street", "line1", "addressLine1", "streetAddress"]);
    if (!city) city = firstText$3(record, ["city"]);
    if (!state) state = firstText$3(record, ["state"]);
    if (!zip) zip = firstText$3(record, ["zip", "postalCode"]);
  }
  let locality = joinLocality(city, state, zip);
  if (!street || !locality) {
    const parsed = parseAddressLine(addressString$1(data));
    if (!street) street = parsed.street;
    if (!locality) locality = parsed.locality;
  }
  return { street, locality };
}
function listingCardAmenities(data) {
  return {
    beds: countLabel(readRaw(data, ["bedrooms", "beds", "bedCount"])),
    baths: countLabel(readRaw(data, ["bathrooms", "baths", "bathCount"])),
    garage: countLabel(readRaw(data, ["garage", "garages", "garageSpaces", "garageCount"])),
    pool: poolLabel(readRaw(data, ["pool", "hasPool"]))
  };
}
function formatShootDateLabel(isoDay, raw) {
  if (isoDay && /^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
    const [year, month, day] = isoDay.split("-");
    return `${month}.${day}.${year}`;
  }
  if (typeof raw === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(raw.trim())) return raw.trim();
  return "";
}
function addressRecords(data) {
  const records = [data];
  for (const key of ["address", "propertyAddress", "shootLocation"]) {
    const nested2 = asRecord$3(data[key]);
    if (nested2) records.push(nested2);
  }
  return records;
}
function addressString$1(data) {
  for (const key of ["address", "propertyAddress", "shootLocation", "addressLabel"]) {
    const label = addressText(data[key]);
    if (label) return label;
  }
  return "";
}
function parseAddressLine(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { street: "", locality: "" };
  const piped = trimmed.split(/\s*\|\s*/);
  if (piped.length === 2 && piped[0] && piped[1]) return { street: piped[0], locality: piped[1] };
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean).filter((part) => !/^(usa|u\.s\.a\.|united states)$/i.test(part));
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZip) {
      return {
        street: parts.slice(0, -2).join(", "),
        locality: `${parts[parts.length - 2]}, ${stateZip[1].toUpperCase()} ${stateZip[2]}`
      };
    }
    if (/^\d{5}(?:-\d{4})?$/.test(last) && /^[A-Za-z]{2}$/.test(parts[parts.length - 2] || "")) {
      return {
        street: parts.slice(0, -3).join(", "),
        locality: `${parts[parts.length - 3]}, ${parts[parts.length - 2].toUpperCase()} ${last}`
      };
    }
    if (/^[A-Za-z]{2}$/.test(last)) {
      return {
        street: parts.slice(0, -2).join(", "),
        locality: `${parts[parts.length - 2]}, ${last.toUpperCase()}`
      };
    }
  }
  return { street: trimmed, locality: "" };
}
function joinLocality(city, state, zip) {
  const region = [state.length === 2 ? state.toUpperCase() : state, zip].filter(Boolean).join(" ");
  return [city, region].filter(Boolean).join(", ");
}
function readRaw(data, keys) {
  for (const record of factRecords(data)) {
    for (const key of keys) {
      const value = record[key];
      if (value == null || value === "") continue;
      return value;
    }
  }
  return void 0;
}
function factRecords(data) {
  const records = [data];
  for (const key of ["property", "details", "facts", "propertyFacts", "homeFacts"]) {
    const nested2 = asRecord$3(data[key]);
    if (nested2) records.push(nested2);
  }
  const portal = asRecord$3(data.portalData);
  if (portal) {
    records.push(portal);
    const facts = asRecord$3(portal.facts);
    if (facts) records.push(facts);
  }
  return records;
}
function countLabel(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const match = value.trim().match(/\d+(?:\.\d+)?/);
    return match ? match[0] : "";
  }
  return "";
}
function poolLabel(value) {
  if (value === true) return "Y";
  if (value === false || value == null || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return "";
    return value === 1 ? "Y" : String(value);
  }
  const text2 = String(value).trim();
  if (/^(y|yes|true)$/i.test(text2)) return "Y";
  if (/^(n|no|false|0)$/i.test(text2)) return "";
  if (/^\d+(?:\.\d+)?$/.test(text2)) return text2 === "1" || text2 === "1.0" ? "Y" : text2;
  return "";
}
function firstText$3(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
function asRecord$3(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
const CHICAGO = "America/Chicago";
const ACCEPTED = /* @__PURE__ */ new Set([
  "confirmed",
  "scheduled",
  "accepted",
  "in_progress",
  "completed",
  "shot_complete",
  "appt_scheduled",
  "consult_scheduled",
  "delivered"
]);
function statusKey$1(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
function calendarDateKey(value, timeZone = CHICAGO) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return instantDateKey(new Date(value), timeZone);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : instantDateKey(value, timeZone);
  if (typeof value === "object") {
    const record = value;
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return instantDateKey(date, timeZone);
    }
    const seconds = typeof record.seconds === "number" ? record.seconds : typeof record._seconds === "number" ? record._seconds : null;
    if (seconds == null) return null;
    return instantDateKey(new Date(seconds * 1e3), timeZone);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const textual = textualDateKey(trimmed);
  if (textual) return textual;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return instantDateKey(parsed, timeZone);
}
function formatChicagoDate(value, style = "short") {
  const key = calendarDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const options = style === "long" ? { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" } : style === "weekday" ? { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } : style === "compact" ? { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-US", options).format(date);
}
function formatPortalDate(value) {
  return formatChicagoDate(value, "short");
}
function bookingDateLabel(value, fallback = "") {
  const formatted = formatChicagoDate(value);
  if (formatted) return formatted;
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}
function chicagoNoonDate(value) {
  const key = calendarDateKey(value);
  if (!key) return null;
  const date = /* @__PURE__ */ new Date(`${key}T12:00:00-06:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function clockTime(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^tbd$/i.test(trimmed)) return null;
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (!meridiem && hours > 23) return null;
  if (meridiem && hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function storedAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney$3(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return roundMoney$3(parsed);
  }
  return null;
}
function listingCoverUrl(images) {
  if (!Array.isArray(images)) return null;
  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const record = image;
    const candidate = typeof record.url === "string" ? record.url : record.thumbnailUrl;
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) return candidate.trim();
  }
  return null;
}
function sortNewestFirst(items) {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    const aOk = Number.isFinite(aTime);
    const bOk = Number.isFinite(bTime);
    if (aOk && bOk && aTime !== bTime) return bTime - aTime;
    if (aOk !== bOk) return aOk ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}
function clientListingPath(listingId) {
  return `/portal/listings/${encodeURIComponent(listingId.trim())}`;
}
function buildClientListing(id, data) {
  const images = data.images;
  const projectType2 = data.projectType === "business" || data.projectType === "real_estate" ? data.projectType : "";
  const status = typeof data.status === "string" && data.status.trim() ? data.status.trim() : "scheduled";
  const appointmentDate = calendarDateKey(data.shootDate || data.apptDate || data.appointmentDate || data.scheduledDate);
  const addressParts2 = listingCardAddress(data);
  const amenities = listingCardAmenities(data);
  return {
    id,
    address: addressText(data.propertyAddress || data.address || data.shootLocation) || "Listing",
    status,
    projectType: projectType2,
    imageCount: Array.isArray(images) ? images.length : 0,
    coverUrl: listingCoverUrl(images),
    createdAt: isoStamp(data.createdAt),
    appointmentDate,
    href: clientListingPath(id),
    look: resolveListingCardLook(data),
    street: addressParts2.street,
    locality: addressParts2.locality,
    shootDateLabel: formatShootDateLabel(appointmentDate, data.shootDate),
    beds: amenities.beds,
    baths: amenities.baths,
    garage: amenities.garage,
    pool: amenities.pool
  };
}
function buildClientInvoice(id, data, now = /* @__PURE__ */ new Date()) {
  const createdAt = isoStamp(data.createdAt);
  const issuedAt = createdAt ? new Date(createdAt) : now;
  return {
    id,
    invoiceNumber: presentInvoiceNumber(data.invoiceNumber, id, Number.isNaN(issuedAt.getTime()) ? now : issuedAt),
    status: typeof data.status === "string" && data.status.trim() ? data.status.trim() : "",
    clientName: text$b(data.clientName),
    address: addressText(data.billToAddress || data.address || data.propertyAddress),
    createdAt,
    issuedOn: formatPortalDate(data.createdAt) || formatPortalDate(data.sentAt) || formatPortalDate(data.paidAt),
    lineItems: storedLines(data.lineItems, data.services),
    subtotal: storedAmount(data.subtotal),
    processing: storedAmount(data.processing),
    fees: storedAmount(data.fees),
    travel: storedAmount(data.travel),
    promoDiscount: storedAmount(data.promoDiscount),
    promoCode: text$b(data.promoCode),
    tax: storedAmount(data.tax),
    total: storedAmount(data.total),
    amountPaid: storedAmount(data.amountPaid),
    amountDue: storedAmount(data.amountDue)
  };
}
function buildClientAppointment(id, data, orderRequest) {
  const scheduledDate = firstDate$1(data.scheduledDate, data.appointmentDate);
  const scheduledTime = firstTime(data.scheduledTime, data.appointmentTime, data.apptTime);
  let requestedDate = firstDate$1(data.requestedDate, data.originalScheduledDate, data.originalDate, orderRequest?.requestedDate, orderRequest?.originalScheduledDate);
  let requestedTime = firstTime(data.requestedTime, data.originalScheduledTime, data.originalTime, orderRequest?.requestedTime, orderRequest?.originalScheduledTime);
  const requestScheduledDate = firstDate$1(orderRequest?.scheduledDate, orderRequest?.appointmentDate);
  const requestScheduledTime = firstTime(orderRequest?.scheduledTime, orderRequest?.appointmentTime);
  if (!requestedDate && requestScheduledDate && scheduledDate && requestScheduledDate !== scheduledDate) {
    requestedDate = requestScheduledDate;
  }
  if (!requestedTime && requestScheduledTime && scheduledTime && clockTime(requestScheduledTime) !== clockTime(scheduledTime)) {
    requestedTime = requestScheduledTime;
  }
  const proposedDate = firstDate$1(data.proposedDate, data.alternateDate, data.counterDate);
  const proposedTime = firstTime(data.proposedTime, data.alternateTime, data.counterTime);
  const status = typeof data.status === "string" ? data.status.trim() : "";
  const iconicAccepted = ACCEPTED.has(statusKey$1(status)) || statusKey$1(status) === "pending_confirmation" || statusKey$1(status) === "rescheduled";
  let date = scheduledDate;
  let time = scheduledTime;
  if (proposedDate && iconicAccepted && proposedDate !== (requestedDate || scheduledDate)) {
    if (!requestedDate && scheduledDate) requestedDate = scheduledDate;
    date = proposedDate;
    if (proposedTime) time = proposedTime;
  }
  if (!date) date = requestedDate;
  if (!time) time = requestedTime;
  return {
    id,
    address: addressText(data.addressLabel || data.address) || "Appointment",
    status,
    date,
    time,
    requestedDate,
    requestedTime,
    approved: hasStamp(data.clientConfirmedAt) || hasStamp(data.changeApprovedAt) || hasStamp(data.agentApprovedAt) || hasStamp(orderRequest?.clientConfirmedAt) || hasStamp(orderRequest?.changeApprovedAt),
    createdAt: isoStamp(data.createdAt)
  };
}
function storedLines(lineItems, services2) {
  const raw = Array.isArray(lineItems) ? lineItems : Array.isArray(services2) ? services2 : [];
  return raw.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ name: item.trim(), qty: null, amount: null }];
    if (!item || typeof item !== "object") return [];
    const record = item;
    const named = text$b(record.name) || text$b(record.label);
    const description = text$b(record.description);
    const name = named || description;
    const qty = storedQty(record.qty ?? record.quantity);
    const amount = storedAmount(record.price ?? record.amount ?? record.total);
    if (!name && amount == null && qty == null) return [];
    const line = { name: name || "Line item", qty, amount };
    const id = text$b(record.id);
    const category = text$b(record.category);
    if (id) line.id = id;
    if (category) line.category = category;
    if (named && description) line.description = description;
    return [line];
  });
}
function storedQty(value) {
  const qty = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return Math.round(qty);
}
function firstDate$1(...values) {
  for (const value of values) {
    const key = calendarDateKey(value);
    if (key) return key;
  }
  return null;
}
function firstTime(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() && !/^tbd$/i.test(value.trim())) return value.trim();
  }
  return "";
}
function hasStamp(value) {
  if (value == null || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}
function isoStamp(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
}
function text$b(value) {
  return typeof value === "string" ? value.trim() : "";
}
function roundMoney$3(value) {
  return Math.round(value * 100) / 100;
}
const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};
function textualDateKey(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const long = value.match(/^(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (long) {
    const month = MONTHS[long[1].toLowerCase()];
    const day = Number(long[2]);
    const year = Number(long[3]);
    if (month && day >= 1 && day <= 31) return dateKey$1(year, month, day);
  }
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return dateKey$1(year, month, day);
  }
  return null;
}
function instantDateKey(date, timeZone) {
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return dateKey$1(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  return formatZoned(date, timeZone);
}
function dateKey$1(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function formatZoned(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
function getPrivateKey() {
  return (process.env.GOOGLE_CALENDAR_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}
function getAuth() {
  const clientEmail2 = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  if (!clientEmail2 || !privateKey) return null;
  return new google.auth.JWT({
    email: clientEmail2,
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
function bookingEventDescription(booking) {
  return [
    `Order: ${booking.orderId}`,
    `Client: ${booking.clientName}`,
    booking.clientEmail ? `Email: ${booking.clientEmail}` : "",
    booking.clientPhone ? `Phone: ${booking.clientPhone}` : "",
    booking.photographerName ? `Photographer: ${booking.photographerName}` : "",
    booking.services.length ? `Services: ${booking.services.join(", ")}` : "",
    booking.travelSummary ? `Travel: ${booking.travelSummary}` : "",
    booking.notes ? `Notes: ${booking.notes}` : ""
  ].filter(Boolean).join("\n");
}
function bookingEventTimes(date, time) {
  if (!date) return null;
  const { hours, minutes } = parseTime(time);
  const datePart = calendarDateKey(date);
  if (!datePart) return null;
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
  const times = bookingEventTimes(booking.scheduledDate, booking.scheduledTime);
  if (!auth || !times) return null;
  const calendarId = booking.photographerCalendarId || booking.photographerEmail || process.env.GOOGLE_CALENDAR_ID || "primary";
  const calendar = google.calendar({ version: "v3", auth });
  const summary = `Iconic Images: ${booking.clientName}`;
  const description = bookingEventDescription(booking);
  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody: {
      summary,
      location: addressText(booking.address),
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
function toCalendarScheduleEvent(event, source) {
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  return {
    id: event.id || `${source.id}-${event.iCalUID || event.htmlLink || event.summary}`,
    calendarId: source.id,
    photographerName: source.name || source.id,
    summary: event.summary || "Untitled appointment",
    location: event.location || "",
    description: event.description || "",
    start: event.start?.dateTime || event.start?.date || null,
    end: event.end?.dateTime || event.end?.date || null,
    htmlLink: event.htmlLink || null,
    allDay,
    transparency: event.transparency || null,
    eventType: event.eventType || null,
    status: event.status || null
  };
}
async function listCalendarScheduleEvents({
  calendars,
  timeMin,
  timeMax
}) {
  const auth = getAuth();
  if (!auth) return { configured: false, events: [], readFailures: 0 };
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
      return (response.data.items || []).map((event) => toCalendarScheduleEvent(event, source));
    })
  );
  const events = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    console.error(`[Calendar] Failed to read ${uniqueCalendars[index]?.id}:`, result.reason);
    return [];
  });
  const readFailures = results.filter((result) => result.status === "rejected").length;
  return { configured: true, events, readFailures };
}
const db$q = () => admin.firestore();
async function upsertPortalClient(input) {
  const email = normalizeEmail$1(input.email);
  const firstName = cleanPersonName(input.firstName);
  const lastName = cleanPersonName(input.lastName);
  const phone = String(input.phone || "").trim().slice(0, 40);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const existing = email ? await db$q().collection("clients").where("email", "==", email).limit(5).get() : null;
  const linked = existing?.docs.find((doc) => doc.id !== input.uid);
  const linkedData = linked?.data() || {};
  const uidRef = db$q().collection("clients").doc(input.uid);
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
  const direct = await db$q().collection("clients").doc(uid).get();
  let profile = direct.exists ? { id: direct.id, ...direct.data() } : null;
  const redirectId = typeof profile?._redirect === "string" ? profile._redirect : "";
  if (redirectId) ids.add(redirectId);
  const linkedId = typeof profile?.linkedClientId === "string" ? profile.linkedClientId : "";
  if (linkedId) ids.add(linkedId);
  const normalized = normalizeEmail$1(email || profile?.email);
  if (normalized) {
    const matches = await db$q().collection("clients").where("email", "==", normalized).limit(10).get();
    for (const doc of matches.docs) {
      ids.add(doc.id);
      if (!profile) profile = { id: doc.id, ...doc.data() };
    }
  }
  if (redirectId && profile && !profile.email) {
    const real = await db$q().collection("clients").doc(redirectId).get();
    if (real.exists) profile = { id: real.id, ...real.data(), portalDocId: uid };
  }
  return { ids: [...ids], profile, email: normalized };
}
function planBookingAccount(input) {
  if (input.staffMatch) {
    return {
      createAuthUser: false,
      sendPasswordSetup: false,
      attachToUid: null,
      skipReason: "staff_email"
    };
  }
  if (input.authUid) {
    return {
      createAuthUser: false,
      sendPasswordSetup: false,
      attachToUid: input.authUid,
      skipReason: null
    };
  }
  return {
    createAuthUser: true,
    sendPasswordSetup: true,
    attachToUid: null,
    skipReason: null
  };
}
const db$p = () => admin.firestore();
function appUrl$3() {
  return process.env.APP_URL || process.env.FRONTEND_URL || "https://iconicimagestx.com";
}
async function attachBookingClient(input) {
  const email = normalizeEmail$1(input.email);
  if (!email || !email.includes("@")) {
    return { clientId: null, createdAccount: false, passwordSetupLink: null, skipReason: "invalid_email" };
  }
  const firstName = cleanPersonName(input.firstName) || "Client";
  const lastName = cleanPersonName(input.lastName);
  const phone = String(input.phone || "").trim().slice(0, 40);
  const staffHit = await db$p().collection("staff").where("email", "==", email).limit(1).get();
  let authUid = null;
  if (staffHit.empty) {
    try {
      authUid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (err) {
      const code = err.code;
      if (code !== "auth/user-not-found") throw err;
    }
  }
  const plan = planBookingAccount({ staffMatch: !staffHit.empty, authUid });
  if (plan.skipReason === "staff_email") {
    console.warn(`[Bookings] Skipped portal account for staff email ${email}`);
    return { clientId: null, createdAccount: false, passwordSetupLink: null, skipReason: "staff_email" };
  }
  let uid = plan.attachToUid;
  let createdAccount = false;
  if (plan.createAuthUser) {
    try {
      const user = await admin.auth().createUser({
        email,
        password: randomBytes(24).toString("base64url"),
        displayName: `${firstName} ${lastName}`.trim(),
        emailVerified: false
      });
      uid = user.uid;
      createdAccount = true;
    } catch (err) {
      const code = err.code;
      if (code !== "auth/email-already-exists") throw err;
      uid = (await admin.auth().getUserByEmail(email)).uid;
      createdAccount = false;
    }
  }
  if (!uid) {
    return { clientId: null, createdAccount: false, passwordSetupLink: null, skipReason: null };
  }
  try {
    await upsertPortalClient({ uid, email, firstName, lastName, phone });
  } catch (err) {
    if (createdAccount) await admin.auth().deleteUser(uid).catch(() => void 0);
    throw err;
  }
  let passwordSetupLink = null;
  if (createdAccount && plan.sendPasswordSetup && input.preparePasswordLink) {
    passwordSetupLink = await createPasswordSetupLink(email);
  }
  return { clientId: uid, createdAccount, passwordSetupLink, skipReason: null };
}
async function createPasswordSetupLink(email) {
  const continueUrl = `${appUrl$3().replace(/\/$/, "")}/portal`;
  try {
    return await admin.auth().generatePasswordResetLink(email, {
      url: continueUrl,
      handleCodeInApp: false
    });
  } catch (err) {
    console.warn("[Bookings] Password setup link with continue URL failed. Using the default Firebase link.", err);
  }
  try {
    return await admin.auth().generatePasswordResetLink(email);
  } catch (err) {
    console.error("[Bookings] Password setup link was not created:", err);
    return null;
  }
}
async function sendFirebasePasswordEmail(email) {
  const key = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!key) {
    throw new Error("Set FIREBASE_WEB_API_KEY or VITE_FIREBASE_API_KEY to send the Firebase password email.");
  }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email })
  });
  if (!res.ok) {
    throw new Error(`Firebase password email failed (${res.status}).`);
  }
}
async function createRequestedAppointment(input) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db$p().collection("appointments").add({
    orderRequestId: input.orderRequestId,
    clientId: input.clientId,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    clientPhone: input.clientPhone,
    address: input.address,
    addressLabel: input.addressLabel,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    services: input.services,
    status: "requested",
    source: "booking_form",
    notes: input.notes,
    createdAt: now,
    updatedAt: now
  });
}
function visibleToPortalClient(record, identity) {
  if (!record) return false;
  if (record.clientId && identity.ids.includes(String(record.clientId))) return true;
  const email = normalizeEmail$1(identity.email);
  if (!email) return false;
  return [record.email, record.clientEmail].some((value) => normalizeEmail$1(value) === email);
}
const PORTAL_LISTING_ID$1 = /^[A-Za-z0-9_-]{4,128}$/;
const NEVER_FILL = /* @__PURE__ */ new Set([
  "images",
  "createdAt",
  "source",
  "id",
  "lockDownloads",
  "requirePayment",
  "lockStudio"
]);
const NEW_BOOKING_LOCKS = {
  lockDownloads: true,
  requirePayment: true,
  lockStudio: false
};
function isPortalListingId(value) {
  return PORTAL_LISTING_ID$1.test(value);
}
function bookingListingDocId(kind, rawId) {
  const safe = rawId.trim().replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!safe) return null;
  let id = `bklist_${kind}_${safe}`;
  if (id.length > 128) id = id.slice(0, 128).replace(/_+$/g, "");
  return isPortalListingId(id) ? id : null;
}
function bookingListingGroups(input) {
  const requests = cleanDocs(input.orderRequests);
  const orders = cleanDocs(input.orders);
  const invoices = cleanDocs(input.invoices);
  const appointments = cleanDocs(input.appointments);
  const galleries = cleanDocs(input.galleries);
  const uf = new UnionFind();
  for (const doc of requests) {
    const node = nodeId("orderRequests", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("listings", text$a(doc.data.listingId)));
    uf.link(node, nodeId("orders", text$a(doc.data.orderId) || text$a(doc.data.convertedToOrderId)));
    uf.link(node, nodeId("invoices", text$a(doc.data.invoiceId)));
    uf.link(node, nodeId("galleries", text$a(doc.data.galleryId)));
  }
  for (const doc of orders) {
    const node = nodeId("orders", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text$a(doc.data.orderRequestId)));
    uf.link(node, nodeId("listings", text$a(doc.data.listingId)));
    uf.link(node, nodeId("invoices", text$a(doc.data.invoiceId)));
    uf.link(node, nodeId("galleries", text$a(doc.data.galleryId)));
  }
  for (const doc of invoices) {
    const node = nodeId("invoices", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text$a(doc.data.orderRequestId)));
    uf.link(node, nodeId("orders", text$a(doc.data.orderId)));
    uf.link(node, nodeId("listings", text$a(doc.data.listingId)));
  }
  for (const doc of appointments) {
    const node = nodeId("appointments", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text$a(doc.data.orderRequestId)));
    uf.link(node, nodeId("orders", text$a(doc.data.orderId)));
    uf.link(node, nodeId("listings", text$a(doc.data.listingId)));
  }
  for (const doc of galleries) {
    const node = nodeId("galleries", doc.id);
    uf.touch(node);
    uf.link(node, nodeId("orderRequests", text$a(doc.data.orderRequestId)));
    uf.link(node, nodeId("orders", text$a(doc.data.orderId)));
    uf.link(node, nodeId("invoices", text$a(doc.data.invoiceId)));
    uf.link(node, nodeId("listings", text$a(doc.data.listingId)));
  }
  const groups = [];
  for (const nodes of uf.components()) {
    const orderRequestIds = idsWithPrefix(nodes, "orderRequests");
    const orderIds = idsWithPrefix(nodes, "orders");
    const invoiceIds = idsWithPrefix(nodes, "invoices");
    const appointmentIds = idsWithPrefix(nodes, "appointments");
    const galleryIds = idsWithPrefix(nodes, "galleries");
    if (orderRequestIds.length + orderIds.length + invoiceIds.length + appointmentIds.length === 0) continue;
    const stableId = stableListingId(orderRequestIds, orderIds, invoiceIds, appointmentIds);
    if (!stableId) continue;
    const group = {
      stableId,
      preferredListingIds: preferredListingIds({
        orderRequests: requests.filter((doc) => orderRequestIds.includes(doc.id)),
        orders: orders.filter((doc) => orderIds.includes(doc.id)),
        invoices: invoices.filter((doc) => invoiceIds.includes(doc.id)),
        appointments: appointments.filter((doc) => appointmentIds.includes(doc.id)),
        galleries: galleries.filter((doc) => galleryIds.includes(doc.id))
      }),
      orderRequestIds,
      orderIds,
      invoiceIds,
      appointmentIds,
      galleryIds,
      orderRequests: requests.filter((doc) => orderRequestIds.includes(doc.id)),
      orders: orders.filter((doc) => orderIds.includes(doc.id)),
      invoices: invoices.filter((doc) => invoiceIds.includes(doc.id)),
      appointments: appointments.filter((doc) => appointmentIds.includes(doc.id)),
      galleries: galleries.filter((doc) => galleryIds.includes(doc.id))
    };
    groups.push(group);
  }
  return groups.sort((a, b) => a.stableId < b.stableId ? -1 : a.stableId > b.stableId ? 1 : 0);
}
function planBookingListingGroup(group, existingListings, identity) {
  const clients = clientsFor(group, identity);
  const existing = chooseListing(group, cleanDocs(existingListings), clients);
  const listingId = existing?.id || group.stableId;
  if (!isPortalListingId(listingId)) return null;
  const desired = desiredListingFields(group, identity);
  const createFields = existing ? desired : { ...desired, ...NEW_BOOKING_LOCKS };
  return {
    listingId,
    create: !existing,
    createFields,
    fillFields: existing ? fillEmptyListingFields(existing.data, desired) : {},
    links: linksFor(group, listingId, cleanDocs(existingListings), clients)
  };
}
function fillEmptyListingFields(existing, desired) {
  const patch = {};
  for (const [key, value] of Object.entries(desired)) {
    if (NEVER_FILL.has(key) || !present(value) || !isEmpty(existing[key])) continue;
    patch[key] = value;
  }
  return patch;
}
function clientOwnsListing(listing, clients) {
  const clientId2 = text$a(listing.clientId);
  const email = normalizeEmail$1(listing.clientEmail || listing.email);
  if (!clientId2 && !email) return true;
  if (clientId2 && clients.ids.includes(clientId2)) return true;
  return Boolean(email && clients.emails.includes(email));
}
function desiredListingFields(group, identity) {
  const fields = { images: [], source: "booking" };
  const address = bestAddress(group);
  const scheduleDate = firstScheduleDate(group);
  const scheduleTime = firstScheduleTime(group);
  const total = firstTotal(group);
  const squareFootage = firstScalar(group, ["squareFootage", "sqft"]);
  const names = serviceNames(group);
  assign(fields, "orderRequestId", chosenId(group.orderRequests, group.orderRequestIds));
  assign(fields, "orderId", chosenId(group.orders, group.orderIds, [...group.orderRequests, ...group.invoices], ["convertedToOrderId", "orderId"]));
  assign(fields, "invoiceId", chosenInvoiceId(group));
  assign(fields, "appointmentId", chosenId(group.appointments, group.appointmentIds));
  assign(fields, "galleryId", chosenId(group.galleries, group.galleryIds, [...group.orderRequests, ...group.orders], ["galleryId"]));
  assign(fields, "clientId", clientId(group, identity));
  assign(fields, "clientEmail", clientEmail(group, identity));
  assign(fields, "clientName", clientName(group));
  assign(fields, "clientPhone", firstText$2(group, ["clientPhone", "phone"]));
  if (address) {
    fields.address = address;
    fields.propertyAddress = address;
    const label = addressText(address);
    if (label) fields.addressLabel = label;
  }
  const pin = firstStoredServicePin(group);
  if (pin) {
    fields.lat = pin.lat;
    fields.lng = pin.lng;
    fields.latitude = pin.lat;
    fields.longitude = pin.lng;
  }
  assign(fields, "projectType", projectType(group));
  assign(fields, "status", listingStatus(group, Boolean(scheduleDate)));
  assign(fields, "apptDate", scheduleDate);
  assign(fields, "appointmentDate", scheduleDate);
  assign(fields, "scheduledDate", scheduleDate);
  assign(fields, "apptTime", scheduleTime);
  assign(fields, "scheduledTime", scheduleTime);
  if (names.length) fields.services = names;
  const travel = firstStoredTravel(group);
  if (travel) {
    fields.travelZone = travel.travelZone;
    fields.travelMiles = travel.travelMiles;
    fields.travelFeeCents = travel.travelFeeCents;
    fields.travelQuoted = travel.travelQuoted;
  }
  if (total != null) fields.total = total;
  if (squareFootage != null) fields.squareFootage = squareFootage;
  assign(fields, "propertyStatus", firstText$2(group, ["propertyStatus"]));
  assign(fields, "furnishingStatus", firstText$2(group, ["furnishingStatus"]));
  assign(fields, "accessMethod", firstText$2(group, ["accessMethod"]));
  assign(fields, "accessInfo", accessInfo(group));
  assign(fields, "createdAt", groupCreatedAt(group));
  return fields;
}
function chooseListing(group, listings, clients) {
  const owned = listings.filter((doc) => isPortalListingId(doc.id) && clientOwnsListing(doc.data, clients) && listingMatches(doc, group));
  for (const id of group.preferredListingIds) {
    const found = owned.find((doc) => doc.id === id);
    if (found) return found;
  }
  const stable = owned.find((doc) => doc.id === group.stableId);
  if (stable) return stable;
  return owned.sort((a, b) => a.id < b.id ? -1 : 1)[0] || null;
}
function listingMatches(doc, group) {
  if (doc.id === group.stableId || group.preferredListingIds.includes(doc.id)) return true;
  const requestId = text$a(doc.data.orderRequestId);
  const orderId = text$a(doc.data.orderId);
  const invoiceId = text$a(doc.data.invoiceId);
  const appointmentId = text$a(doc.data.appointmentId);
  return Boolean(
    requestId && group.orderRequestIds.includes(requestId) || orderId && group.orderIds.includes(orderId) || invoiceId && group.invoiceIds.includes(invoiceId) || appointmentId && group.appointmentIds.includes(appointmentId)
  );
}
function linksFor(group, listingId, listings, clients) {
  const ownedIds = new Set(listings.filter((doc) => clientOwnsListing(doc.data, clients)).map((doc) => doc.id));
  const links = [];
  const push = (collection, docs) => {
    for (const doc of docs) {
      const current = text$a(doc.data.listingId);
      if (current === listingId) continue;
      if (current && isPortalListingId(current) && ownedIds.has(current)) continue;
      links.push({ collection, id: doc.id });
    }
  };
  push("orderRequests", group.orderRequests);
  push("orders", group.orders);
  push("invoices", group.invoices);
  push("appointments", group.appointments);
  push("galleries", group.galleries);
  return links.sort((a, b) => a.collection === b.collection ? a.id < b.id ? -1 : 1 : a.collection < b.collection ? -1 : 1);
}
function clientsFor(group, identity) {
  const ids = /* @__PURE__ */ new Set();
  const emails = /* @__PURE__ */ new Set();
  const addId = (value) => {
    const id = text$a(value);
    if (id) ids.add(id);
  };
  const addEmail = (value) => {
    const email = normalizeEmail$1(value);
    if (email) emails.add(email);
  };
  for (const id of identity?.ids || []) addId(id);
  addEmail(identity?.email);
  for (const doc of propertyDocs(group)) {
    addId(doc.data.clientId);
    addEmail(doc.data.clientEmail);
    addEmail(doc.data.email);
  }
  return { ids: [...ids], emails: [...emails] };
}
function preferredListingIds(group) {
  const ids = [];
  const push = (value) => {
    const id = text$a(value);
    if (id && isPortalListingId(id) && !ids.includes(id)) ids.push(id);
  };
  for (const doc of [...group.orderRequests, ...group.orders, ...group.invoices, ...group.appointments, ...group.galleries]) {
    push(doc.data.listingId);
  }
  return ids;
}
function stableListingId(requestIds, orderIds, invoiceIds, appointmentIds) {
  const request = requestIds[0];
  if (request) return bookingListingDocId("req", request);
  const order = orderIds[0];
  if (order) return bookingListingDocId("ord", order);
  const invoice = invoiceIds[0];
  if (invoice) return bookingListingDocId("inv", invoice);
  const appointment = appointmentIds[0];
  if (appointment) return bookingListingDocId("apt", appointment);
  return null;
}
function firstStoredServicePin(group) {
  for (const doc of [...group.orderRequests, ...group.orders, ...group.appointments]) {
    const pin = storedRecordPin(doc.data);
    if (pin) return pin;
  }
  return null;
}
function bestAddress(group) {
  for (const doc of propertyDocs(group)) {
    for (const key of ["address", "propertyAddress", "shootLocation"]) {
      const value = doc.data[key];
      if (hasAddress(value) && typeof value === "object") return value;
    }
  }
  for (const doc of propertyDocs(group)) {
    for (const key of ["address", "propertyAddress", "shootLocation"]) {
      if (typeof doc.data[key] === "string" && text$a(doc.data[key])) return text$a(doc.data[key]);
    }
    if (text$a(doc.data.addressLabel)) return text$a(doc.data.addressLabel);
  }
  return null;
}
function firstScheduleDate(group) {
  for (const doc of [...group.appointments, ...group.orders, ...group.orderRequests, ...group.invoices]) {
    for (const key of ["scheduledDate", "appointmentDate", "apptDate", "requestedDate"]) {
      const day = calendarDateKey(doc.data[key]);
      if (day) return day;
    }
  }
  return null;
}
function firstScheduleTime(group) {
  for (const doc of [...group.appointments, ...group.orders, ...group.orderRequests]) {
    for (const key of ["scheduledTime", "appointmentTime", "apptTime", "requestedTime"]) {
      const value = text$a(doc.data[key]);
      if (value && !/^tbd$/i.test(value)) return value;
    }
  }
  return "";
}
function groupCreatedAt(group) {
  const fromRequest = earliestIso(group.orderRequests.map((doc) => doc.data.createdAt));
  if (fromRequest) return fromRequest;
  return earliestIso(propertyDocs(group).map((doc) => doc.data.createdAt));
}
function projectType(group) {
  for (const doc of [...group.orderRequests, ...group.orders, ...group.invoices]) {
    if (doc.data.projectType === "business") return "business";
    if (doc.data.projectType === "real_estate") return "real_estate";
    const service = doc.data.selectedService;
    if (service && typeof service === "object") {
      const category = text$a(service.category);
      if (category === "business" || category === "branding") return "business";
      if (category === "listings") return "real_estate";
    }
  }
  return "real_estate";
}
function listingStatus(group, hasDate) {
  const keys = [...group.orderRequests, ...group.orders, ...group.appointments].map((doc) => statusKey(doc.data.status));
  if (keys.some((key) => key === "cancelled" || key === "canceled" || key === "declined")) return "cancelled";
  if (keys.some((key) => key === "archived")) return "archived";
  return hasDate ? "scheduled" : "unscheduled";
}
function serviceNames(group) {
  for (const doc of [...group.orderRequests, ...group.orders, ...group.invoices]) {
    const names = namesFrom(doc.data.lineItems ?? doc.data.services);
    if (names.length) return names;
  }
  return [];
}
function namesFrom(value) {
  if (!Array.isArray(value)) return [];
  const names = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) names.push(item.trim());
    else if (item && typeof item === "object") {
      const name = text$a(item.name);
      if (name) names.push(name);
    }
    if (names.length >= 40) break;
  }
  return names;
}
function firstTotal(group) {
  for (const doc of [...group.orders, ...group.invoices, ...group.orderRequests]) {
    if (doc.data.total != null && doc.data.total !== "") {
      const parsed = money$4(doc.data.total);
      if (parsed != null) return parsed;
    }
    const pricing = doc.data.pricing;
    if (pricing && typeof pricing === "object") {
      const parsed = money$4(pricing.total);
      if (pricing.total != null && pricing.total !== "" && parsed != null) return parsed;
    }
  }
  return null;
}
function accessInfo(group) {
  return [firstText$2(group, ["accessMethod"]), firstText$2(group, ["lockboxCode"])].filter(Boolean).join(" - ");
}
function clientId(group, identity) {
  const bookingIds = propertyDocs(group).map((doc) => text$a(doc.data.clientId)).filter(Boolean);
  const identityIds = (identity?.ids || []).map((id) => text$a(id)).filter(Boolean);
  return bookingIds.find((id) => identityIds.includes(id)) || bookingIds[0] || identityIds[0] || "";
}
function clientEmail(group, identity) {
  const identityEmail = normalizeEmail$1(identity?.email);
  if (identityEmail) return identityEmail;
  for (const doc of propertyDocs(group)) {
    const email = normalizeEmail$1(doc.data.clientEmail || doc.data.email);
    if (email) return email;
  }
  return "";
}
function clientName(group) {
  for (const doc of propertyDocs(group)) {
    if (text$a(doc.data.clientName)) return text$a(doc.data.clientName);
    const joined = `${text$a(doc.data.firstName)} ${text$a(doc.data.lastName)}`.trim();
    if (joined) return joined;
  }
  return "";
}
function chosenInvoiceId(group) {
  const known = new Set(group.invoiceIds);
  for (const doc of [...group.orderRequests, ...group.orders]) {
    const id = text$a(doc.data.invoiceId);
    if (id && known.has(id)) return id;
  }
  return newestDoc(group.invoices)?.id || group.invoiceIds[0] || "";
}
function chosenId(docs, ids, pointers = [], keys = []) {
  const known = new Set(ids);
  for (const doc of pointers) {
    for (const key of keys) {
      const id = text$a(doc.data[key]);
      if (id && known.has(id)) return id;
    }
  }
  return newestDoc(docs)?.id || ids[0] || "";
}
function propertyDocs(group) {
  return [...group.orderRequests, ...group.orders, ...group.appointments, ...group.invoices, ...group.galleries];
}
function firstText$2(group, keys) {
  for (const doc of propertyDocs(group)) {
    for (const key of keys) {
      const value = text$a(doc.data[key]);
      if (value) return value;
    }
  }
  return "";
}
function firstStoredTravel(group) {
  for (const doc of propertyDocs(group)) {
    const travel = travelFromRecord(doc.data);
    if (travel) return travel;
  }
  return null;
}
function firstScalar(group, keys) {
  for (const doc of propertyDocs(group)) {
    for (const key of keys) {
      const value = doc.data[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}
function newestDoc(docs) {
  if (docs.length === 0) return null;
  return [...docs].sort((a, b) => {
    const left = readCreatedAt(a.data.createdAt) || "";
    const right = readCreatedAt(b.data.createdAt) || "";
    if (left !== right) return right.localeCompare(left);
    return a.id < b.id ? -1 : 1;
  })[0];
}
function earliestIso(values) {
  let best = null;
  for (const value of values) {
    const iso = readCreatedAt(value);
    if (!iso) continue;
    if (!best || iso < best) best = iso;
  }
  return best;
}
function readCreatedAt(value) {
  if (isSentinel$1(value)) return null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.trim());
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (value && typeof value === "object") {
    const record = value;
    if (typeof record.toDate === "function") {
      try {
        const date = record.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
      } catch {
        return null;
      }
    }
    const seconds = typeof record.seconds === "number" ? record.seconds : typeof record._seconds === "number" ? record._seconds : null;
    if (seconds != null) return new Date(seconds * 1e3).toISOString();
  }
  return null;
}
function hasAddress(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value;
  return ["formatted", "label", "street", "line1", "addressLine1", "city", "state", "zip"].some((key) => text$a(record[key]).length > 0);
}
function statusKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
function money$4(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/[$,\s]/g, "")) : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}
function assign(fields, key, value) {
  if (!present(value)) return;
  fields[key] = value;
}
function present(value) {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
function isEmpty(value) {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    if (value instanceof Date) return Number.isNaN(value.getTime());
    if ("seconds" in value || "_seconds" in value || "toDate" in value) return false;
    return Object.keys(value).length === 0;
  }
  return false;
}
function isSentinel$1(value) {
  return Boolean(value && typeof value === "object" && "_methodName" in value);
}
function text$a(value) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanDocs(docs) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const doc of docs || []) {
    const id = text$a(doc?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, data: doc.data && typeof doc.data === "object" ? doc.data : {} });
  }
  return out;
}
function nodeId(prefix, id) {
  return id ? `${prefix}:${id}` : "";
}
function idsWithPrefix(nodes, prefix) {
  const marker = `${prefix}:`;
  return nodes.filter((node) => node.startsWith(marker)).map((node) => node.slice(marker.length)).sort();
}
class UnionFind {
  parent = /* @__PURE__ */ new Map();
  touch(id) {
    if (id) this.find(id);
  }
  link(left, right) {
    if (!left || !right) return;
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent.set(b, a);
  }
  components() {
    const grouped = /* @__PURE__ */ new Map();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const list2 = grouped.get(root) || [];
      list2.push(key);
      grouped.set(root, list2);
    }
    return [...grouped.values()];
  }
  find(id) {
    const current = this.parent.get(id);
    if (!current) {
      this.parent.set(id, id);
      return id;
    }
    if (current === id) return id;
    const root = this.find(current);
    this.parent.set(id, root);
    return root;
  }
}
const db$o = () => admin.firestore();
const LINK_COLLECTIONS = /* @__PURE__ */ new Set([
  "orderRequests",
  "orders",
  "invoices",
  "appointments",
  "galleries"
]);
const BLOCKED_FIELDS = /* @__PURE__ */ new Set([
  "id",
  "createdAt",
  "paymentUrl",
  "studioToken",
  "lockboxCode",
  "notifications",
  "passwordSetupLink"
]);
const LOCK_FIELDS = /* @__PURE__ */ new Set(["lockDownloads", "requirePayment", "lockStudio"]);
async function ensureBookingListingForRequest(orderRequestId) {
  const id = orderRequestId.trim();
  if (!id) return null;
  const snap = await db$o().collection("orderRequests").doc(id).get();
  if (!snap.exists) return null;
  const request = asDoc(snap.id, snap.data());
  const bundle = await hydrateBundle({
    orderRequests: [request],
    orders: [],
    invoices: [],
    appointments: [],
    galleries: []
  });
  const identity = {
    ids: text$9(request.data.clientId) ? [text$9(request.data.clientId)] : [],
    email: normalizeEmail$1(request.data.clientEmail || request.data.email)
  };
  const plans = await plansFor(bundle, identity);
  const primary = plans.find((plan) => plan.createFields.orderRequestId === id) || plans[0];
  if (!primary) return null;
  let created = false;
  let listingId = primary.listingId;
  for (const plan of plans) {
    const result = await applyBookingListingPlan(plan);
    if (plan.listingId === primary.listingId) {
      listingId = result.listingId;
      created = result.created;
    }
  }
  return { listingId, created };
}
async function ensurePortalListingsForClient(identity) {
  const ids = [...new Set(identity.ids.map((id) => id.trim()).filter(Boolean))];
  const email = normalizeEmail$1(identity.email);
  if (ids.length === 0 && !email) return { created: 0 };
  const portal = { ids, email };
  const seeds = await loadVisibleSeeds(portal);
  const bundle = await hydrateBundle(seeds);
  const plans = await plansFor(bundle, portal);
  const results = await Promise.allSettled(plans.map((plan) => applyBookingListingPlan(plan)));
  let created = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value.created) created += 1;
      return;
    }
    console.error(`[Listings] Ensure failed for ${plans[index]?.listingId || "booking"}:`, result.reason);
  });
  return { created };
}
async function plansFor(bundle, identity) {
  const groups = bookingListingGroups(bundle);
  const listings = await loadListingsForGroups(identity, groups);
  return groups.map((group) => planBookingListingGroup(group, listings, identity)).filter((plan) => Boolean(plan));
}
async function applyBookingListingPlan(plan) {
  if (!isPortalListingId(plan.listingId)) throw new Error("Listing id is not valid.");
  const ref = db$o().collection("listings").doc(plan.listingId);
  let created = false;
  if (plan.create) {
    try {
      await ref.create({
        ...plainFields(plan.createFields),
        createdAt: timestampOrNow(plan.createFields.createdAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      created = true;
      console.info(`[Listings] Created ${plan.listingId} for booking ${text$9(plan.createFields.orderRequestId) || text$9(plan.createFields.orderId) || text$9(plan.createFields.invoiceId)}`);
    } catch (err) {
      if (!alreadyExists(err)) throw err;
      await fillListing(ref, plan.createFields);
    }
  } else if (Object.keys(plan.fillFields).length > 0) {
    await fillListing(ref, plan.fillFields);
  }
  for (const link of plan.links) {
    try {
      await linkRecord(link.collection, link.id, plan.listingId);
    } catch (err) {
      console.error(`[Listings] Could not link ${link.collection}/${link.id} to ${plan.listingId}:`, err);
    }
  }
  return { listingId: plan.listingId, created };
}
async function fillListing(ref, desired) {
  const snap = await ref.get();
  if (!snap.exists) return;
  const patch = plainFields(fillEmptyListingFields(snap.data() || {}, desired));
  if (Object.keys(patch).length === 0) return;
  await ref.update({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}
async function linkRecord(collectionName, id, listingId) {
  if (!LINK_COLLECTIONS.has(collectionName) || !id) return;
  const ref = db$o().collection(collectionName).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (text$9(snap.data()?.listingId) === listingId) return;
  await ref.update({
    listingId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
async function loadVisibleSeeds(identity) {
  const requests = /* @__PURE__ */ new Map();
  const orders = /* @__PURE__ */ new Map();
  const invoices = /* @__PURE__ */ new Map();
  const appointments = /* @__PURE__ */ new Map();
  const keep = (map, docs) => {
    for (const doc of docs) {
      if (!visibleToPortalClient({
        clientId: text$9(doc.data.clientId),
        email: text$9(doc.data.email),
        clientEmail: text$9(doc.data.clientEmail)
      }, identity)) continue;
      if (!map.has(doc.id)) map.set(doc.id, doc);
    }
  };
  const jobs = [];
  const track = (job, map) => {
    jobs.push(job.then((docs) => keep(map, docs)));
  };
  if (identity.ids.length) {
    track(queryIn("orderRequests", "clientId", identity.ids), requests);
    track(queryIn("orders", "clientId", identity.ids), orders);
    track(queryIn("invoices", "clientId", identity.ids), invoices);
    track(queryIn("appointments", "clientId", identity.ids), appointments);
  }
  if (identity.email) {
    track(queryEqual("orderRequests", "email", identity.email), requests);
    track(queryEqual("orderRequests", "clientEmail", identity.email), requests);
    track(queryEqual("orders", "clientEmail", identity.email), orders);
    track(queryEqual("invoices", "clientEmail", identity.email), invoices);
    track(queryEqual("appointments", "clientEmail", identity.email), appointments);
  }
  await Promise.all(jobs);
  return {
    orderRequests: [...requests.values()],
    orders: [...orders.values()],
    invoices: [...invoices.values()],
    appointments: [...appointments.values()],
    galleries: []
  };
}
async function hydrateBundle(seed) {
  const requests = mapDocs(seed.orderRequests);
  const orders = mapDocs(seed.orders);
  const invoices = mapDocs(seed.invoices);
  const appointments = mapDocs(seed.appointments);
  const galleries = mapDocs(seed.galleries);
  const requestIds = new Set(requests.keys());
  for (const doc of [...orders.values(), ...invoices.values(), ...appointments.values()]) {
    const id = text$9(doc.data.orderRequestId);
    if (id) requestIds.add(id);
  }
  await readMissing("orderRequests", requestIds, requests);
  const orderIds = new Set(orders.keys());
  for (const doc of requests.values()) {
    const id = text$9(doc.data.convertedToOrderId) || text$9(doc.data.orderId);
    if (id) orderIds.add(id);
  }
  for (const doc of [...invoices.values(), ...appointments.values()]) {
    const id = text$9(doc.data.orderId);
    if (id) orderIds.add(id);
  }
  await readMissing("orders", orderIds, orders);
  const invoiceIds = new Set(invoices.keys());
  for (const doc of [...requests.values(), ...orders.values()]) {
    const id = text$9(doc.data.invoiceId);
    if (id) invoiceIds.add(id);
  }
  await readMissing("invoices", invoiceIds, invoices);
  mergeDocs(invoices, await queryIn("invoices", "orderRequestId", [...requests.keys()]));
  mergeDocs(invoices, await queryIn("invoices", "orderId", [...orders.keys()]));
  mergeDocs(appointments, await queryIn("appointments", "orderRequestId", [...requests.keys()]));
  mergeDocs(appointments, await queryIn("appointments", "orderId", [...orders.keys()]));
  const galleryIds = new Set(galleries.keys());
  for (const doc of [...requests.values(), ...orders.values()]) {
    const id = text$9(doc.data.galleryId);
    if (id) galleryIds.add(id);
  }
  await readMissing("galleries", galleryIds, galleries);
  mergeDocs(galleries, await queryIn("galleries", "orderId", [...orders.keys()]));
  mergeDocs(galleries, await queryIn("galleries", "orderRequestId", [...requests.keys()]));
  return {
    orderRequests: [...requests.values()],
    orders: [...orders.values()],
    invoices: [...invoices.values()],
    appointments: [...appointments.values()],
    galleries: [...galleries.values()]
  };
}
async function loadListingsForGroups(identity, groups) {
  const found = /* @__PURE__ */ new Map();
  const email = normalizeEmail$1(identity.email);
  if (identity.ids.length) mergeDocs(found, await queryIn("listings", "clientId", identity.ids));
  if (email) mergeDocs(found, await queryEqual("listings", "clientEmail", email));
  const directIds = /* @__PURE__ */ new Set();
  const requestIds = /* @__PURE__ */ new Set();
  const orderIds = /* @__PURE__ */ new Set();
  const invoiceIds = /* @__PURE__ */ new Set();
  for (const group of groups) {
    if (isPortalListingId(group.stableId)) directIds.add(group.stableId);
    group.preferredListingIds.forEach((id) => {
      if (isPortalListingId(id)) directIds.add(id);
    });
    group.orderRequestIds.forEach((id) => requestIds.add(id));
    group.orderIds.forEach((id) => orderIds.add(id));
    group.invoiceIds.forEach((id) => invoiceIds.add(id));
  }
  await readMissing("listings", directIds, found);
  mergeDocs(found, await queryIn("listings", "orderRequestId", [...requestIds]));
  mergeDocs(found, await queryIn("listings", "orderId", [...orderIds]));
  mergeDocs(found, await queryIn("listings", "invoiceId", [...invoiceIds]));
  return [...found.values()];
}
async function readMissing(collectionName, ids, into) {
  const missing = [...ids].filter((id) => id && !into.has(id)).slice(0, 100);
  if (missing.length === 0) return;
  const snaps = await db$o().getAll(...missing.map((id) => db$o().collection(collectionName).doc(id)));
  snaps.forEach((snap) => {
    if (!snap.exists || into.has(snap.id)) return;
    into.set(snap.id, asDoc(snap.id, snap.data()));
  });
}
async function queryIn(collectionName, field, values) {
  const unique2 = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  const docs = [];
  for (const part of chunk(unique2, 30)) {
    const snap = await db$o().collection(collectionName).where(field, "in", part).limit(100).get();
    snap.docs.forEach((doc) => docs.push(asDoc(doc.id, doc.data())));
  }
  return docs;
}
async function queryEqual(collectionName, field, value) {
  if (!value) return [];
  const snap = await db$o().collection(collectionName).where(field, "==", value).limit(100).get();
  return snap.docs.map((doc) => asDoc(doc.id, doc.data()));
}
function mergeDocs(into, docs) {
  for (const doc of docs) {
    if (doc.id && !into.has(doc.id)) into.set(doc.id, doc);
  }
}
function mapDocs(docs) {
  const map = /* @__PURE__ */ new Map();
  mergeDocs(map, docs);
  return map;
}
function asDoc(id, data) {
  return { id, data: data || {} };
}
function plainFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!allowedField(key) || value == null || value === "") continue;
    const plain = plainValue(value);
    if (plain == null) continue;
    out[key] = plain;
  }
  return out;
}
function plainValue(value) {
  if (isSentinel(value)) return null;
  if (Array.isArray(value)) return value.map((item) => plainValue(item));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const nested2 = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === void 0 || isSentinel(item)) continue;
      nested2[key] = plainValue(item);
    }
    return nested2;
  }
  return value;
}
function allowedField(key) {
  if (LOCK_FIELDS.has(key)) return true;
  if (BLOCKED_FIELDS.has(key)) return false;
  if (/cubicasa/i.test(key) || /payment/i.test(key)) return false;
  if (/^square/i.test(key) && key !== "squareFootage") return false;
  return true;
}
function timestampOrNow(value) {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return admin.firestore.Timestamp.fromDate(date);
  }
  return admin.firestore.FieldValue.serverTimestamp();
}
function alreadyExists(err) {
  const code = err.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}
function isSentinel(value) {
  return Boolean(value && typeof value === "object" && "_methodName" in value);
}
function text$9(value) {
  return typeof value === "string" ? value.trim() : "";
}
function chunk(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
function lifeOfTheListingCareSelected(value) {
  return value === true;
}
function planOrderPackageRepair(record, catalog) {
  if (hasPricedServices(record.lineItems) || hasPricedServices(record.services)) return null;
  const resolved = resolveSubmittedBooking({
    selectedService: record.selectedService,
    selectedBasics: record.selectedBasics,
    selectedAddOns: record.selectedAddOns,
    premiumUpgrade: record.premiumUpgrade,
    virtualStagingCredits: record.virtualStagingCredits,
    specializedPhotography: record.specializedPhotography,
    promoCode: record.promoCode,
    lineItems: record.lineItems,
    total: record.total ?? nestedTotal(record.pricing),
    pricing: record.pricing,
    lifeOfTheListingCare: record.lifeOfTheListingCare
  }, catalog);
  const lineItems = resolved.lineItems.filter((item) => item.name.trim());
  if (chargedServiceLines(lineItems).length === 0) return null;
  warnWhenStoredTotalDiffers(record, lineItems);
  return {
    lineItems,
    services: lineItems
  };
}
function hasPricedServices(value) {
  return normalizeBookingLineItems(value).some((item) => {
    if (!item.name.trim()) return false;
    const id = String(item.id || "");
    if (id.startsWith("promo-") || item.name.startsWith("Promo Code:")) return false;
    return true;
  });
}
function nestedTotal(pricing) {
  if (!pricing || typeof pricing !== "object") return void 0;
  return pricing.total;
}
function warnWhenStoredTotalDiffers(record, lineItems) {
  const stored = [money$3(record.total), money$3(nestedTotal(record.pricing))].filter((amount) => amount != null);
  if (stored.length === 0) return;
  const rebuilt = roundMoney$2(sumLineItemPrices(chargedServiceLines(lineItems)));
  const drifted = [...new Set(stored.filter((amount) => Math.abs(amount - rebuilt) > 9e-3))];
  if (drifted.length === 0) return;
  console.warn(
    `[Bookings] Package repair kept stored total ${drifted.join(" / ")}; catalog lines total ${rebuilt}.`
  );
}
function money$3(value) {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney$2(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return roundMoney$2(parsed);
  }
  return void 0;
}
function roundMoney$2(value) {
  return Math.round(value * 100) / 100;
}
const PACKAGE_LABEL_KEYS = [
  "selectedService",
  "package",
  "packageName",
  "packageId",
  "selectedPackage"
];
function cleanPackageName(raw) {
  return raw.replace(/\s+[—–-]\s+\$[\d,]+(?:\s*\/\s*\w+)?\s*$/i, "").replace(/\s+\$[\d,]+(?:\s*\/\s*\w+)?\s*$/i, "").trim();
}
function orderServiceLines(record, linked) {
  const own = storedServiceLines(record);
  if (own.length > 0) return own;
  const fromLink = storedServiceLines(linked);
  if (fromLink.length > 0) return fromLink;
  const synthesized = synthesizePackageLine(record) || synthesizePackageLine(linked);
  return synthesized ? [synthesized] : [];
}
function orderChargeSummary(record, lines) {
  const lineSubtotal = roundMoney$1(lines.reduce((sum, line) => sum + line.price, 0));
  const pricing = nested$1(record?.pricing);
  const tax = moneyOrNull$1(record?.tax) ?? moneyOrNull$1(pricing.tax) ?? 0;
  const storedTotal = moneyOrNull$1(record?.total) ?? moneyOrNull$1(pricing.total);
  const total = storedTotal ?? roundMoney$1(lineSubtotal + tax);
  const storedSubtotal = moneyOrNull$1(record?.subtotal) ?? moneyOrNull$1(pricing.subtotal);
  const subtotal = lineSubtotal > 0 ? lineSubtotal : storedSubtotal && storedSubtotal > 0 ? storedSubtotal : total;
  return { subtotal: roundMoney$1(subtotal), tax: roundMoney$1(tax), total: roundMoney$1(total) };
}
function storedServiceLines(record) {
  if (!record) return [];
  const raw = Array.isArray(record.lineItems) && record.lineItems.length > 0 ? record.lineItems : record.services;
  return normalizeBookingLineItems(raw).filter((item) => item.name.trim() && !isPromo(item)).map(toOrderLine);
}
function synthesizePackageLine(record) {
  if (!record) return null;
  const label = packageLabel(record);
  if (!label) return null;
  const pricing = nested$1(record.pricing);
  const price = moneyOrNull$1(record.total) ?? moneyOrNull$1(pricing.total) ?? moneyOrNull$1(pricing.subtotal) ?? moneyOrNull$1(record.amount) ?? labeledMoney(label);
  if (price == null) return null;
  return { name: cleanPackageName(label) || label, qty: 1, price };
}
function packageLabel(record) {
  for (const key of PACKAGE_LABEL_KEYS) {
    const value = text$8(record[key]);
    if (value) return value;
  }
  return "";
}
function toOrderLine(item) {
  const line = {
    name: item.name,
    qty: item.qty > 0 ? item.qty : 1,
    price: item.price
  };
  if (item.id) line.id = item.id;
  return line;
}
function isPromo(item) {
  const id = String(item.id || "");
  const name = String(item.name || "");
  return id.startsWith("promo-") || name.startsWith("Promo Code:");
}
function labeledMoney(raw) {
  const match = raw.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}
function moneyOrNull$1(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function nested$1(value) {
  return value && typeof value === "object" ? value : {};
}
function text$8(value) {
  return typeof value === "string" ? value.trim() : "";
}
function roundMoney$1(value) {
  return Math.round(value * 100) / 100;
}
const NOT_PROVIDED = "Not provided";
function officeNewOrderEmail(saved, options) {
  const catalog = options?.catalog ?? packagesForStaffEditor([]);
  const lines = orderServiceLines(saved).filter((line) => !isTravelFeeLine(line));
  const charges = orderChargeSummary(saved, lines);
  const packageLine = lines.find((line) => !isAddOn(line, catalog)) || lines[0];
  const addOns2 = packageLine ? lines.filter((line) => line !== packageLine) : lines;
  const features = packageFeatures(packageLine, catalog);
  const deliverables = describeDeliverables(features);
  const packageName = packageLine ? cleanPackageName(packageLine.name) : NOT_PROVIDED;
  const orderNumber = orderNumberOf(saved);
  const address = addressText(saved.addressLabel) || addressText(saved.address) || addressText(saved.propertyAddress) || addressText(saved.shootLocation) || NOT_PROVIDED;
  const requestedDate = firstDate(saved, ["scheduledDate", "requestedDate", "appointmentDate", "requestedDates"]);
  const clientName2 = clientNameOf(saved);
  const notes = notesOf(saved);
  const fields = [
    ["Order number", orderNumber],
    ["Admin link", text$7(options?.adminUrl) || NOT_PROVIDED],
    ["Client name", clientName2],
    ["Client email", firstText$1(saved, ["clientEmail", "email"])],
    ["Client phone", firstText$1(saved, ["clientPhone", "phone"])],
    ["Agent", firstText$1(saved, ["agentName", "agent"])],
    ["Agent email/phone", agentContactOf(saved)],
    ["Brokerage", firstText$1(saved, ["brokerage", "brokerageName"])],
    ["Property address", address],
    ["Unit", firstText$1(saved, ["unit", "unitNumber"]) || addressPart(saved.address, ["unit", "unitNumber"])],
    ["Gate code", firstText$1(saved, ["gateCode", "gate"])],
    ["Lockbox", lockboxOf(saved)],
    ["Access notes", firstText$1(saved, ["accessNotes", "accessInstructions", "accessMethod"])],
    ["MLS #", firstText$1(saved, ["mlsNumber", "mls", "mlsId"])],
    ["Package", packageName],
    ["Photo count", deliverables.photoCount],
    ["Aerials", deliverables.aerials],
    ["Reels", deliverables.reels],
    ["Twilights", deliverables.twilights],
    ["Walkthrough", deliverables.walkthrough],
    ["Floor plan", deliverables.floorplan],
    ["Turnaround", deliverables.turnaround],
    ["Add-ons", addOnText(addOns2)],
    ["Travel", travelTextForRecord(saved, { miles: true }) ?? NOT_PROVIDED],
    ["Subtotal", moneyField(saved, "subtotal", lines.length ? charges.subtotal : null)],
    ["Tax", moneyField(saved, "tax", lines.length ? charges.tax : null)],
    ["Total", moneyField(saved, "total", lines.length ? charges.total : null)],
    ["Payment", paymentOf(saved, lines.length ? charges.total : null)],
    ["Requested date", requestedDate],
    ["Requested time", firstText$1(saved, ["scheduledTime", "requestedTime", "appointmentTime", "timeWindow"])],
    ["Square footage", firstText$1(saved, ["squareFootage", "sqft", "homeSize"])],
    ["Occupancy", occupancyOf(saved)],
    ["Notes", notes],
    ["Booked via", bookedVia(saved)]
  ];
  const subjectCore = `New order ${orderNumber} — ${packageName} — ${address} — ${requestedDate}`;
  const subject = isTestOrder(clientName2, notes) ? `[TEST] ${subjectCore}` : subjectCore;
  const plain = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#111"><h1 style="font-size:18px">${escapeHtml$4(subject)}</h1><table style="width:100%;border-collapse:collapse">${fields.map(([label, value]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:bold;vertical-align:top">${escapeHtml$4(label)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml$4(value)}</td></tr>`).join("")}</table></div>`;
  return { subject, text: plain, html };
}
function isTestOrder(clientName2, notes) {
  return `${clientName2}
${notes}`.toUpperCase().includes("TEST ORDER");
}
function orderNumberOf(saved) {
  const explicit = firstText$1(saved, ["orderNumber", "orderCode", "displayId"]);
  if (explicit) return explicit;
  const id = text$7(saved.id);
  if (!id) return NOT_PROVIDED;
  return `ORD-${id.slice(-5).toUpperCase()}`;
}
function clientNameOf(saved) {
  const named = firstText$1(saved, ["clientName", "customerName"]);
  if (named) return named;
  const joined = [text$7(saved.firstName), text$7(saved.lastName)].filter(Boolean).join(" ");
  return joined || NOT_PROVIDED;
}
function agentContactOf(saved) {
  const clientEmail2 = firstText$1(saved, ["clientEmail", "email"]).toLowerCase();
  const clientPhone = digits(firstText$1(saved, ["clientPhone", "phone"]));
  const email = agentField(saved, ["agentEmail", "realtorEmail", "listingAgentEmail", "brokerEmail"], "email");
  const phone = agentField(saved, ["agentPhone", "realtorPhone", "listingAgentPhone", "brokerPhone"], "phone");
  const parts = [];
  if (email && email.toLowerCase() !== clientEmail2) parts.push(email);
  if (phone && digits(phone) !== clientPhone) parts.push(phone);
  return parts.length ? parts.join(" / ") : NOT_PROVIDED;
}
function agentField(saved, keys, nestedKey) {
  const direct = firstText$1(saved, keys);
  if (direct !== NOT_PROVIDED) return direct;
  for (const holder of [saved.agent, saved.listingAgent, saved.realtor]) {
    const record = nested(holder);
    const value = text$7(record[nestedKey]);
    if (value) return value;
  }
  return "";
}
function digits(value) {
  return value === NOT_PROVIDED ? "" : value.replace(/\D/g, "");
}
function notesOf(saved) {
  const parts = ["vibeNote", "notes", "specialInstructions", "internalNotes"].map((key) => text$7(saved[key])).filter(Boolean);
  return parts.length ? parts.join("\n") : NOT_PROVIDED;
}
function lockboxOf(saved) {
  const code = firstText$1(saved, ["lockboxCode", "supraCode"]);
  return code || NOT_PROVIDED;
}
function occupancyOf(saved) {
  const parts = ["occupancy", "propertyStatus", "furnishingStatus"].map((key) => text$7(saved[key])).filter(Boolean);
  return parts.length ? parts.join(", ") : NOT_PROVIDED;
}
function bookedVia(saved) {
  const lead = text$7(saved.leadSource);
  const source = text$7(saved.source);
  const blob = `${lead} ${source}`.toLowerCase();
  if (!blob.trim()) return NOT_PROVIDED;
  if (/admin/.test(blob)) return "Admin";
  if (/portal/.test(blob)) return "Portal";
  if (/site|booking form|booking_form|temporary booking|ordericonic|web/.test(blob)) return "Site";
  return lead || source;
}
function paymentOf(saved, total) {
  const invoice = nested(saved.invoice);
  const explicit = [saved.paymentStatus, saved.invoiceStatus, invoice.status].map((value) => text$7(value).toLowerCase()).find(Boolean) || "";
  if (/partial/.test(explicit)) return "Partial";
  if (/\bpaid\b/.test(explicit) && !/unpaid/.test(explicit)) return "Paid";
  if (/unpaid/.test(explicit)) return "Unpaid";
  const paid = moneyOrNull(invoice.amountPaid) ?? moneyOrNull(saved.amountPaid) ?? moneyOrNull(saved.depositPaid);
  if (paid != null && total != null && paid > 0 && paid + 9e-3 < total) return "Partial";
  if (paid != null && paid > 0) return "Paid";
  if (total != null || saved.total != null || invoice.status != null) return "Unpaid";
  return NOT_PROVIDED;
}
function moneyField(saved, key, computed) {
  const pricing = nested(saved.pricing);
  const direct = moneyOrNull(saved[key]) ?? moneyOrNull(pricing[key]);
  if (direct != null) return formatMoney(direct);
  if (computed != null) return formatMoney(computed);
  return NOT_PROVIDED;
}
function addOnText(lines) {
  if (lines.length === 0) return NOT_PROVIDED;
  return lines.map((line) => `${line.name} × ${line.qty || 1} — ${formatMoney(line.price)}`).join("\n");
}
function packageFeatures(line, catalog) {
  if (!line) return [];
  const match = catalog.find((item) => item.id === line.id || item.bookingId === line.id || item.name === line.name || item.name === cleanPackageName(line.name));
  return match?.includedServices ?? [];
}
function describeDeliverables(features) {
  return {
    photoCount: featureMatch(features, /(\d+\s+(?:daytime\s+)?(?:listing\s+)?(?:photos|images)|full images)/i),
    aerials: featureMatch(features, /(\d+\s+aerials?|aerial photos?|aerials?)/i),
    reels: featureMatch(features, /([^\n]*reel[^\n]*)/i),
    twilights: featureMatch(features, /([^\n]*twilight[^\n]*)/i),
    walkthrough: featureMatch(features, /([^\n]*(?:walkthrough|listing video|3d tour|matterport)[^\n]*)/i),
    floorplan: featureMatch(features, /([^\n]*floor\s*plan[^\n]*)/i),
    turnaround: featureMatch(features, /([^\n]*(?:same[- ]day|next[- ]day|by 7\s*pm)[^\n]*)/i)
  };
}
function featureMatch(features, pattern) {
  const hit = features.find((feature) => pattern.test(feature));
  return hit ? hit.trim() : NOT_PROVIDED;
}
function isAddOn(line, catalog) {
  const match = catalog.find((item) => item.id === line.id || item.bookingId === line.id);
  return match?.bookingKind === "addon" || match?.bookingKind === "upgrade";
}
function firstText$1(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const joined = value.map((entry2) => displayScalar(entry2)).filter((entry2) => entry2 && entry2 !== NOT_PROVIDED).join(", ");
      if (joined) return joined;
      continue;
    }
    const shown = displayScalar(value);
    if (shown !== NOT_PROVIDED) return shown;
  }
  return NOT_PROVIDED;
}
function firstDate(record, keys) {
  for (const key of keys) {
    const value = record[key];
    const values = Array.isArray(value) ? value : [value];
    for (const entry2 of values) {
      const formatted = formatChicagoDate(entry2);
      if (formatted) return formatted;
    }
  }
  return NOT_PROVIDED;
}
function addressPart(value, keys) {
  if (!value || typeof value !== "object") return NOT_PROVIDED;
  const record = value;
  for (const key of keys) {
    const shown = displayScalar(record[key]);
    if (shown !== NOT_PROVIDED) return shown;
  }
  return NOT_PROVIDED;
}
function displayScalar(value) {
  if (typeof value === "string") return value.trim() || NOT_PROVIDED;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    const record = value;
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
    const seconds = typeof record.seconds === "number" ? record.seconds : typeof record._seconds === "number" ? record._seconds : null;
    if (seconds != null) return new Date(seconds * 1e3).toISOString().slice(0, 10);
  }
  return NOT_PROVIDED;
}
function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}
function moneyOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function nested(value) {
  return value && typeof value === "object" ? value : {};
}
function text$7(value) {
  return typeof value === "string" ? value.trim() : "";
}
function escapeHtml$4(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const OFFICE_NEW_ORDER_EMAIL_TEMPLATE = "office_new_order";
function officeStaffRecipients(env = process.env) {
  const seen = /* @__PURE__ */ new Set();
  const recipients = [];
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
async function notifyOfficeOfOrder(input) {
  const env = input.env ?? process.env;
  const saved = input.saved || {};
  const clientEmails = new Set(
    [saved.email, saved.clientEmail].map((value) => typeof value === "string" ? value.trim().toLowerCase() : "").filter(Boolean)
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
      body: message.text
    }
  });
  return { sent: result.sent };
}
const router$m = Router();
const db$n = () => admin.firestore();
function appUrl$2() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}
function addressLabel(address) {
  return addressText(address) || "Address not provided";
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
function money$2(value) {
  return orderTotalLabel(value);
}
async function loadBookingCatalog() {
  try {
    const snap = await db$n().collection("packages").get();
    return packagesForStaffEditor(snap.docs.map((entry2) => ({ id: entry2.id, ...entry2.data() })));
  } catch (err) {
    console.error("[Bookings] Catalog read failed — using the seeded catalog", err);
    return packagesForStaffEditor([]);
  }
}
router$m.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      vibeNote,
      scheduledDate,
      scheduledTime,
      photographerPreference,
      squareFootage,
      accessMethod,
      lockboxCode,
      propertyStatus,
      furnishingStatus,
      // Additional fields from booking form (previously dropped)
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
    const clientName2 = `${firstName} ${lastName}`.trim();
    const locationFields = storedServiceLocationFields(address);
    const savedAddress = locationFields.address;
    if (!savedAddress) {
      return res.status(400).json({ error: "Missing required fields." });
    }
    const displayAddress = addressLabel(savedAddress);
    const catalog = await loadBookingCatalog();
    const resolved = resolveSubmittedBooking(req.body, catalog);
    const keptLines = resolved.lineItems.filter((item) => !isTravelFeeLine(item));
    if (chargedServiceLines(keptLines).length === 0) {
      return res.status(400).json({ error: "No services selected." });
    }
    const traveled = applyServerTravel(keptLines, savedAddress);
    const lineItems = traveled.lineItems;
    const total = traveled.total;
    const travel = traveled.travel;
    const promoCode = resolved.promoCode;
    const promoDiscount = resolved.promoDiscount;
    const pricing = { subtotal: total, tax: 0, total };
    const selectedService = resolved.selectedService;
    const selectedBasics = resolved.selectedBasics;
    const selectedAddOns = resolved.selectedAddOns;
    const specializedPhotography = resolved.specializedPhotography;
    const virtualStagingCredits = resolved.virtualStagingCredits;
    const { address: _savedAddress, ...storedPin } = locationFields;
    const orderRequest = {
      firstName,
      lastName,
      clientName: clientName2,
      email: email.toLowerCase().trim(),
      phone,
      address: savedAddress,
      ...storedPin,
      lineItems,
      pricing: pricing || {},
      total: Number(total) || 0,
      vibeNote: vibeNote || "",
      promoCode: promoCode || null,
      promoDiscount: Number(promoDiscount) || 0,
      travelZone: travel.travelZone,
      travelMiles: travel.travelMiles,
      travelFeeCents: travel.travelFeeCents,
      travelQuoted: travel.travelQuoted,
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
    const docRef = await db$n().collection("orderRequests").add(orderRequest);
    const normalizedEmail = orderRequest.email;
    const passwordSetupAllowed = clientNotifyLive() || isNotifyTestAllowlisted(normalizedEmail);
    let account = {
      clientId: null,
      createdAccount: false,
      passwordSetupLink: null,
      skipReason: null
    };
    try {
      account = await attachBookingClient({
        email: normalizedEmail,
        firstName,
        lastName,
        phone,
        preparePasswordLink: passwordSetupAllowed
      });
    } catch (err) {
      console.error("[Bookings] Account attach failed:", err);
    }
    if (account.clientId) {
      try {
        await docRef.update({
          clientId: account.clientId,
          clientEmail: normalizedEmail,
          portalAttached: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await createRequestedAppointment({
          orderRequestId: docRef.id,
          clientId: account.clientId,
          clientName: clientName2,
          clientEmail: normalizedEmail,
          clientPhone: String(phone || ""),
          address: savedAddress,
          addressLabel: displayAddress,
          scheduledDate: typeof scheduledDate === "string" ? scheduledDate : null,
          scheduledTime: typeof scheduledTime === "string" ? scheduledTime : null,
          services: lineItems,
          notes: typeof vibeNote === "string" ? vibeNote : ""
        });
      } catch (err) {
        console.error("[Bookings] Appointment attach failed:", err);
      }
    }
    let invoiceId = null;
    try {
      const created = await createBookingInvoiceDraft({
        orderRequestId: docRef.id,
        email,
        clientName: clientName2,
        lineItems,
        pricing,
        total,
        promoCode,
        promoDiscount,
        travel,
        clientId: account.clientId
      });
      invoiceId = created.invoiceId;
      try {
        await docRef.update({
          invoiceId: created.invoiceId,
          ...account.clientId ? { clientId: account.clientId } : created.clientId ? { clientId: created.clientId } : {}
        });
      } catch (linkErr) {
        console.error("[Bookings] Invoice link update failed:", linkErr);
      }
    } catch (err) {
      console.error("[Bookings] Invoice draft create failed:", err);
      invoiceId = null;
    }
    try {
      await ensureBookingListingForRequest(docRef.id);
    } catch (err) {
      console.error("[Bookings] Listing ensure failed:", err);
    }
    const accessLine = accessMethod ? `${accessMethod}${lockboxCode ? ` — Code: ${lockboxCode}` : ""}` : "Not specified";
    let clientEmailStatus = "failed";
    let officeEmailStatus = "failed";
    let passwordSetupStatus = account.createdAccount ? "gated" : "not_needed";
    let smsStatus = phone ? "failed" : "skipped";
    clientEmailStatus = await sendEmail({
      to: email,
      template: "booking_received",
      variables: {
        clientName: clientName2,
        address: displayAddress,
        total: money$2(total),
        requestId: docRef.id,
        scheduledDate: bookingDateLabel(scheduledDate, "TBD — we'll confirm shortly"),
        scheduledTime: scheduledTime || "",
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        travelFee: travelSummaryText(travel),
        dashboardUrl: `${appUrl$2()}/admin/order-request/${docRef.id}`
      }
    }).then((result) => result.sent ? "sent" : "failed").catch((err) => {
      console.error("[Bookings] Confirmation email failed:", err);
      return "failed";
    });
    officeEmailStatus = await sendEmail({
      to: "photos@iconicimagestx.com",
      template: "booking_received",
      variables: {
        clientName: clientName2,
        address: displayAddress,
        total: money$2(total),
        requestId: docRef.id,
        scheduledDate: bookingDateLabel(scheduledDate, "TBD — we'll confirm shortly"),
        scheduledTime: scheduledTime || "",
        propertyStatus: propertyStatus || "Not specified",
        furnishingStatus: furnishingStatus || "Not specified",
        accessMethod: accessLine,
        squareFootage: squareFootage ? `${squareFootage} sq ft` : "",
        travelFee: travelSummaryText(travel),
        dashboardUrl: `${appUrl$2()}/admin/order-request/${docRef.id}`
      }
    }).then((result) => result.sent ? "sent" : "failed").catch((err) => {
      console.error("[Bookings] Office notification email failed:", err);
      return "failed";
    });
    if (phone) {
      smsStatus = await sendSMS({
        to: phone,
        kind: "booking_confirmation",
        body: SMS_TEMPLATES.bookingConfirmation(
          firstName,
          bookingDateLabel(scheduledDate, "TBD — we'll confirm shortly"),
          displayAddress,
          money$2(total)
        )
      }).then((result) => "suppressed" in result && result.suppressed ? "failed" : "sent").catch((err) => {
        console.error("[Bookings] Confirmation SMS failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        return /TWILIO_|not configured|not set/i.test(message) ? "not_configured" : "failed";
      });
    }
    if (process.env.ADMIN_PHONE) {
      const serviceNames2 = lineItems.map((i) => i.name).join(", ");
      await sendSMS({
        to: process.env.ADMIN_PHONE,
        body: SMS_TEMPLATES.newBookingAlert(
          displayAddress,
          bookingDateLabel(scheduledDate, "TBD"),
          serviceNames2
        )
      }).catch((err) => console.error("[Bookings] Admin SMS alert failed:", err));
    }
    if (account.createdAccount) {
      if (!passwordSetupAllowed) {
        passwordSetupStatus = "gated";
        console.info(
          `[Bookings] Password-setup email not sent for request ${docRef.id}. ${clientNotifyBlockReason()}.`
        );
      } else if (account.passwordSetupLink) {
        passwordSetupStatus = await sendEmail({
          to: email,
          template: "account_password_setup",
          variables: {
            clientName: clientName2,
            clientEmail: normalizedEmail,
            setupUrl: account.passwordSetupLink,
            portalUrl: `${appUrl$2()}/portal`
          }
        }).then((result) => result.sent ? "sent" : "failed").catch(async (err) => {
          console.error("[Bookings] Password setup email failed:", err);
          try {
            await sendFirebasePasswordEmail(normalizedEmail);
            return "sent";
          } catch (fallbackErr) {
            console.error("[Bookings] Firebase password email fallback failed:", fallbackErr);
            return "failed";
          }
        });
      } else {
        try {
          await sendFirebasePasswordEmail(normalizedEmail);
          passwordSetupStatus = "sent";
        } catch (err) {
          console.error("[Bookings] Firebase password email fallback failed:", err);
          passwordSetupStatus = "failed";
        }
      }
    }
    let officeAlertStatus = "skipped";
    try {
      const savedSnap = await docRef.get();
      const savedOrder = { id: savedSnap.id, ...savedSnap.data() || {} };
      const alert = await notifyOfficeOfOrder({
        isNewOrder: true,
        saved: savedOrder,
        adminUrl: `${appUrl$2()}/admin/order-request/${savedSnap.id}`
      });
      officeAlertStatus = alert.sent ? "sent" : "skipped";
    } catch (err) {
      console.error("[Bookings] Office new-order email failed:", err);
      officeAlertStatus = "failed";
    }
    const notifications = {
      appointmentEmail: clientEmailStatus,
      officeEmail: officeEmailStatus,
      officeAlert: officeAlertStatus,
      sms: smsStatus,
      passwordSetup: passwordSetupStatus,
      accountCreated: account.createdAccount,
      accountAttached: Boolean(account.clientId),
      accountSkipReason: account.skipReason
    };
    await docRef.update({
      notifications,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch((err) => console.error("[Bookings] Notification status was not saved:", err));
    return res.status(201).json({
      success: true,
      requestId: docRef.id,
      invoiceId,
      accountCreated: account.createdAccount,
      notifications,
      message: "Booking request received. We'll confirm shortly!"
    });
  } catch (err) {
    console.error("[Bookings] Submission error:", err);
    return res.status(500).json({ error: "Failed to submit booking request." });
  }
});
router$m.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$n().collection("orderRequests").orderBy("createdAt", "desc").limit(100).get();
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
router$m.get("/:id", requireCoordinator, async (req, res) => {
  try {
    const doc = await db$n().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("[Bookings] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch booking request." });
  }
});
router$m.patch("/:id/confirm", requireCoordinator, async (req, res) => {
  try {
    const { assignedPhotographerId, assignedPhotographerName, scheduledDate, scheduledTime, internalNotes } = req.body;
    const requestDoc = await db$n().collection("orderRequests").doc(req.params.id).get();
    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    const request = requestDoc.data();
    if (request.convertedToOrderId) {
      let listingId2 = existingInvoiceId(request.listingId);
      try {
        const ensured = await ensureBookingListingForRequest(req.params.id);
        if (ensured?.listingId) listingId2 = ensured.listingId;
      } catch (err) {
        console.error("[Bookings] Listing ensure failed:", err);
      }
      try {
        await stampDurableLinks({
          invoiceId: existingInvoiceId(request.invoiceId),
          orderRequestId: req.params.id,
          orderId: String(request.convertedToOrderId),
          listingId: listingId2
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
    const locationFields = storedServiceLocationFields(request.address || request.propertyAddress || "");
    const requestAddress = locationFields.address || "";
    const requestAddressLabel = addressLabel(requestAddress);
    const storedPin = locationFields.lat == null ? {} : {
      lat: locationFields.lat,
      lng: locationFields.lng,
      latitude: locationFields.latitude,
      longitude: locationFields.longitude,
      placeId: locationFields.placeId
    };
    const traveledConfirm = applyServerTravel(linesForConfirmedOrder(request), requestAddress);
    const requestLineItems = traveledConfirm.lineItems;
    const travel = traveledConfirm.travel;
    const requestTotal = traveledConfirm.total;
    const requestSubtotal = sumLineItemPrices(requestLineItems.filter((item) => {
      const id = String(item.id || "");
      return !id.startsWith("promo-") && !item.name.startsWith("Promo Code:");
    }));
    const confirmSource = scheduledDate || request.scheduledDate || request.appointmentDate || request.requestedDate;
    const confirmDate = toDate$1(confirmSource);
    const confirmTime = scheduledTime || request.scheduledTime || request.appointmentTime || request.requestedTime || null;
    if (!requestEmail) {
      return res.status(400).json({ error: "Client email is missing on this booking request." });
    }
    let photographer = null;
    if (assignedPhotographerId) {
      const staffDoc = await db$n().collection("staff").doc(assignedPhotographerId).get();
      photographer = staffDoc.exists ? staffDoc.data() : null;
    }
    let clientId2;
    const attachedClientId = typeof request.clientId === "string" ? request.clientId.trim() : "";
    const attachedClient = attachedClientId ? await db$n().collection("clients").doc(attachedClientId).get() : null;
    if (attachedClient?.exists) {
      clientId2 = attachedClient.id;
      await attachedClient.ref.update({
        totalOrders: admin.firestore.FieldValue.increment(1),
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const existingClients = await db$n().collection("clients").where("email", "==", requestEmail).limit(1).get();
      if (!existingClients.empty) {
        clientId2 = existingClients.docs[0].id;
        await existingClients.docs[0].ref.update({
          totalOrders: admin.firestore.FieldValue.increment(1),
          lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        const clientRef = await db$n().collection("clients").add({
          firstName: requestFirstName,
          lastName: requestLastName,
          email: requestEmail,
          phone: requestPhone,
          address: requestAddress,
          totalOrders: 1,
          totalSpend: 0,
          lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "active",
          portalAccess: false,
          tags: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        clientId2 = clientRef.id;
      }
    }
    const orderData = {
      orderRequestId: req.params.id,
      clientId: clientId2,
      clientName: requestClientName,
      clientEmail: requestEmail,
      clientPhone: requestPhone,
      address: requestAddress,
      addressLabel: requestAddressLabel,
      ...storedPin,
      services: requestLineItems,
      lineItems: requestLineItems,
      selectedService: request.selectedService || null,
      addOns: [],
      subtotal: requestSubtotal,
      pricing: { ...request.pricing || {}, subtotal: requestSubtotal, tax: Number(request.pricing?.tax) || 0, total: requestTotal },
      total: requestTotal,
      travelZone: travel.travelZone,
      travelMiles: travel.travelMiles,
      travelFeeCents: travel.travelFeeCents,
      travelQuoted: travel.travelQuoted,
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
    const orderRef = await db$n().collection("orders").add(orderData);
    const existingAppointment = await db$n().collection("appointments").where("orderRequestId", "==", req.params.id).limit(1).get();
    const confirmedAppointment = {
      orderId: orderRef.id,
      orderRequestId: req.params.id,
      clientId: clientId2,
      clientName: requestClientName,
      clientEmail: requestEmail,
      clientPhone: requestPhone,
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const appointmentRef = existingAppointment.empty ? db$n().collection("appointments").doc() : existingAppointment.docs[0].ref;
    if (existingAppointment.empty) {
      await appointmentRef.set({
        ...confirmedAppointment,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await appointmentRef.update(confirmedAppointment);
    }
    const galleryRef = await db$n().collection("galleries").add({
      orderId: orderRef.id,
      clientId: clientId2,
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
      services: requestLineItems.filter((item) => !isTravelFeeLine(item)).map((item) => item.name || String(item)).filter(Boolean),
      travelSummary: travelSummaryText(travel, { miles: true }),
      scheduledDate: confirmDate,
      scheduledTime: confirmTime,
      photographerEmail: photographer?.email || null,
      photographerCalendarId: photographer?.googleCalendarId || photographer?.calendarId || null,
      photographerName: assignedPhotographerName || photographer?.name || null,
      notes: internalNotes || request.vibeNote || ""
    }).catch(async (err) => {
      console.error("[Bookings] Calendar event creation failed:", err);
      await db$n().collection("agentLogs").add({
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
    let listingId = existingInvoiceId(request.listingId);
    let invoiceId = linkedInvoiceId;
    if (linkedInvoiceId) {
      const existingInvoice = await db$n().collection("invoices").doc(linkedInvoiceId).get();
      if (existingInvoice.exists) {
        await existingInvoice.ref.update({
          orderId: orderRef.id,
          clientId: clientId2,
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
      const invoiceRef = db$n().collection("invoices").doc();
      const draft = buildBookingInvoiceDraft({
        lineItems: requestLineItems,
        total: requestTotal,
        pricing: { subtotal: requestSubtotal, tax: Number(request.pricing?.tax) || 0 },
        clientEmail: requestEmail,
        clientId: clientId2,
        clientName: requestClientName,
        orderRequestId: req.params.id,
        promoCode: request.promoCode,
        promoDiscount: request.promoDiscount,
        travel
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
      clientId: clientId2,
      galleryId: galleryRef.id,
      invoiceId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    try {
      const ensured = await ensureBookingListingForRequest(req.params.id);
      if (ensured?.listingId) listingId = ensured.listingId;
    } catch (err) {
      console.error("[Bookings] Listing ensure failed:", err);
    }
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
        scheduledDate: bookingDateLabel(confirmSource, "To be confirmed"),
        scheduledTime: confirmTime || "To be confirmed",
        photographerName: assignedPhotographerName || "Our team",
        travelFee: travelSummaryText(travel),
        orderId: orderRef.id,
        portalUrl: `${appUrl$2()}/portal`
      }
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));
    return res.json({
      success: true,
      orderId: orderRef.id,
      clientId: clientId2,
      invoiceId,
      message: "Booking confirmed and order created."
    });
  } catch (err) {
    console.error("[Bookings] Confirm error:", err);
    return res.status(500).json({ error: "Failed to confirm booking." });
  }
});
router$m.patch("/:id/decline", requireCoordinator, async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await db$n().collection("orderRequests").doc(req.params.id).get();
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
  const invoiceRef = db$n().collection("invoices").doc(plan.createId);
  const invoiceSnap = await invoiceRef.get();
  if (invoiceSnap.exists && Object.keys(plan.invoiceFields).length > 0) {
    await invoiceRef.update({ ...plan.invoiceFields, updatedAt: now });
  }
  if (plan.orderFields) {
    await db$n().collection("orders").doc(input.orderId).update({ ...plan.orderFields, updatedAt: now });
  }
  if (input.listingId && plan.listingFields) {
    await db$n().collection("listings").doc(input.listingId).update({ ...plan.listingFields, updatedAt: now });
  }
}
function linesForConfirmedOrder(request) {
  const raw = Array.isArray(request.lineItems) && request.lineItems.length > 0 ? request.lineItems : Array.isArray(request.services) ? request.services.map((service) => typeof service === "string" ? { name: service, price: 0 } : service) : [];
  const stored = normalizeBookingLineItems(raw).filter((item) => item.name.trim());
  if (chargedServiceLines(stored).length > 0) return stored;
  return planOrderPackageRepair(request)?.lineItems ?? stored;
}
async function linkClientIdByEmail(email) {
  try {
    const normalized = normalizeEmail$1(email);
    if (!normalized) return null;
    const snap = await db$n().collection("clients").where("email", "==", normalized).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
  } catch (err) {
    console.error("[Bookings] Client lookup for invoice failed:", err);
    return null;
  }
}
async function createBookingInvoiceDraft(input) {
  const clientId2 = input.clientId || await linkClientIdByEmail(input.email);
  const draft = buildBookingInvoiceDraft({
    lineItems: input.lineItems,
    total: input.total,
    pricing: input.pricing,
    clientEmail: input.email,
    clientId: clientId2,
    clientName: input.clientName,
    orderRequestId: input.orderRequestId,
    promoCode: input.promoCode,
    promoDiscount: input.promoDiscount,
    travel: input.travel
  });
  const invoiceRef = db$n().collection("invoices").doc();
  await invoiceRef.set({
    ...draft,
    invoiceNumber: await generateInvoiceNumber(),
    paymentUrl: `${appUrl$2()}/invoice/${invoiceRef.id}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { invoiceId: invoiceRef.id, clientId: clientId2 };
}
async function generateInvoiceNumber() {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const snapshot = await db$n().collection("invoices").where("invoiceNumber", ">=", `INV-${year}-`).where("invoiceNumber", "<", `INV-${year + 1}`).get().catch((err) => {
    console.error("[Bookings] Invoice number lookup failed:", err);
    return null;
  });
  if (!snapshot) {
    return `INV-${year}-${String(Date.now()).slice(-6)}`;
  }
  return nextSequentialInvoiceNumber(
    snapshot.docs.map((entry2) => entry2.data().invoiceNumber),
    year
  );
}
const router$l = Router();
const db$m = () => admin.firestore();
router$l.get("/", requireStaff, async (req, res) => {
  try {
    const { status, photographerId, limit = "50", startAfter } = req.query;
    let query = db$m().collection("orders").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (photographerId) {
      query = query.where("assignedPhotographerId", "==", photographerId);
    }
    const limitNum = Math.min(Number(limit), 200);
    query = query.limit(limitNum);
    if (startAfter) {
      const cursorDoc = await db$m().collection("orders").doc(startAfter).get();
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
router$l.get("/dashboard", requireStaff, async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [allOrders, todayOrders, monthTransactions, pendingRequests] = await Promise.all([
      db$m().collection("orders").get(),
      db$m().collection("orders").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(todayStart)).get(),
      db$m().collection("transactions").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(monthStart)).where("status", "==", "completed").get(),
      db$m().collection("orderRequests").where("status", "==", "new").get()
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
router$l.get("/:id", requireStaff, async (req, res) => {
  try {
    const orderDoc = await db$m().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = { id: orderDoc.id, ...orderDoc.data() };
    const [gallery, invoice, appointment, messages] = await Promise.all([
      db$m().collection("galleries").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Gallery lookup failed:", err);
        return null;
      }),
      db$m().collection("invoices").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Invoice lookup failed:", err);
        return null;
      }),
      db$m().collection("appointments").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Appointment lookup failed:", err);
        return null;
      }),
      db$m().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "desc").limit(20).get().catch((err) => {
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
router$l.patch("/:id", requireCoordinator, async (req, res) => {
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
      const anchored = chicagoNoonDate(updates.scheduledDate) || new Date(updates.scheduledDate);
      if (!Number.isNaN(anchored.getTime())) {
        updates.scheduledDate = admin.firestore.Timestamp.fromDate(anchored);
      }
    }
    await db$m().collection("orders").doc(req.params.id).update(updates);
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
router$l.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, note } = req.body;
    const orderDoc = await db$m().collection("orders").doc(req.params.id).get();
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
    const apptSnapshot = await db$m().collection("appointments").where("orderId", "==", req.params.id).limit(1).get();
    if (!apptSnapshot.empty) {
      const apptStatus = status === "in_progress" ? "in_progress" : status === "shot_complete" || status === "editing" ? "completed" : status === "cancelled" ? "cancelled" : void 0;
      if (apptStatus) {
        await apptSnapshot.docs[0].ref.update({ status: apptStatus });
      }
    }
    await db$m().collection("agentLogs").add({
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
router$l.get("/:id/timeline", requireStaff, async (req, res) => {
  try {
    const [messages, editRequests, agentLogs] = await Promise.all([
      db$m().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$m().collection("editRequests").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$m().collection("agentLogs").where("relatedId", "==", req.params.id).orderBy("createdAt", "asc").get()
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
  const hasMoney = ["total", "amountDue", "amountPaid"].some((key) => numeric(invoice[key]) != null);
  if (!hasMoney) return false;
  const { total, amountPaid, amountDue } = invoiceBalance(invoice);
  const statedDue = numeric(invoice.amountDue);
  if (total <= 0 && (statedDue == null || statedDue <= 0)) return true;
  if (statedDue != null && statedDue <= 0 && amountPaid <= 0 && total > 0) return false;
  return amountDue <= 0 && amountPaid > 0;
}
const ICONIC_DOWNLOAD_LOCK = {
  title: "Your Iconic files are locked",
  message: "Iconic Images invoices after the shoot. Downloads open when that invoice is paid, or when our team releases the gallery."
};
function lockDownloadsOn(value) {
  return value !== false;
}
function requirePaymentOn(value) {
  return value !== false;
}
function clientGalleryDownloadsUnlocked(gate = {}) {
  if (gate.downloadsReleased === true) return true;
  if (gate.lockDownloads === false) return true;
  if (gate.downloadEnabled === true) return true;
  return invoiceAllowsDownload(gate.invoice);
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
const RAW_EXT$2 = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq)$/i;
const PREVIEW_EXT = /\.(jpe?g|png|webp|gif)$/i;
function ingestJobId(listingId) {
  return `ingest_${listingId}`;
}
function shouldBumpStudioQueue(storagePath) {
  return storagePath.includes("/raw/");
}
function isRawStudioFile(name, contentType) {
  if (RAW_EXT$2.test(name)) return true;
  const type = String(contentType || "").toLowerCase();
  return type.includes("raw") || type.includes("dng") || type.includes("canon-cr") || type.includes("nikon");
}
function isStudioPreviewable(name, contentType) {
  if (isRawStudioFile(name, contentType)) return false;
  const type = String(contentType || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif") return true;
  return PREVIEW_EXT.test(name);
}
function finalsObjectPath(listingId, fileName2, now = Date.now()) {
  return `listings/${listingId}/finals/${now}_${safeStorageFileName(fileName2)}`;
}
function listingAddressLabel(listing) {
  return recordAddressText(listing) || "Untitled listing";
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
function text$6(value) {
  return typeof value === "string" ? value.trim() : "";
}
function httpUrl(value) {
  const url = text$6(value);
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
  return addressText(listing.addressLabel) || addressText(listing.propertyAddress) || addressText(listing.address) || addressText(listing.shootLocation);
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
const PRIVATE_FILE = /\.(zip|pdf|dng|cr2|cr3|nef|nrw|arw|srf|sr2|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic)(\?|$)/i;
const PRIVATE_FOLDER = /\/(raw|downloads?|mls|full|print|zips?)\//i;
function rowOf(item) {
  return item && typeof item === "object" ? item : null;
}
function isPrivateMedia(path2, name, url) {
  if (PRIVATE_FOLDER.test(path2) || path2.includes("/raw/")) return true;
  return PRIVATE_FILE.test(name) || PRIVATE_FILE.test(url);
}
function mediaName(row, fallback) {
  return text$6(row.name) || text$6(row.fileName) || text$6(row.title) || fallback;
}
function publicImages(listing) {
  if (!Array.isArray(listing.images)) return [];
  const images = [];
  listing.images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    const url = httpUrl(frame?.url);
    if (!frame || frame.raw || !url) return;
    if (isPrivateMedia(frame.path, frame.name, url)) return;
    images.push({ url, name: frame.name });
  });
  return images.slice(0, 200);
}
function publicVideos(listing) {
  if (!Array.isArray(listing.videos)) return [];
  const videos = [];
  for (const item of listing.videos) {
    const row = rowOf(item);
    if (!row) continue;
    const url = httpUrl(row.url);
    const name = mediaName(row, "Video");
    if (!url || isPrivateMedia(text$6(row.path) || text$6(row.storagePath), name, url)) continue;
    videos.push({ url, name });
  }
  return videos.slice(0, 40);
}
function publicTour(listing) {
  for (const key of ["tourUrl", "matterportUrl", "virtualTourUrl", "virtualTour", "threeDTourUrl", "tourLink"]) {
    const url = httpUrl(listing[key]);
    if (url && !isPrivateMedia("", key, url)) return url;
  }
  return "";
}
function agentNameOf$1(listing) {
  const direct = text$6(listing.agentName) || text$6(listing.listingAgent);
  if (direct) return direct;
  const agent = listing.agent;
  if (agent && typeof agent === "object") return text$6(agent.name);
  if (typeof agent === "string") return agent.trim();
  return "";
}
function publicFloorPlans(listing) {
  const groups = [listing.floorplans, listing.floorPlans];
  const plans = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      const row = rowOf(item);
      if (!row) continue;
      const url = httpUrl(row.url) || httpUrl(row.shareUrl);
      const name = mediaName(row, "Floor plan");
      const path2 = text$6(row.path) || text$6(row.storagePath);
      if (!url || isPrivateMedia(path2, name, url)) continue;
      plans.push({ url, name });
    }
  }
  return plans.slice(0, 40);
}
function downloadUrlOf(row) {
  for (const key of ["downloadUrl", "fullResUrl", "mlsUrl", "originalUrl", "zipUrl", "printUrl"]) {
    const url = httpUrl(row[key]);
    if (url) return url;
  }
  return "";
}
function ownerFiles(listing) {
  const files = [];
  const push = (url, name) => {
    if (!url || files.some((file) => file.url === url)) return;
    files.push({ url, name });
  };
  for (const key of ["zipUrl", "downloadUrl", "mlsUrl", "mlsPackageUrl", "fullResUrl"]) {
    push(httpUrl(listing[key]), key);
  }
  const groups = [listing.images, listing.files, listing.downloads, listing.mlsFiles, listing.floorplans, listing.floorPlans];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    group.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      const name = mediaName(row, `File ${index + 1}`);
      const path2 = text$6(row.path) || text$6(row.storagePath);
      const display = httpUrl(row.url);
      const download = downloadUrlOf(row);
      if (download) push(download, name);
      if (display && isPrivateMedia(path2, name, display)) push(display, name);
    });
  }
  return files.slice(0, 200);
}
function ownerImageDownloads(listing, images) {
  const byUrl = /* @__PURE__ */ new Map();
  if (Array.isArray(listing.images)) {
    for (const item of listing.images) {
      const row = rowOf(item);
      if (!row) continue;
      const display = httpUrl(row.url);
      const download = downloadUrlOf(row);
      if (display && download && download !== display) byUrl.set(display, download);
    }
  }
  return images.map((image) => {
    const downloadUrl = byUrl.get(image.url);
    return downloadUrl ? { ...image, downloadUrl } : image;
  });
}
function ownerRevisions(listing) {
  if (!Array.isArray(listing.revisions)) return [];
  return listing.revisions.slice(0, 40).map((item, index) => {
    const row = rowOf(item) || {};
    const photoIndex = typeof row.photoIndex === "number" ? row.photoIndex : null;
    return {
      id: text$6(row.id) || `revision-${index + 1}`,
      type: text$6(row.type) || "gallery",
      photoIndex,
      description: text$6(row.description),
      status: text$6(row.status) || "pending",
      createdAt: text$6(row.createdAt)
    };
  });
}
function invoiceOf(listing) {
  const nested2 = listing.invoice;
  if (nested2 && typeof nested2 === "object" && typeof nested2.status === "string") {
    return { status: nested2.status };
  }
  const status = text$6(listing.invoiceStatus);
  return status ? { status } : null;
}
function pickReleasedGallery(listing, related) {
  const preferred = text$6(listing.galleryId) || text$6(listing.playtestGalleryId);
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
    agentName: agentNameOf$1(listing),
    services: servicesOf(listing),
    images: publicImages(listing),
    videos: publicVideos(listing),
    tourUrl: publicTour(listing),
    floorPlans: publicFloorPlans(listing),
    notice,
    view: "public"
  };
}
function ownerStudioProject(listing, pub, gate = {}) {
  const invoiceStatus = text$6(gate.invoice?.status) || text$6(invoiceOf(listing)?.status);
  const invoice = invoiceStatus ? { status: invoiceStatus } : null;
  const downloadsUnlocked = clientGalleryDownloadsUnlocked({
    invoice,
    downloadEnabled: gate.downloadEnabled ?? listing.downloadEnabled,
    downloadsReleased: gate.downloadsReleased ?? listing.downloadsReleased,
    lockDownloads: listing.lockDownloads
  });
  return {
    ...pub,
    view: "owner",
    clientName: text$6(listing.clientName),
    clientEmail: text$6(listing.clientEmail),
    clientPhone: text$6(listing.clientPhone),
    revisions: ownerRevisions(listing),
    lockDownloads: lockDownloadsOn(listing.lockDownloads),
    requirePayment: requirePaymentOn(listing.requirePayment),
    downloadsUnlocked,
    invoice,
    images: downloadsUnlocked ? ownerImageDownloads(listing, pub.images) : pub.images,
    files: downloadsUnlocked ? ownerFiles(listing) : []
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
    const galleryId = text$6(input.order.galleryId);
    const listingId = text$6(input.order.listingId);
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
    const galleryId = text$6(input.orderRequest.galleryId);
    const listingId = text$6(input.orderRequest.listingId);
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
const ORDER_GALLERY_RELEASE = "hold_until_order_complete";
const SHOWCASE_PHOTO_COUNT = 30;
const ICONIC_POLISH_TREATMENTS = [
  "Remove dirt and debris",
  "Remove harsh shadows and reflections",
  "Remove cords and powerlines",
  "Clean driveways",
  "Add grass",
  "Add curb appeal",
  "Add TVs and screens",
  "Firepits and fireplaces"
];
const ICONIC_POLISH_LIMITS = "Keep the architecture and camera angle. Do not add people. Standalone grass replacement is a separate edit, not a substitute for this full polish.";
const ICONIC_POLISH_INSTRUCTION = `Iconic Polish: ${ICONIC_POLISH_TREATMENTS.join("; ")}. ${ICONIC_POLISH_LIMITS}`;
const PHOTO_BASE = "Prepare this listing photo. Balance color, clear window glare, and replace a blown-out sky when the sky is visible. Keep the architecture, furnishings, and camera angle.";
function asItems(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry2) => {
    if (typeof entry2 === "string") {
      const name2 = entry2.trim();
      return name2 ? [{ id: "", name: name2 }] : [];
    }
    if (!entry2 || typeof entry2 !== "object") return [];
    const row = entry2;
    const id = String(row.id || "").trim();
    const name = String(row.name || row.label || "").trim();
    return id || name ? [{ id, name }] : [];
  });
}
function asIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry2) => String(entry2 || "").trim()).filter(Boolean);
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
function orderExteriorTwilightPrompt() {
  return twilightPrompt("exterior", false);
}
function photoPrompt(polish) {
  return polish ? `${PHOTO_BASE} ${ICONIC_POLISH_INSTRUCTION}` : PHOTO_BASE;
}
function twilightRole(index) {
  if (index === 0) return "front";
  if (index === 1) return "back";
  return `exterior-${index + 1}`;
}
function isShowcaseItem(id, name, catalogId) {
  const blob = `${id} ${name} ${catalogId || ""}`.toLowerCase();
  return blob.includes("listing-showcase") || blob.includes("the showcase");
}
function collectTexts(input) {
  const texts = [];
  const packageNames = [];
  let polishFromOrder = false;
  let showcase = false;
  const items = [...asItems(input.lineItems), ...asItems(input.services)];
  for (const id of asIds(input.serviceIds)) items.push({ id, name: "" });
  for (const item of items) {
    if (item.name) texts.push(item.name);
    const catalog = packageByIdOrName(item.id, item.name);
    if (catalog) {
      packageNames.push(catalog.name);
      for (const feature of catalog.features || []) texts.push(feature);
    }
    if (isShowcaseItem(item.id, item.name, catalog?.id)) showcase = true;
    const blob = `${item.id} ${item.name}`.toLowerCase();
    if (blob.includes("iconic finish") || blob.includes("iconic polish") || blob.includes("iconic-finish")) {
      polishFromOrder = true;
    }
  }
  return {
    texts,
    packageName: packageNames[0] || items.find((item) => item.name)?.name || "Custom order",
    polishFromOrder,
    showcase
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
      const previous = deliverables.get("aerials");
      const stated = aerials ? Number(aerials[1]) : null;
      const count2 = stated != null ? Math.max(stated, previous?.count || 0) : previous?.count ?? null;
      deliverables.set("aerials", {
        id: "aerials",
        label: count2 ? `${count2} aerial stills` : "Aerial stills",
        kind: "capture",
        count: count2
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
  if (collected.showcase) {
    photoCount = SHOWCASE_PHOTO_COUNT;
    photoFull = false;
  }
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
    photoScope: photoFull ? "full" : photoCount != null ? "count" : "none",
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
const AERIAL_NAME = /aerial|drone/i;
function galleryStatusNeedsReleaseGate(status) {
  return RELEASED_GALLERY_STATUSES.includes(status);
}
function isAerialAssetName(value) {
  return AERIAL_NAME.test(value);
}
function mediaBlob(media) {
  return `${media.type || ""} ${media.title || ""} ${media.fileName || ""}`.toLowerCase();
}
function fileBlob(file) {
  return `${file.name} ${file.path}`.toLowerCase();
}
function mediaMatchesDeliverable(id, media) {
  const blob = mediaBlob(media);
  const type = String(media.type || "").toLowerCase();
  if (id === "snap-reel") {
    if (/animated|walk-?through|cinematic/.test(blob)) return false;
    return type === "reel" || /snap/.test(blob);
  }
  if (id === "animated-reel") return /animated|walk-?through/.test(blob);
  if (id === "cinematic-video") return /cinematic/.test(blob);
  if (id === "floorplan") return /floor\s*plan|floorplan/.test(blob);
  if (id === "tour-3d") return type === "tour" || type === "matterport" || /matterport|3d tour/.test(blob);
  return false;
}
function fileMatchesDeliverable(id, file) {
  const blob = fileBlob(file);
  if (id === "floorplan") return /floor\s*plan|floorplan/.test(blob);
  if (id === "tour-3d") return /matterport|3d tour/.test(blob);
  if (id === "snap-reel") return /snap/.test(blob) && /reel/.test(blob);
  if (id === "animated-reel") return /animated|walk-?through/.test(blob);
  if (id === "cinematic-video") return /cinematic/.test(blob);
  return false;
}
function isTwilightJob(job) {
  return job.type === "twilight" || String(job.slot || "").startsWith("twilight-");
}
function approvedJobs(evidence) {
  return evidence.jobs.filter((job) => job.status === "approved");
}
function previewableUploads(files) {
  return files.filter((file) => file.raw !== true && file.previewable !== false && !file.path.includes("/finals/"));
}
function unlinkedGalleryRelease() {
  return {
    galleryRelease: ORDER_GALLERY_RELEASE,
    complete: true,
    linked: false,
    percent: 100,
    required: 0,
    satisfied: 0,
    gaps: [],
    message: "No package is linked to this gallery, so the order gate does not hold it."
  };
}
function gapLine(id, label, required, satisfied) {
  return { id, label, required, satisfied: Math.max(0, satisfied) };
}
function releaseMessage(complete, percent, gaps, required) {
  if (required === 0) {
    return "No image or file requirements are on this order. The gallery is not held.";
  }
  if (complete) {
    return "Order plan is 100% complete. The gallery can be marked delivered or approved.";
  }
  const missing = gaps.map((gap) => gap.required > 1 || gap.satisfied > 0 ? `${gap.label} (${gap.satisfied}/${gap.required})` : gap.label);
  return `Gallery stays held until the order is 100% complete (${percent}%). Missing: ${missing.join(", ")}.`;
}
function assessGalleryRelease(plan, evidence) {
  const lines = [];
  const approved = approvedJobs(evidence);
  const twilightResults = new Set(
    approved.filter(isTwilightJob).map((job) => job.resultPath).filter((path2) => Boolean(path2))
  );
  const photoSources = /* @__PURE__ */ new Set();
  const aerialKeys = /* @__PURE__ */ new Set();
  for (const job of approved) {
    if (isTwilightJob(job)) continue;
    const name = `${job.fileName || ""} ${job.sourcePath || ""} ${job.resultPath || ""}`;
    if (isAerialAssetName(name)) {
      const key2 = job.sourcePath || job.resultPath || job.slot || name;
      aerialKeys.add(key2);
      continue;
    }
    const key = job.sourcePath || job.resultPath || job.slot;
    if (key) photoSources.add(key);
  }
  for (const final of evidence.finals) {
    if (twilightResults.has(final.path)) continue;
    const name = `${final.name} ${final.path}`;
    if (isAerialAssetName(name)) {
      aerialKeys.add(final.path || final.name);
      continue;
    }
    const key = final.sourcePath || final.path;
    if (!key || photoSources.has(key)) continue;
    photoSources.add(key);
  }
  if (plan.photoScope === "count" && (plan.photoCount || 0) > 0) {
    lines.push(gapLine("photos", "Photos", plan.photoCount || 0, photoSources.size));
  } else if (plan.photoScope === "full") {
    const uploads = previewableUploads(evidence.uploads).filter((file) => !isAerialAssetName(fileBlob(file)));
    if (uploads.length === 0) {
      lines.push(gapLine("photos", "Photos", 1, 0));
    } else {
      const satisfied2 = uploads.filter((file) => photoSources.has(file.path) || approved.some((job) => !isTwilightJob(job) && job.sourcePath === file.path)).length;
      lines.push(gapLine("photos", "Photos", uploads.length, satisfied2));
    }
  }
  if (plan.twilight.length > 0) {
    const approvedSlots = new Set(approved.filter(isTwilightJob).map((job) => String(job.slot || "")));
    const satisfied2 = plan.twilight.filter((slot) => approvedSlots.has(slot.slot)).length;
    lines.push(gapLine("twilight", "Twilight renders", plan.twilight.length, satisfied2));
  }
  const aerial = plan.deliverables.find((item) => item.id === "aerials");
  if (aerial) {
    if (typeof aerial.count === "number" && aerial.count > 0) {
      lines.push(gapLine("aerials", aerial.label, aerial.count, aerialKeys.size));
    } else {
      const uploads = previewableUploads(evidence.uploads).filter((file) => isAerialAssetName(fileBlob(file)));
      if (uploads.length === 0) {
        lines.push(gapLine("aerials", "Aerial stills", 1, 0));
      } else {
        const satisfied2 = uploads.filter((file) => aerialKeys.has(file.path) || approved.some((job) => job.sourcePath === file.path && isAerialAssetName(`${job.fileName || ""} ${job.sourcePath || ""}`))).length;
        lines.push(gapLine("aerials", "Aerial stills", uploads.length, satisfied2));
      }
    }
  }
  const usedMedia = /* @__PURE__ */ new Set();
  for (const item of plan.deliverables) {
    if (item.id === "aerials" || item.kind === "delivery") continue;
    if (item.kind !== "video" && item.kind !== "floorplan" && item.id !== "tour-3d") continue;
    const fileHit = [...evidence.finals, ...evidence.uploads].some((file) => fileMatchesDeliverable(item.id, file));
    let mediaHit = false;
    if (!fileHit) {
      for (let index = 0; index < evidence.media.length; index += 1) {
        if (usedMedia.has(index)) continue;
        if (!mediaMatchesDeliverable(item.id, evidence.media[index])) continue;
        usedMedia.add(index);
        mediaHit = true;
        break;
      }
    }
    lines.push(gapLine(item.id, item.label, 1, fileHit || mediaHit ? 1 : 0));
  }
  const measurable = lines.filter((line) => line.required > 0);
  const gaps = measurable.filter((line) => line.satisfied < line.required);
  const required = measurable.reduce((sum, line) => sum + line.required, 0);
  const satisfied = measurable.reduce((sum, line) => sum + Math.min(line.satisfied, line.required), 0);
  const percent = required === 0 ? 100 : Math.floor(satisfied / required * 100);
  const complete = gaps.length === 0;
  return {
    galleryRelease: ORDER_GALLERY_RELEASE,
    complete,
    linked: true,
    percent,
    required,
    satisfied,
    gaps,
    message: releaseMessage(complete, percent, gaps, required)
  };
}
const MEDIA_DELIVERY_STATUSES = ["pending", "undelivered", "delivered"];
const MEDIA_DELIVERY_LABELS = {
  pending: "Pending",
  undelivered: "Undelivered",
  delivered: "Delivered"
};
const EARLY_GALLERY_STATUSES = /* @__PURE__ */ new Set(["", "pending_upload", "raw_uploaded", "editing"]);
const RELEASED_QUEUE_STATUSES = /* @__PURE__ */ new Set(["delivered", "approved"]);
function isMediaDeliveryStatus(value) {
  return MEDIA_DELIVERY_STATUSES.includes(value);
}
function mediaDeliveryFromGalleryStatus(status) {
  const value = String(status || "").trim();
  if (RELEASED_QUEUE_STATUSES.has(value)) return "delivered";
  if (value === "ready_for_review") return "undelivered";
  if (EARLY_GALLERY_STATUSES.has(value)) return "pending";
  return "undelivered";
}
function galleryStatusForDeliveryMove(target, hasMedia) {
  if (target === "undelivered") return "ready_for_review";
  return hasMedia ? "editing" : "pending_upload";
}
function deliveryMoveTargets(input) {
  if (!input.galleryId) return [];
  const targets = [];
  if (input.deliveryStatus !== "pending") targets.push("pending");
  if (input.deliveryStatus !== "undelivered") targets.push("undelivered");
  if (input.galleryStatus !== "delivered") targets.push("delivered");
  return targets;
}
function emptyStudio() {
  return { active: 0, review: 0, approved: 0, failed: 0 };
}
function tallyStudioJobs(jobs) {
  const studio = emptyStudio();
  for (const job of jobs) {
    const status = String(job.status || "");
    if (status === "pending" || status === "processing") studio.active += 1;
    else if (status === "review") studio.review += 1;
    else if (status === "approved") studio.approved += 1;
    else if (status === "failed" || status === "rejected") studio.failed += 1;
  }
  return studio;
}
function rowAddress(input) {
  const labeled = addressText(input.addressLabel) || addressText(input.address) || (input.listing ? recordAddressText(input.listing) : "");
  if (labeled) return labeled;
  if (typeof input.title === "string" && input.title.trim()) return input.title.trim();
  return "Untitled listing";
}
function listingJobs(jobs, listingId) {
  if (!listingId) return [];
  return jobs.filter((job) => job.listingId === listingId);
}
const STATUS_RANK = {
  undelivered: 0,
  pending: 1,
  delivered: 2
};
function finalize(row) {
  const deliveryStatus = mediaDeliveryFromGalleryStatus(row.galleryStatus);
  const next = {
    ...row,
    deliveryStatus,
    label: MEDIA_DELIVERY_LABELS[deliveryStatus],
    moves: []
  };
  next.moves = deliveryMoveTargets(next);
  return next;
}
function buildMediaDeliveryQueue(input) {
  const listings = input.listings || [];
  const jobs = input.jobs || [];
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const seenGalleryIds = /* @__PURE__ */ new Set();
  const galleryListingIds = /* @__PURE__ */ new Set();
  const rows = input.galleries.map((gallery) => {
    seenGalleryIds.add(gallery.id);
    const listingId = String(gallery.listingId || "").trim();
    if (listingId) galleryListingIds.add(listingId);
    const listing = listingId ? listingById.get(listingId) || null : null;
    const galleryStatus = String(gallery.status || "");
    return finalize({
      id: gallery.id,
      galleryId: gallery.id,
      listingId: listingId || listing?.id || null,
      orderId: String(gallery.orderId || "").trim() || null,
      address: rowAddress({
        addressLabel: gallery.addressLabel,
        address: gallery.address,
        title: gallery.title,
        listing
      }),
      clientName: String(gallery.clientName || "").trim(),
      galleryStatus,
      mediaCount: Math.max(0, Number(gallery.mediaCount) || 0),
      studio: tallyStudioJobs(listingJobs(jobs, listingId))
    });
  });
  for (const listing of listings) {
    const linkedGallery = String(listing.galleryId || "").trim();
    if (linkedGallery && seenGalleryIds.has(linkedGallery)) continue;
    if (galleryListingIds.has(listing.id)) continue;
    const studio = tallyStudioJobs(listingJobs(jobs, listing.id));
    const hasStudioWork = studio.active + studio.review + studio.approved + studio.failed > 0;
    if (!hasStudioWork) continue;
    rows.push(finalize({
      id: `listing:${listing.id}`,
      galleryId: null,
      listingId: listing.id,
      orderId: null,
      address: rowAddress({ listing }),
      clientName: "",
      galleryStatus: "",
      mediaCount: 0,
      studio
    }));
  }
  return rows.sort((a, b) => {
    const rank = STATUS_RANK[a.deliveryStatus] - STATUS_RANK[b.deliveryStatus];
    if (rank !== 0) return rank;
    return a.address.localeCompare(b.address);
  });
}
const ORDER_EDIT_RUN_PER_REQUEST = 1;
const ORDER_EDIT_STALE_MS = 3 * 60 * 1e3;
function orderEditClaimable(job, now = Date.now()) {
  if (job.status === "pending") return true;
  if (job.status !== "processing") return false;
  if (job.updatedAtMs == null) return false;
  return now - job.updatedAtMs >= ORDER_EDIT_STALE_MS;
}
function runnableOrderEdits(jobs, now = Date.now()) {
  return jobs.filter((job) => job.origin === "order" && Boolean(job.sourcePath) && orderEditClaimable(job, now)).sort((a, b) => {
    const rank = (job) => job.type === "twilight" ? 0 : 1;
    return rank(a) - rank(b);
  });
}
function orderQueueAdvancePlan(jobs, now = Date.now()) {
  const runnable = runnableOrderEdits(jobs, now);
  const next = runnable[0] || null;
  const remainingAfter = next ? Math.max(0, runnable.length - ORDER_EDIT_RUN_PER_REQUEST) : 0;
  return {
    nextId: next?.id || null,
    runnable: runnable.length,
    remainingAfter,
    shouldFollowUp: remainingAfter > 0,
    perRequest: ORDER_EDIT_RUN_PER_REQUEST
  };
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
    for (const [key, nested2] of Object.entries(value)) {
      out[key] = jsonSafe(nested2);
    }
    return out;
  }
  return value;
}
const db$l = () => admin.firestore();
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
async function createListingUploadUrl(listingId, fileName2, contentType, folder) {
  await ensureBucketCors();
  const safeName = safeStorageFileName(fileName2);
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
async function saveListingBytes(listingId, fileName2, contentType, folder, bytes) {
  const safeName = safeStorageFileName(fileName2);
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
  const { listingId, storagePath, fileName: fileName2, uploadedBy } = options;
  if (!isListingStoragePath(listingId, storagePath)) {
    throw Object.assign(new Error("Storage path is not inside this listing."), { status: 400 });
  }
  const listingRef = db$l().collection("listings").doc(listingId);
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
        contentType: contentTypeForUpload(fileName2, options.contentType || metadata.contentType)
      });
    }
    url = firebaseDownloadUrl(bucket$1().name, storagePath, token);
  }
  const image = {
    url,
    name: safeStorageFileName(fileName2),
    path: storagePath,
    contentType: contentTypeForUpload(fileName2, options.contentType),
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
    const snap = await db$l().collection("galleries").where("listingId", "==", listingId).limit(5).get();
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
    const ref = db$l().collection("galleries").doc(galleryId);
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
const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_EDIT_MODEL = "gpt-image-1";
const OPENAI_IMAGE_EDIT_TIMEOUT_MS = 45e3;
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_INSPECTION_MODEL = "gpt-4o-mini";
const OPENAI_INSPECTION_TIMEOUT_MS = 2e4;
const DELIVERY_INSPECTION_NOTES = [
  "Photographer visible in a mirror or shadow.",
  "Photographer reflected in a doorway or glass.",
  "Inconsistent color.",
  "Double exposure.",
  "Frame is too poor to deliver."
];
const INSPECTION_MISSING_KEY_NOTE = "Inspection skipped. Review this photo.";
const INSPECTION_FAILED_NOTE = "Inspection did not finish. Review this photo.";
function deliveryInspection(status, notes) {
  return { status, notes: [...notes] };
}
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
function imagePart(bytes, contentType, filename) {
  const type = contentType.includes("png") ? "image/png" : contentType.includes("webp") ? "image/webp" : "image/jpeg";
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return {
    blob: new Blob([new Uint8Array(bytes)], { type }),
    filename: filename || `source.${extension}`
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
  const references = input.references || [];
  for (const reference of references) {
    if (reference.bytes.length > MAX_SOURCE_BYTES) {
      throw new OpenAiEditError("A reference image is over 20 MB.");
    }
  }
  const file = imagePart(input.bytes, input.contentType);
  const form = new FormData();
  form.append("model", OPENAI_IMAGE_EDIT_MODEL);
  form.append("prompt", prompt);
  if (!references.length) {
    form.append("image", file.blob, file.filename);
  } else {
    form.append("image[]", file.blob, file.filename);
    for (const reference of references) {
      const extra = imagePart(reference.bytes, reference.contentType, reference.filename);
      form.append("image[]", extra.blob, extra.filename);
    }
  }
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
    throw new OpenAiEditError("Studio could not reach OpenAI. Queue the edit again.");
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
function canonicalInspectionNotes(raw) {
  if (!Array.isArray(raw)) return [];
  const found = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const text2 = item.trim().toLowerCase();
    const match = DELIVERY_INSPECTION_NOTES.find((note) => note.toLowerCase() === text2);
    if (match && !found.includes(match)) found.push(match);
  }
  return found;
}
function inspectionObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
function parseDeliveryInspection(body) {
  let value = body;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  const row = inspectionObject(value);
  if (!row) return null;
  if (Array.isArray(row.choices)) {
    const message = inspectionObject(inspectionObject(row.choices[0])?.message);
    const content = message?.content;
    if (typeof content !== "string") return null;
    return parseDeliveryInspection(content);
  }
  if (row.status !== "pass" && row.status !== "flag") return null;
  if (row.status === "pass") return deliveryInspection("pass", []);
  const notes = canonicalInspectionNotes(row.notes);
  if (!notes.length) return null;
  return deliveryInspection("flag", notes);
}
const INSPECTION_PROMPT = [
  "Inspect this finished real-estate listing JPEG.",
  "Look only for: a photographer in a mirror or shadow; a doorway or glass reflection of the photographer; inconsistent color; a double exposure; a frame too poor to deliver.",
  "Do not comment on staging, sky, furniture, or other edits.",
  "Do not approve or reject the photo.",
  'Reply with JSON only: {"status":"pass" or "flag","notes":string[]}.',
  "Use status flag only when one of those issues is visible. Otherwise pass.",
  "When status is pass, notes must be an empty array.",
  "When status is flag, copy notes exactly from this list:",
  ...DELIVERY_INSPECTION_NOTES
].join(" ");
async function inspectFinishedListingJpeg(input) {
  const apiKey = input.apiKey.trim();
  if (!apiKey) return deliveryInspection("flag", [INSPECTION_MISSING_KEY_NOTE]);
  if (!input.bytes.length) return deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);
  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = input.timeoutMs ?? OPENAI_INSPECTION_TIMEOUT_MS;
  let response;
  try {
    response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_INSPECTION_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: INSPECTION_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${input.bytes.toString("base64")}` }
              }
            ]
          }
        ]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    console.error("[Studio inspection]", err instanceof Error ? err.message : err);
    return deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);
  }
  const body = await response.text();
  if (!response.ok) {
    console.error("[Studio inspection] OpenAI did not inspect the finished photo.", response.status);
    return deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);
  }
  return parseDeliveryInspection(body) || deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);
}
const db$k = () => admin.firestore();
const bucket = () => admin.storage().bucket();
function httpError$3(status, message) {
  return Object.assign(new Error(message), { status });
}
async function bumpRawIngestJob(input) {
  const file = {
    path: input.image.path,
    url: input.image.url || "",
    name: input.image.name || input.image.path.split("/").pop() || "raw",
    contentType: input.image.contentType || ""
  };
  const ref = db$k().collection("editJobs").doc(ingestJobId(input.listingId));
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
  const snap = await db$k().collection("listings").doc(listingId).get();
  if (!snap.exists) throw httpError$3(404, "Listing not found.");
  return { id: snap.id, ref: snap.ref, data: snap.data() || {} };
}
async function listingDelivery(listingId, data) {
  try {
    const ids = [];
    const push = (value) => {
      if (typeof value === "string" && value.trim()) ids.push(value.trim());
    };
    push(data.galleryId);
    push(data.playtestGalleryId);
    const snap = await db$k().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    snap.docs.forEach((doc) => ids.push(doc.id));
    for (const galleryId of [...new Set(ids)]) {
      const doc = await db$k().collection("galleries").doc(galleryId).get();
      if (!doc.exists) continue;
      const galleryStatus = typeof doc.data()?.status === "string" ? doc.data().status : "";
      const deliveryStatus = mediaDeliveryFromGalleryStatus(galleryStatus);
      return {
        galleryId: doc.id,
        galleryStatus,
        deliveryStatus,
        label: MEDIA_DELIVERY_LABELS[deliveryStatus]
      };
    }
    return null;
  } catch (err) {
    console.error("[Studio] Delivery status failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
async function listingsForRole(uid, role) {
  if (role === "photographer") {
    const [byUid, byIds] = await Promise.all([
      db$k().collection("listings").where("photographerUid", "==", uid).limit(50).get(),
      db$k().collection("listings").where("photographerIds", "array-contains", uid).limit(50).get()
    ]);
    const merged = /* @__PURE__ */ new Map();
    for (const doc of [...byUid.docs, ...byIds.docs]) merged.set(doc.id, doc);
    return [...merged.values()].map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  const snap = await db$k().collection("listings").limit(80).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}
async function assertStudioAccess(uid, role, listingId) {
  if (role !== "photographer") {
    await loadListing$1(listingId);
    return;
  }
  const mine = await listingsForRole(uid, "photographer");
  if (!mine.some((item) => item.id === listingId)) {
    throw httpError$3(403, "This job is not assigned to you.");
  }
}
function listingFrames(data) {
  return (Array.isArray(data.images) ? data.images : []).map((item, index) => frameFromListingImage(item, index)).filter((frame) => Boolean(frame));
}
async function downloadListingImage(listingId, sourcePath, fileName2, contentType) {
  if (!isListingStoragePath(listingId, sourcePath)) {
    throw new OpenAiEditError("That photo is not stored on this listing.");
  }
  if (!isStudioPreviewable(fileName2, contentType)) {
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
  const resolved = contentTypeForUpload(fileName2, String(metadata.contentType || contentType || ""));
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
  return { afterUrl: saved.url, resultPath: saved.storagePath, bytes: edited.bytes };
}
async function inspectOrderEditJpeg(bytes) {
  try {
    return await inspectFinishedListingJpeg({
      apiKey: readOpenAiApiKey(process.env),
      bytes
    });
  } catch (err) {
    console.error("[Studio inspection]", err instanceof Error ? err.message : err);
    return { status: "flag", notes: [INSPECTION_FAILED_NOTE] };
  }
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
    const snap = await db$k().collection("orders").doc(orderId).get();
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
function jobUpdatedAtMs(data) {
  const value = data.updatedAt;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
function queueJobsFromSnap(docs) {
  return docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      origin: typeof data.origin === "string" ? data.origin : "",
      status: typeof data.status === "string" ? data.status : "",
      type: typeof data.type === "string" ? data.type : "",
      sourcePath: typeof data.sourcePath === "string" ? data.sourcePath : "",
      updatedAtMs: jobUpdatedAtMs(data)
    };
  });
}
async function prepareOrderEditJobs(input) {
  const { listing, plan } = await loadOrderEditContext(input.listingId);
  const frames = listingFrames(listing.data);
  const drafts = orderEditDrafts(plan, frames);
  const settled = /* @__PURE__ */ new Set(["review", "approved", "rejected", "processing", "failed"]);
  if (input.retryFailed) settled.delete("failed");
  let prepared = 0;
  for (const draft of drafts) {
    const ref = db$k().collection("editJobs").doc(orderEditDocId(input.listingId, draft.slot));
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
  const jobSnap = await db$k().collection("editJobs").where("listingId", "==", input.listingId).limit(200).get();
  const jobs = queueJobsFromSnap(jobSnap.docs);
  const advance2 = orderQueueAdvancePlan(jobs);
  const waiting = jobs.filter((job) => job.origin === "order" && job.status === "pending" && !job.sourcePath).length;
  return { plan, prepared, pending: advance2.runnable, waiting, shouldFollowUp: advance2.shouldFollowUp };
}
async function claimOrderEdit(ref, now = Date.now()) {
  try {
    await db$k().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("missing");
      const data = snap.data() || {};
      const claimable = orderQueueAdvancePlan([{
        id: ref.id,
        origin: "order",
        status: String(data.status || ""),
        type: String(data.type || ""),
        sourcePath: typeof data.sourcePath === "string" ? data.sourcePath : "",
        updatedAtMs: jobUpdatedAtMs(data)
      }], now).nextId === ref.id;
      if (!claimable) throw new Error("busy");
      tx.update(ref, {
        status: "processing",
        note: "Editing this photo with OpenAI.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Error && (err.message === "busy" || err.message === "missing")) return false;
    throw err;
  }
}
async function advanceOrderEditQueue(input) {
  const prepared = await prepareOrderEditJobs(input);
  const jobSnap = await db$k().collection("editJobs").where("listingId", "==", input.listingId).limit(200).get();
  const advance2 = orderQueueAdvancePlan(queueJobsFromSnap(jobSnap.docs));
  const waiting = queueJobsFromSnap(jobSnap.docs).filter((job) => job.origin === "order" && job.status === "pending" && !job.sourcePath).length;
  if (!advance2.nextId) {
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      ran: null,
      remaining: 0,
      waiting,
      shouldFollowUp: false
    };
  }
  const next = jobSnap.docs.find((doc) => doc.id === advance2.nextId) || null;
  if (!next) {
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      ran: null,
      remaining: advance2.runnable,
      waiting,
      shouldFollowUp: advance2.shouldFollowUp
    };
  }
  const claimed = await claimOrderEdit(next.ref);
  if (!claimed) {
    const still = Math.max(0, advance2.runnable - 1);
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      ran: null,
      remaining: still,
      waiting,
      shouldFollowUp: still > 0
    };
  }
  const data = next.data() || {};
  const fileName2 = String(data.sourcePath || "").split("/").pop() || "photo.jpg";
  const beforeUrl = String(data.beforeUrl || data.sourceUrl || "");
  try {
    const saved = await runOpenAiEdit({
      listingId: input.listingId,
      sourcePath: String(data.sourcePath),
      fileName: fileName2,
      contentType: "",
      prompt: String(data.prompt || prepared.plan.photoPrompt)
    });
    await next.ref.update({
      status: "review",
      beforeUrl,
      afterUrl: saved.afterUrl,
      resultPath: saved.resultPath,
      placeholder: false,
      note: AI_EDIT_READY_NOTE,
      pipeline: ["pending", "processing", "review"],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const inspection = await inspectOrderEditJpeg(saved.bytes);
    try {
      await next.ref.update({
        inspection,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.error("[Studio inspection] The edit is in review, but the inspection note was not stored.", err instanceof Error ? err.message : err);
    }
    const remaining = Math.max(0, advance2.remainingAfter);
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      remaining,
      waiting,
      shouldFollowUp: remaining > 0,
      ran: {
        jobId: next.id,
        status: "review",
        slot: String(data.slot || ""),
        type: String(data.type || ""),
        beforeUrl,
        afterUrl: saved.afterUrl,
        resultPath: saved.resultPath,
        placeholder: false,
        note: AI_EDIT_READY_NOTE,
        inspection
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
    const remaining = Math.max(0, advance2.remainingAfter);
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      remaining,
      waiting,
      shouldFollowUp: remaining > 0,
      ran: {
        jobId: next.id,
        status: "failed",
        slot: String(data.slot || ""),
        type: String(data.type || ""),
        beforeUrl,
        afterUrl: "",
        placeholder: false,
        note
      }
    };
  }
}
async function queueOrderEdits(input) {
  return advanceOrderEditQueue({ ...input, retryFailed: true });
}
async function enqueueOrderEditsFromUpload(input) {
  return prepareOrderEditJobs({ ...input, retryFailed: false });
}
async function nextOrderEditListingId() {
  const snap = await db$k().collection("editJobs").where("status", "==", "pending").limit(40).get();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.origin === "order" && data.sourcePath && typeof data.listingId === "string" && data.listingId) {
      return data.listingId;
    }
  }
  return null;
}
async function enqueueAiEdit(input) {
  const listing = await loadListing$1(input.listingId);
  const frame = listingFrames(listing.data).find((item) => item.path === input.sourcePath);
  if (!frame) throw httpError$3(404, "That file is not on this listing.");
  if (!isStudioPreviewable(frame.name, frame.contentType)) {
    throw httpError$3(400, "Choose a JPEG, PNG, or WebP. RAW stays in the queue until a preview exists.");
  }
  const beforeUrl = frame.url || input.imageUrl;
  const ref = await db$k().collection("editJobs").add({
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
  const ref = db$k().collection("editJobs").doc(input.jobId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError$3(404, "Edit job not found.");
  const job = snap.data() || {};
  if (job.listingId !== input.listingId) throw httpError$3(400, "That job is for a different listing.");
  if (job.status === "approved") throw httpError$3(400, "Approved finals stay on the listing.");
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
  if (!input.bytes.length) throw httpError$3(400, "Adjusted JPEG was empty.");
  if (input.bytes.length > 45e5) throw httpError$3(413, "Adjusted JPEG is too large.");
  if (!isListingStoragePath(input.listingId, input.sourcePath)) {
    throw httpError$3(400, "sourcePath must belong to this listing.");
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
  const job = await db$k().collection("editJobs").add({
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
async function copyToFinals(listingId, sourcePath, fileName2) {
  if (!isListingStoragePath(listingId, sourcePath)) {
    throw httpError$3(400, "That file is not stored on this listing.");
  }
  if (sourcePath.includes("/finals/")) {
    const file = bucket().file(sourcePath);
    const [exists2] = await file.exists();
    if (!exists2) throw httpError$3(400, "Final file was not found in storage.");
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
  if (isRawStudioFile(fileName2, "")) {
    throw httpError$3(400, `${fileName2} is RAW. Import it for the AI queue, then approve a JPEG, PNG, or WebP final.`);
  }
  if (!isStudioPreviewable(fileName2)) {
    throw httpError$3(400, "Approve a JPEG, PNG, or WebP. RAW stays in the AI queue.");
  }
  const destPath = finalsObjectPath(listingId, fileName2);
  const source = bucket().file(sourcePath);
  const [exists] = await source.exists();
  if (!exists) throw httpError$3(400, "Source file was not found in storage.");
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
  const snap = await db$k().collection("galleries").where("listingId", "==", listingId).limit(10).get();
  snap.docs.forEach((doc) => ids.add(doc.id));
  const updated = [];
  for (const galleryId of ids) {
    const ref = db$k().collection("galleries").doc(galleryId);
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
    await db$k().collection("editJobs").doc(input.jobId).set({
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
  const jobSnap = await db$k().collection("editJobs").limit(150).get();
  const jobs = jobSnap.docs.map((doc) => jsonSafe({ id: doc.id, ...doc.data() })).filter((job) => {
    const listingId = String(job.listingId || "");
    if (input.role === "photographer") return allowed.has(listingId);
    return true;
  }).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  let listing = null;
  if (input.listingId) {
    if (input.role === "photographer" && !allowed.has(input.listingId)) {
      throw httpError$3(403, "This job is not assigned to you.");
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
      editPlan,
      delivery: await listingDelivery(loaded.id, loaded.data)
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
const db$j = () => admin.firestore();
function asMedia(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry2) => {
    if (!entry2 || typeof entry2 !== "object") return [];
    const row = entry2;
    return [{
      type: typeof row.type === "string" ? row.type : "",
      title: typeof row.title === "string" ? row.title : "",
      fileName: typeof row.fileName === "string" ? row.fileName : ""
    }];
  });
}
function filesFromListing(data) {
  const images = Array.isArray(data.images) ? data.images : [];
  const uploads = [];
  const finals = [];
  images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    if (!frame) return;
    const sourcePath = item && typeof item === "object" && typeof item.sourcePath === "string" ? item.sourcePath : "";
    const file = {
      path: frame.path,
      name: frame.name,
      raw: frame.raw,
      previewable: frame.previewable,
      sourcePath
    };
    if (frame.studioApproved || frame.studioRole === "final" || frame.path.includes("/finals/")) finals.push(file);
    if (!frame.path.includes("/finals/") && frame.studioRole !== "final") uploads.push(file);
  });
  return { uploads, finals };
}
async function galleryMediaForListing(listingId, listing, extra) {
  const media = [
    ...asMedia(extra?.mediaItems),
    ...asMedia(extra?.videoLinks),
    ...asMedia(extra?.tourLinks)
  ];
  const ids = /* @__PURE__ */ new Set();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  const snap = await db$j().collection("galleries").where("listingId", "==", listingId).limit(10).get();
  snap.docs.forEach((doc) => ids.add(doc.id));
  for (const galleryId of ids) {
    if (extra && galleryId === extra.id) continue;
    const doc = await db$j().collection("galleries").doc(galleryId).get();
    if (!doc.exists) continue;
    const data = doc.data() || {};
    media.push(...asMedia(data.mediaItems), ...asMedia(data.videoLinks), ...asMedia(data.tourLinks));
  }
  return media;
}
async function loadGalleryReleaseReport(listingId, gallery) {
  const { listing, plan } = await loadOrderEditContext(listingId);
  const files = filesFromListing(listing.data);
  const jobSnap = await db$j().collection("editJobs").where("listingId", "==", listingId).limit(200).get();
  const jobs = jobSnap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      slot: typeof data.slot === "string" ? data.slot : "",
      type: typeof data.type === "string" ? data.type : "",
      status: typeof data.status === "string" ? data.status : "",
      sourcePath: typeof data.sourcePath === "string" ? data.sourcePath : "",
      resultPath: typeof data.resultPath === "string" ? data.resultPath : "",
      fileName: typeof data.fileName === "string" ? data.fileName : ""
    };
  });
  const evidence = {
    jobs,
    finals: files.finals,
    uploads: files.uploads,
    media: await galleryMediaForListing(listingId, listing.data, gallery)
  };
  const report = assessGalleryRelease(plan, evidence);
  if (report.required === 0 && plan.photoScope === "none" && plan.twilight.length === 0 && plan.deliverables.length === 0) {
    return unlinkedGalleryRelease();
  }
  return report;
}
async function loadGalleryReleaseForGallery(galleryId) {
  const snap = await db$j().collection("galleries").doc(galleryId).get();
  if (!snap.exists) {
    throw Object.assign(new Error("Gallery not found."), { status: 404 });
  }
  const gallery = { id: snap.id, ...snap.data() || {} };
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (listingId) {
    const listingSnap = await db$j().collection("listings").doc(listingId).get();
    if (listingSnap.exists) return loadGalleryReleaseReport(listingId, gallery);
  }
  const orderId = typeof gallery.orderId === "string" ? gallery.orderId.trim() : "";
  let order = null;
  if (orderId) {
    const orderSnap = await db$j().collection("orders").doc(orderId).get();
    if (orderSnap.exists) order = orderSnap.data() || {};
  }
  const plan = planOrderEdits({
    lineItems: order?.lineItems || gallery.lineItems,
    services: order?.services || gallery.services,
    serviceIds: order?.serviceIds || gallery.serviceIds
  });
  if (plan.photoScope === "none" && plan.twilight.length === 0 && plan.deliverables.length === 0) {
    return unlinkedGalleryRelease();
  }
  return assessGalleryRelease(plan, {
    jobs: [],
    finals: [],
    uploads: [],
    media: [...asMedia(gallery.mediaItems), ...asMedia(gallery.videoLinks), ...asMedia(gallery.tourLinks)]
  });
}
const db$i = () => admin.firestore();
function httpError$2(status, message, extra) {
  return Object.assign(new Error(message), { status, ...extra });
}
function appUrl$1() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}
async function invoiceForGallery$1(gallery) {
  if (typeof gallery.invoiceId === "string" && gallery.invoiceId) {
    const doc = await db$i().collection("invoices").doc(gallery.invoiceId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
  }
  if (typeof gallery.orderId === "string" && gallery.orderId) {
    const snap = await db$i().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}
async function listingDownloadFlags$1(gallery) {
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (!listingId) return { lockDownloads: void 0, downloadsReleased: false };
  const listing = await db$i().collection("listings").doc(listingId).get();
  if (!listing.exists) return { lockDownloads: void 0, downloadsReleased: false };
  const data = listing.data() || {};
  return {
    lockDownloads: data.lockDownloads,
    downloadsReleased: data.downloadsReleased === true
  };
}
async function downloadGateForGallery$1(gallery) {
  const invoice = await invoiceForGallery$1(gallery);
  const listing = await listingDownloadFlags$1(gallery);
  return {
    invoice,
    downloadEnabled: gallery.downloadEnabled,
    downloadsReleased: gallery.downloadsReleased === true || listing.downloadsReleased,
    lockDownloads: listing.lockDownloads
  };
}
async function deliverGalleryToClient(galleryId, options) {
  const galleryDoc = await db$i().collection("galleries").doc(galleryId).get();
  if (!galleryDoc.exists) throw httpError$2(404, "Gallery not found.");
  const report = await loadGalleryReleaseForGallery(galleryId);
  if (!report.complete) {
    throw httpError$2(409, report.message, { report });
  }
  const gallery = galleryDoc.data() || {};
  const gate = await downloadGateForGallery$1(gallery);
  const downloadEnabled = clientGalleryDownloadsUnlocked(gate);
  const expiresInDays = Number(options?.expiresInDays) > 0 ? Number(options?.expiresInDays) : 30;
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1e3)
  );
  const deliveryUrl = `${appUrl$1()}/gallery/${galleryId}`;
  await galleryDoc.ref.update({
    status: "delivered",
    deliveryUrl,
    downloadEnabled,
    expiresAt,
    deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  if (gallery.orderId) {
    await db$i().collection("orders").doc(String(gallery.orderId)).update({
      status: "delivered",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  const clientId2 = typeof gallery.clientId === "string" ? gallery.clientId : "";
  const clientDoc = clientId2 ? await db$i().collection("clients").doc(clientId2).get() : null;
  const client = clientDoc?.data();
  if (client?.email) {
    const invoiceSnap = gallery.orderId ? await db$i().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get() : null;
    const invoice = invoiceSnap && !invoiceSnap.empty ? invoiceSnap.docs[0].data() : null;
    await sendEmail({
      to: client.email,
      template: "gallery_delivery",
      variables: {
        clientName: gallery.clientName,
        address: recordAddressText(gallery) || "the property",
        galleryUrl: deliveryUrl,
        invoiceAmount: invoice ? `$${invoice.total.toFixed(2)}` : "",
        paymentUrl: invoice && invoiceSnap ? `${appUrl$1()}/invoice/${invoiceSnap.docs[0].id}` : "",
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
  return { deliveryUrl, galleryStatus: "delivered" };
}
const db$h = () => admin.firestore();
function text$5(value) {
  return typeof value === "string" ? value.trim() : "";
}
function docRecord(snap) {
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() || {} };
}
async function galleriesWhere(field, id) {
  try {
    const snap = await db$h().collection("galleries").where(field, "==", id).limit(8).get();
    return snap.docs.map((doc) => docRecord(doc)).filter((doc) => Boolean(doc));
  } catch (err) {
    console.error(`[Galleries] ${field} lookup failed:`, err);
    return [];
  }
}
async function galleryById(id) {
  if (!id) return null;
  return docRecord(await db$h().collection("galleries").doc(id).get());
}
async function relatedForListing(listing) {
  const related = await galleriesWhere("listingId", listing.id);
  const extras = [text$5(listing.galleryId), text$5(listing.playtestGalleryId)];
  for (const galleryId of extras) {
    if (!galleryId || related.some((doc) => doc.id === galleryId)) continue;
    const extra = await galleryById(galleryId);
    if (extra) related.push(extra);
  }
  return related;
}
async function resolveClientGalleryLink(id) {
  const [gallerySnap, listingSnap] = await Promise.all([
    db$h().collection("galleries").doc(id).get(),
    db$h().collection("listings").doc(id).get()
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
    db$h().collection("orders").doc(id).get(),
    db$h().collection("orderRequests").doc(id).get()
  ]);
  const order = docRecord(orderSnap);
  const orderRequest = docRecord(requestSnap);
  const galleriesByOrderId = order ? await galleriesWhere("orderId", id) : [];
  const pointedGalleryId = text$5(orderRequest?.galleryId) || text$5(order?.galleryId);
  const pointedListingId = text$5(orderRequest?.listingId) || text$5(order?.listingId);
  const pointedGallery = pointedGalleryId ? await galleryById(pointedGalleryId) : null;
  let pointedListing = null;
  let pointedRelated = relatedGalleries;
  if (!pointedGallery && pointedListingId) {
    pointedListing = docRecord(await db$h().collection("listings").doc(pointedListingId).get());
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
async function invoiceForListing(listing) {
  const invoiceId = text$5(listing.invoiceId);
  if (invoiceId) {
    const doc = await db$h().collection("invoices").doc(invoiceId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() || {} };
  }
  const orderId = text$5(listing.orderId);
  if (!orderId) return null;
  try {
    const snap = await db$h().collection("invoices").where("orderId", "==", orderId).limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() || {} };
  } catch (err) {
    console.error("[Galleries] Invoice lookup failed:", err);
    return null;
  }
}
function callerCanOpenPrivateStudio(listing, caller) {
  if (!caller) return false;
  if (caller.staffRole && staffCanAccessListing(caller.staffRole, caller.uid, listing)) return true;
  return clientCanViewListing(listing, { uid: caller.uid, email: caller.email, ids: caller.ids });
}
async function readStudioCaller(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    if (isTempAdminEnabled(liveServerEnv()) && token === "temp-admin-token") {
      return {
        uid: "temp-admin-uid",
        email: "temp-admin@iconicimagestx.com",
        ids: ["temp-admin-uid"],
        staffRole: "admin"
      };
    }
    const decoded = await admin.auth().verifyIdToken(token);
    const staffSnap = await db$h().collection("staff").doc(decoded.uid).get();
    const staff = staffSnap.exists ? staffSnap.data() : null;
    const staffRole = isActiveStaffRecord(staff) ? String(staff?.role || "") : void 0;
    const identity = await resolveClientIdentity(decoded.uid, decoded.email);
    return {
      uid: decoded.uid,
      email: identity.email || decoded.email,
      ids: identity.ids,
      staffRole
    };
  } catch (err) {
    console.warn("[Galleries] Studio link session was not applied.", err);
    return null;
  }
}
async function finishGalleryLink(result, caller) {
  if (!result.ok || result.kind !== "listing") return result;
  const listing = docRecord(await db$h().collection("listings").doc(result.project.id).get());
  if (!listing || !callerCanOpenPrivateStudio(listing, caller)) return result;
  const [invoice, related] = await Promise.all([
    invoiceForListing(listing),
    relatedForListing(listing)
  ]);
  if (result.project.view !== "public") return result;
  const status = typeof invoice?.status === "string" ? invoice.status : "";
  const project = ownerStudioProject(listing, result.project, {
    invoice: status ? { status } : null,
    downloadEnabled: listing.downloadEnabled === true || related.some((doc) => doc.downloadEnabled === true),
    downloadsReleased: listing.downloadsReleased === true || related.some((doc) => doc.downloadsReleased === true)
  });
  return { ...result, project };
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
    const result = await finishGalleryLink(await resolveClientGalleryLink(id), await readStudioCaller(req));
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
const router$k = Router();
const db$g = () => admin.firestore();
const storage = () => admin.storage().bucket();
function adminReady$5(res) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET."
  });
  return false;
}
async function holdIfOrderIncomplete(res, galleryId) {
  const report = await loadGalleryReleaseForGallery(galleryId);
  if (report.complete) return false;
  res.status(409).json({
    error: report.message,
    galleryRelease: report.galleryRelease,
    complete: false,
    percent: report.percent,
    gaps: report.gaps
  });
  return true;
}
async function invoiceForGallery(gallery) {
  if (typeof gallery.invoiceId === "string" && gallery.invoiceId) {
    const doc = await db$g().collection("invoices").doc(gallery.invoiceId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
  }
  if (typeof gallery.orderId === "string" && gallery.orderId) {
    const snap = await db$g().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}
async function listingDownloadFlags(gallery) {
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (!listingId) return { lockDownloads: void 0, downloadsReleased: false };
  const listing = await db$g().collection("listings").doc(listingId).get();
  if (!listing.exists) return { lockDownloads: void 0, downloadsReleased: false };
  const data = listing.data() || {};
  return {
    lockDownloads: data.lockDownloads,
    downloadsReleased: data.downloadsReleased === true
  };
}
async function downloadGateForGallery(gallery) {
  const invoice = await invoiceForGallery(gallery);
  const listing = await listingDownloadFlags(gallery);
  return {
    invoice,
    downloadEnabled: gallery.downloadEnabled,
    downloadsReleased: gallery.downloadsReleased === true || listing.downloadsReleased,
    lockDownloads: listing.lockDownloads
  };
}
function clientGalleryPayload(id, gallery, gate) {
  const unlocked = clientGalleryDownloadsUnlocked(gate);
  const invoice = gate.invoice;
  const showMedia = ["delivered", "approved"].includes(String(gallery.status || ""));
  const media = [
    ...Array.isArray(gallery.mediaItems) ? gallery.mediaItems : [],
    ...Array.isArray(gallery.videoLinks) ? gallery.videoLinks : [],
    ...Array.isArray(gallery.tourLinks) ? gallery.tourLinks : []
  ];
  return {
    id,
    title: gallery.title,
    address: recordAddressText(gallery),
    status: gallery.status,
    deliveredAt: gallery.deliveredAt || null,
    expiresAt: gallery.expiresAt || null,
    downloadEnabled: unlocked,
    paymentRequired: !unlocked,
    invoiceId: invoice?.id || null,
    invoiceStatus: invoice?.status || null,
    lockTitle: unlocked ? null : ICONIC_DOWNLOAD_LOCK.title,
    lockMessage: unlocked ? null : ICONIC_DOWNLOAD_LOCK.message,
    mediaItems: showMedia ? media.map((item) => publicMediaItem(
      item && typeof item === "object" ? item : {},
      unlocked
    )) : []
  };
}
router$k.get("/", requireStaff, async (req, res) => {
  try {
    const { status, orderId } = req.query;
    let query = db$g().collection("galleries").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (orderId) query = query.where("orderId", "==", orderId);
    const snapshot = await query.limit(100).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch galleries." });
  }
});
const PUBLIC_GALLERY_NOT_FOUND = "We couldn't find this gallery.";
function publicGalleryNotFound(res) {
  return res.status(404).json({ error: PUBLIC_GALLERY_NOT_FOUND });
}
function malformedPublicGalleryId(id) {
  if (!id || id.length > 1500) return true;
  if (id === "." || id === "..") return true;
  if (id.includes("/") || id.includes("\\")) return true;
  if (/^__.*__$/.test(id)) return true;
  return /[\u0000-\u001F\u007F]/.test(id);
}
router$k.get("/public/:id", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (malformedPublicGalleryId(id)) {
    console.warn("[Galleries] Public gallery id rejected.");
    return publicGalleryNotFound(res);
  }
  if (!admin.apps.length) {
    console.error("[Galleries] Public gallery lookup skipped: Firebase Admin is not configured.");
    return publicGalleryNotFound(res);
  }
  try {
    const doc = await db$g().collection("galleries").doc(id).get();
    if (!doc.exists) {
      console.info("[Galleries] Public gallery not found.", id);
      return publicGalleryNotFound(res);
    }
    const gallery = doc.data();
    const gate = await downloadGateForGallery(gallery);
    return res.json(clientGalleryPayload(doc.id, gallery, gate));
  } catch (err) {
    console.error("[Galleries] Public fetch error:", err);
    const code = err.code;
    if (code === "not-found" || code === "invalid-argument" || code === 5 || code === 3) {
      return publicGalleryNotFound(res);
    }
    return res.status(500).json({ error: "We couldn't open this gallery." });
  }
});
router$k.get("/link/:id", handlePublicGalleryLink);
router$k.get("/:id", requireAuth, async (req, res) => {
  try {
    const doc = await db$g().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = doc.data();
    const staffDoc = await db$g().collection("staff").doc(req.user.uid).get();
    if (!staffDoc.exists) {
      if (gallery.clientId !== req.user.uid) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (!["delivered", "approved"].includes(gallery.status)) {
        return res.status(403).json({ error: "Gallery not yet available." });
      }
      const gate = await downloadGateForGallery(gallery);
      return res.json({
        ...clientGalleryPayload(doc.id, gallery, gate),
        clientName: gallery.clientName || null
      });
    }
    return res.json({ id: doc.id, ...gallery });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch gallery." });
  }
});
router$k.post("/:id/upload-url", requirePhotographer, async (req, res) => {
  try {
    const { fileName: fileName2, fileType, isRaw: isRaw2 = false } = req.body;
    if (!fileName2 || !fileType) {
      return res.status(400).json({ error: "fileName and fileType required." });
    }
    const galleryDoc = await db$g().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const folder = isRaw2 ? "raw" : "edited";
    const safeName = fileName2.replace(/[^a-zA-Z0-9._-]/g, "_");
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
router$k.post("/:id/media", requirePhotographer, async (req, res) => {
  try {
    const {
      storagePath,
      fileName: fileName2,
      type = "photo",
      width,
      height,
      fileSize,
      isRaw: isRaw2 = false
    } = req.body;
    if (!storagePath || !fileName2) {
      return res.status(400).json({ error: "storagePath and fileName required." });
    }
    const galleryDoc = await db$g().collection("galleries").doc(req.params.id).get();
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
      fileName: fileName2,
      type,
      width: width || null,
      height: height || null,
      fileSize: fileSize || null,
      isRaw: isRaw2,
      isEdited: !isRaw2,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.Timestamp.now()
    };
    await galleryDoc.ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(mediaItem),
      status: isRaw2 ? "raw_uploaded" : "editing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, mediaItem });
  } catch (err) {
    console.error("[Galleries] Media register error:", err);
    return res.status(500).json({ error: "Failed to register media." });
  }
});
router$k.post("/:id/media-link", requireCoordinator, async (req, res) => {
  try {
    const { url, title, type = "video", embedUrl, thumbnailUrl, downloadable = false } = req.body;
    if (!url) return res.status(400).json({ error: "url required." });
    const galleryDoc = await db$g().collection("galleries").doc(req.params.id).get();
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
router$k.get("/:id/release", requireCoordinator, async (req, res) => {
  if (!adminReady$5(res)) return;
  try {
    const report = await loadGalleryReleaseForGallery(req.params.id);
    return res.json(report);
  } catch (err) {
    const status = err.status;
    if (status === 404) return res.status(404).json({ error: "Gallery not found." });
    console.error("[Galleries] Release check error:", err);
    return res.status(500).json({ error: "Failed to check gallery release." });
  }
});
router$k.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending_upload", "raw_uploaded", "editing", "ready_for_review", "approved", "delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    if (galleryStatusNeedsReleaseGate(status)) {
      if (!adminReady$5(res)) return;
      if (await holdIfOrderIncomplete(res, req.params.id)) return;
    }
    await db$g().collection("galleries").doc(req.params.id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    const code = err.status;
    if (code === 404) return res.status(404).json({ error: "Gallery not found." });
    return res.status(500).json({ error: "Failed to update gallery status." });
  }
});
router$k.post("/:id/deliver", requireCoordinator, async (req, res) => {
  try {
    if (!adminReady$5(res)) return;
    const result = await deliverGalleryToClient(req.params.id, {
      expiresInDays: Number(req.body?.expiresInDays)
    });
    return res.json({ success: true, deliveryUrl: result.deliveryUrl });
  } catch (err) {
    const code = err.status;
    const report = err.report;
    if (code === 404) return res.status(404).json({ error: "Gallery not found." });
    if (code === 409 && report) {
      return res.status(409).json({
        error: err instanceof Error ? err.message : "Gallery stays held.",
        galleryRelease: report.galleryRelease,
        complete: false,
        percent: report.percent,
        gaps: report.gaps
      });
    }
    console.error("[Galleries] Deliver error:", err);
    return res.status(500).json({ error: "Failed to deliver gallery." });
  }
});
router$k.patch("/:id/downloads", requireCoordinator, async (req, res) => {
  if (!adminReady$5(res)) return;
  try {
    if (typeof req.body?.released !== "boolean") {
      return res.status(400).json({ error: "released must be true or false." });
    }
    const released = req.body.released === true;
    const galleryDoc = await db$g().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = galleryDoc.data() || {};
    const invoice = await invoiceForGallery(gallery);
    const listing = await listingDownloadFlags(gallery);
    const downloadEnabled = clientGalleryDownloadsUnlocked({
      invoice,
      downloadEnabled: false,
      downloadsReleased: released,
      lockDownloads: listing.lockDownloads
    });
    await galleryDoc.ref.update({
      downloadsReleased: released,
      downloadEnabled,
      downloadsReleasedAt: released ? admin.firestore.FieldValue.serverTimestamp() : null,
      downloadsReleasedBy: released ? req.user?.uid || null : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({
      success: true,
      downloadsReleased: released,
      downloadEnabled,
      lockTitle: downloadEnabled ? null : ICONIC_DOWNLOAD_LOCK.title,
      lockMessage: downloadEnabled ? null : ICONIC_DOWNLOAD_LOCK.message
    });
  } catch (err) {
    console.error("[Galleries] Download release error:", err);
    return res.status(500).json({ error: "Failed to update gallery downloads." });
  }
});
router$k.delete("/:id/media/:mediaId", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db$g().collection("galleries").doc(req.params.id).get();
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
const SQUARE_VERSION_FALLBACK = "2026-08-20";
function squareApiBaseUrl(environment) {
  return environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}
function squareConfigured(env) {
  return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
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
const router$j = Router();
const db$f = () => admin.firestore();
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
function money$1(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}
async function paymentAlreadyRecorded({
  squarePaymentId,
  stripePaymentIntentId
}) {
  if (squarePaymentId) {
    const existing = await db$f().collection("transactions").where("squarePaymentId", "==", squarePaymentId).limit(1).get();
    if (!existing.empty) return true;
  }
  if (stripePaymentIntentId) {
    const existing = await db$f().collection("transactions").where("stripePaymentIntentId", "==", stripePaymentIntentId).limit(1).get();
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
  if (galleryId) refs.set(galleryId, db$f().collection("galleries").doc(galleryId));
  const lookups = [
    db$f().collection("galleries").where("invoiceId", "==", invoiceId).get()
  ];
  if (orderId) lookups.push(db$f().collection("galleries").where("orderId", "==", orderId).get());
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
  clientId: clientId2,
  clientName: clientName2,
  amount,
  method,
  squarePaymentId,
  stripePaymentIntentId
}) {
  const invoiceRef = db$f().collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) return;
  const invoice = invoiceDoc.data();
  const resolvedOrderId = orderId || invoice.orderId || "";
  const resolvedClientId = clientId2 || invoice.clientId || "";
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
    await db$f().collection("orders").doc(resolvedOrderId).update({
      depositPaid: admin.firestore.FieldValue.increment(amount),
      balanceDue: newAmountDue,
      paymentStatus: newAmountDue <= 0 ? "paid" : "partial",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch((err) => console.error("[Payments] Order balance update failed:", err));
  }
  if (resolvedClientId) {
    await db$f().collection("clients").doc(resolvedClientId).update({
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
  await db$f().collection("transactions").add({
    type: "payment",
    orderId: resolvedOrderId,
    invoiceId,
    clientId: resolvedClientId,
    clientName: clientName2 || invoice.clientName,
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
        amount: money$1(amount),
        invoiceNumber: invoice.invoiceNumber,
        balance: money$1(newAmountDue)
      }
    }).catch(console.error);
  }
}
router$j.post("/create-intent", requireAuth, async (req, res) => {
  try {
    if (!stripeReady()) {
      return res.status(503).json({ error: "Studio Noir Stripe payments are not configured yet." });
    }
    const { invoiceId, amount, currency = "usd" } = req.body;
    if (!invoiceId || !amount) return res.status(400).json({ error: "invoiceId and amount required." });
    const invoiceDoc = await db$f().collection("invoices").doc(invoiceId).get();
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
router$j.post("/send-invoice", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });
    const invoiceDoc = await db$f().collection("invoices").doc(invoiceId).get();
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
        amount: money$1(invoice.total),
        paymentUrl,
        dueDate: bookingDateLabel(invoice.dueDate, "Upon receipt")
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
router$j.post("/send-receipt", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });
    const invoiceDoc = await db$f().collection("invoices").doc(invoiceId).get();
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
        amount: money$1(invoice.amountPaid || invoice.total),
        invoiceNumber: invoice.invoiceNumber,
        balance: money$1(amountStillDue(invoice))
      }
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("[Payments] Send receipt error:", err);
    return res.status(500).json({ error: "Failed to send receipt." });
  }
});
router$j.get("/invoice/:id", async (req, res) => {
  try {
    const invoiceDoc = await db$f().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    const provider = invoiceProvider(invoice);
    return res.json({
      id: invoiceDoc.id,
      paid: invoiceAllowsDownload(invoice),
      invoiceNumber: presentInvoiceNumber(invoice.invoiceNumber, invoiceDoc.id),
      clientName: invoice.clientName,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      processing: invoice.processing ?? null,
      fees: invoice.fees ?? null,
      travel: invoice.travel ?? null,
      promoDiscount: invoice.promoDiscount ?? null,
      promoCode: invoice.promoCode ?? null,
      billToAddress: typeof invoice.billToAddress === "string" ? invoice.billToAddress : null,
      notes: typeof invoice.notes === "string" ? invoice.notes : null,
      clientEmail: invoice.clientEmail || null,
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
router$j.post("/invoice/:id/checkout", async (req, res) => {
  try {
    const invoiceDoc = await db$f().collection("invoices").doc(req.params.id).get();
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
            description: addressText(invoice.address) || addressText(invoice.billToAddress) || (typeof invoice.clientName === "string" ? invoice.clientName : "") || void 0
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
router$j.post("/webhook", async (req, res) => {
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
    const byNote = await db$f().collection("invoices").doc(noteId).get();
    if (byNote.exists) return byNote;
  }
  const referenceId = typeof payment.reference_id === "string" ? payment.reference_id : "";
  if (referenceId) {
    const byReference = await db$f().collection("invoices").doc(referenceId).get();
    if (byReference.exists) return byReference;
  }
  if (typeof payment.order_id === "string" && payment.order_id) {
    const bySquareOrder = await db$f().collection("invoices").where("squareOrderId", "==", payment.order_id).limit(1).get();
    if (!bySquareOrder.empty) return bySquareOrder.docs[0];
  }
  const linkId = payment.payment_link_id || payment.paymentLinkId;
  if (typeof linkId === "string" && linkId) {
    const byLink = await db$f().collection("invoices").where("squarePaymentLinkId", "==", linkId).limit(1).get();
    if (!byLink.empty) return byLink.docs[0];
  }
  if (typeof payment.id === "string" && payment.id) {
    const byPayment = await db$f().collection("invoices").where("squarePaymentId", "==", payment.id).limit(1).get();
    if (!byPayment.empty) return byPayment.docs[0];
  }
  return null;
}
router$j.post("/square-webhook", async (req, res) => {
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
      await db$f().collection("agentLogs").add({
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
router$j.get("/transactions", requireCoordinator, async (req, res) => {
  try {
    const { startDate, endDate, limit = "50" } = req.query;
    let query = db$f().collection("transactions").orderBy("createdAt", "desc");
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
  const { invoiceId, orderId, clientId: clientId2, clientName: clientName2 } = intent.metadata;
  if (!invoiceId) return;
  const invoiceDoc = await db$f().collection("invoices").doc(invoiceId).get();
  if (!invoiceDoc.exists) return;
  if (invoiceProvider(invoiceDoc.data() || {}) !== "stripe") {
    console.warn(`[Payments] Ignored Stripe payment ${intent.id} for non-Stripe invoice ${invoiceId}`);
    return;
  }
  await applySuccessfulPayment({
    invoiceId,
    orderId,
    clientId: clientId2,
    clientName: clientName2,
    amount: intent.amount_received / 100,
    method: "stripe",
    stripePaymentIntentId: intent.id
  });
}
async function handleStripePaymentFailed(intent) {
  const { invoiceId } = intent.metadata;
  if (!invoiceId) return;
  await db$f().collection("agentLogs").add({
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
  const invoiceSnap = await db$f().collection("invoices").where("stripePaymentIntentId", "==", intentId).limit(1).get();
  if (invoiceSnap.empty) return;
  const invoiceDoc = invoiceSnap.docs[0];
  const refundAmount = charge.amount_refunded / 100;
  await db$f().collection("transactions").add({
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
const router$i = Router();
const db$e = () => admin.firestore();
const VSAI_API_BASE = "https://api.virtualstagingai.app/v1";
const VSAI_API_KEY = process.env.VSAI_API_KEY || process.env.VIRTUAL_STAGING_AI_API_KEY || "";
const VSAI_PRICE_CENTS = parseInt(process.env.VSAI_PRICE_CENTS || "1500", 10);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});
router$i.post("/create", requireAuth, async (req, res) => {
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
    const jobRef = await db$e().collection("vsaiJobs").add({
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
router$i.get("/result/:jobId", requireAuth, async (req, res) => {
  try {
    const jobDoc = await db$e().collection("vsaiJobs").doc(req.params.jobId).get();
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
router$i.get("/result/:jobId/file", requireAuth, async (req, res) => {
  try {
    const jobDoc = await db$e().collection("vsaiJobs").doc(req.params.jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });
    const job = jobDoc.data();
    if (job.userId !== req.user.uid) return res.status(403).json({ error: "Access denied." });
    if (job.status !== "completed" || !job.resultUrl) {
      return res.status(409).json({ error: "The staged photo is not ready yet." });
    }
    const image = await fetch(job.resultUrl);
    if (!image.ok) {
      return res.status(502).json({ error: `Could not read the staged photo (${image.status}).` });
    }
    const bytes = Buffer.from(await image.arrayBuffer());
    res.setHeader("Content-Type", image.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.send(bytes);
  } catch (err) {
    console.error("[VSAI] Result file error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$i.post("/variation", requireAuth, async (req, res) => {
  try {
    const { jobId, style: newStyle, roomType: newRoomType } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: "jobId required." });
    }
    let rootJobDoc = await db$e().collection("vsaiJobs").doc(jobId).get();
    if (!rootJobDoc.exists) return res.status(404).json({ error: "Job not found." });
    let rootJob = rootJobDoc.data();
    if (rootJob.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    while (rootJob.parentJobId) {
      const parentDoc = await db$e().collection("vsaiJobs").doc(rootJob.parentJobId).get();
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
    const variationRef = await db$e().collection("vsaiJobs").add({
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
router$i.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { jobIds, successUrl, cancelUrl } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "jobIds array required." });
    }
    const userId = req.user.uid;
    const jobDocs = await Promise.all(
      jobIds.map((id) => db$e().collection("vsaiJobs").doc(id).get())
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
router$i.post(
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
            (id) => db$e().collection("vsaiJobs").doc(id).update({
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
router$i.get("/options", (_req, res) => {
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
const router$h = Router();
const db$d = () => admin.firestore();
router$h.post("/email", requireStaff, async (req, res) => {
  try {
    const { to, subject, body, orderId, clientId: clientId2 } = req.body;
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
    await db$d().collection("messages").add({
      orderId: orderId || null,
      clientId: clientId2 || null,
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
router$h.get("/:orderId", requireAuth, async (req, res) => {
  try {
    const orderDoc = await db$d().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$d().collection("staff").doc(req.user.uid).get();
    const isStaff = staffDoc.exists;
    if (!isStaff && order.clientId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    const snapshot = await db$d().collection("messages").where("orderId", "==", req.params.orderId).orderBy("createdAt", "asc").limit(100).get();
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const unread = snapshot.docs.filter(
      (d) => !d.data().isRead && d.data().senderId !== req.user.uid
    );
    const batch = db$d().batch();
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
router$h.post("/:orderId", requireAuth, async (req, res) => {
  try {
    const { content, attachments } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content required." });
    }
    const orderDoc = await db$d().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$d().collection("staff").doc(req.user.uid).get();
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
      const clientDoc = await db$d().collection("clients").doc(order.clientId).get();
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
    const docRef = await db$d().collection("messages").add(message);
    await db$d().collection("agentLogs").add({
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
router$h.get("/unread/count", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$d().collection("messages").where("isRead", "==", false).where("senderType", "==", "client").get();
    return res.json({ unreadCount: snapshot.size });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get unread count." });
  }
});
const PHOTO_EDIT_NOTE_LIMIT = 2e3;
const PHOTO_EDIT_REQUEST_LIMIT = 100;
const PHOTO_EDIT_REPLACEMENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const STATUSES = /* @__PURE__ */ new Set(["requested", "sent_out", "received_back"]);
const REPLACEMENT_TYPES$1 = new Set(PHOTO_EDIT_REPLACEMENT_TYPES);
function text$4(value, limit) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}
function noteText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, PHOTO_EDIT_NOTE_LIMIT);
}
function stamp(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40) return "";
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}
function idText(value, limit = 80) {
  const id = text$4(value, limit);
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : "";
}
function photoIdText(value) {
  if (typeof value !== "string") return "";
  const id = value.trim().slice(0, 180);
  if (!id || /[\u0000-\u001f]/.test(id)) return "";
  return id;
}
function sortRequests(requests) {
  return [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
function timelineEntry(value) {
  const row = value && typeof value === "object" ? value : null;
  if (!row || !STATUSES.has(row.status)) return null;
  const at = stamp(row.at);
  const actorId = text$4(row.actorId, 128);
  if (!at || !actorId) return null;
  if (row.actor !== "client" && row.actor !== "staff") return null;
  return { status: row.status, at, actor: row.actor, actorId };
}
function replacementEntry(value, listingId) {
  if (!value || typeof value !== "object") return null;
  const row = value;
  const name = text$4(row.name, 180);
  const path2 = typeof row.path === "string" ? row.path.trim() : "";
  const contentType = typeof row.contentType === "string" ? row.contentType.trim().toLowerCase() : "";
  const attachedAt = stamp(row.attachedAt);
  const attachedBy = text$4(row.attachedBy, 128);
  const url = httpsUrl(row.url);
  if (!name || !attachedAt || !attachedBy || !url || !REPLACEMENT_TYPES$1.has(contentType)) return null;
  if (!replacementPath(listingId, path2)) return null;
  return {
    name,
    url,
    path: path2,
    contentType,
    attachedAt,
    attachedBy
  };
}
function httpsUrl(value) {
  if (typeof value !== "string" || value.length > 2e3) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}
function replacementPath(listingId, storagePath) {
  if (!listingId || storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false;
  const prefix = `listings/${listingId}/replacements/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}
function parseRequest(value) {
  const row = value && typeof value === "object" ? value : null;
  if (!row) return null;
  const id = idText(row.id);
  const listingId = idText(row.listingId, 128) || text$4(row.listingId, 128);
  const photoId = photoIdText(row.photoId);
  const note = noteText(row.note);
  const clientId2 = text$4(row.clientId, 128);
  const createdAt = stamp(row.createdAt);
  const updatedAt = stamp(row.updatedAt);
  if (!id || !listingId || !photoId || !note || !clientId2 || !createdAt || !updatedAt) return null;
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(listingId)) return null;
  if (!STATUSES.has(row.status)) return null;
  const timeline = Array.isArray(row.timeline) ? row.timeline.map(timelineEntry).filter((entry2) => Boolean(entry2)) : [];
  if (timeline.length === 0) return null;
  return {
    id,
    listingId,
    photoId,
    photoName: text$4(row.photoName, 180) || "Photo",
    photoUrl: httpsUrl(row.photoUrl),
    note,
    status: row.status,
    timeline,
    replacement: replacementEntry(row.replacement, listingId),
    clientId: clientId2,
    createdAt,
    updatedAt
  };
}
function readPhotoEditRequests(value) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const requests = [];
  for (const item of value) {
    const request = parseRequest(item);
    if (!request || seen.has(request.id)) continue;
    seen.add(request.id);
    requests.push(request);
  }
  return sortRequests(requests);
}
function openPhotoEditForPhoto(requests, photoId) {
  return requests.find((request) => request.photoId === photoId && request.status !== "received_back") || null;
}
function createPhotoEditRequest(input) {
  const id = idText(input.id);
  const listingId = text$4(input.listingId, 128);
  const photoId = photoIdText(input.photoId);
  const note = noteText(input.note);
  const clientId2 = text$4(input.clientId, 128);
  const at = stamp(input.at);
  if (!id) return { ok: false, status: 400, error: "Could not save that edit request." };
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(listingId)) return { ok: false, status: 400, error: "Listing id is not valid." };
  if (!photoId || !input.knownPhotoIds.includes(photoId)) {
    return { ok: false, status: 400, error: "That photo is not on this listing." };
  }
  if (!note) return { ok: false, status: 400, error: "Add a note for the change you want." };
  if (!clientId2) return { ok: false, status: 400, error: "Sign in again before requesting an edit." };
  if (!at) return { ok: false, status: 400, error: "Could not save that edit request." };
  if (input.existing.length >= PHOTO_EDIT_REQUEST_LIMIT) {
    return { ok: false, status: 409, error: "This listing already has the maximum number of photo edit requests." };
  }
  if (openPhotoEditForPhoto(input.existing, photoId)) {
    return { ok: false, status: 409, error: "This photo already has an open edit request." };
  }
  const request = {
    id,
    listingId,
    photoId,
    photoName: text$4(input.photoName, 180) || "Photo",
    photoUrl: httpsUrl(input.photoUrl),
    note,
    status: "requested",
    timeline: [{ status: "requested", at, actor: "client", actorId: clientId2 }],
    replacement: null,
    clientId: clientId2,
    createdAt: at,
    updatedAt: at
  };
  return { ok: true, request, requests: sortRequests([...input.existing, request]) };
}
function advancePhotoEditRequest(input) {
  const requestId = idText(input.requestId);
  const actorId = text$4(input.actorId, 128);
  const at = stamp(input.at);
  if (!requestId || !actorId || !at) return { ok: false, status: 400, error: "Could not update that edit request." };
  const current = input.requests.find((request2) => request2.id === requestId);
  if (!current) return { ok: false, status: 404, error: "Edit request not found." };
  if (input.to === "sent_out" && current.status !== "requested") {
    return {
      ok: false,
      status: 400,
      error: current.status === "sent_out" ? "This request is already sent out." : "This request is already received back."
    };
  }
  if (input.to === "received_back" && current.status !== "sent_out") {
    return {
      ok: false,
      status: 400,
      error: current.status === "requested" ? "Mark this request sent out before marking it received back." : "This request is already received back."
    };
  }
  const request = {
    ...current,
    status: input.to,
    updatedAt: at,
    timeline: [...current.timeline, { status: input.to, at, actor: "staff", actorId }]
  };
  return {
    ok: true,
    request,
    requests: sortRequests(input.requests.map((item) => item.id === request.id ? request : item))
  };
}
function attachPhotoEditReplacement(input) {
  const requestId = idText(input.requestId);
  const current = input.requests.find((request2) => request2.id === requestId);
  if (!current) return { ok: false, status: 404, error: "Edit request not found." };
  if (current.listingId !== input.listingId) return { ok: false, status: 404, error: "Edit request not found." };
  const replacement = replacementEntry(input.replacement, input.listingId);
  if (!replacement) return { ok: false, status: 400, error: "Attach a JPG, PNG, or WebP file." };
  const request = {
    ...current,
    replacement,
    updatedAt: replacement.attachedAt
  };
  return {
    ok: true,
    request,
    requests: sortRequests(input.requests.map((item) => item.id === request.id ? request : item))
  };
}
const PORTAL_ADDRESS_LIMITS = {
  line1: 240,
  line2: 240,
  city: 120,
  state: 50,
  zip: 20
};
const PORTAL_FACT_TEXT_LIMIT = 1e3;
const EMPTY = "Not on file yet";
const FACT_DEFS = [
  { id: "beds", label: "Beds", keys: ["bedrooms", "beds"] },
  { id: "baths", label: "Baths", keys: ["bathrooms", "baths"] },
  { id: "sqft", label: "Sqft", keys: ["squareFeet", "squareFootage", "sqft"] },
  { id: "yearBuilt", label: "Year built", keys: ["yearBuilt"] },
  { id: "pool", label: "Pool", keys: ["pool", "hasPool"] },
  { id: "lotSize", label: "Lot size", keys: ["lotSize"] },
  { id: "stories", label: "Stories", keys: ["stories", "levels"] },
  { id: "neighborhood", label: "Neighborhood", keys: ["neighborhood", "subdivision"] },
  { id: "schools", label: "Schools", keys: ["schools", "schoolDistrict"] },
  { id: "amenities", label: "Amenities", keys: ["amenities"] },
  { id: "flexSpaces", label: "Flex spaces", keys: ["flexSpaces", "flexSpace"] },
  { id: "office", label: "Office", keys: ["office", "hasOffice"] }
];
const PORTAL_MARKETING_KIT = [
  {
    id: "flyer",
    title: "Flyer",
    status: "not_connected",
    note: "Design tools are not connected yet. A flyer for this listing will be chosen here."
  },
  {
    id: "social",
    title: "Social post",
    status: "not_connected",
    note: "Design tools are not connected yet. Social posts for this listing will be chosen here."
  },
  {
    id: "reel",
    title: "Reel / short",
    status: "not_connected",
    note: "Design tools are not connected yet. Reels and shorts for this listing will be chosen here."
  }
];
const WEBSITE_FONTS = /* @__PURE__ */ new Set(["sans", "serif", "modern"]);
const WEBSITE_COLORS = /* @__PURE__ */ new Set(["ink", "teal", "warm"]);
const WEBSITE_STYLES = /* @__PURE__ */ new Set(["classic", "editorial", "minimal"]);
const PORTAL_LISTING_ID = /^[A-Za-z0-9_-]{4,128}$/;
function portalListingId(value) {
  const id = text$3(value);
  return PORTAL_LISTING_ID.test(id) ? id : "";
}
function isInvoiceOrPaymentActivity(event) {
  if (/^(invoice|payment)$/i.test(event.kind)) return true;
  return /\binvoice\b|\bpayment\b|\bamount due\b/i.test(event.summary);
}
function visitorPortalListingDetail(detail) {
  return {
    ...detail,
    photos: detail.photos.filter((item) => !item.hidden),
    videos: detail.videos.filter((item) => !item.hidden),
    tours: detail.tours.filter((item) => !item.hidden),
    floorplans: detail.floorplans.filter((item) => !item.hidden),
    invoices: [],
    activity: detail.activity.filter((event) => !isInvoiceOrPaymentActivity(event)),
    photoEditRequests: []
  };
}
function defaultPortalWebsite() {
  return {
    font: "sans",
    color: "ink",
    style: "classic",
    showPhotos: true,
    showVideo: true,
    showTours: true,
    showFloorplans: true
  };
}
function hiddenPresentationKeys(listing) {
  const keys = /* @__PURE__ */ new Set();
  const photos = readMediaStore(listing?.portalMedia).photos;
  for (const [id, prefs] of Object.entries(photos)) {
    if (prefs.hidden && id) keys.add(id);
  }
  return keys;
}
function rowHiddenFromPresentation(row, hiddenKeys) {
  if (row.hiddenFromPresentation === true || row.portalHidden === true) return true;
  const id = text$3(row.id);
  const path2 = text$3(row.path) || text$3(row.storagePath);
  const url = text$3(row.url) || text$3(row.shareUrl);
  return [id, path2, url].some((key) => Boolean(key) && hiddenKeys.has(key));
}
function buildPortalListingDetail(sources) {
  const listing = sources.listing || {};
  const id = text$3(listing.id);
  const records = [listing, sources.order, sources.orderRequest].filter(Boolean);
  const address = readAddress(records);
  const store = readMediaStore(listing.portalMedia);
  const galleries = sources.galleries || [];
  const photos = collectPhotos(listing, galleries, store);
  const videos = collectVideos(listing, galleries, store);
  const tours = collectTours(listing, galleries, store);
  const floorplans = collectFloorplans(listing, galleries, store);
  const website = readWebsite(listing.portalWebsite);
  const invoices = readInvoices(sources.invoices || []);
  const activity = buildActivity(sources, photos, videos, floorplans, tours, invoices);
  const status = text$3(listing.status) || text$3(sources.order?.status) || text$3(sources.orderRequest?.status) || "open";
  return applyStoredPortalData({
    id,
    title: address.formatted || "Listing",
    status,
    address,
    facts: FACT_DEFS.map((fact) => {
      const value = factText(readFact(records, fact.keys));
      return { id: fact.id, label: fact.label, value: value || EMPTY, empty: !value };
    }),
    photos,
    videos,
    tours,
    floorplans,
    marketing: PORTAL_MARKETING_KIT,
    website,
    invoices,
    activity,
    photoEditRequests: readPhotoEditRequests(listing.photoEditRequests)
  }, listing.portalData);
}
function portalFactsDraftFromDetail(detail) {
  const facts = {};
  for (const fact of FACT_DEFS) {
    const shown = detail.facts.find((item) => item.id === fact.id);
    facts[fact.id] = shown && !shown.empty ? shown.value : "";
  }
  return {
    address: {
      line1: detail.address.line1,
      line2: detail.address.line2,
      city: detail.address.city,
      state: detail.address.state,
      zip: detail.address.zip
    },
    facts
  };
}
function sanitizePortalListingFacts(value) {
  const row = asRecord$2(value);
  if (!row) return null;
  const addressRow = asRecord$2(row.address);
  const factsRow = asRecord$2(row.facts);
  if (!addressRow || !factsRow) return null;
  const facts = {};
  for (const fact of FACT_DEFS) {
    facts[fact.id] = Object.prototype.hasOwnProperty.call(factsRow, fact.id) ? clipText(factsRow[fact.id], PORTAL_FACT_TEXT_LIMIT) : "";
  }
  return { address: normalizeAddressLines(addressRow), facts };
}
function portalListingFactsWrite(detail, body, nowIso) {
  const next = sanitizePortalListingFacts(body);
  const current = sanitizePortalListingFacts(portalFactsDraftFromDetail(detail));
  if (!next || !current) return { ok: false, error: "Say which listing facts to save." };
  if (JSON.stringify(next) === JSON.stringify(current)) return { ok: true, changed: false };
  return {
    ok: true,
    changed: true,
    portalData: next,
    activity: {
      id: `portal-data-${nowIso}`,
      at: nowIso,
      kind: "data",
      summary: "Listing facts updated"
    }
  };
}
function applyStoredPortalData(detail, stored) {
  const saved = readStoredPortalData(stored);
  if (!saved) return detail;
  const address = saved.address ? {
    ...detail.address,
    ...saved.address,
    formatted: formatPortalAddress(saved.address)
  } : detail.address;
  const facts = detail.facts.map((fact) => {
    if (!Object.prototype.hasOwnProperty.call(saved.facts, fact.id)) return fact;
    const value = saved.facts[fact.id];
    return { ...fact, value: value || EMPTY, empty: !value };
  });
  return {
    ...detail,
    title: address.formatted || "Listing",
    address,
    facts
  };
}
function readStoredPortalData(value) {
  const row = asRecord$2(value);
  if (!row) return null;
  const addressRow = asRecord$2(row.address);
  const factsRow = asRecord$2(row.facts);
  if (!addressRow && !factsRow) return null;
  const facts = {};
  if (factsRow) {
    for (const fact of FACT_DEFS) {
      if (!Object.prototype.hasOwnProperty.call(factsRow, fact.id)) continue;
      facts[fact.id] = clipText(factsRow[fact.id], PORTAL_FACT_TEXT_LIMIT);
    }
  }
  return {
    address: addressRow ? normalizeAddressLines(addressRow) : null,
    facts
  };
}
function normalizeAddressLines(row) {
  return {
    line1: clipText(row.line1, PORTAL_ADDRESS_LIMITS.line1),
    line2: clipText(row.line2, PORTAL_ADDRESS_LIMITS.line2),
    city: clipText(row.city, PORTAL_ADDRESS_LIMITS.city),
    state: clipText(row.state, PORTAL_ADDRESS_LIMITS.state),
    zip: clipText(row.zip, PORTAL_ADDRESS_LIMITS.zip)
  };
}
function clipText(value, max) {
  let raw = "";
  if (typeof value === "string") raw = value;
  else if (typeof value === "number" && Number.isFinite(value)) raw = String(value);
  else if (typeof value === "boolean") raw = value ? "Yes" : "No";
  else return "";
  return raw.replace(/\u0000/g, "").trim().slice(0, max);
}
function applyPortalMediaChange(store, items, change, nowIso) {
  const bucket2 = items.filter((item) => item.kind === change.kind).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const index = bucket2.findIndex((item) => item.id === change.id);
  if (index < 0) return { ok: false, error: "That file is not on this listing." };
  const next = bucket2.map((item) => ({ ...item }));
  const current = next[index];
  let summary = "";
  if ("hidden" in change && current.hidden !== change.hidden) {
    current.hidden = change.hidden;
    summary = change.hidden ? `Hid ${mediaLabel(current)} from the presentation` : `Restored ${mediaLabel(current)} to the presentation`;
  }
  if ("move" in change) {
    const swapWith = change.move === "earlier" ? index - 1 : index + 1;
    if (swapWith >= 0 && swapWith < next.length) {
      const other = next[swapWith];
      next[swapWith] = current;
      next[index] = other;
      summary = summary || `Moved ${mediaLabel(current)} ${change.move === "earlier" ? "earlier" : "later"}`;
    }
  }
  if (!summary) return { ok: true, store, activity: null };
  const prefs = {};
  next.forEach((item, order) => {
    prefs[item.id] = { hidden: item.hidden, order };
  });
  const activity = {
    id: `portal-${change.kind}-${change.id}-${nowIso}`,
    at: nowIso,
    kind: change.kind,
    summary
  };
  return {
    ok: true,
    store: { ...store, [storeKey(change.kind)]: prefs },
    activity
  };
}
function sanitizeWebsiteSettings(value, base = defaultPortalWebsite()) {
  const row = value && typeof value === "object" ? value : {};
  const font = text$3(row.font);
  const color = text$3(row.color);
  const style = text$3(row.style);
  return {
    font: WEBSITE_FONTS.has(font) ? font : base.font,
    color: WEBSITE_COLORS.has(color) ? color : base.color,
    style: WEBSITE_STYLES.has(style) ? style : base.style,
    showPhotos: boolOr(row.showPhotos, base.showPhotos),
    showVideo: boolOr(row.showVideo, base.showVideo),
    showTours: boolOr(row.showTours, base.showTours),
    showFloorplans: boolOr(row.showFloorplans, base.showFloorplans)
  };
}
function readMediaStore(value) {
  const row = value && typeof value === "object" ? value : {};
  return {
    photos: readPrefs(row.photos),
    videos: readPrefs(row.videos),
    floorplans: readPrefs(row.floorplans),
    tours: readPrefs(row.tours)
  };
}
function storeKey(kind) {
  if (kind === "photo") return "photos";
  if (kind === "video") return "videos";
  if (kind === "floorplan") return "floorplans";
  return "tours";
}
function readPrefs(value) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [id, prefs] of Object.entries(value)) {
    if (!id || !prefs || typeof prefs !== "object") continue;
    const row = prefs;
    out[id] = {
      hidden: row.hidden === true,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0
    };
  }
  return out;
}
function readWebsite(value) {
  return sanitizeWebsiteSettings(value, defaultPortalWebsite());
}
function text$3(value) {
  return typeof value === "string" ? value.trim() : "";
}
function boolOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function asRecord$2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function readFact(records, keys) {
  for (const record of records) {
    const bags = [record, asRecord$2(record.property), asRecord$2(record.propertyDetails), asRecord$2(record.listingInfo), asRecord$2(record.details)];
    for (const bag of bags) {
      if (!bag) continue;
      for (const key of keys) {
        const value = bag[key];
        if (value == null || value === "") continue;
        return value;
      }
    }
  }
  return void 0;
}
function factText(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map((item) => factText(item)).filter(Boolean);
    return parts.join(", ");
  }
  return "";
}
function formatPortalAddress(address) {
  return [address.line1, address.line2, [address.city, [address.state, address.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
}
function readAddress(records) {
  const address = {
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
    formatted: "",
    lat: null,
    lng: null,
    mapUrl: null
  };
  for (const record of records) {
    fillAddress(address, addressFromRecord(record));
  }
  address.formatted = formatPortalAddress(address);
  const geo = address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null;
  address.mapUrl = geo ? mapEmbedUrl(geo.lat, geo.lng) : null;
  return address;
}
function fillAddress(target, source) {
  if (!target.line1 && source.line1) target.line1 = source.line1;
  if (!target.line2 && source.line2) target.line2 = source.line2;
  if (!target.city && source.city) target.city = source.city;
  if (!target.state && source.state) target.state = source.state;
  if (!target.zip && source.zip) target.zip = source.zip;
  if (target.lat == null && source.lat != null) target.lat = source.lat;
  if (target.lng == null && source.lng != null) target.lng = source.lng;
}
function addressFromRecord(record) {
  const structured = asRecord$2(record.address) || asRecord$2(record.shootLocation) || asRecord$2(record.propertyAddress);
  const parsed = parseAddressText(
    text$3(record.addressLine1) ? "" : addressString(record.address) || addressString(record.propertyAddress) || addressString(record.shootLocation) || text$3(structured?.formatted)
  );
  const line1 = firstText(record, ["addressLine1", "line1", "street", "streetAddress"]) || text$3(structured?.street) || text$3(structured?.line1) || text$3(structured?.addressLine1) || parsed.line1;
  const line2 = firstText(record, ["addressLine2", "line2", "unit", "street2"]) || text$3(structured?.line2) || text$3(structured?.unit) || parsed.line2;
  const split = splitUnit(line1);
  return {
    line1: split.line1,
    line2: line2 || split.line2,
    city: firstText(record, ["city"]) || text$3(structured?.city) || parsed.city,
    state: firstText(record, ["state"]) || text$3(structured?.state) || parsed.state,
    zip: firstText(record, ["zip", "postalCode"]) || text$3(structured?.zip) || text$3(structured?.postalCode) || parsed.zip,
    formatted: "",
    lat: readCoord(record.lat ?? record.latitude ?? structured?.lat ?? structured?.latitude ?? nestedCoord(record, "lat"), "lat"),
    lng: readCoord(record.lng ?? record.longitude ?? structured?.lng ?? structured?.longitude ?? nestedCoord(record, "lng"), "lng"),
    mapUrl: null
  };
}
function addressString(value) {
  return addressText(value);
}
function firstText(record, keys) {
  for (const key of keys) {
    const value = text$3(record[key]);
    if (value) return value;
  }
  return "";
}
function parseAddressText(raw) {
  const empty = { line1: "", line2: "", city: "", state: "", zip: "" };
  if (!raw) return empty;
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean).filter((part) => !/^(usa|u\.s\.a\.|united states)$/i.test(part));
  if (parts.length === 0) return empty;
  const last = parts[parts.length - 1];
  const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!stateZip || parts.length < 2) return { ...empty, line1: raw.replace(/,\s*(usa|united states)$/i, "").trim() };
  const city = parts[parts.length - 2];
  const street = parts.slice(0, -2);
  let line1 = street[0] || "";
  let line2 = "";
  if (street.length >= 2 && isUnit(street[1])) {
    line2 = street[1];
  } else if (street.length > 1) {
    line1 = street.join(", ");
  }
  return { line1, line2, city, state: stateZip[1].toUpperCase(), zip: stateZip[2] };
}
function isUnit(value) {
  return /^(apt|apartment|unit|suite|ste|bldg|building|floor|#)\b/i.test(value);
}
function splitUnit(line1) {
  const match = line1.match(/^(.*?)(?:,\s*|\s+)((?:apt|apartment|unit|suite|ste|bldg|building|floor|#)\s*\S.*)$/i);
  if (!match) return { line1, line2: "" };
  return { line1: match[1].trim(), line2: match[2].trim() };
}
function nestedCoord(record, axis) {
  const geo = asRecord$2(record.geo) || asRecord$2(record.location) || asRecord$2(record.geometry);
  if (!geo) return void 0;
  const location = asRecord$2(geo.location) || geo;
  if (axis === "lat") return location.lat ?? location.latitude;
  return location.lng ?? location.longitude;
}
function readCoord(value, axis) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  if (axis === "lat" && (number < -90 || number > 90)) return null;
  if (axis === "lng" && (number < -180 || number > 180)) return null;
  return number;
}
function mapEmbedUrl(lat, lng) {
  const delta = 8e-3;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].map((n) => n.toFixed(6)).join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}
function collectPhotos(listing, galleries, store) {
  return finishMedia("photo", [...rowsFrom(listing.images), ...galleryRows(galleries)], store.photos, (row) => isPhoto(row));
}
function collectVideos(listing, galleries, store) {
  return finishMedia("video", [...rowsFrom(listing.videos), ...rowsFrom(listing.images), ...galleryRows(galleries)], store.videos, (row) => isVideo(row));
}
function collectFloorplans(listing, galleries, store) {
  const rows = [
    ...rowsFrom(listing.floorplans).filter(isRasterFloorplan),
    ...rowsFrom(listing.designAssets).filter(isFloorplan),
    ...rowsFrom(listing.cubiCasaImports).filter(isFloorplan),
    ...galleryRows(galleries).filter(isFloorplan)
  ];
  return finishMedia("floorplan", rows, store.floorplans, () => true);
}
function collectTours(listing, galleries, store) {
  const rows = [];
  for (const key of ["tourUrl", "matterportUrl", "virtualTourUrl", "virtualTour", "threeDTourUrl", "tourLink"]) {
    const url = safeHttpUrl(listing[key]);
    if (url) rows.push({ id: key, url, name: key });
  }
  for (const item of rowsFrom(listing.tours)) rows.push(item);
  for (const item of galleryRows(galleries)) rows.push(item);
  const seen = /* @__PURE__ */ new Set();
  const drafts = [];
  rows.forEach((row, index) => {
    const url = safeHttpUrl(row.url) || safeHttpUrl(row.shareUrl) || safeHttpUrl(row.href);
    if (!url || seen.has(url)) return;
    const provider = providerFor(url, row);
    const typed = /^(tour|matterport)$/i.test(text$3(row.type)) || provider != null || isTourField(text$3(row.id));
    if (!typed) return;
    seen.add(url);
    const id = mediaId("tour", row, index);
    const prefs = store.tours[id];
    drafts.push({
      id,
      kind: "tour",
      name: text$3(row.name) || text$3(row.title) || provider || "Virtual tour",
      url,
      contentType: text$3(row.contentType),
      hidden: prefs?.hidden === true || row.hiddenFromPresentation === true,
      order: prefs?.order ?? index,
      uploadedAt: portalTimestamp(row.uploadedAt || row.createdAt),
      provider: provider || "Virtual tour",
      embedUrl: provider === "Matterport" ? url : null
    });
  });
  return drafts.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
function isTourField(id) {
  return /tour|matterport/i.test(id);
}
function finishMedia(kind, rows, prefs, include) {
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  rows.forEach((row, index) => {
    if (!include(row)) return;
    const url = safeHttpUrl(row.url) || safeHttpUrl(row.shareUrl);
    if (!url) return;
    const id = mediaId(kind, row, index);
    const key = text$3(row.path) || text$3(row.storagePath) || url;
    if (seen.has(id) || seen.has(key) || seen.has(url)) return;
    seen.add(id);
    seen.add(key);
    seen.add(url);
    const pref = prefs[id];
    items.push({
      id,
      kind,
      name: text$3(row.name) || text$3(row.fileName) || text$3(row.title) || `${kind} ${items.length + 1}`,
      url,
      contentType: text$3(row.contentType).toLowerCase(),
      hidden: pref?.hidden === true || row.hiddenFromPresentation === true || row.portalHidden === true,
      order: pref?.order ?? index,
      uploadedAt: portalTimestamp(row.uploadedAt || row.createdAt)
    });
  });
  return items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
function rowsFrom(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object");
}
function galleryRows(galleries) {
  const rows = [];
  for (const gallery of galleries) {
    rows.push(...rowsFrom(gallery.mediaItems), ...rowsFrom(gallery.images));
  }
  return rows;
}
function mediaId(kind, row, index) {
  const raw = text$3(row.id) || text$3(row.path) || text$3(row.storagePath) || text$3(row.url) || text$3(row.shareUrl) || `${kind}-${index}`;
  return raw.slice(0, 180);
}
const RAW_EXT$1 = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic)$/i;
const IMAGE_EXT$1 = /\.(jpe?g|png|webp|gif)$/i;
const FLOOR_IMAGE = /\.(jpe?g|png)$/i;
const VIDEO_EXT = /\.(mp4|mov)$/i;
function fileName(row) {
  return text$3(row.name) || text$3(row.fileName) || text$3(row.title) || text$3(row.path) || text$3(row.url);
}
function isRaw(row) {
  const path2 = text$3(row.path) || text$3(row.storagePath);
  const name = fileName(row);
  return RAW_EXT$1.test(name) || RAW_EXT$1.test(path2) || path2.includes("/raw/");
}
function isFloorplan(row) {
  if (!isRasterFloorplan(row)) return false;
  const type = text$3(row.type).toLowerCase();
  const asset = text$3(row.assetType).toLowerCase();
  const name = fileName(row);
  return type === "floorplan" || asset === "floorplan" || /floor\s*plan|floorplan/i.test(name) || type === "image" && asset === "floorplan";
}
function isRasterFloorplan(row) {
  const content = text$3(row.contentType).toLowerCase();
  const declared = text$3(row.type).toLowerCase();
  const name = fileName(row);
  const url = text$3(row.url) || text$3(row.shareUrl);
  if (content === "image/jpeg" || content === "image/png" || declared === "image/jpeg" || declared === "image/png") return true;
  return FLOOR_IMAGE.test(name) || FLOOR_IMAGE.test(url.split("?")[0]);
}
function isVideo(row) {
  const type = text$3(row.type).toLowerCase();
  if (type === "tour" || type === "matterport" || type === "floorplan") return false;
  const content = text$3(row.contentType).toLowerCase();
  const name = fileName(row);
  const url = (text$3(row.url) || text$3(row.shareUrl)).split("?")[0];
  if (content === "video/mp4" || content === "video/quicktime") return true;
  return VIDEO_EXT.test(name) || VIDEO_EXT.test(url);
}
function isPhoto(row) {
  const declared = text$3(row.type).toLowerCase();
  const asset = text$3(row.assetType).toLowerCase();
  if (isVideo(row) || declared === "floorplan" || asset === "floorplan" || isRaw(row)) return false;
  const type = text$3(row.type).toLowerCase();
  if (type === "tour" || type === "matterport" || type === "video" || type === "reel" || type === "file" || type === "document") return false;
  const content = text$3(row.contentType).toLowerCase();
  const name = fileName(row);
  const path2 = text$3(row.path) || text$3(row.storagePath);
  if (content.startsWith("video/")) return false;
  if (content && !content.startsWith("image/") && !IMAGE_EXT$1.test(name)) return false;
  return !content || content.startsWith("image/") || IMAGE_EXT$1.test(name) || IMAGE_EXT$1.test(path2);
}
function providerFor(url, row) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("matterport.com") || /matterport/i.test(text$3(row.type)) || /matterport/i.test(text$3(row.name))) return "Matterport";
  if (host.includes("cloudpano.com")) return "CloudPano";
  if (host.includes("iguide")) return "iGUIDE";
  if (host.includes("kuula.co")) return "Kuula";
  if (host.includes("eyespy360.com")) return "EyeSpy360";
  if (host.includes("asteroom.com")) return "Asteroom";
  if (host.includes("zillow.com") && /3d|tour/i.test(url)) return "Zillow 3D";
  if (/^(tour|matterport)$/i.test(text$3(row.type))) return "Virtual tour";
  return null;
}
function safeHttpUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/")) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}
function readInvoices(invoices) {
  const seen = /* @__PURE__ */ new Set();
  const summaries = [];
  for (const invoice of invoices) {
    const id = text$3(invoice.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const total = money(invoice.total);
    summaries.push({
      id,
      invoiceNumber: text$3(invoice.invoiceNumber) || id,
      status: text$3(invoice.status) || "draft",
      total,
      amountDue: invoice.amountDue == null ? total : money(invoice.amountDue)
    });
  }
  return summaries;
}
function money(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}
function buildActivity(sources, photos, videos, floorplans, tours, invoices) {
  const events = [];
  const push = (event) => {
    if (!event || !event.summary) return;
    if (events.some((item) => item.id === event.id)) return;
    events.push(event);
  };
  const request = sources.orderRequest;
  if (request) {
    push(eventOf(
      `booking-${text$3(request.id) || "request"}`,
      request.submittedAt || request.createdAt,
      "booking",
      "Booking request received"
    ));
  }
  for (const appointment of sources.appointments || []) {
    const when = appointment.createdAt || appointment.scheduledDate;
    const status = text$3(appointment.status);
    push(eventOf(
      `appointment-${text$3(appointment.id) || events.length}`,
      when,
      "appointment",
      status === "confirmed" ? "Appointment confirmed" : "Appointment requested"
    ));
  }
  const order = sources.order;
  if (order) {
    push(eventOf(
      `order-${text$3(order.id) || "order"}`,
      order.confirmedAt || order.createdAt,
      "booking",
      "Booking confirmed"
    ));
  }
  push(eventOf(
    `listing-${text$3(sources.listing.id) || "listing"}`,
    sources.listing.createdAt,
    "listing",
    "Listing file created"
  ));
  for (const photo of photos) {
    push(eventOf(`upload-photo-${photo.id}`, photo.uploadedAt, "photo", `Photo uploaded: ${photo.name}`));
  }
  for (const video of videos) {
    push(eventOf(`upload-video-${video.id}`, video.uploadedAt, "video", `Video uploaded: ${video.name}`));
  }
  for (const plan of floorplans) {
    push(eventOf(`upload-floorplan-${plan.id}`, plan.uploadedAt, "floorplan", `Floorplan uploaded: ${plan.name}`));
  }
  for (const tour of tours) {
    push(eventOf(`tour-${tour.id}`, tour.uploadedAt, "tour", `${tour.provider} tour added`));
  }
  for (const gallery of sources.galleries || []) {
    const status = text$3(gallery.status).replace(/_/g, " ") || "opened";
    push(eventOf(
      `gallery-${text$3(gallery.id) || events.length}`,
      gallery.updatedAt || gallery.createdAt,
      "gallery",
      `Gallery ${status}`
    ));
  }
  for (const invoice of sources.invoices || []) {
    const id = text$3(invoice.id);
    const number = text$3(invoice.invoiceNumber) || invoices.find((item) => item.id === id)?.invoiceNumber || "Invoice";
    const status = text$3(invoice.status) || "draft";
    const summary = status === "paid" ? `Payment recorded on ${number}` : `Invoice ${number} is ${status.replace(/_/g, " ")}`;
    push(eventOf(`invoice-${id || number}`, invoice.paidAt || invoice.updatedAt || invoice.createdAt, "invoice", summary));
  }
  for (const entry2 of rowsFrom(sources.listing.auditLog)) {
    const action = text$3(entry2.action);
    if (!action || /lockbox|internal|password|secret/i.test(action)) continue;
    push(eventOf(
      `audit-${text$3(entry2.id) || action}-${text$3(entry2.at)}`,
      entry2.at || entry2.createdAt,
      "audit",
      action
    ));
  }
  for (const entry2 of rowsFrom(sources.listing.portalActivity)) {
    push({
      id: text$3(entry2.id) || `portal-activity-${events.length}`,
      at: portalTimestamp(entry2.at),
      kind: text$3(entry2.kind) || "listing",
      summary: text$3(entry2.summary)
    });
  }
  return events.filter((event) => event.summary).sort((a, b) => {
    if (a.at && b.at) return a.at.localeCompare(b.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return 0;
  });
}
function eventOf(id, when, kind, summary) {
  const at = portalTimestamp(when);
  if (!summary) return null;
  return { id, at, kind, summary };
}
function portalTimestamp(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "object") {
    const record = value;
    if (typeof record.toDate === "function") {
      try {
        const date = record.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
      } catch {
        return "";
      }
    }
    const seconds = typeof record.seconds === "number" ? record.seconds : typeof record._seconds === "number" ? record._seconds : null;
    if (seconds != null) {
      const date = new Date(seconds * 1e3);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
  }
  return "";
}
function mediaLabel(item) {
  return item.name || item.kind;
}
const BUCKET$1 = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "iconic-images-aicon.firebasestorage.app";
const REPLACEMENT_LIMIT = 4e6;
const REPLACEMENT_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
class PhotoEditRequestError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const db$c = () => admin.firestore();
async function writeRequests(listingId, change) {
  const ref = db$c().collection("listings").doc(listingId);
  let saved = null;
  await db$c().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PhotoEditRequestError(404, "Listing not found.");
    const result = change(readPhotoEditRequests(snap.data()?.photoEditRequests));
    if (result.ok === false) throw new PhotoEditRequestError(result.status, result.error);
    tx.update(ref, {
      photoEditRequests: result.requests,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    saved = result.request;
  });
  if (!saved) throw new PhotoEditRequestError(500, "Could not save the photo edit request.");
  return saved;
}
async function filePhotoEditRequest(input) {
  return writeRequests(input.listingId, (existing) => createPhotoEditRequest({
    id: randomUUID(),
    listingId: input.listingId,
    photoId: input.photoId,
    photoName: input.photoName,
    photoUrl: input.photoUrl,
    note: input.note,
    clientId: input.clientId,
    at: input.at,
    knownPhotoIds: input.knownPhotoIds,
    existing
  }));
}
async function markPhotoEditRequest(input) {
  return writeRequests(input.listingId, (requests) => advancePhotoEditRequest({
    requests,
    requestId: input.requestId,
    to: input.to,
    actorId: input.actorId,
    at: input.at
  }));
}
function decodeReplacementBytes(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!trimmed || trimmed.length > 8e6 || !/^[A-Za-z0-9+/=]+$/.test(trimmed)) return null;
  const bytes = Buffer.from(trimmed, "base64");
  return bytes.length ? bytes : null;
}
async function savePhotoEditReplacement(input) {
  const contentType = input.contentType.trim().toLowerCase();
  if (!REPLACEMENT_TYPES.has(contentType)) {
    throw new PhotoEditRequestError(415, "Attach a JPG, PNG, or WebP file.");
  }
  if (!input.bytes.length) throw new PhotoEditRequestError(400, "The replacement file was empty.");
  if (input.bytes.length > REPLACEMENT_LIMIT) {
    throw new PhotoEditRequestError(413, "That replacement is over 4 MB.");
  }
  if (!admin.apps.length) {
    throw new PhotoEditRequestError(503, "File storage is not configured.");
  }
  const existing = await db$c().collection("listings").doc(input.listingId).get();
  if (!existing.exists) throw new PhotoEditRequestError(404, "Listing not found.");
  const known = readPhotoEditRequests(existing.data()?.photoEditRequests);
  if (!known.some((request) => request.id === input.requestId)) {
    throw new PhotoEditRequestError(404, "Edit request not found.");
  }
  const name = safeStorageFileName(input.fileName);
  const storagePath = `listings/${input.listingId}/replacements/${Date.now()}_${name}`;
  if (!replacementPath(input.listingId, storagePath)) {
    throw new PhotoEditRequestError(400, "Could not store that replacement.");
  }
  const token = randomUUID();
  const bucket2 = admin.storage().bucket(BUCKET$1);
  await bucket2.file(storagePath).save(input.bytes, {
    resumable: false,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
  const url = firebaseDownloadUrl(bucket2.name, storagePath, token);
  return writeRequests(input.listingId, (requests) => attachPhotoEditReplacement({
    requests,
    requestId: input.requestId,
    listingId: input.listingId,
    replacement: {
      name,
      url,
      path: storagePath,
      contentType,
      attachedAt: input.at,
      attachedBy: input.actorId
    }
  }));
}
const db$b = () => admin.firestore();
const KINDS = /* @__PURE__ */ new Set(["photo", "video", "floorplan", "tour"]);
function adminReady$4(res) {
  if (admin.apps.length) return true;
  res.status(503).json({ error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT." });
  return false;
}
function listingIdFrom(value) {
  return portalListingId(value);
}
function text$2(value) {
  return typeof value === "string" ? value.trim() : "";
}
function sendKnownError$3(res, err, fallback) {
  const status = err instanceof PhotoEditRequestError ? err.status : err.status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Portal listing]", err);
  return res.status(500).json({ error: fallback });
}
async function readDoc(collectionName, id) {
  if (!id) return null;
  try {
    const snap = await db$b().collection(collectionName).doc(id).get();
    if (!snap.exists) return null;
    return jsonSafe({ id: snap.id, ...snap.data() || {} });
  } catch (err) {
    console.error(`[Portal listing] ${collectionName}/${id} read failed:`, err);
    return null;
  }
}
async function readWhere(collectionName, field, value) {
  if (!value) return [];
  try {
    const snap = await db$b().collection(collectionName).where(field, "==", value).limit(10).get();
    return snap.docs.map((doc) => jsonSafe({ id: doc.id, ...doc.data() || {} }));
  } catch (err) {
    console.error(`[Portal listing] ${collectionName}.${field} lookup failed:`, err);
    return [];
  }
}
function unique(records) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const record of records) {
    if (!record) continue;
    const id = text$2(record.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(record);
  }
  return out;
}
async function loadSources(listingId, listing) {
  const requestId = text$2(listing.orderRequestId);
  const requests = unique([
    await readDoc("orderRequests", requestId),
    ...await readWhere("orderRequests", "listingId", listingId)
  ]);
  const orderRequest = requests.find((record) => record.id === requestId) || requests[0] || null;
  const orderId = text$2(listing.orderId) || text$2(orderRequest?.convertedToOrderId) || text$2(orderRequest?.orderId);
  const orders = unique([
    await readDoc("orders", orderId),
    ...await readWhere("orders", "listingId", listingId)
  ]);
  const order = orders.find((record) => record.id === orderId) || orders[0] || null;
  const invoiceIds = [text$2(listing.invoiceId), text$2(order?.invoiceId), text$2(orderRequest?.invoiceId)].filter(Boolean);
  const galleryId = text$2(listing.galleryId) || text$2(orderRequest?.galleryId) || text$2(order?.galleryId);
  const [invoiceDocs, invoicesByListing, invoicesByOrder, invoicesByRequest, galleryDoc, galleriesByListing, galleriesByOrder, appointmentsByRequest, appointmentsByOrder, appointmentsByListing] = await Promise.all([
    Promise.all(invoiceIds.map((id) => readDoc("invoices", id))),
    readWhere("invoices", "listingId", listingId),
    readWhere("invoices", "orderId", text$2(order?.id)),
    readWhere("invoices", "orderRequestId", text$2(orderRequest?.id)),
    readDoc("galleries", galleryId),
    readWhere("galleries", "listingId", listingId),
    readWhere("galleries", "orderId", text$2(order?.id)),
    readWhere("appointments", "orderRequestId", text$2(orderRequest?.id)),
    readWhere("appointments", "orderId", text$2(order?.id)),
    readWhere("appointments", "listingId", listingId)
  ]);
  return {
    listing,
    orderRequest,
    order,
    invoices: unique([...invoiceDocs, ...invoicesByListing, ...invoicesByOrder, ...invoicesByRequest]),
    galleries: unique([galleryDoc, ...galleriesByListing, ...galleriesByOrder]),
    appointments: unique([...appointmentsByRequest, ...appointmentsByOrder, ...appointmentsByListing])
  };
}
async function authorizedListing(req, listingId) {
  const snap = await db$b().collection("listings").doc(listingId).get();
  if (!snap.exists) {
    throw Object.assign(new Error("Listing not found."), { status: 404 });
  }
  const listing = jsonSafe({ id: snap.id, ...snap.data() || {} });
  const identity = await resolveClientIdentity(req.user.uid, req.user.email);
  if (!clientCanViewListing(listing, { uid: req.user.uid, email: identity.email, ids: identity.ids })) {
    throw Object.assign(new Error("You do not have access to this listing."), { status: 403 });
  }
  return listing;
}
function mediaChange(body) {
  const row = body && typeof body === "object" ? body : {};
  const kind = text$2(row.kind);
  const id = text$2(row.id);
  if (!KINDS.has(kind) || !id) return null;
  if (typeof row.hidden === "boolean") return { kind, id, hidden: row.hidden };
  if (row.move === "earlier" || row.move === "later") return { kind, id, move: row.move };
  return null;
}
async function appendPortalWrite(listingId, patch) {
  const ref = db$b().collection("listings").doc(listingId);
  await db$b().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const existing = Array.isArray(data.portalActivity) ? data.portalActivity : [];
    const activity = [...existing, patch.activity].slice(-200);
    const update = {
      portalActivity: activity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (patch.portalMedia) update.portalMedia = patch.portalMedia;
    if (patch.portalWebsite) update.portalWebsite = patch.portalWebsite;
    if (patch.portalData) update.portalData = patch.portalData;
    tx.update(ref, update);
  });
}
const handleGetPublicPortalListing = async (req, res) => {
  const listingId = portalListingId(req.params.id);
  if (!listingId) return res.status(404).json({ error: "Listing not found." });
  if (!adminReady$4(res)) return;
  try {
    const snap = await db$b().collection("listings").doc(listingId).get();
    if (!snap.exists) return res.status(404).json({ error: "Listing not found." });
    const listing = jsonSafe({ id: snap.id, ...snap.data() || {} });
    const detail = visitorPortalListingDetail(buildPortalListingDetail(await loadSources(listingId, listing)));
    return res.json(detail);
  } catch (err) {
    return sendKnownError$3(res, err, "Failed to load this listing.");
  }
};
const handleGetPortalListing = async (req, res) => {
  if (!adminReady$4(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  try {
    const listing = await authorizedListing(req, listingId);
    const detail = buildPortalListingDetail(await loadSources(listingId, listing));
    return res.json(detail);
  } catch (err) {
    return sendKnownError$3(res, err, "Failed to load this listing.");
  }
};
const handlePatchPortalMedia = async (req, res) => {
  if (!adminReady$4(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  const change = mediaChange(req.body);
  if (!change) return res.status(400).json({ error: "Say which file to hide, show, or move." });
  try {
    const listing = await authorizedListing(req, listingId);
    const sources = await loadSources(listingId, listing);
    const detail = buildPortalListingDetail(sources);
    const items = [...detail.photos, ...detail.videos, ...detail.floorplans, ...detail.tours];
    const result = applyPortalMediaChange(readMediaStore(listing.portalMedia), items, change, (/* @__PURE__ */ new Date()).toISOString());
    if (result.ok === false) return res.status(400).json({ error: result.error });
    if (result.activity) {
      await appendPortalWrite(listingId, { portalMedia: result.store, activity: result.activity });
    }
    const refreshed = await authorizedListing(req, listingId);
    return res.json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError$3(res, err, "Could not update that file.");
  }
};
const handlePatchPortalData = async (req, res) => {
  if (!adminReady$4(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  try {
    const listing = await authorizedListing(req, listingId);
    const detail = buildPortalListingDetail(await loadSources(listingId, listing));
    const write = portalListingFactsWrite(detail, req.body, (/* @__PURE__ */ new Date()).toISOString());
    if (write.ok === false) return res.status(400).json({ error: write.error });
    if (write.changed) {
      await appendPortalWrite(listingId, { portalData: write.portalData, activity: write.activity });
    }
    const refreshed = await authorizedListing(req, listingId);
    return res.json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError$3(res, err, "Could not save listing facts.");
  }
};
const handleCreatePhotoEditRequest = async (req, res) => {
  if (!adminReady$4(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const photoId = text$2(body.photoId);
  const note = typeof body.note === "string" ? body.note : "";
  if (!photoId) return res.status(400).json({ error: "Choose one photo." });
  try {
    const listing = await authorizedListing(req, listingId);
    const detail = buildPortalListingDetail(await loadSources(listingId, listing));
    const photo = detail.photos.find((item) => item.id === photoId);
    if (!photo) return res.status(400).json({ error: "That photo is not on this listing." });
    await filePhotoEditRequest({
      listingId,
      photoId,
      photoName: photo.name,
      photoUrl: photo.url,
      note,
      clientId: req.user.uid,
      knownPhotoIds: detail.photos.map((item) => item.id),
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
    const refreshed = await authorizedListing(req, listingId);
    return res.status(201).json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError$3(res, err, "Could not save that edit request.");
  }
};
const handlePatchPortalWebsite = async (req, res) => {
  if (!adminReady$4(res)) return;
  const listingId = listingIdFrom(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Listing id is not valid." });
  try {
    const listing = await authorizedListing(req, listingId);
    const current = sanitizeWebsiteSettings(listing.portalWebsite);
    const next = sanitizeWebsiteSettings(req.body, current);
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    if (changed) {
      await appendPortalWrite(listingId, {
        portalWebsite: next,
        activity: {
          id: `portal-website-${(/* @__PURE__ */ new Date()).toISOString()}`,
          at: (/* @__PURE__ */ new Date()).toISOString(),
          kind: "website",
          summary: "Listing site style updated"
        }
      });
    }
    const refreshed = await authorizedListing(req, listingId);
    return res.json(buildPortalListingDetail(await loadSources(listingId, refreshed)));
  } catch (err) {
    return sendKnownError$3(res, err, "Could not save the listing site.");
  }
};
const router$g = Router();
const db$a = () => admin.firestore();
const HOME_LIMIT = 100;
function asRecord$1(value) {
  return value && typeof value === "object" ? value : {};
}
router$g.get("/", requireStaff, async (req, res) => {
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
function adminReady$3(res) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT."
  });
  return false;
}
router$g.post("/register", async (req, res) => {
  if (!adminReady$3(res)) return;
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
      const email2 = normalizeEmail$1(decoded.email || req.body?.email);
      if (!email2) return res.status(400).json({ error: "A valid email is required." });
      const result = await upsertPortalClient({ uid: decoded.uid, email: email2, firstName, lastName, phone });
      return res.status(201).json(result);
    }
    const email = normalizeEmail$1(req.body?.email);
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
router$g.get("/me/home", requireAuth, async (req, res) => {
  if (!adminReady$3(res)) return;
  try {
    const identity = await resolveClientIdentity(req.user.uid, req.user.email);
    if (!identity.profile) {
      return res.status(404).json({ error: "Client profile not found." });
    }
    try {
      await ensurePortalListingsForClient({ ids: identity.ids, email: identity.email });
    } catch (err) {
      console.error("[Clients] Listing ensure failed:", err);
    }
    const galleries = [];
    const invoices = [];
    const projects = [];
    const appointmentDocs = [];
    let listingsTruncated = false;
    let invoicesTruncated = false;
    let appointmentsTruncated = false;
    const seenGallery = /* @__PURE__ */ new Set();
    const seenInvoice = /* @__PURE__ */ new Set();
    const seenProject = /* @__PURE__ */ new Set();
    const seenAppointment = /* @__PURE__ */ new Set();
    const pushAppointment = (entry2) => {
      if (seenAppointment.has(entry2.id)) return;
      seenAppointment.add(entry2.id);
      appointmentDocs.push(entry2);
    };
    const pushInvoice = (entry2) => {
      if (seenInvoice.has(entry2.id)) return;
      seenInvoice.add(entry2.id);
      invoices.push(buildClientInvoice(entry2.id, asRecord$1(jsonSafe(entry2.data()))));
    };
    const pushListing = (entry2) => {
      if (seenProject.has(entry2.id)) return;
      seenProject.add(entry2.id);
      projects.push(buildClientListing(entry2.id, asRecord$1(jsonSafe(entry2.data()))));
    };
    for (const clientId2 of identity.ids) {
      const [gallerySnap, invoiceSnap, projectSnap] = await Promise.all([
        db$a().collection("galleries").where("clientId", "==", clientId2).limit(HOME_LIMIT).get(),
        db$a().collection("invoices").where("clientId", "==", clientId2).limit(HOME_LIMIT).get(),
        db$a().collection("listings").where("clientId", "==", clientId2).limit(HOME_LIMIT).get()
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
      if (invoiceSnap.size >= HOME_LIMIT) invoicesTruncated = true;
      invoiceSnap.docs.forEach(pushInvoice);
      if (projectSnap.size >= HOME_LIMIT) listingsTruncated = true;
      projectSnap.docs.forEach(pushListing);
      try {
        const appointmentSnap = await db$a().collection("appointments").where("clientId", "==", clientId2).limit(HOME_LIMIT).get();
        if (appointmentSnap.size >= HOME_LIMIT) appointmentsTruncated = true;
        appointmentSnap.docs.forEach(pushAppointment);
      } catch (appointmentErr) {
        console.error("[Clients] Appointment lookup failed:", appointmentErr);
      }
    }
    const orders = [];
    const seenOrder = /* @__PURE__ */ new Set();
    const pushOrder = (entry2) => {
      if (seenOrder.has(entry2.id)) return;
      const data = entry2.data();
      if (!visibleToPortalClient(
        { clientId: data.clientId, email: data.email, clientEmail: data.clientEmail },
        { ids: identity.ids, email: identity.email }
      )) return;
      seenOrder.add(entry2.id);
      const listingId = typeof data.listingId === "string" ? data.listingId : "";
      orders.push({
        id: entry2.id,
        address: addressText(data.address || data.shootLocation) || "Order",
        status: data.status || "new",
        href: listingId ? `/studio/${listingId}` : ""
      });
    };
    try {
      for (const clientId2 of identity.ids) {
        const snap = await db$a().collection("orderRequests").where("clientId", "==", clientId2).limit(HOME_LIMIT).get();
        snap.docs.forEach(pushOrder);
      }
      if (identity.email) {
        const [byEmail, byClientEmail] = await Promise.all([
          db$a().collection("orderRequests").where("email", "==", identity.email).limit(HOME_LIMIT).get(),
          db$a().collection("orderRequests").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get()
        ]);
        byEmail.docs.forEach(pushOrder);
        byClientEmail.docs.forEach(pushOrder);
      }
    } catch (orderErr) {
      console.error("[Clients] Order lookup failed:", orderErr);
    }
    if (identity.email) {
      try {
        const byInvoiceEmail = await db$a().collection("invoices").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get();
        if (byInvoiceEmail.size >= HOME_LIMIT) invoicesTruncated = true;
        byInvoiceEmail.docs.forEach(pushInvoice);
      } catch (invoiceErr) {
        console.error("[Clients] Invoice email lookup failed:", invoiceErr);
      }
    }
    if (identity.email) {
      try {
        const appointmentsByEmail = await db$a().collection("appointments").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get();
        if (appointmentsByEmail.size >= HOME_LIMIT) appointmentsTruncated = true;
        appointmentsByEmail.docs.forEach(pushAppointment);
      } catch (appointmentErr) {
        console.error("[Clients] Appointment email lookup failed:", appointmentErr);
      }
      const byEmail = await db$a().collection("listings").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get();
      if (byEmail.size >= HOME_LIMIT) listingsTruncated = true;
      byEmail.docs.forEach(pushListing);
    }
    const requestIds = appointmentDocs.map((entry2) => entry2.data().orderRequestId).filter((id) => typeof id === "string" && id.trim().length > 0);
    const orderRequests = await orderRequestsById(requestIds);
    const appointments = appointmentDocs.map((entry2) => {
      const data = asRecord$1(jsonSafe(entry2.data()));
      const orderRequestId = typeof data.orderRequestId === "string" ? data.orderRequestId : "";
      return buildClientAppointment(entry2.id, data, orderRequests.get(orderRequestId) || null);
    });
    const listings = sortNewestFirst(projects);
    const invoiceRows = sortNewestFirst(invoices);
    return res.json({
      profile: jsonSafe(identity.profile),
      appointments,
      orders,
      galleries,
      invoices: invoiceRows,
      listings,
      projects: listings,
      listingsTruncated,
      invoicesTruncated,
      appointmentsTruncated
    });
  } catch (err) {
    console.error("[Clients] Home error:", err);
    return res.status(500).json({ error: "Failed to load your portal." });
  }
});
router$g.get("/me/listings/:id", requireAuth, handleGetPortalListing);
router$g.patch("/me/listings/:id/data", requireAuth, handlePatchPortalData);
router$g.patch("/me/listings/:id/media", requireAuth, handlePatchPortalMedia);
router$g.patch("/me/listings/:id/website", requireAuth, handlePatchPortalWebsite);
router$g.post("/me/listings/:id/photo-edit-requests", requireAuth, handleCreatePhotoEditRequest);
router$g.get("/me", requireAuth, async (req, res) => {
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
router$g.get("/:id", requireStaff, async (req, res) => {
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
router$g.post("/", requireCoordinator, async (req, res) => {
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
router$g.patch("/:id", requireCoordinator, async (req, res) => {
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
async function orderRequestsById(ids) {
  const unique2 = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, HOME_LIMIT);
  const map = /* @__PURE__ */ new Map();
  if (unique2.length === 0) return map;
  try {
    const snaps = await db$a().getAll(...unique2.map((id) => db$a().collection("orderRequests").doc(id)));
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      map.set(snap.id, asRecord$1(jsonSafe(snap.data() || {})));
    });
  } catch (err) {
    console.error("[Clients] Order request schedule lookup failed:", err);
  }
  return map;
}
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
function readSetupSecret(headerValue2) {
  if (typeof headerValue2 === "string") return headerValue2.trim();
  if (Array.isArray(headerValue2) && typeof headerValue2[0] === "string") return headerValue2[0].trim();
  return "";
}
const db$9 = () => admin.firestore();
function httpError$1(status, error) {
  return Object.assign(new Error(error), { status });
}
async function bootstrapPlaytest(input) {
  const photographerInput = input.photographer || {};
  const email = normalizeEmail$1(photographerInput.email);
  const password = String(photographerInput.password || "");
  const firstName = String(photographerInput.firstName || "Playtest").trim().slice(0, 80);
  const lastName = String(photographerInput.lastName || "Photographer").trim().slice(0, 80);
  const role = photographerInput.role || "photographer";
  const seedListing = input.seedListing !== false;
  const seedGallery = input.seedGallery !== false;
  const clientEmail2 = normalizeEmail$1(input.clientEmail);
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
  let clientStatus = clientEmail2 ? "not_found" : "skipped";
  if (clientEmail2) {
    const matches = await db$9().collection("clients").where("email", "==", clientEmail2).limit(5).get();
    const preferred = matches.docs.find((doc) => doc.data().firebaseUid === doc.id) || matches.docs[0];
    if (preferred) {
      client = {
        id: preferred.id,
        email: clientEmail2,
        name: `${preferred.data().firstName || ""} ${preferred.data().lastName || ""}`.trim() || clientEmail2
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
    client: client ? { ...client, status: clientStatus } : { status: clientStatus, email: clientEmail2 || null },
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
const router$f = Router();
const db$8 = () => admin.firestore();
router$f.get("/", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$8().collection("staff").where("isActive", "==", true).orderBy("firstName").get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch staff." });
  }
});
router$f.post("/", requireAdmin, async (req, res) => {
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
router$f.patch("/:id", requireAdmin, async (req, res) => {
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
router$f.post("/playtest", async (req, res) => {
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
router$f.post("/setup", async (req, res) => {
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
function uploadQueueKickDecision(input) {
  return { kick: false };
}
function studioQueueTickRequest(env, listingId) {
  const secret = typeof env.CRON_SECRET === "string" ? env.CRON_SECRET.trim() : "";
  const base = String(env.APP_URL || env.URL || "").trim().replace(/\/$/, "");
  const id = listingId.trim();
  if (!secret || !base || !id) return null;
  return {
    url: `${base}/api/studio/order-queue/tick`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ listingId: id, chain: true })
    }
  };
}
function kickStudioQueue(listingId, env = process.env) {
  const request = studioQueueTickRequest(env, listingId);
  if (!request) return { dispatched: false };
  void fetch(request.url, request.init).catch((err) => {
    console.error("[Studio queue] Follow-up tick failed:", err instanceof Error ? err.message : err);
  });
  return { dispatched: true };
}
const router$e = Router();
const db$7 = () => admin.firestore();
const DIRECT_UPLOAD_LIMIT = 3e6;
function adminReady$2(res) {
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
  const snap = await db$7().collection("listings").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}
async function assertListingAccess(req, listingId) {
  const listing = await loadListing(listingId);
  if (!listing) {
    const error = Object.assign(new Error("Listing not found."), { status: 404 });
    throw error;
  }
  const staffDoc = await db$7().collection("staff").doc(req.user.uid).get();
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
async function noteOrderEditQueue(listingId, uploadedBy) {
  try {
    return await enqueueOrderEditsFromUpload({ listingId, createdBy: uploadedBy });
  } catch (err) {
    console.error("[Studio] Upload saved, but order edits were not queued.", err);
    return null;
  }
}
function followUploadWithQueue(listingId, autoQueue) {
  const decision = uploadQueueKickDecision({
    pendingWithSourcePhoto: autoQueue?.pending ?? 0
  });
  if (decision.kick) kickStudioQueue(listingId);
}
function sendKnownError$2(res, err, fallback) {
  const status = err.status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Listings]", err);
  return res.status(500).json({ error: fallback });
}
router$e.get("/assigned", requirePhotographer, async (req, res) => {
  if (!adminReady$2(res)) return;
  try {
    const uid = req.user.uid;
    const role = req.staffRole || "";
    let docs = [];
    if (role === "admin" || role === "coordinator") {
      const snap = await db$7().collection("listings").limit(100).get();
      docs = snap.docs;
    } else {
      const [byUid, byIds] = await Promise.all([
        db$7().collection("listings").where("photographerUid", "==", uid).limit(50).get(),
        db$7().collection("listings").where("photographerIds", "array-contains", uid).limit(50).get()
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
router$e.get("/:id", requireAuth, async (req, res) => {
  if (!adminReady$2(res)) return;
  try {
    const listing = await assertListingAccess(req, req.params.id);
    const staffDoc = await db$7().collection("staff").doc(req.user.uid).get();
    const payload = serializeDoc(listing.id, listing);
    if (!staffDoc.exists) {
      delete payload.notes;
      delete payload.internalNotes;
    }
    return res.json(payload);
  } catch (err) {
    return sendKnownError$2(res, err, "Failed to load listing.");
  }
});
router$e.post("/:id/photos/upload-url", requirePhotographer, async (req, res) => {
  if (!adminReady$2(res)) return;
  try {
    const fileName2 = safeStorageFileName(req.body?.fileName);
    if (!fileName2) ;
    await assertListingAccess(req, req.params.id);
    const folder = folderFrom(req.body?.folder);
    const ticket = await createListingUploadUrl(
      req.params.id,
      fileName2,
      contentTypeForUpload(fileName2, req.body?.contentType),
      folder
    );
    return res.json(ticket);
  } catch (err) {
    return sendKnownError$2(res, err, "Failed to prepare the upload. Check FIREBASE_STORAGE_BUCKET.");
  }
});
router$e.post("/:id/photos", requirePhotographer, async (req, res) => {
  if (!adminReady$2(res)) return;
  try {
    const listingId = req.params.id;
    await assertListingAccess(req, listingId);
    const fileName2 = safeStorageFileName(req.body?.fileName || "upload");
    const folder = folderFrom(req.body?.folder);
    if (typeof req.body?.dataBase64 === "string" && req.body.dataBase64) {
      const bytes = Buffer.from(req.body.dataBase64, "base64");
      if (!bytes.length) return res.status(400).json({ error: "Upload body was empty." });
      if (bytes.length > DIRECT_UPLOAD_LIMIT) {
        return res.status(413).json({ error: "File is too large for a direct API upload. Use the signed upload URL." });
      }
      const saved = await saveListingBytes(listingId, fileName2, req.body?.contentType, folder, bytes);
      const registered2 = await registerListingPhoto({
        listingId,
        storagePath: saved.storagePath,
        fileName: fileName2,
        contentType: saved.contentType,
        uploadedBy: req.user.uid,
        existingUrl: saved.url
      });
      await noteRawUpload(listingId, registered2.image, req.user.uid);
      const autoQueue2 = await noteOrderEditQueue(listingId, req.user.uid);
      followUploadWithQueue(listingId, autoQueue2);
      return res.status(201).json({ success: true, ...registered2, autoQueue: autoQueue2 });
    }
    const storagePath = req.body?.storagePath;
    if (!isListingStoragePath(listingId, storagePath)) {
      return res.status(400).json({ error: "storagePath must be a photos or raw path for this listing." });
    }
    const registered = await registerListingPhoto({
      listingId,
      storagePath,
      fileName: fileName2,
      contentType: req.body?.contentType,
      uploadedBy: req.user.uid
    });
    await noteRawUpload(listingId, registered.image, req.user.uid);
    const autoQueue = await noteOrderEditQueue(listingId, req.user.uid);
    followUploadWithQueue(listingId, autoQueue);
    return res.status(201).json({ success: true, ...registered, autoQueue });
  } catch (err) {
    return sendKnownError$2(res, err, "Failed to save the uploaded photo.");
  }
});
const router$d = Router();
const db$6 = () => admin.firestore();
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
router$d.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$6().collection("campaigns").orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch campaigns." });
  }
});
router$d.get("/mailchimp/status", requireCoordinator, async (_req, res) => {
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
      lists: (listsData.lists || []).map((list2) => ({
        id: list2.id,
        name: list2.name,
        memberCount: list2.stats?.member_count || 0,
        unsubscribeCount: list2.stats?.unsubscribe_count || 0
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
router$d.post("/mailchimp/sync", requireCoordinator, async (req, res) => {
  try {
    const { listId, audience = "all" } = req.body;
    if (!listId) return res.status(400).json({ error: "listId required." });
    let recipientQuery = db$6().collection("clients").where("status", "==", "active");
    if (audience === "vip") {
      recipientQuery = db$6().collection("clients").where("status", "==", "vip");
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
    await db$6().collection("agentLogs").add({
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
router$d.post("/", requireCoordinator, async (req, res) => {
  try {
    const { name, type, subject, body, audience, audienceIds, scheduledAt } = req.body;
    if (!name || !body || !audience) {
      return res.status(400).json({ error: "name, body, and audience required." });
    }
    const ref = await db$6().collection("campaigns").add({
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
router$d.post("/:id/send", requireCoordinator, async (req, res) => {
  try {
    const campaignDoc = await db$6().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });
    const campaign = campaignDoc.data();
    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Campaign already sent." });
    }
    if (!clientNotifyLive()) {
      console.warn(`[Campaigns] Suppressed send for ${req.params.id} — ${clientNotifyBlockReason()}.`);
      return res.status(503).json({ error: "Client notifications are off.", suppressed: true });
    }
    let recipientQuery = db$6().collection("clients").where("status", "==", "active");
    if (campaign.audience === "vip") {
      recipientQuery = db$6().collection("clients").where("status", "==", "vip");
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
    await db$6().collection("campaigns").doc(req.params.id).update({ status: "draft" }).catch(() => {
    });
    return res.status(500).json({ error: "Failed to send campaign." });
  }
});
function marketingPermissionsForRole(role) {
  if (role === "admin") return ["view", "manage", "send"];
  return [];
}
function hasMarketingPermission(role, permission) {
  return marketingPermissionsForRole(role).includes(permission);
}
const EMAIL_RE$1 = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}
function isValidEmail(value) {
  return EMAIL_RE$1.test(normalizeEmail(value));
}
function normalizePersonName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
function contactName(contact) {
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  return name || contact.email;
}
function normalizeTag(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
}
function uniqueTags(tags) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const tag of tags) {
    const clean = normalizeTag(tag);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}
function splitTags(value) {
  return uniqueTags(String(value || "").split(/[,;|]/));
}
function applyTagChange(contact, add, remove, now) {
  const removeKeys = new Set(remove.map((tag) => normalizeTag(tag).toLowerCase()).filter(Boolean));
  const next = contact.tags.filter((tag) => !removeKeys.has(tag.toLowerCase()));
  return { ...contact, tags: uniqueTags([...next, ...add]), updatedAt: now };
}
function contactMatchesFilter(contact, filter) {
  const query = filter.query.trim().toLowerCase();
  if (query) {
    const haystack = [
      contact.email,
      contact.firstName,
      contact.lastName,
      contact.company,
      contact.phone,
      contact.tags.join(" "),
      ...Object.values(contact.custom)
    ].join(" ").toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  const have = new Set(contact.tags.map((tag) => tag.toLowerCase()));
  if (filter.tagsAll.some((tag) => !have.has(tag.toLowerCase()))) return false;
  if (filter.tagsAny.length && !filter.tagsAny.some((tag) => have.has(tag.toLowerCase()))) return false;
  if (filter.tagsNone.some((tag) => have.has(tag.toLowerCase()))) return false;
  if (filter.source && contact.source !== filter.source) return false;
  if (filter.verified === "yes" && !contact.emailVerified) return false;
  if (filter.verified === "no" && contact.emailVerified) return false;
  for (const field of filter.fields) {
    const key = field.key.trim().toLowerCase();
    if (!key) continue;
    const actual = Object.entries(contact.custom).find(([name]) => name.toLowerCase() === key)?.[1] || "";
    if (actual.trim().toLowerCase() !== field.value.trim().toLowerCase()) return false;
  }
  return true;
}
function blankContact(email, source, now) {
  return {
    email: normalizeEmail(email),
    firstName: "",
    lastName: "",
    company: "",
    phone: "",
    tags: [],
    custom: {},
    source,
    clientId: "",
    emailVerified: source === "client",
    createdAt: now,
    updatedAt: now
  };
}
function prefer(current, incoming) {
  return incoming.trim() || current;
}
function syncClientsIntoContacts(contacts, clients, now) {
  const byEmail = new Map(contacts.map((contact) => [contact.email, { ...contact, tags: [...contact.tags], custom: { ...contact.custom } }]));
  let created = 0;
  let relinked = 0;
  let refreshed = 0;
  for (const client of clients) {
    const email = normalizeEmail(client.email);
    if (!isValidEmail(email)) continue;
    const previous = [...byEmail.values()].find((contact) => contact.clientId === client.id);
    let target = byEmail.get(email);
    if (previous && previous.email !== email) {
      relinked += 1;
      if (!target) {
        target = { ...previous, email, updatedAt: now };
        byEmail.set(email, target);
      } else {
        target = {
          ...target,
          tags: uniqueTags([...target.tags, ...previous.tags]),
          custom: { ...previous.custom, ...target.custom },
          updatedAt: now
        };
        byEmail.set(email, target);
      }
      if (previous.email !== email) byEmail.delete(previous.email);
    }
    if (!target) {
      target = blankContact(email, "client", now);
      created += 1;
      byEmail.set(email, target);
    } else {
      refreshed += 1;
    }
    target.clientId = client.id;
    target.firstName = prefer(target.firstName, client.firstName);
    target.lastName = prefer(target.lastName, client.lastName);
    target.phone = prefer(target.phone, client.phone);
    target.company = prefer(target.company, client.company);
    target.emailVerified = true;
    target.updatedAt = now;
    if (!target.source) target.source = "client";
  }
  return {
    contacts: [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email)),
    created,
    relinked,
    refreshed
  };
}
const HEADER_HINTS = [
  { field: "email", hints: ["email", "e-mail", "email address", "e mail"] },
  { field: "firstName", hints: ["first name", "firstname", "first", "given name"] },
  { field: "lastName", hints: ["last name", "lastname", "last", "surname"] },
  { field: "company", hints: ["company", "brokerage", "organization", "organisation", "office"] },
  { field: "phone", hints: ["phone", "mobile", "cell", "telephone"] },
  { field: "tags", hints: ["tags", "tag", "labels", "label"] }
];
function parseCsv(text2) {
  const input = text2.replace(/^\uFEFF/, "");
  const matrix = [];
  let row = [];
  let cell2 = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell2 += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell2 += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell2.trim());
      cell2 = "";
    } else if (char === "\n") {
      row.push(cell2.trim());
      matrix.push(row);
      row = [];
      cell2 = "";
    } else if (char !== "\r") {
      cell2 += char;
    }
  }
  if (cell2.length || row.length) {
    row.push(cell2.trim());
    matrix.push(row);
  }
  const filled = matrix.filter((line) => line.some((value) => value.length > 0));
  const width = filled.reduce((max, line) => Math.max(max, line.length), 0);
  const headers = (filled[0] || []).concat(Array(Math.max(0, width - (filled[0]?.length || 0))).fill("")).map((header, index) => header || `Column ${index + 1}`);
  const rows = filled.slice(1).map((line) => {
    const next = line.slice(0, headers.length);
    while (next.length < headers.length) next.push("");
    return next;
  });
  return { headers, rows };
}
function suggestMapping(headers) {
  const mapping = {};
  const used = /* @__PURE__ */ new Set();
  for (const header of headers) {
    const key = header.trim().toLowerCase();
    const match = HEADER_HINTS.find((hint) => hint.hints.includes(key) && !used.has(hint.field));
    if (match) {
      mapping[header] = match.field;
      used.add(match.field);
    } else {
      mapping[header] = "ignore";
    }
  }
  return mapping;
}
function mapTable(table, mapping) {
  return table.rows.map((row, index) => {
    const mapped = {
      row: index + 2,
      email: "",
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      tags: [],
      custom: {}
    };
    table.headers.forEach((header, column) => {
      const field = mapping[header] || "ignore";
      const value = row[column] || "";
      if (field === "ignore" || !value.trim()) return;
      if (field === "tags") mapped.tags = splitTags(value);
      else if (field === "custom") mapped.custom[header] = value.trim();
      else if (field === "email") mapped.email = normalizeEmail(value);
      else mapped[field] = value.trim();
    });
    return mapped;
  });
}
function buildImportPlan(input) {
  const existing = new Map(input.existing.map((contact) => [contact.email, contact]));
  const planned = /* @__PURE__ */ new Map();
  const invalid = [];
  const seenInFile = /* @__PURE__ */ new Set();
  let duplicatesInFile = 0;
  let created = 0;
  let updated = 0;
  const extra = uniqueTags(input.extraTags || []);
  for (const row of input.rows) {
    if (!row.email) {
      invalid.push({ row: row.row, email: "", reason: "Missing email" });
      continue;
    }
    if (!isValidEmail(row.email)) {
      invalid.push({ row: row.row, email: row.email, reason: "Invalid email" });
      continue;
    }
    if (seenInFile.has(row.email)) duplicatesInFile += 1;
    seenInFile.add(row.email);
    const prior = planned.get(row.email) || existing.get(row.email);
    if (!prior) {
      const contact = blankContact(row.email, "import", input.now);
      contact.firstName = row.firstName;
      contact.lastName = row.lastName;
      contact.company = row.company;
      contact.phone = row.phone;
      contact.tags = uniqueTags([...row.tags, ...extra]);
      contact.custom = { ...row.custom };
      contact.emailVerified = false;
      planned.set(row.email, contact);
      created += 1;
      continue;
    }
    const next = {
      ...prior,
      custom: { ...prior.custom },
      tags: uniqueTags([...prior.tags, ...row.tags, ...extra]),
      firstName: row.firstName || prior.firstName,
      lastName: row.lastName || prior.lastName,
      company: row.company || prior.company,
      phone: row.phone || prior.phone,
      updatedAt: input.now
    };
    for (const [key, value] of Object.entries(row.custom)) next.custom[key] = value;
    if (!planned.has(row.email) && existing.has(row.email)) updated += 1;
    planned.set(row.email, next);
  }
  return {
    summary: {
      totalRows: input.rows.length,
      invalid,
      duplicatesInFile,
      created,
      updated
    },
    upserts: [...planned.values()]
  };
}
function entry(now, draft) {
  const names = draft.names || [];
  const aliases = (draft.aliases || names).map((name) => normalizePersonName(name)).filter(Boolean);
  return {
    id: draft.kind === "email" ? `email:${normalizeEmail(draft.value)}` : draft.kind === "domain" ? `domain:${draft.value.replace(/^@/, "").toLowerCase()}` : `name:${normalizePersonName(draft.value)}`,
    kind: draft.kind,
    value: draft.kind === "email" ? normalizeEmail(draft.value) : draft.kind === "domain" ? draft.value.replace(/^@/, "").trim().toLowerCase() : normalizePersonName(draft.value),
    reason: draft.reason,
    hold: draft.hold || "",
    note: draft.note,
    aliases,
    email: normalizeEmail(draft.email || (draft.kind === "email" ? draft.value : "")),
    source: draft.source || "manual",
    createdAt: now,
    updatedAt: now
  };
}
function seedSuppression(now) {
  const manual = "Standing blacklist. Add the email here when you have it. A matching customer name is already blocked.";
  return [
    entry(now, {
      kind: "domain",
      value: "thekinkteam.com",
      reason: "manual",
      note: "Standing blacklist: every @thekinkteam.com address.",
      source: "seed"
    }),
    entry(now, { kind: "name", value: "Bruce Kink", reason: "manual", note: manual, source: "seed", names: ["Bruce Kink"] }),
    entry(now, { kind: "name", value: "Lisa Cagle", reason: "manual", note: manual, source: "seed", names: ["Lisa Cagle"] }),
    entry(now, { kind: "name", value: "Haley Garcia", reason: "manual", note: manual, source: "seed", names: ["Haley Garcia"] }),
    entry(now, { kind: "name", value: "Shannon Cox", reason: "manual", note: manual, source: "seed", names: ["Shannon Cox"] }),
    entry(now, { kind: "name", value: "Melissa Franklin", reason: "manual", note: manual, source: "seed", names: ["Melissa Franklin"] }),
    entry(now, { kind: "name", value: "Justin McClung", reason: "manual", note: manual, source: "seed", names: ["Justin McClung"] }),
    entry(now, {
      kind: "name",
      value: "Rebecca Nye",
      reason: "manual",
      hold: "personal",
      note: "Personal hold. Cadi emails Rebecca herself.",
      source: "seed",
      names: ["Rebecca Nye"]
    }),
    entry(now, {
      kind: "name",
      value: "Jacalyn Henthorne",
      reason: "manual",
      hold: "personal",
      note: "Personal hold. Cadi emails Jacki (Jacalyn) Henthorne herself.",
      source: "seed",
      names: ["Jacki Henthorne", "Jacalyn Henthorne", "Jacki Jacalyn Henthorne"]
    })
  ];
}
function buildSuppression(now, draft) {
  if (draft.kind === "email" && !isValidEmail(draft.value)) return null;
  if (draft.kind === "domain" && !draft.value.replace(/^@/, "").includes(".")) return null;
  if (draft.kind === "name" && !normalizePersonName(draft.value)) return null;
  return entry(now, draft);
}
function matchSuppression(contact, list2) {
  const email = normalizeEmail(contact.email);
  const domain = email.split("@")[1] || "";
  const name = normalizePersonName(`${contact.firstName} ${contact.lastName}`);
  for (const item of list2) {
    if (item.kind === "email" && item.value === email) return item;
    if (item.email && item.email === email) return item;
    if (item.kind === "domain" && domain === item.value) return item;
    if (item.kind === "name" && name && (name === item.value || item.aliases.includes(name))) return item;
  }
  return null;
}
function reasonLabel(reason, hold) {
  if (hold === "personal") return "Personal hold";
  if (reason === "bounced") return "Bounced";
  if (reason === "blocked") return "Blocked";
  if (reason === "unsubscribed") return "Unsubscribed";
  if (reason === "complained") return "Complained";
  return "Do not email";
}
const PHOTOS_SENDING_ACCOUNT = "photos@iconicimagestx.com";
function normalizeSendingAccounts(raw) {
  const list2 = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (email, label) => {
    const normalized = normalizeEmail(String(email || ""));
    if (!isValidEmail(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    const name = String(label || "").trim();
    list2.push({ email: normalized, label: name || normalized });
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item;
      add(row.email, row.label);
    }
  }
  if (!list2.length) add(PHOTOS_SENDING_ACCOUNT, "Photos");
  return list2;
}
function matchSendingAccount(email, accounts) {
  const normalized = normalizeEmail(email);
  return accounts.some((account) => account.email === normalized) ? normalized : "";
}
const EMPTY_SEGMENT_FILTER = {
  query: "",
  tagsAll: [],
  tagsAny: [],
  tagsNone: [],
  source: "",
  verified: "",
  fields: []
};
const DEFAULT_MARKETING_SETTINGS = {
  frequencyMax: 2,
  frequencyDays: 7,
  overlapHours: 24,
  gmailDailyLimit: 2e3,
  bounceWarnRate: 0.05,
  bouncePauseRate: 0.08,
  fromName: "Iconic Images",
  fromEmail: "photos@iconicimagestx.com",
  replyTo: "photos@iconicimagestx.com",
  sendingAccounts: [{ email: "photos@iconicimagestx.com", label: "Photos" }],
  suppressionSeededAt: ""
};
function settingsFrom(raw) {
  const merged = { ...DEFAULT_MARKETING_SETTINGS, ...raw || {} };
  const sendingAccounts = normalizeSendingAccounts(
    raw && Array.isArray(raw.sendingAccounts) ? raw.sendingAccounts : DEFAULT_MARKETING_SETTINGS.sendingAccounts
  );
  const fromEmail = matchSendingAccount(merged.fromEmail, sendingAccounts) || sendingAccounts[0]?.email || PHOTOS_SENDING_ACCOUNT;
  return { ...merged, sendingAccounts, fromEmail };
}
function createMemoryMarketingStore() {
  const contacts = /* @__PURE__ */ new Map();
  const segments = /* @__PURE__ */ new Map();
  const suppression = /* @__PURE__ */ new Map();
  const events = [];
  const campaigns = /* @__PURE__ */ new Map();
  const templates = /* @__PURE__ */ new Map();
  const sends = [];
  const reports = /* @__PURE__ */ new Map();
  let settings = { ...DEFAULT_MARKETING_SETTINGS };
  let clients = [];
  return {
    async ensureSeed() {
      if (settings.suppressionSeededAt) return;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      for (const item of seedSuppression(now)) suppression.set(item.id, item);
      settings = { ...settings, suppressionSeededAt: now };
    },
    async listContacts() {
      return [...contacts.values()];
    },
    async saveContacts(next) {
      for (const contact of next) contacts.set(contact.email, contact);
    },
    async deleteContacts(emails) {
      for (const email of emails) contacts.delete(email);
    },
    async listSegments() {
      return [...segments.values()];
    },
    async saveSegment(segment) {
      segments.set(segment.id, segment);
    },
    async deleteSegment(id) {
      segments.delete(id);
    },
    async listSuppression() {
      return [...suppression.values()];
    },
    async saveSuppression(entry2) {
      suppression.set(entry2.id, entry2);
    },
    async deleteSuppression(id) {
      suppression.delete(id);
    },
    async listEvents(email) {
      return events.filter((event) => !email || event.email === email);
    },
    async addEvents(next) {
      events.push(...next);
    },
    async getSettings() {
      settings = settingsFrom(settings);
      return settings;
    },
    async saveSettings(next) {
      settings = next;
    },
    async listClients() {
      return clients;
    },
    replaceClients(next) {
      clients = next;
    },
    async listCampaigns() {
      return [...campaigns.values()];
    },
    async getCampaign(id) {
      return campaigns.get(id) || null;
    },
    async saveCampaign(campaign) {
      campaigns.set(campaign.id, campaign);
    },
    async deleteCampaign(id) {
      campaigns.delete(id);
    },
    async listTemplates() {
      return [...templates.values()];
    },
    async saveTemplate(template) {
      templates.set(template.id, template);
    },
    async deleteTemplate(id) {
      templates.delete(id);
    },
    async listSends() {
      return sends;
    },
    async addSends(next) {
      sends.push(...next);
    },
    async getReport(campaignId) {
      return reports.get(campaignId) || null;
    },
    async saveReport(report) {
      reports.set(report.campaignId, report);
    },
    async listReports() {
      return [...reports.values()];
    }
  };
}
const memoryStore$1 = createMemoryMarketingStore();
function getMarketingStore() {
  if (process.env.MARKETING_STORE === "memory" || !admin.apps.length) return memoryStore$1;
  return firestoreStore$1;
}
function db$5() {
  return admin.firestore();
}
async function writeAll(collection, docs) {
  for (let index = 0; index < docs.length; index += 400) {
    const batch = db$5().batch();
    for (const doc of docs.slice(index, index + 400)) {
      batch.set(db$5().collection(collection).doc(doc.id), doc.data);
    }
    await batch.commit();
  }
}
const firestoreStore$1 = {
  async ensureSeed() {
    const settings = await this.getSettings();
    if (settings.suppressionSeededAt) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await writeAll("marketingSuppression", seedSuppression(now).map((item) => ({ id: item.id, data: item })));
    await this.saveSettings({ ...settings, suppressionSeededAt: now });
  },
  async listContacts() {
    const snap = await db$5().collection("marketingContacts").get();
    return snap.docs.map((doc) => doc.data());
  },
  async saveContacts(contacts) {
    await writeAll("marketingContacts", contacts.map((contact) => ({ id: contact.email, data: contact })));
  },
  async deleteContacts(emails) {
    for (let index = 0; index < emails.length; index += 400) {
      const batch = db$5().batch();
      for (const email of emails.slice(index, index + 400)) {
        batch.delete(db$5().collection("marketingContacts").doc(email));
      }
      await batch.commit();
    }
  },
  async listSegments() {
    const snap = await db$5().collection("marketingSegments").get();
    return snap.docs.map((doc) => doc.data());
  },
  async saveSegment(segment) {
    await db$5().collection("marketingSegments").doc(segment.id).set(segment);
  },
  async deleteSegment(id) {
    await db$5().collection("marketingSegments").doc(id).delete();
  },
  async listSuppression() {
    const snap = await db$5().collection("marketingSuppression").get();
    return snap.docs.map((doc) => doc.data());
  },
  async saveSuppression(entry2) {
    await db$5().collection("marketingSuppression").doc(entry2.id).set(entry2);
  },
  async deleteSuppression(id) {
    await db$5().collection("marketingSuppression").doc(id).delete();
  },
  async listEvents(email) {
    const query = email ? db$5().collection("marketingEvents").where("email", "==", email) : db$5().collection("marketingEvents");
    const snap = await query.get();
    return snap.docs.map((doc) => doc.data());
  },
  async addEvents(events) {
    await writeAll("marketingEvents", events.map((event) => ({ id: event.id, data: event })));
  },
  async getSettings() {
    const doc = await db$5().collection("marketingSettings").doc("default").get();
    return settingsFrom(doc.exists ? doc.data() : void 0);
  },
  async saveSettings(settings) {
    await db$5().collection("marketingSettings").doc("default").set(settings);
  },
  async listClients() {
    const snap = await db$5().collection("clients").get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: String(data.email || ""),
        firstName: String(data.firstName || ""),
        lastName: String(data.lastName || ""),
        phone: String(data.phone || ""),
        company: String(data.company || "")
      };
    });
  },
  async listCampaigns() {
    const snap = await db$5().collection("marketingCampaigns").get();
    return snap.docs.map((doc) => doc.data());
  },
  async getCampaign(id) {
    const doc = await db$5().collection("marketingCampaigns").doc(id).get();
    return doc.exists ? doc.data() : null;
  },
  async saveCampaign(campaign) {
    await db$5().collection("marketingCampaigns").doc(campaign.id).set(campaign);
  },
  async deleteCampaign(id) {
    await db$5().collection("marketingCampaigns").doc(id).delete();
  },
  async listTemplates() {
    const snap = await db$5().collection("marketingTemplates").get();
    return snap.docs.map((doc) => doc.data());
  },
  async saveTemplate(template) {
    await db$5().collection("marketingTemplates").doc(template.id).set(template);
  },
  async deleteTemplate(id) {
    await db$5().collection("marketingTemplates").doc(id).delete();
  },
  async listSends() {
    const snap = await db$5().collection("marketingSends").get();
    return snap.docs.map((doc) => doc.data());
  },
  async addSends(sends) {
    await writeAll("marketingSends", sends.map((send) => ({
      id: `${send.campaignId}_${send.email}`.replace(/[^\w@.-]+/g, "_"),
      data: send
    })));
  },
  async getReport(campaignId) {
    const doc = await db$5().collection("marketingReports").doc(campaignId).get();
    return doc.exists ? doc.data() : null;
  },
  async saveReport(report) {
    await db$5().collection("marketingReports").doc(report.campaignId).set(report);
  },
  async listReports() {
    const snap = await db$5().collection("marketingReports").get();
    return snap.docs.map((doc) => doc.data());
  }
};
async function syncCustomerContacts(store = getMarketingStore()) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const [contacts, clients] = await Promise.all([store.listContacts(), store.listClients()]);
  const result = syncClientsIntoContacts(contacts, clients, now);
  const nextEmails = new Set(result.contacts.map((contact) => contact.email));
  const removed = contacts.map((contact) => contact.email).filter((email) => !nextEmails.has(email));
  await store.saveContacts(result.contacts);
  if (removed.length) await store.deleteContacts(removed);
  return {
    created: result.created,
    relinked: result.relinked,
    refreshed: result.refreshed,
    total: result.contacts.length
  };
}
function parseTabularUpload(input) {
  const name = (input.filename || "").toLowerCase();
  const isWorkbook = name.endsWith(".xlsx") || name.endsWith(".xls") || Boolean(input.base64 && !input.text);
  if (isWorkbook) {
    if (!input.base64) throw new Error("The spreadsheet file was empty.");
    const workbook = XLSX.read(Buffer.from(input.base64, "base64"), { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false
    });
    const lines = matrix.map((row) => row.map((cell2) => String(cell2 ?? "").trim()));
    const filled = lines.filter((row) => row.some((cell2) => cell2.length > 0));
    if (!filled.length) return { headers: [], rows: [] };
    const width = filled.reduce((max, row) => Math.max(max, row.length), 0);
    const headers = filled[0].concat(Array(Math.max(0, width - filled[0].length)).fill("")).map((header, index) => header || `Column ${index + 1}`);
    const rows = filled.slice(1).map((row) => {
      const next = row.slice(0, headers.length);
      while (next.length < headers.length) next.push("");
      return next;
    });
    return { headers, rows };
  }
  return parseCsv(input.text || "");
}
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
      const recent = (hits.get(key) ?? []).filter((stamp2) => stamp2 > windowStart);
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
const router$c = Router();
const MAX_ROWS = 1e4;
const unsubscribeLimit = createRateLimiter({ windowMs: 60 * 60 * 1e3, max: 20 });
function requireMarketing$1(permission) {
  return async (req, res, next) => {
    await requireStaff(req, res, () => {
      if (!hasMarketingPermission(req.staffRole, permission)) {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      next();
    });
  };
}
function asFilter(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    query: String(raw.query || ""),
    tagsAll: Array.isArray(raw.tagsAll) ? raw.tagsAll.map(String) : [],
    tagsAny: Array.isArray(raw.tagsAny) ? raw.tagsAny.map(String) : [],
    tagsNone: Array.isArray(raw.tagsNone) ? raw.tagsNone.map(String) : [],
    source: raw.source === "client" || raw.source === "import" || raw.source === "manual" ? raw.source : "",
    verified: raw.verified === "yes" || raw.verified === "no" ? raw.verified : "",
    fields: Array.isArray(raw.fields) ? raw.fields.filter((field) => field && typeof field === "object").map((field) => ({
      key: String(field.key || ""),
      value: String(field.value || "")
    })) : []
  };
}
function publicContact(contact, suppression) {
  const blocked = matchSuppression(contact, suppression);
  return {
    ...contact,
    name: contactName(contact),
    suppressed: blocked ? reasonLabel(blocked.reason, blocked.hold) : ""
  };
}
router$c.get("/overview", requireMarketing$1("view"), async (_req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression, segments] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listSegments()
  ]);
  res.json({
    contacts: contacts.length,
    customers: contacts.filter((contact) => contact.clientId).length,
    unverified: contacts.filter((contact) => !contact.emailVerified).length,
    suppressed: suppression.length,
    segments: segments.length
  });
});
router$c.get("/contacts", requireMarketing$1("view"), async (req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression] = await Promise.all([store.listContacts(), store.listSuppression()]);
  const query = String(req.query.q || "").trim().toLowerCase();
  const tag = String(req.query.tag || "").trim().toLowerCase();
  const source = String(req.query.source || "");
  const filtered = contacts.filter((contact) => {
    if (tag && !contact.tags.some((item) => item.toLowerCase() === tag)) return false;
    if (source && contact.source !== source) return false;
    if (!query) return true;
    return `${contact.email} ${contact.firstName} ${contact.lastName} ${contact.company} ${contact.tags.join(" ")}`.toLowerCase().includes(query);
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((contact) => publicContact(contact, suppression));
  const tags = [...new Set(contacts.flatMap((contact) => contact.tags))].sort((a, b) => a.localeCompare(b));
  res.json({ contacts: filtered, tags, total: contacts.length });
});
router$c.get("/contacts/detail", requireMarketing$1("view"), async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "A valid email is required." });
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression, events] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listEvents(email)
  ]);
  const contact = contacts.find((item) => item.email === email);
  if (!contact) return res.status(404).json({ error: "Contact not found." });
  res.json({
    contact: publicContact(contact, suppression),
    activity: events.sort((a, b) => b.at.localeCompare(a.at))
  });
});
router$c.post("/contacts", requireMarketing$1("manage"), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "A valid email is required." });
  const store = getMarketingStore();
  const contacts = await store.listContacts();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = contacts.find((contact2) => contact2.email === email);
  const contact = {
    email,
    firstName: String(req.body?.firstName || existing?.firstName || "").trim(),
    lastName: String(req.body?.lastName || existing?.lastName || "").trim(),
    company: String(req.body?.company || existing?.company || "").trim(),
    phone: String(req.body?.phone || existing?.phone || "").trim(),
    tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : existing?.tags || [],
    custom: existing?.custom || {},
    source: existing?.source || "manual",
    clientId: existing?.clientId || "",
    emailVerified: existing?.emailVerified ?? req.body?.emailVerified === true,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (req.body?.emailVerified === true) contact.emailVerified = true;
  await store.saveContacts([contact]);
  res.json({ contact });
});
router$c.post("/contacts/tags", requireMarketing$1("manage"), async (req, res) => {
  const emails = Array.isArray(req.body?.emails) ? req.body.emails.map((email) => normalizeEmail(email)) : [];
  const add = Array.isArray(req.body?.add) ? req.body.add.map(String) : [];
  const remove = Array.isArray(req.body?.remove) ? req.body.remove.map(String) : [];
  if (!emails.length) return res.status(400).json({ error: "Choose at least one contact." });
  const store = getMarketingStore();
  const contacts = await store.listContacts();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const wanted = new Set(emails);
  const next = contacts.filter((contact) => wanted.has(contact.email)).map((contact) => applyTagChange(contact, add, remove, now));
  await store.saveContacts(next);
  res.json({ updated: next.length });
});
router$c.post("/contacts/sync", requireMarketing$1("manage"), async (_req, res) => {
  const result = await syncCustomerContacts();
  res.json(result);
});
router$c.post("/imports/parse", requireMarketing$1("manage"), async (req, res) => {
  try {
    const table = parseTabularUpload({
      text: typeof req.body?.text === "string" ? req.body.text : "",
      base64: typeof req.body?.base64 === "string" ? req.body.base64 : "",
      filename: typeof req.body?.filename === "string" ? req.body.filename : ""
    });
    if (table.rows.length > MAX_ROWS) {
      return res.status(400).json({ error: `Imports are limited to ${MAX_ROWS} rows.` });
    }
    res.json({
      headers: table.headers,
      rows: table.rows,
      rowCount: table.rows.length,
      suggested: suggestMapping(table.headers)
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not read that file." });
  }
});
router$c.post("/imports/commit", requireMarketing$1("manage"), async (req, res) => {
  const headers = Array.isArray(req.body?.headers) ? req.body.headers.map(String) : [];
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.map((row) => Array.isArray(row) ? row.map(String) : []) : [];
  const mapping = req.body?.mapping && typeof req.body.mapping === "object" ? req.body.mapping : {};
  if (!headers.length) return res.status(400).json({ error: "Map at least an email column." });
  if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Imports are limited to ${MAX_ROWS} rows.` });
  if (!Object.values(mapping).includes("email")) return res.status(400).json({ error: "Choose which column contains the email address." });
  const store = getMarketingStore();
  const existing = await store.listContacts();
  const plan = buildImportPlan({
    rows: mapTable({ headers, rows }, mapping),
    existing,
    now: (/* @__PURE__ */ new Date()).toISOString(),
    extraTags: Array.isArray(req.body?.extraTags) ? req.body.extraTags.map(String) : []
  });
  await store.saveContacts(plan.upserts);
  res.json({ summary: plan.summary });
});
router$c.get("/segments", requireMarketing$1("view"), async (_req, res) => {
  const store = getMarketingStore();
  const [segments, contacts] = await Promise.all([store.listSegments(), store.listContacts()]);
  res.json({
    segments: segments.sort((a, b) => a.name.localeCompare(b.name)).map((segment) => ({
      ...segment,
      count: contacts.filter((contact) => contactMatchesFilter(contact, segment.filter)).length
    }))
  });
});
router$c.post("/segments", requireMarketing$1("manage"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name the segment." });
  const store = getMarketingStore();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = String(req.body?.id || crypto.randomUUID());
  const existing = (await store.listSegments()).find((segment2) => segment2.id === id);
  const segment = {
    id,
    name,
    filter: { ...EMPTY_SEGMENT_FILTER, ...asFilter(req.body?.filter) },
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  await store.saveSegment(segment);
  res.json({ segment });
});
router$c.delete("/segments/:id", requireMarketing$1("manage"), async (req, res) => {
  await getMarketingStore().deleteSegment(req.params.id);
  res.json({ ok: true });
});
router$c.get("/suppression", requireMarketing$1("view"), async (_req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const entries = await store.listSuppression();
  res.json({
    entries: entries.sort((a, b) => a.value.localeCompare(b.value))
  });
});
router$c.post("/suppression", requireMarketing$1("manage"), async (req, res) => {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const entry2 = buildSuppression(now, {
    kind: req.body?.kind === "domain" || req.body?.kind === "name" ? req.body.kind : "email",
    value: String(req.body?.value || ""),
    reason: ["bounced", "blocked", "unsubscribed", "complained", "manual"].includes(req.body?.reason) ? req.body.reason : "manual",
    hold: req.body?.hold === "personal" ? "personal" : "",
    note: String(req.body?.note || "").trim(),
    email: String(req.body?.email || ""),
    names: Array.isArray(req.body?.names) ? req.body.names.map(String) : void 0,
    source: "manual"
  });
  if (!entry2) return res.status(400).json({ error: "That suppression entry is not valid." });
  const store = getMarketingStore();
  await store.ensureSeed();
  const existing = (await store.listSuppression()).find((item) => item.id === entry2.id);
  await store.saveSuppression({ ...entry2, createdAt: existing?.createdAt || now, source: existing?.source || "manual" });
  res.json({ entry: entry2 });
});
router$c.delete("/suppression/:id", requireMarketing$1("manage"), async (req, res) => {
  await getMarketingStore().deleteSuppression(decodeURIComponent(req.params.id));
  res.json({ ok: true });
});
router$c.post("/unsubscribe", async (req, res) => {
  const limit = unsubscribeLimit.check(clientIp(req));
  if (!limit.allowed) return res.status(429).json({ error: "Too many attempts. Try again later." });
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter the email address you want removed." });
  const token = String(req.body?.token || "");
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET || "";
  if (token) {
    if (!secret || !unsubscribeTokenMatches(email, token, secret)) {
      return res.status(400).json({ error: "This unsubscribe link is not valid. Enter your email on the form instead." });
    }
  }
  const store = getMarketingStore();
  await store.ensureSeed();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const entry2 = buildSuppression(now, {
    kind: "email",
    value: email,
    reason: "unsubscribed",
    note: "Unsubscribed from the public page.",
    source: "unsubscribe"
  });
  if (!entry2) return res.status(400).json({ error: "Enter the email address you want removed." });
  await store.saveSuppression(entry2);
  const contacts = await store.listContacts();
  const contact = contacts.find((item) => item.email === email);
  if (contact) {
    await store.addEvents([{
      id: crypto.randomUUID(),
      email,
      campaignId: "",
      campaignName: "",
      type: "unsubscribe",
      at: now,
      detail: "Unsubscribed from marketing email"
    }]);
  }
  res.json({ ok: true, message: `${email} will not receive Iconic marketing email.` });
});
function signUnsubscribeEmail(email, secret) {
  return crypto.createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}
function unsubscribeTokenMatches(email, token, secret) {
  const expected = signUnsubscribeEmail(email, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(token);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function hoursBetween(laterIso, earlierIso) {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(later) || Number.isNaN(earlier)) return Number.POSITIVE_INFINITY;
  return (later - earlier) / 36e5;
}
function resolveAudience(input) {
  const removed = [];
  const seen = /* @__PURE__ */ new Set();
  const recipients = [];
  let duplicatesRemoved = 0;
  const pool = input.filter ? input.contacts.filter((contact) => contactMatchesFilter(contact, input.filter)) : input.contacts;
  for (const contact of pool) {
    const email = normalizeEmail(contact.email);
    const name = `${contact.firstName} ${contact.lastName}`.trim() || email;
    if (!isValidEmail(email)) {
      removed.push({ email, name, reason: "invalid", detail: "Invalid email" });
      continue;
    }
    if (seen.has(email)) {
      duplicatesRemoved += 1;
      removed.push({ email, name, reason: "duplicate", detail: "Duplicate in this send" });
      continue;
    }
    seen.add(email);
    const suppressed = matchSuppression(contact, input.suppression);
    if (suppressed) {
      const detail = suppressed.hold === "personal" ? "Personal hold" : suppressed.reason;
      removed.push({ email, name, reason: "suppressed", detail });
      continue;
    }
    const windowStart = Date.parse(input.sendAt) - input.settings.frequencyDays * 864e5;
    const recent = input.sends.filter((send) => {
      return normalizeEmail(send.email) === email && Date.parse(send.sentAt) >= windowStart;
    });
    if (input.settings.frequencyMax > 0 && recent.length >= input.settings.frequencyMax) {
      removed.push({
        email,
        name,
        reason: "frequency",
        detail: `${recent.length} marketing emails in ${input.settings.frequencyDays} days`
      });
      continue;
    }
    if (!input.overlapOverride) {
      const clash = input.campaigns.find((campaign) => {
        if (campaign.id === input.excludeCampaignId) return false;
        if (!campaign.recipientEmails.map(normalizeEmail).includes(email)) return false;
        if (campaign.status === "sending") return true;
        if (campaign.status === "scheduled" && campaign.scheduledAt) {
          return Math.abs(hoursBetween(campaign.scheduledAt, input.sendAt)) <= input.settings.overlapHours;
        }
        if (campaign.status === "sent" && campaign.sentAt) {
          return hoursBetween(input.sendAt, campaign.sentAt) <= input.settings.overlapHours && hoursBetween(input.sendAt, campaign.sentAt) >= 0;
        }
        return false;
      });
      if (clash) {
        removed.push({ email, name, reason: "overlap", detail: clash.name });
        continue;
      }
    }
    recipients.push({ ...contact, email });
  }
  return {
    recipients,
    removed,
    duplicatesRemoved,
    suppressed: removed.filter((item) => item.reason === "suppressed").length,
    frequencyCapped: removed.filter((item) => item.reason === "frequency").length,
    overlapHeld: removed.filter((item) => item.reason === "overlap").length,
    unverified: recipients.filter((contact) => !contact.emailVerified).length
  };
}
function deliverabilityWarnings(input) {
  const warnings = [];
  if (input.audience.unverified > 0) {
    warnings.push(`${input.audience.unverified} recipient${input.audience.unverified === 1 ? "" : "s"} were imported and never verified.`);
  }
  const remaining = input.settings.gmailDailyLimit - input.sentToday;
  if (input.audience.recipients.length > input.settings.gmailDailyLimit) {
    warnings.push(`This send is ${input.audience.recipients.length} people. The Gmail daily limit is set to ${input.settings.gmailDailyLimit}.`);
  } else if (input.audience.recipients.length > remaining) {
    warnings.push(`About ${input.sentToday} marketing emails already went out today. ${input.audience.recipients.length} more would pass the ${input.settings.gmailDailyLimit} daily limit.`);
  }
  return warnings;
}
const GMASS_LINKS = [
  {
    id: "dashboard",
    label: "GMass dashboard",
    href: "https://gmass.co/dashboard",
    detail: "Campaign reports and the settings gear."
  },
  {
    id: "account",
    label: "Plan, billing, and card",
    href: "https://gmass.co/dashboard",
    detail: "Settings → My Account. Change plan, card, invoices, and billing contacts there."
  },
  {
    id: "pricing",
    label: "Compare plans",
    href: "https://www.gmass.co/pricing",
    detail: "Upgrade and downgrade from My Account. There is no billing API."
  },
  {
    id: "gmail",
    label: "Connected Gmail",
    href: "https://gmass.co/dashboard",
    detail: "The connected Gmail stays photos@iconicimagestx.com. A campaign can still send as photos@ or another Send-as alias, such as news@, once that alias exists on the mailbox. The API cannot change the connected Gmail."
  },
  {
    id: "keys",
    label: "API keys",
    href: "https://gmass.co/dashboard",
    detail: "Settings → API Keys → Manage API Keys. Paste the key into GMASS_API_KEY on the server."
  },
  {
    id: "support",
    label: "GMass support",
    href: "https://www.gmass.co/g/support",
    detail: "For account changes this portal cannot make."
  }
];
const GMASS_IN_PORTAL = [
  "Account payload from GET /api/user (fields are whatever GMass returns; the spec does not list them).",
  "Warm-up stats from GET /api/user/WarmupStats.",
  "Unsubscribe domains from GET /api/unsubscribes/domains, plus add or remove an address or domain.",
  "Campaign settings at send time: from name, reply-to, preheader, open and click tracking, Chicago schedule, emails per day, and GMass suppressionDays.",
  "Reports from GET /api/campaigns, GET /api/campaigns/{id}, and GET /api/reports/{id}/recipients|opens|clicks|bounces|blocks|unsubscribes|replies."
];
const GMASS_LINK_OUT = [
  "Billing, invoices, credit card, and plan changes.",
  "Changing the connected Gmail account.",
  "Creating or rotating API keys.",
  "Pausing a campaign that is already sending. The API has no pause endpoint, so a bounce spike becomes a recommendation and a dashboard link.",
  "Webhooks. The webhook route is for Zapier, and end users manage webhooks in the dashboard."
];
const MERGE = /\{([A-Za-z]+)(?:\|([^}]*))?\}/g;
function escapeHtml$3(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function applyMerge(template, values) {
  return template.replace(MERGE, (full, key, fallback) => {
    const value = values[key];
    if (value) return key === "UnsubscribeUrl" ? value : escapeHtml$3(value);
    if (fallback !== void 0) return escapeHtml$3(fallback);
    return full;
  });
}
function mergeValues(contact, unsubscribeUrl) {
  return {
    FirstName: contact.firstName || "",
    LastName: contact.lastName || "",
    Email: contact.email || "",
    Company: contact.company || "",
    UnsubscribeUrl: unsubscribeUrl
  };
}
function withUnsubscribeFooter(html, url) {
  const merged = html.includes("{UnsubscribeUrl}") ? html : `${html}
<p style="margin-top:24px;font-size:12px;color:#667085;">Iconic Images marketing email. <a href="{UnsubscribeUrl}">Unsubscribe</a>.</p>`;
  return applyMerge(merged, { UnsubscribeUrl: url });
}
function list(value) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  if (value && typeof value === "object" && Array.isArray(value.data)) {
    return value.data.filter((item) => item && typeof item === "object");
  }
  return [];
}
function text$1(row, key) {
  const value = row[key] ?? row[key[0].toUpperCase() + key.slice(1)];
  return value == null ? "" : String(value);
}
function rate(part, whole) {
  if (!whole) return 0;
  return Math.round(part / whole * 1e3) / 10;
}
function summarizeGmassReport(input) {
  const recipients = list(input.recipients);
  const opens = list(input.opens);
  const clicks = list(input.clicks);
  const bounces = list(input.bounces);
  const blocks = list(input.blocks);
  const unsubscribes = list(input.unsubscribes);
  const replies = list(input.replies);
  const sent = recipients.length || Number(input.aggregate?.recipients || 0);
  const bounceEmails = new Set(bounces.map((row) => text$1(row, "emailAddress").toLowerCase()).filter(Boolean));
  const blockEmails = new Set(blocks.map((row) => text$1(row, "emailAddress").toLowerCase()).filter(Boolean));
  const delivered = Math.max(0, sent - (/* @__PURE__ */ new Set([...bounceEmails, ...blockEmails])).size);
  const uniqueOpens = new Set(opens.map((row) => text$1(row, "emailAddress").toLowerCase()).filter(Boolean)).size || (recipients.length ? 0 : Number(input.aggregate?.opens || 0));
  const openTotal = opens.reduce((sum, row) => sum + Number(row.openCount || row.OpenCount || 1), 0) || uniqueOpens;
  const clickEmails = new Set(clicks.map((row) => text$1(row, "emailAddress").toLowerCase()).filter(Boolean));
  const uniqueClicks = clickEmails.size || (recipients.length ? 0 : Number(input.aggregate?.clicks || 0));
  const replyCount = replies.length || Number(input.aggregate?.replies || 0);
  const bounceCount = bounces.length || Number(input.aggregate?.bounces || 0);
  const blockCount = blocks.length || Number(input.aggregate?.blocks || 0);
  const unsubCount = unsubscribes.length || Number(input.aggregate?.unsubscribes || 0);
  const linkMap = /* @__PURE__ */ new Map();
  for (const row of clicks) {
    const url = text$1(row, "url") || "(unknown link)";
    const current = linkMap.get(url) || { clicks: 0, emails: /* @__PURE__ */ new Set() };
    current.clicks += 1;
    const email = text$1(row, "emailAddress").toLowerCase();
    if (email) current.emails.add(email);
    linkMap.set(url, current);
  }
  const byEmail = /* @__PURE__ */ new Map();
  const ensure = (email) => {
    const key = email.toLowerCase();
    if (!key) return null;
    if (!byEmail.has(key)) {
      byEmail.set(key, { email: key, sentAt: "", opens: 0, clicks: 0, replied: false, bounced: false, blocked: false, unsubscribed: false });
    }
    return byEmail.get(key);
  };
  for (const row of recipients) {
    const item = ensure(text$1(row, "emailAddress"));
    if (item) item.sentAt = text$1(row, "sentTime");
  }
  for (const row of opens) {
    const item = ensure(text$1(row, "emailAddress"));
    if (item) item.opens = Number(row.openCount || row.OpenCount || 1);
  }
  for (const row of clicks) {
    const item = ensure(text$1(row, "emailAddress"));
    if (item) item.clicks += 1;
  }
  for (const row of replies) {
    const item = ensure(text$1(row, "emailAddress"));
    if (item) item.replied = true;
  }
  for (const row of bounces) {
    const item = ensure(text$1(row, "emailAddress"));
    if (item) item.bounced = true;
  }
  for (const row of blocks) {
    const item = ensure(text$1(row, "emailAddress"));
    if (item) item.blocked = true;
  }
  for (const row of unsubscribes) {
    const item = ensure(text$1(row, "emailAddress"));
    if (item) item.unsubscribed = true;
  }
  const timeline = [
    ...recipients.map((row) => ({ at: text$1(row, "sentTime"), type: "sent", email: text$1(row, "emailAddress"), detail: "Sent" })),
    ...opens.map((row) => ({ at: text$1(row, "lastOpenTime"), type: "open", email: text$1(row, "emailAddress"), detail: `${row.openCount || 1} opens` })),
    ...clicks.map((row) => ({ at: text$1(row, "clickTime"), type: "click", email: text$1(row, "emailAddress"), detail: text$1(row, "url") })),
    ...replies.map((row) => ({ at: text$1(row, "replyTime"), type: "reply", email: text$1(row, "emailAddress"), detail: "Replied" })),
    ...bounces.map((row) => ({ at: text$1(row, "bounceTime"), type: "bounce", email: text$1(row, "emailAddress"), detail: text$1(row, "bounceReason") || "Bounced" })),
    ...blocks.map((row) => ({ at: text$1(row, "blockTime"), type: "block", email: text$1(row, "emailAddress"), detail: text$1(row, "blockReason") || "Blocked" })),
    ...unsubscribes.map((row) => ({ at: text$1(row, "unsubscribeTime"), type: "unsubscribe", email: text$1(row, "emailAddress"), detail: "Unsubscribed" }))
  ].filter((item) => item.at).sort((a, b) => b.at.localeCompare(a.at));
  const bounceRate = sent ? bounceCount / sent : 0;
  return {
    sent,
    delivered,
    opens: openTotal,
    uniqueOpens,
    clicks: clicks.length || uniqueClicks,
    uniqueClicks,
    replies: replyCount,
    bounces: bounceCount,
    blocks: blockCount,
    unsubscribes: unsubCount,
    rates: {
      open: rate(uniqueOpens, delivered || sent),
      click: rate(uniqueClicks, delivered || sent),
      bounce: rate(bounceCount, sent),
      unsubscribe: rate(unsubCount, sent)
    },
    links: [...linkMap.entries()].map(([url, value]) => ({ url, clicks: value.clicks, unique: value.emails.size })).sort((a, b) => b.clicks - a.clicks),
    recipients: [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email)),
    timeline,
    bounceRate,
    warn: sent >= 25 && bounceRate >= input.warnRate,
    pauseRecommended: sent >= 25 && bounceRate >= input.pauseRate
  };
}
function complaintLike(reason) {
  return /complain|spam|abuse/i.test(reason);
}
function gmassSendTime(localDateTime) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localDateTime.trim());
  if (!match) throw new Error("Choose a date and time.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  for (const offsetHours of [-5, -6]) {
    const utc = new Date(wall - offsetHours * 36e5);
    const parts = chicagoParts(utc);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute) {
      const sign = offsetHours < 0 ? "-" : "+";
      return `${match[2]}/${match[3]}/${match[1]} ${match[4]}:${match[5]} ${sign}${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
    }
  }
  throw new Error("That Chicago time is not valid.");
}
function chicagoParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value || "0");
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}
function chicagoLocalToIso(localDateTime) {
  const formatted = gmassSendTime(localDateTime);
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) ([+-]\d{2}):(\d{2})$/.exec(formatted);
  if (!match) throw new Error("Could not read the Chicago time.");
  const [, month, day, year, hour, minute, offset] = match;
  const sign = offset.startsWith("-") ? -1 : 1;
  const hours = Number(offset.slice(1, 3));
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) - sign * hours * 36e5;
  return new Date(utc).toISOString();
}
function marketingSendLive(env = process.env) {
  return env.MARKETING_SEND_LIVE === "true";
}
function marketingPublicUrl(env = process.env, requestOrigin = "") {
  const configured = String(env.MARKETING_PUBLIC_URL || env.APP_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return requestOrigin.replace(/\/$/, "");
}
class GmassSendBlocked extends Error {
  constructor() {
    super("GMass sending is off. Set GMASS_SEND_ENABLED=true after you mean to send.");
    this.name = "GmassSendBlocked";
  }
}
class GmassNotConfigured extends Error {
  constructor() {
    super("GMass is not configured. Set GMASS_API_KEY on the server.");
    this.name = "GmassNotConfigured";
  }
}
const SEND_POST = [/^\/api\/campaigndrafts$/, /^\/api\/campaigns\/[^/]+$/, /^\/api\/transactional$/];
function createGmassClient(env = process.env, fetchImpl = fetch) {
  const apiKey = env.GMASS_API_KEY || "";
  const writesEnabled = env.GMASS_SEND_ENABLED === "true";
  async function request(method, path2, body) {
    if (!apiKey) throw new GmassNotConfigured();
    const sending = method === "POST" && SEND_POST.some((pattern) => pattern.test(path2));
    if (sending && !writesEnabled) throw new GmassSendBlocked();
    const response = await fetchImpl(`https://api.gmass.co${path2}`, {
      method,
      headers: {
        "X-apikey": apiKey,
        ...body ? { "Content-Type": "application/json" } : {}
      },
      body: body ? JSON.stringify(body) : void 0
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.message === "string" ? data.message : `GMass ${method} ${path2} failed (${response.status}).`;
      throw new Error(message);
    }
    return data;
  }
  return {
    configured: Boolean(apiKey),
    writesEnabled,
    getUser: () => request("GET", "/api/user"),
    getWarmup: () => request("GET", "/api/user/WarmupStats"),
    listUnsubscribeDomains: () => request("GET", "/api/unsubscribes/domains"),
    addUnsubscribe: (email) => request("POST", "/api/unsubscribes", { emailAddress: email }),
    removeUnsubscribe: (email) => request("DELETE", `/api/unsubscribes?emailAddress=${encodeURIComponent(email)}`),
    addUnsubscribeDomain: (domain) => request("POST", `/api/unsubscribes/domain/${encodeURIComponent(domain)}`),
    removeUnsubscribeDomain: (domain) => request("DELETE", `/api/unsubscribes/domain/${encodeURIComponent(domain)}`),
    createDraft: (draft) => request("POST", "/api/campaigndrafts", draft),
    sendCampaign: (draftId, settings) => request("POST", `/api/campaigns/${encodeURIComponent(draftId)}`, settings),
    sendTransactional: (message) => request("POST", "/api/transactional", message),
    listCampaigns: (limit = 20) => request("GET", `/api/campaigns?limit=${limit}`),
    getCampaign: (campaignId) => request("GET", `/api/campaigns/${encodeURIComponent(campaignId)}`),
    report: (campaignId, metric, query = {}) => {
      const params = new URLSearchParams();
      if (query.limit) params.set("limit", String(query.limit));
      if (query.offset) params.set("offset", String(query.offset));
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return request("GET", `/api/reports/${encodeURIComponent(campaignId)}/${metric}${suffix}`);
    }
  };
}
function getGmassClient() {
  return createGmassClient();
}
const router$b = Router();
function requireMarketing(permission) {
  return async (req, res, next) => {
    await requireStaff(req, res, () => {
      if (!hasMarketingPermission(req.staffRole, permission)) {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      next();
    });
  };
}
function originOf$1(req) {
  return marketingPublicUrl(process.env, `${req.protocol}://${req.get("host")}`);
}
function blankCampaign(now, settings) {
  return {
    id: crypto.randomUUID(),
    name: "Untitled campaign",
    status: "draft",
    audienceMode: "all",
    segmentId: "",
    tags: [],
    subject: "",
    preheader: "",
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    replyTo: settings.replyTo,
    html: "<p>Hi {FirstName|there},</p>\n<p></p>",
    templateId: "",
    scheduledAt: "",
    overlapOverride: false,
    confirmation: null,
    gmassDraftId: "",
    gmassCampaignId: "",
    recipientEmails: [],
    sentAt: "",
    createdAt: now,
    updatedAt: now
  };
}
async function prepareAudience(store, campaign, sendAt, overlapOverride, scheduleKey) {
  await store.ensureSeed();
  await syncCustomerContacts(store);
  const [contacts, suppression, sends, campaigns, segments, settings] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listSends(),
    store.listCampaigns(),
    store.listSegments(),
    store.getSettings()
  ]);
  const segment = segments.find((item) => item.id === campaign.segmentId);
  const filter = campaign.audienceMode === "segment" ? segment?.filter || { ...EMPTY_SEGMENT_FILTER, tagsAll: ["__no-such-segment__"] } : campaign.audienceMode === "tags" ? { ...EMPTY_SEGMENT_FILTER, tagsAny: campaign.tags } : null;
  const overlap = campaigns.filter((item) => item.id !== campaign.id && item.recipientEmails.length && item.status !== "draft" && item.status !== "cancelled").map((item) => ({
    id: item.id,
    name: item.name,
    status: item.sentAt ? "sent" : item.status,
    sentAt: item.sentAt,
    scheduledAt: item.scheduledAt,
    recipientEmails: item.recipientEmails
  }));
  const dayStart = new Date(sendAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const sentToday = sends.filter((send) => Date.parse(send.sentAt) >= dayStart.getTime()).length;
  const audience = resolveAudience({
    contacts,
    suppression,
    sends,
    campaigns: overlap,
    settings,
    filter,
    sendAt,
    excludeCampaignId: campaign.id,
    overlapOverride
  });
  const warnings = deliverabilityWarnings({ audience, settings, sentToday });
  const token = crypto.createHash("sha256").update(JSON.stringify({
    emails: audience.recipients.map((contact) => contact.email).sort(),
    overlapOverride,
    scheduleKey,
    fromEmail: campaign.fromEmail
  })).digest("hex").slice(0, 24);
  const confirmation = {
    token,
    sendAt,
    overlapOverride,
    recipientCount: audience.recipients.length,
    recipientEmails: audience.recipients.map((contact) => contact.email),
    suppressed: audience.suppressed,
    frequencyCapped: audience.frequencyCapped,
    overlapHeld: audience.overlapHeld,
    duplicatesRemoved: audience.duplicatesRemoved,
    unverified: audience.unverified,
    warnings,
    removedPreview: audience.removed.slice(0, 40).map((item) => ({ email: item.email, reason: item.reason, detail: item.detail })),
    fromEmail: campaign.fromEmail,
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { confirmation, settings, audience };
}
function readCampaign(body, current, now) {
  const mode = body.audienceMode === "segment" || body.audienceMode === "tags" ? body.audienceMode : body.audienceMode === "all" ? "all" : current.audienceMode;
  return {
    ...current,
    name: String(body.name ?? current.name).trim() || current.name,
    audienceMode: mode,
    segmentId: String(body.segmentId ?? current.segmentId),
    tags: Array.isArray(body.tags) ? body.tags.map(String) : current.tags,
    subject: String(body.subject ?? current.subject),
    preheader: String(body.preheader ?? current.preheader),
    fromName: String(body.fromName ?? current.fromName),
    fromEmail: normalizeEmail(body.fromEmail ?? current.fromEmail) || current.fromEmail,
    replyTo: normalizeEmail(body.replyTo ?? current.replyTo) || current.replyTo,
    html: String(body.html ?? current.html),
    templateId: String(body.templateId ?? current.templateId),
    scheduledAt: String(body.scheduledAt ?? current.scheduledAt),
    overlapOverride: Boolean(body.overlapOverride ?? current.overlapOverride),
    confirmation: null,
    updatedAt: now
  };
}
const UNKNOWN_FROM = "Choose a saved sending account. photos@iconicimagestx.com is ready today. Add a future address such as news@ on the GMass page before a campaign can use it.";
function knownFrom(settings, email, res) {
  const match = matchSendingAccount(email, settings.sendingAccounts);
  if (!match) res.status(400).json({ error: UNKNOWN_FROM });
  return match;
}
function sendBlocked(res, gmass) {
  if (!marketingSendLive()) {
    res.status(503).json({
      error: "Marketing email is off. Set MARKETING_SEND_LIVE=true.",
      suppressed: true
    });
    return true;
  }
  if (!gmass.configured) {
    res.status(503).json({ error: "Set GMASS_API_KEY on the server before sending." });
    return true;
  }
  if (!gmass.writesEnabled) {
    res.status(503).json({ error: "Set GMASS_SEND_ENABLED=true before a live GMass send." });
    return true;
  }
  return false;
}
router$b.get("/dashboard", requireMarketing("view"), async (_req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression, segments, campaigns, reports] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listSegments(),
    store.listCampaigns(),
    store.listReports()
  ]);
  const reportById = new Map(reports.map((report) => [report.campaignId, report]));
  const rows = campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((campaign) => {
    const report = reportById.get(campaign.id);
    return {
      id: campaign.id,
      name: campaign.name,
      status: report?.derived.pauseRecommended ? "pause-recommended" : campaign.status,
      subject: campaign.subject,
      updatedAt: campaign.updatedAt,
      sentAt: campaign.sentAt,
      recipients: campaign.recipientEmails.length,
      sample: Boolean(report?.sample),
      stats: report?.derived || null
    };
  });
  res.json({
    contacts: contacts.length,
    customers: contacts.filter((contact) => contact.clientId).length,
    unverified: contacts.filter((contact) => !contact.emailVerified).length,
    suppressed: suppression.length,
    segments: segments.length,
    campaigns: rows,
    alerts: rows.filter((row) => row.stats?.pauseRecommended)
  });
});
router$b.get("/campaigns", requireMarketing("view"), async (_req, res) => {
  const campaigns = await getMarketingStore().listCampaigns();
  res.json({ campaigns: campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
});
router$b.post("/campaigns", requireMarketing("manage"), async (req, res) => {
  const store = getMarketingStore();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const settings = await store.getSettings();
  const created = blankCampaign(now, settings);
  const campaign = readCampaign(req.body || {}, created, now);
  const fromEmail = knownFrom(settings, campaign.fromEmail, res);
  if (!fromEmail) return;
  campaign.fromEmail = fromEmail;
  campaign.confirmation = null;
  await store.saveCampaign(campaign);
  res.status(201).json({ campaign });
});
router$b.get("/campaigns/:id", requireMarketing("view"), async (req, res) => {
  const campaign = await getMarketingStore().getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  res.json({ campaign });
});
router$b.post("/campaigns/:id", requireMarketing("manage"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  if (current.status === "sent" || current.status === "sending") {
    return res.status(400).json({ error: "This campaign already went to GMass. Duplicate it to make changes." });
  }
  const settings = await store.getSettings();
  const campaign = readCampaign(req.body || {}, current, (/* @__PURE__ */ new Date()).toISOString());
  const fromEmail = knownFrom(settings, campaign.fromEmail, res);
  if (!fromEmail) return;
  campaign.fromEmail = fromEmail;
  await store.saveCampaign(campaign);
  res.json({ campaign });
});
router$b.post("/campaigns/:id/duplicate", requireMarketing("manage"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const copy = {
    ...current,
    id: crypto.randomUUID(),
    name: `${current.name} copy`,
    status: "draft",
    confirmation: null,
    gmassDraftId: "",
    gmassCampaignId: "",
    recipientEmails: [],
    sentAt: "",
    scheduledAt: "",
    createdAt: now,
    updatedAt: now
  };
  await store.saveCampaign(copy);
  res.status(201).json({ campaign: copy });
});
router$b.post("/campaigns/:id/preview", requireMarketing("send"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  const overlapOverride = req.body?.overlapOverride === true;
  const scheduleKey = typeof req.body?.scheduleLocal === "string" ? req.body.scheduleLocal : "";
  let sendAt = (/* @__PURE__ */ new Date()).toISOString();
  if (scheduleKey) {
    try {
      sendAt = chicagoLocalToIso(scheduleKey);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Choose a valid Chicago time." });
    }
  }
  const { confirmation } = await prepareAudience(store, current, sendAt, overlapOverride, scheduleKey);
  const campaign = { ...current, overlapOverride, confirmation, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await store.saveCampaign(campaign);
  res.json({ confirmation });
});
router$b.post("/campaigns/:id/test", requireMarketing("send"), async (req, res) => {
  const to = normalizeEmail(req.body?.to);
  if (!isValidEmail(to)) return res.status(400).json({ error: "Enter a test email address." });
  const gmass = getGmassClient();
  if (sendBlocked(res, gmass)) return;
  const store = getMarketingStore();
  const campaign = await store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  const fromEmail = knownFrom(await store.getSettings(), campaign.fromEmail, res);
  if (!fromEmail) return;
  const contacts = await store.listContacts();
  const contact = contacts.find((item) => item.email === to) || { firstName: "there", lastName: "", email: to, company: "" };
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET || "";
  const url = new URL("/unsubscribe", originOf$1(req));
  url.searchParams.set("email", to);
  if (secret) url.searchParams.set("token", crypto.createHmac("sha256", secret).update(to).digest("hex"));
  const html = withUnsubscribeFooter(applyMerge(campaign.html, mergeValues(contact, url.toString())), url.toString());
  try {
    await gmass.sendTransactional({
      fromEmail,
      fromName: campaign.fromName,
      to,
      subject: campaign.subject || campaign.name,
      message: html,
      settings: { openTrack: true, clickTrack: true, messageType: "html" }
    });
  } catch (err) {
    const message = err instanceof GmassSendBlocked ? err.message : err instanceof Error ? err.message : "Test send failed.";
    return res.status(503).json({ error: message });
  }
  res.json({ ok: true, to });
});
router$b.post("/campaigns/:id/send", requireMarketing("send"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  if (current.status === "sent" || current.status === "sending") {
    return res.status(400).json({ error: "This campaign was already sent." });
  }
  const overlapOverride = req.body?.overlapOverride === true;
  const scheduleKey = typeof req.body?.scheduleLocal === "string" ? req.body.scheduleLocal : "";
  let sendAt = (/* @__PURE__ */ new Date()).toISOString();
  let sendTime = "";
  if (scheduleKey) {
    try {
      sendTime = gmassSendTime(scheduleKey);
      sendAt = chicagoLocalToIso(scheduleKey);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Choose a valid Chicago time." });
    }
    if (Date.parse(sendAt) <= Date.now()) return res.status(400).json({ error: "Schedule a time in the future." });
  }
  const { confirmation, settings } = await prepareAudience(store, current, sendAt, overlapOverride, scheduleKey);
  if (!current.confirmation || current.confirmation.token !== confirmation.token || req.body?.token !== confirmation.token) {
    await store.saveCampaign({ ...current, confirmation, overlapOverride, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    return res.status(409).json({
      error: "Review the recipient count again. The list changed since the last confirm.",
      confirmation
    });
  }
  if (confirmation.recipientCount === 0) return res.status(400).json({ error: "Nobody is left to email after suppression." });
  if (confirmation.recipientCount > 5e3) return res.status(400).json({ error: "Split this send. One campaign can include 5,000 addresses." });
  const fromEmail = knownFrom(settings, current.fromEmail, res);
  if (!fromEmail) return;
  const gmass = getGmassClient();
  if (sendBlocked(res, gmass)) return;
  const page = `${originOf$1(req)}/unsubscribe`;
  const html = withUnsubscribeFooter(applyMerge(current.html, mergeValues({}, page)), page);
  try {
    const draft = await gmass.createDraft({
      subject: current.subject,
      message: html,
      messageType: "html",
      fromEmail,
      emailAddresses: confirmation.recipientEmails.join(",")
    });
    const draftId = String(draft?.campaignDraftId || "");
    if (!draftId) return res.status(502).json({ error: "GMass did not return a draft id. Nothing was marked sent." });
    const sent = await gmass.sendCampaign(draftId, {
      openTracking: true,
      clickTracking: true,
      fromName: current.fromName,
      replyTo: current.replyTo,
      previewText: current.preheader,
      friendlyName: current.name,
      ...sendTime ? { sendTime } : {},
      emailsPerDay: settings.gmailDailyLimit,
      suppressionDays: settings.frequencyDays
    });
    const gmassCampaignId = String(sent?.campaignId || "");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const campaign = {
      ...current,
      status: sendTime ? "scheduled" : "sent",
      scheduledAt: sendTime ? sendAt : "",
      sentAt: sendTime ? "" : now,
      gmassDraftId: draftId,
      gmassCampaignId,
      recipientEmails: confirmation.recipientEmails,
      confirmation,
      overlapOverride,
      updatedAt: now
    };
    await store.saveCampaign(campaign);
    if (!sendTime) {
      await store.addSends(confirmation.recipientEmails.map((email) => ({ email, campaignId: campaign.id, sentAt: now })));
      await store.addEvents(confirmation.recipientEmails.map((email) => ({
        id: crypto.randomUUID(),
        email,
        campaignId: campaign.id,
        campaignName: campaign.name,
        type: "sent",
        at: now,
        detail: campaign.subject || campaign.name
      })));
    }
    res.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GMass send failed.";
    return res.status(502).json({ error: message });
  }
});
router$b.get("/campaigns/:id/report", requireMarketing("view"), async (req, res) => {
  const store = getMarketingStore();
  const [campaign, report] = await Promise.all([
    store.getCampaign(req.params.id),
    store.getReport(req.params.id)
  ]);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  res.json({ campaign, report });
});
router$b.post("/campaigns/:id/report", requireMarketing("view"), async (req, res) => {
  const store = getMarketingStore();
  const campaign = await store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  if (!campaign.gmassCampaignId) return res.status(400).json({ error: "GMass has not returned a campaign id for this send yet." });
  const cached = await store.getReport(campaign.id);
  const fresh = req.body?.force === true || !cached || Date.now() - Date.parse(cached.fetchedAt) > 5 * 60 * 1e3;
  if (!fresh && cached) return res.json({ campaign, report: cached, cached: true });
  const gmass = getGmassClient();
  if (!gmass.configured) return res.status(503).json({ error: "Set GMASS_API_KEY to refresh GMass reports." });
  try {
    const aggregate = await gmass.getCampaign(campaign.gmassCampaignId);
    const metrics = ["recipients", "opens", "clicks", "bounces", "blocks", "unsubscribes", "replies"];
    const raw = { aggregate };
    for (const metric of metrics) {
      const rows = [];
      let offset = 0;
      for (let page = 0; page < 20; page += 1) {
        const payload = await gmass.report(campaign.gmassCampaignId, metric, { limit: 200, offset });
        const data = Array.isArray(payload) ? payload : payload?.data || [];
        rows.push(...data);
        const total = payload?.metadata?.totalRecords;
        if (!data.length || data.length < 200 || typeof total === "number" && rows.length >= total) break;
        offset += data.length;
      }
      raw[metric] = rows;
    }
    const settings = await store.getSettings();
    const stats = aggregate?.statistics;
    const derived = summarizeGmassReport({
      recipients: raw.recipients,
      opens: raw.opens,
      clicks: raw.clicks,
      bounces: raw.bounces,
      blocks: raw.blocks,
      unsubscribes: raw.unsubscribes,
      replies: raw.replies,
      aggregate: stats || null,
      warnRate: settings.bounceWarnRate,
      pauseRate: settings.bouncePauseRate
    });
    const report = {
      campaignId: campaign.id,
      gmassCampaignId: campaign.gmassCampaignId,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      sample: false,
      derived,
      raw
    };
    await store.saveReport(report);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const suppressionWrites = [];
    for (const row of raw.bounces || []) {
      if (!row?.emailAddress) continue;
      const reason = complaintLike(String(row.bounceReason || "")) ? "complained" : "bounced";
      const entry2 = buildSuppression(now, { kind: "email", value: row.emailAddress, reason, note: String(row.bounceReason || reason), source: "gmass" });
      if (entry2) suppressionWrites.push(entry2);
    }
    for (const row of raw.blocks || []) {
      const entry2 = row?.emailAddress ? buildSuppression(now, { kind: "email", value: row.emailAddress, reason: "blocked", note: String(row.blockReason || "Blocked by GMass"), source: "gmass" }) : null;
      if (entry2) suppressionWrites.push(entry2);
    }
    for (const row of raw.unsubscribes || []) {
      const entry2 = row?.emailAddress ? buildSuppression(now, { kind: "email", value: row.emailAddress, reason: "unsubscribed", note: "Unsubscribed in GMass", source: "gmass" }) : null;
      if (entry2) suppressionWrites.push(entry2);
    }
    for (const entry2 of suppressionWrites) await store.saveSuppression(entry2);
    if (derived.pauseRecommended && campaign.status === "sent") {
      await store.saveCampaign({ ...campaign, status: "pause-recommended", updatedAt: now });
    }
    res.json({ campaign, report, cached: false });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not refresh the GMass report." });
  }
});
router$b.get("/templates", requireMarketing("view"), async (_req, res) => {
  const templates = await getMarketingStore().listTemplates();
  res.json({ templates });
});
router$b.post("/templates", requireMarketing("manage"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const html = String(req.body?.html || "");
  if (!name || !html) return res.status(400).json({ error: "A template needs a name and HTML." });
  const template = {
    id: String(req.body?.id || crypto.randomUUID()),
    name,
    subject: String(req.body?.subject || ""),
    preheader: String(req.body?.preheader || ""),
    html,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await getMarketingStore().saveTemplate(template);
  res.json({ template });
});
router$b.delete("/templates/:id", requireMarketing("manage"), async (req, res) => {
  await getMarketingStore().deleteTemplate(req.params.id);
  res.json({ ok: true });
});
router$b.get("/settings", requireMarketing("view"), async (_req, res) => {
  const settings = await getMarketingStore().getSettings();
  res.json({ settings });
});
router$b.get("/account", requireMarketing("view"), async (_req, res) => {
  const settings = await getMarketingStore().getSettings();
  const gmass = getGmassClient();
  const base = {
    configured: gmass.configured,
    writesEnabled: gmass.writesEnabled,
    sendLive: marketingSendLive(),
    settings,
    links: GMASS_LINKS,
    inPortal: GMASS_IN_PORTAL,
    linkOut: GMASS_LINK_OUT,
    sendingAccount: settings.fromEmail,
    sendingAccounts: settings.sendingAccounts
  };
  if (!gmass.configured) return res.json({ ...base, user: null, warmup: null, domains: null });
  const [user, warmup, domains] = await Promise.all([
    gmass.getUser().catch((err) => ({ error: err.message })),
    gmass.getWarmup().catch((err) => ({ error: err.message })),
    gmass.listUnsubscribeDomains().catch((err) => ({ error: err.message }))
  ]);
  res.json({ ...base, user, warmup, domains });
});
router$b.post("/settings", requireMarketing("send"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getSettings();
  const next = {
    ...current,
    frequencyMax: Number(req.body?.frequencyMax ?? current.frequencyMax),
    frequencyDays: Number(req.body?.frequencyDays ?? current.frequencyDays),
    overlapHours: Number(req.body?.overlapHours ?? current.overlapHours),
    gmailDailyLimit: Number(req.body?.gmailDailyLimit ?? current.gmailDailyLimit),
    bounceWarnRate: Number(req.body?.bounceWarnRate ?? current.bounceWarnRate),
    bouncePauseRate: Number(req.body?.bouncePauseRate ?? current.bouncePauseRate),
    fromName: String(req.body?.fromName ?? current.fromName),
    replyTo: normalizeEmail(req.body?.replyTo ?? current.replyTo) || current.replyTo,
    sendingAccounts: normalizeSendingAccounts(req.body?.sendingAccounts ?? current.sendingAccounts),
    fromEmail: ""
  };
  next.fromEmail = matchSendingAccount(String(req.body?.fromEmail ?? current.fromEmail), next.sendingAccounts) || next.sendingAccounts[0].email;
  if (next.frequencyMax < 0 || next.frequencyDays < 1 || next.gmailDailyLimit < 1) {
    return res.status(400).json({ error: "Check the frequency cap and daily limit." });
  }
  await store.saveSettings(next);
  res.json({ settings: next });
});
router$b.post("/account/unsubscribes", requireMarketing("send"), async (req, res) => {
  const gmass = getGmassClient();
  if (!gmass.configured) return res.status(503).json({ error: "Set GMASS_API_KEY before syncing a suppression to GMass." });
  const email = normalizeEmail(req.body?.email);
  const domain = String(req.body?.domain || "").replace(/^@/, "").trim().toLowerCase();
  try {
    if (domain) {
      if (req.body?.action === "remove") await gmass.removeUnsubscribeDomain(domain);
      else await gmass.addUnsubscribeDomain(domain);
    } else if (isValidEmail(email)) {
      if (req.body?.action === "remove") await gmass.removeUnsubscribe(email);
      else await gmass.addUnsubscribe(email);
    } else {
      return res.status(400).json({ error: "Provide an email or a domain." });
    }
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "GMass unsubscribe update failed." });
  }
  res.json({ ok: true });
});
router$b.post("/demo/sample-report", requireMarketing("send"), async (req, res) => {
  if (process.env.MARKETING_DEMO !== "true" || isHostedDeployment(liveServerEnv())) {
    return res.status(404).json({ error: "Not found." });
  }
  const store = getMarketingStore();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const settings = await store.getSettings();
  const campaign = blankCampaign(now, settings);
  campaign.name = "Sample report (no email sent)";
  campaign.subject = "Listing prep notes";
  campaign.status = "pause-recommended";
  campaign.html = "<p>Hi {FirstName|there},</p>";
  campaign.sentAt = now;
  campaign.recipientEmails = ["sample@example.com"];
  const recipients = Array.from({ length: 100 }, (_, index) => ({ emailAddress: `agent${index}@example.com`, sentTime: now }));
  const derived = summarizeGmassReport({
    recipients,
    opens: [{ emailAddress: "agent20@example.com", openCount: 2, lastOpenTime: now }],
    clicks: [{ emailAddress: "agent20@example.com", url: "https://iconicimagestx.com/book", clickTime: now }],
    bounces: recipients.slice(0, 12).map((row) => ({ ...row, bounceReason: "user unknown", bounceTime: now })),
    blocks: [],
    unsubscribes: [],
    replies: [{ emailAddress: "agent21@example.com", replyTime: now }],
    warnRate: settings.bounceWarnRate,
    pauseRate: settings.bouncePauseRate
  });
  const report = {
    campaignId: campaign.id,
    gmassCampaignId: "",
    fetchedAt: now,
    sample: true,
    derived,
    raw: {}
  };
  await store.saveCampaign(campaign);
  await store.saveReport(report);
  res.json({ campaign, report });
});
const router$a = Router();
const db$4 = () => admin.firestore();
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
  const orderDoc = await db$4().collection("orders").doc(String(appointment.orderId)).get();
  return orderDoc.exists ? { id: orderDoc.id, ref: orderDoc.ref, data: orderDoc.data() || {} } : null;
}
router$a.get("/briefing", requireStaff, async (_req, res) => {
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
      db$4().collection("orderRequests").where("status", "==", "new").get(),
      db$4().collection("appointments").where("scheduledDate", ">=", todayTs).where("scheduledDate", "<", tomorrowTs).where("status", "in", ["confirmed", "scheduled"]).get(),
      db$4().collection("appointments").where("scheduledDate", ">=", tomorrowTs).where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(
        new Date(tomorrow.getTime() + 24 * 60 * 60 * 1e3)
      )).where("status", "in", ["confirmed", "scheduled"]).get(),
      db$4().collection("agentLogs").where("requiresHumanReview", "==", true).where("reviewedAt", "==", null).orderBy("createdAt", "desc").limit(20).get(),
      db$4().collection("agentLogs").where("priority", "==", "urgent").where("requiresHumanReview", "==", true).orderBy("createdAt", "desc").limit(5).get(),
      db$4().collection("galleries").where("status", "in", ["raw_uploaded", "editing"]).get(),
      db$4().collection("invoices").where("status", "==", "overdue").get(),
      db$4().collection("agentLogs").where("createdAt", ">=", yesterdayTs).orderBy("createdAt", "desc").limit(50).get()
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
    const appointments = await db$4().collection("appointments").where("scheduledDate", ">=", admin.firestore.Timestamp.fromDate(today)).where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(twoDaysOut)).get();
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
      const address = recordAddressText(merged) || "the property";
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
        const body = type === "1h" ? SMS_TEMPLATES.appointmentReminder1h(name, String(time)) : SMS_TEMPLATES.appointmentReminder24h(name, bookingDateLabel(scheduledDate, "your scheduled date"), String(time), address);
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
            db$4().collection("smsLogs").add({
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
          await db$4().collection("agentLogs").add({
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
router$a.get("/run-reminders", runReminderSweep);
router$a.post("/run-reminders", runReminderSweep);
router$a.get("/logs", requireStaff, async (req, res) => {
  try {
    const { agent, status, requiresReview, limit = "50" } = req.query;
    let query = db$4().collection("agentLogs").orderBy("createdAt", "desc");
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
router$a.patch("/logs/:id/resolve", requireCoordinator, async (req, res) => {
  try {
    const { notes } = req.body;
    await db$4().collection("agentLogs").doc(req.params.id).update({
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
router$a.post("/log", async (req, res) => {
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
    const ref = await db$4().collection("agentLogs").add({
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
const router$9 = Router();
const db$3 = () => admin.firestore();
router$9.get("/", requireStaff, async (req, res) => {
  try {
    const { status, listingId, orderId, limit = "100" } = req.query;
    let q = db$3().collection("mediaJobs").orderBy("createdAt", "desc");
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
router$9.post("/", requireStaff, async (req, res) => {
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
    const ref = await db$3().collection("mediaJobs").add({
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
    await db$3().collection("agentLogs").add({
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
router$9.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, resultItems = [], error = "", requiresHumanReview } = req.body;
    const valid = ["queued", "processing", "ready_for_review", "completed", "failed", "cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status." });
    await db$3().collection("mediaJobs").doc(req.params.id).update({
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
const db$2 = () => admin.firestore();
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}
async function listMediaDeliveryQueue(input) {
  const listings = await listingsForRole(input.uid, input.role);
  const allowed = input.role === "photographer" ? new Set(listings.map((item) => item.id)) : null;
  const [gallerySnap, jobSnap] = await Promise.all([
    db$2().collection("galleries").orderBy("createdAt", "desc").limit(100).get(),
    db$2().collection("editJobs").limit(200).get()
  ]);
  const galleries = [];
  for (const doc of gallerySnap.docs) {
    const data = doc.data() || {};
    const listingId = asString(data.listingId);
    if (allowed && (!listingId || !allowed.has(listingId))) continue;
    galleries.push({
      id: doc.id,
      status: asString(data.status),
      listingId,
      orderId: asString(data.orderId),
      clientName: asString(data.clientName),
      address: data.address,
      addressLabel: data.addressLabel,
      title: data.title,
      mediaCount: Array.isArray(data.mediaItems) ? data.mediaItems.length : 0
    });
  }
  const jobs = jobSnap.docs.flatMap((doc) => {
    const data = doc.data() || {};
    const listingId = asString(data.listingId);
    if (!listingId) return [];
    if (allowed && !allowed.has(listingId)) return [];
    return [{ id: doc.id, listingId, status: asString(data.status) }];
  });
  const listingSources = listings.map((item) => ({
    id: item.id,
    address: item.data.address,
    shootLocation: item.data.shootLocation,
    galleryId: asString(item.data.galleryId) || asString(item.data.playtestGalleryId)
  }));
  return buildMediaDeliveryQueue({
    galleries,
    listings: listingSources,
    jobs
  });
}
async function moveMediaDelivery(input) {
  if (!isMediaDeliveryStatus(input.status)) {
    throw httpError(400, "Status must be pending, undelivered, or delivered.");
  }
  const galleryId = input.galleryId.trim();
  if (input.status === "delivered") {
    const delivered = await deliverGalleryToClient(galleryId, { expiresInDays: input.expiresInDays });
    return {
      galleryId,
      galleryStatus: delivered.galleryStatus,
      deliveryStatus: "delivered",
      label: MEDIA_DELIVERY_LABELS.delivered,
      deliveryUrl: delivered.deliveryUrl
    };
  }
  const snap = await db$2().collection("galleries").doc(galleryId).get();
  if (!snap.exists) throw httpError(404, "Gallery not found.");
  const data = snap.data() || {};
  const hasMedia = Array.isArray(data.mediaItems) && data.mediaItems.length > 0;
  const next = galleryStatusForDeliveryMove(input.status, hasMedia);
  if (galleryStatusNeedsReleaseGate(next)) {
    throw httpError(400, "Delivered galleries go through gallery deliver.");
  }
  await snap.ref.update({
    status: next,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return {
    galleryId,
    galleryStatus: next,
    deliveryStatus: input.status,
    label: MEDIA_DELIVERY_LABELS[input.status]
  };
}
const router$8 = Router();
function adminReady$1(res) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET."
  });
  return false;
}
function cronAuthorized(req) {
  const secret = typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}
function requireStaffOrQueueCron(req, res, next) {
  if (cronAuthorized(req)) {
    req.user = { uid: "studio-queue" };
    req.staffRole = "admin";
    return next();
  }
  return requireStaff(req, res, next);
}
function sendKnownError$1(res, err, fallback) {
  const status = err.status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Studio]", err);
  return res.status(500).json({ error: fallback });
}
router$8.get("/workspace", requireStaff, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const listingId = typeof req.query.listingId === "string" ? req.query.listingId : "";
    const payload = await loadStudioWorkspace({
      uid: req.user.uid,
      role: req.staffRole || "",
      listingId: listingId || void 0
    });
    if (payload.listing && typeof payload.listing.id === "string") {
      try {
        payload.listing.release = await loadGalleryReleaseReport(payload.listing.id);
      } catch (err) {
        console.error("[Studio] Gallery gate failed:", err instanceof Error ? err.message : err);
        payload.listing.release = null;
      }
    }
    return res.json(payload);
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to load Studio.");
  }
});
router$8.get("/delivery-queue", requireStaff, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const rows = await listMediaDeliveryQueue({
      uid: req.user.uid,
      role: req.staffRole || ""
    });
    return res.json({ rows });
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to load the delivery queue.");
  }
});
router$8.post("/delivery-queue/move", requireCoordinator, async (req, res) => {
  const galleryId = String(req.body?.galleryId || "").trim();
  const status = String(req.body?.status || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(galleryId)) {
    return res.status(400).json({ error: "A valid gallery id is required." });
  }
  if (!isMediaDeliveryStatus(status)) {
    return res.status(400).json({ error: "Status must be pending, undelivered, or delivered." });
  }
  if (!adminReady$1(res)) return;
  try {
    const result = await moveMediaDelivery({
      galleryId,
      status,
      expiresInDays: Number(req.body?.expiresInDays)
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    const code = err.status;
    const report = err.report;
    if (code === 409 && report) {
      return res.status(409).json({
        error: err instanceof Error ? err.message : "Gallery stays held.",
        galleryRelease: report.galleryRelease,
        complete: false,
        percent: report.percent,
        gaps: report.gaps
      });
    }
    return sendKnownError$1(res, err, "Failed to update delivery.");
  }
});
router$8.post("/order-edits", requireStaff, async (req, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!adminReady$1(res)) return;
  try {
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    const result = await queueOrderEdits({ listingId, createdBy: req.user.uid });
    return res.status(201).json(result);
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to queue the order edits.");
  }
});
router$8.post("/order-queue/tick", requireStaffOrQueueCron, async (req, res) => {
  let listingId = String(req.body?.listingId || "").trim();
  if (listingId && !/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!listingId && req.user?.uid !== "studio-queue") {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!adminReady$1(res)) return;
  try {
    if (!listingId) {
      const found = await nextOrderEditListingId();
      if (!found) {
        return res.json({ prepared: 0, ran: null, remaining: 0, waiting: 0, shouldFollowUp: false });
      }
      listingId = found;
    } else if (req.user?.uid !== "studio-queue") {
      await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    }
    const result = await advanceOrderEditQueue({
      listingId,
      createdBy: req.user.uid,
      retryFailed: false
    });
    if (req.body?.chain === true && result.shouldFollowUp) kickStudioQueue(listingId);
    return res.json(result);
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to advance the order edit queue.");
  }
});
router$8.post("/iconic-polish", requireStaff, async (req, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (typeof req.body?.iconicPolish !== "boolean") {
    return res.status(400).json({ error: "iconicPolish must be true or false." });
  }
  if (!adminReady$1(res)) return;
  try {
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    const result = await setIconicPolish({ listingId, iconicPolish: req.body.iconicPolish });
    return res.json(result);
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to save Iconic Polish.");
  }
});
router$8.post("/ai-edit", requireStaff, async (req, res) => {
  const parsed = parseAiEditRequest(req.body);
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
  if (!adminReady$1(res)) return;
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
    return sendKnownError$1(res, err, "Failed to enqueue the AI edit.");
  }
});
router$8.post("/adjust", requireStaff, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const sourcePath = String(req.body?.sourcePath || "");
    const fileName2 = String(req.body?.fileName || "adjusted.jpg");
    const dataBase64 = String(req.body?.dataBase64 || "");
    if (!dataBase64) return res.status(400).json({ error: "Adjusted JPEG data is required." });
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    const bytes = Buffer.from(dataBase64, "base64");
    const saved = await saveAdjustedJpeg({
      listingId,
      sourcePath,
      fileName: fileName2,
      adjustments: req.body?.adjustments || {},
      bytes,
      uploadedBy: req.user.uid
    });
    return res.status(201).json({ success: true, ...saved });
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to save the adjustment.");
  }
});
router$8.post("/reject", requireStaff, async (req, res) => {
  if (!adminReady$1(res)) return;
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
    return sendKnownError$1(res, err, "Failed to reject the edit.");
  }
});
router$8.post("/approve", requireStaff, async (req, res) => {
  if (!adminReady$1(res)) return;
  try {
    const listingId = String(req.body?.listingId || "");
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
    let sourcePath = String(req.body?.sourcePath || "");
    let fileName2 = typeof req.body?.fileName === "string" ? req.body.fileName : "";
    await assertStudioAccess(req.user.uid, req.staffRole || "", listingId);
    if (jobId) {
      const jobSnap = await admin.firestore().collection("editJobs").doc(jobId).get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Edit job not found." });
      const job = jobSnap.data() || {};
      if (job.listingId !== listingId) return res.status(400).json({ error: "That job is for a different listing." });
      const resolved = resolveStudioApprovePath(job, sourcePath);
      if (resolved.ok === false) return res.status(400).json({ error: resolved.error });
      sourcePath = resolved.sourcePath;
      if (!fileName2) fileName2 = sourcePath.split("/").pop() || "final.jpg";
    }
    if (!sourcePath) return res.status(400).json({ error: "sourcePath is required." });
    const result = await approveStudioFinal({
      listingId,
      sourcePath,
      fileName: fileName2,
      uploadedBy: req.user.uid,
      jobId: jobId || void 0
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return sendKnownError$1(res, err, "Failed to approve the final.");
  }
});
const GRASS_REFERENCE_PUBLIC_PATH = "/studio/grass-reference.jpg";
const GRASS_REFERENCE_RELATIVE_PATH = "public/studio/grass-reference.jpg";
const SCRATCH_MAX_BYTES = 4e6;
const SCRATCH_PROMPT_MAX = 2e3;
const SCRATCH_PROMPT_HEADER = "x-scratch-prompt";
const SCRATCH_NAME_HEADER = "x-scratch-filename";
const SCRATCH_ACTION_HEADER = "x-scratch-action";
const SCRATCH_ACTIONS = ["edit", "revise", "twilight", "grass"];
const GRASS_REPLACE_PROMPT = "Replace the lawn in the first image with healthy, even grass that matches the second image, the grass reference. Keep the house, hardscape, trees, sky, lighting, and camera angle. Change only the lawn.";
const GRASS_REFERENCE_MISSING_NOTE = "Grass reference is missing. Add Cadi's lawn JPEG at public/studio/grass-reference.jpg (or set STUDIO_GRASS_REFERENCE_PATH).";
function decodeScratchHeader(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function parseScratchEdit(input) {
  const type = input.contentType.split(";")[0].trim().toLowerCase();
  if (type !== "image/jpeg") return { ok: false, error: "Scratch pad edits JPEGs. Drop a .jpg." };
  if (!input.byteLength) return { ok: false, error: "That photo was empty." };
  if (input.byteLength > SCRATCH_MAX_BYTES) {
    return { ok: false, error: "That photo is too large for the scratch pad. Export a smaller JPEG." };
  }
  const action = input.action.trim().toLowerCase();
  if (!SCRATCH_ACTIONS.includes(action)) {
    return { ok: false, error: "Unknown scratch action." };
  }
  if (action === "twilight") {
    return { ok: true, action: "twilight", prompt: orderExteriorTwilightPrompt(), attachGrass: false };
  }
  if (action === "grass") {
    return { ok: true, action: "grass", prompt: GRASS_REPLACE_PROMPT, attachGrass: true };
  }
  const userPrompt = input.prompt.trim().replace(/\s+/g, " ").slice(0, SCRATCH_PROMPT_MAX);
  if (userPrompt.length < 3) return { ok: false, error: "Describe the edit." };
  return { ok: true, action, prompt: userPrompt, attachGrass: false };
}
function scratchDownloadName(fileName2) {
  const baseName = fileName2.split(/[/\\]/).pop() || "scratch";
  const base = baseName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
  return `${base || "scratch"}-edit.jpg`;
}
function grassReferenceCandidates(env = process.env, cwd = process.cwd()) {
  const override = typeof env.STUDIO_GRASS_REFERENCE_PATH === "string" ? env.STUDIO_GRASS_REFERENCE_PATH.trim() : "";
  if (override) return [override];
  return [
    path.join(cwd, GRASS_REFERENCE_RELATIVE_PATH),
    path.join(cwd, "dist/spa/studio/grass-reference.jpg")
  ];
}
function isJpeg(bytes) {
  return bytes.length > 32 && bytes[0] === 255 && bytes[1] === 216;
}
async function readGrassReference(env = process.env) {
  for (const filePath of grassReferenceCandidates(env)) {
    try {
      const bytes = await fs.readFile(filePath);
      if (isJpeg(bytes)) return { bytes, contentType: "image/jpeg", path: filePath };
    } catch {
    }
  }
  throw new OpenAiEditError(GRASS_REFERENCE_MISSING_NOTE, 503);
}
async function grassReferenceStatus(env = process.env) {
  try {
    await readGrassReference(env);
    return {
      ready: true,
      publicPath: GRASS_REFERENCE_PUBLIC_PATH,
      note: "Using the lawn reference at /studio/grass-reference.jpg."
    };
  } catch (err) {
    return {
      ready: false,
      publicPath: GRASS_REFERENCE_PUBLIC_PATH,
      note: err instanceof Error ? err.message : GRASS_REFERENCE_MISSING_NOTE
    };
  }
}
async function editScratchPhoto(input) {
  const parsed = parseScratchEdit({
    action: input.action,
    prompt: input.prompt,
    byteLength: input.bytes.length,
    contentType: input.contentType
  });
  if (parsed.ok === false) throw new OpenAiEditError(parsed.error, 400);
  let references;
  if (parsed.attachGrass) {
    const grass = input.readGrass ? await input.readGrass() : await readGrassReference(input.env);
    references = [{ bytes: grass.bytes, contentType: grass.contentType, filename: "grass-reference.jpg" }];
  }
  const apiKey = readOpenAiApiKey(input.env ?? process.env);
  if (!apiKey) throw new OpenAiEditError(AI_EDIT_MISSING_KEY_NOTE, 503);
  const edited = await editListingPhotoWithOpenAI({
    apiKey,
    prompt: realEstateEditPrompt(parsed.prompt),
    bytes: input.bytes,
    contentType: "image/jpeg",
    references,
    fetchImpl: input.fetchImpl
  });
  return {
    bytes: edited.bytes,
    contentType: edited.contentType,
    downloadName: scratchDownloadName(input.fileName || "scratch.jpg")
  };
}
const router$7 = Router();
function headerValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}
router$7.get("/", requireCoordinator, async (_req, res) => {
  const grass = await grassReferenceStatus();
  return res.json({ grass, twilightPrompt: orderExteriorTwilightPrompt() });
});
router$7.post(
  "/",
  requireCoordinator,
  express.raw({ type: "image/jpeg", limit: "4mb" }),
  async (req, res) => {
    try {
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const edited = await editScratchPhoto({
        action: headerValue(req.headers[SCRATCH_ACTION_HEADER]) || "edit",
        prompt: decodeScratchHeader(headerValue(req.headers[SCRATCH_PROMPT_HEADER])),
        fileName: decodeScratchHeader(headerValue(req.headers[SCRATCH_NAME_HEADER])),
        bytes,
        contentType: headerValue(req.headers["content-type"]) || ""
      });
      res.setHeader("Content-Type", edited.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${edited.downloadName}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(edited.bytes);
    } catch (err) {
      const status = err instanceof OpenAiEditError && err.status ? err.status : 502;
      const message = err instanceof Error ? err.message : "The scratch edit failed.";
      if (status >= 500) console.error("[Studio scratch]", message);
      return res.status(status).json({ error: message });
    }
  }
);
router$7.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "That photo is too large for the scratch pad. Export a smaller JPEG." });
  }
  return next(err);
});
const router$6 = Router();
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
router$6.get("/autocomplete", async (req, res) => {
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
router$6.get("/distance", async (req, res) => {
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
const router$5 = Router();
const db$1 = () => admin.firestore();
async function findOrderLikeDocument(id) {
  const orderRequestDoc = await db$1().collection("orderRequests").doc(id).get();
  if (orderRequestDoc.exists) return orderRequestDoc;
  const orderDoc = await db$1().collection("orders").doc(id).get();
  if (orderDoc.exists) return orderDoc;
  return null;
}
router$5.post("/send", requireStaff, async (req, res) => {
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
router$5.post("/remind/:orderId", requireStaff, async (req, res) => {
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
    const date = bookingDateLabel(order.scheduledDate, "your scheduled date");
    const time = order.scheduledTime || "your appointment time";
    const address = recordAddressText(order) || "the property";
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
router$5.post("/conversation", requireStaff, async (req, res) => {
  try {
    const { orderId, photographerPhone, photographerName, clientPhone, clientName: clientName2 } = req.body;
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
      `Order ${orderId} — ${photographerName || "Photographer"} + ${clientName2 || "Client"}`,
      { phone: photographerPhone, name: photographerName },
      { phone: clientPhone, name: clientName2 },
      webhookUrl
    );
    await db$1().collection("conversations").add({
      orderId,
      conversationSid: result.conversationSid,
      photographerPhone: normalisePhone(photographerPhone),
      photographerName: photographerName || null,
      photographerParticipantSid: result.photographerParticipantSid,
      clientPhone: normalisePhone(clientPhone),
      clientName: clientName2 || null,
      clientParticipantSid: result.clientParticipantSid,
      status: "active",
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await sendConversationMessage(
      result.conversationSid,
      `Hi! This is a private message channel for your Iconic Images appointment. ${photographerName || "Your photographer"} and ${clientName2 || "your client"} are connected here. Neither party can see each other's phone number. 📸`
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Conversation error:", errorMessage);
    return res.status(500).json({ error: errorMessage });
  }
});
router$5.get("/conversations", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$1().collection("conversations").orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch conversations." });
  }
});
router$5.post("/conversation/:id/close", requireStaff, async (req, res) => {
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
router$5.post("/webhook", express_raw_or_json, async (req, res) => {
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
router$5.post("/campaign/:id/send", requireCoordinator, async (req, res) => {
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
router$5.post("/opt-out", async (req, res) => {
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
const router$4 = Router();
router$4.post("/", async (req, res) => {
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
    const digits2 = phone.replace(/\D/g, "");
    if (digits2.length < 10 || digits2.length > 15) {
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
function escapeHtml$2(value) {
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
        senderName: escapeHtml$2(input.name),
        senderEmail: escapeHtml$2(input.email || "Not provided"),
        senderPhone: escapeHtml$2(input.phone || "Not provided"),
        message: escapeHtml$2(input.message)
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
const router$3 = Router();
const liveChatLimiter = createRateLimiter({
  windowMs: LIVE_CHAT_WINDOW_MS,
  max: LIVE_CHAT_MAX_PER_WINDOW
});
router$3.post("/live-chat", async (req, res) => {
  const parsed = parseLiveChatBody(req.body);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }
  const limit = liveChatLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many messages. Please wait a few minutes or call us at ${BUSINESS_CONTACT.phoneDisplay}.`
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
        error: `Chat delivery isn't set up on this server yet. Please call ${BUSINESS_CONTACT.phoneDisplay}.`
      });
    }
    return res.status(500).json({
      error: `We couldn't deliver your message. Please try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`
    });
  }
});
const COLLECTION = "contactThreads";
const MAX_THREAD_MESSAGES = 200;
const TOKEN_BYTES = 32;
function newId() {
  return randomBytes$1(16).toString("hex");
}
function newToken() {
  return randomBytes$1(TOKEN_BYTES).toString("hex");
}
function tokensMatch(stored, provided) {
  if (!stored || !provided || stored.length !== provided.length || stored.length > 128) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(provided));
}
function trimMessages(messages) {
  if (messages.length <= MAX_THREAD_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_THREAD_MESSAGES);
}
function toContactThreadView(thread) {
  return {
    id: thread.id,
    name: thread.name,
    ...thread.email ? { email: thread.email } : {},
    ...thread.phone ? { phone: thread.phone } : {},
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: thread.messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      senderName: message.senderName,
      text: message.text,
      createdAt: message.createdAt
    }))
  };
}
function asRecord(data) {
  if (!data || typeof data !== "object") return null;
  const raw = data;
  if (typeof raw.id !== "string" || typeof raw.accessToken !== "string") return null;
  const messages = Array.isArray(raw.messages) ? raw.messages.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const msg = item;
    if (typeof msg.id !== "string" || typeof msg.text !== "string") return [];
    if (msg.sender !== "client" && msg.sender !== "staff") return [];
    return [{
      id: msg.id,
      sender: msg.sender,
      senderName: typeof msg.senderName === "string" && msg.senderName.trim() ? msg.senderName : "Iconic Images",
      text: msg.text,
      createdAt: typeof msg.createdAt === "string" ? msg.createdAt : (/* @__PURE__ */ new Date(0)).toISOString()
    }];
  }) : [];
  return {
    id: raw.id,
    accessToken: raw.accessToken,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Visitor",
    ...typeof raw.email === "string" && raw.email ? { email: raw.email } : {},
    ...typeof raw.phone === "string" && raw.phone ? { phone: raw.phone } : {},
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    messages
  };
}
function createMemoryStore() {
  const rows = /* @__PURE__ */ new Map();
  return {
    async get(id) {
      return rows.get(id) ?? null;
    },
    async insert(thread) {
      rows.set(thread.id, thread);
    },
    async update(id, change) {
      const current = rows.get(id);
      if (!current) return null;
      const next = change(current);
      if (!next) return null;
      rows.set(id, next);
      return next;
    },
    async listRecent(limit) {
      return [...rows.values()].sort((a, b) => a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0).slice(0, limit);
    },
    clear() {
      rows.clear();
    }
  };
}
function createFirestoreStore() {
  const db2 = () => admin.firestore();
  const col = () => db2().collection(COLLECTION);
  return {
    async get(id) {
      const snap = await col().doc(id).get();
      if (!snap.exists) return null;
      return asRecord(snap.data());
    },
    async insert(thread) {
      await col().doc(thread.id).set(thread);
    },
    async update(id, change) {
      const ref = col().doc(id);
      return db2().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const current = asRecord(snap.data());
        if (!current) return null;
        const next = change(current);
        if (!next) return null;
        tx.set(ref, next);
        return next;
      });
    },
    async listRecent(limit) {
      const snap = await col().orderBy("updatedAt", "desc").limit(limit).get();
      return snap.docs.map((doc) => asRecord(doc.data())).filter((row) => Boolean(row));
    },
    clear() {
    }
  };
}
const memoryStore = createMemoryStore();
let firestoreStore = null;
function activeStore() {
  if (process.env.CONTACT_THREAD_STORE === "memory" || admin.apps.length === 0) {
    return memoryStore;
  }
  if (!firestoreStore) firestoreStore = createFirestoreStore();
  return firestoreStore;
}
function clientMessage(input, createdAt) {
  return {
    id: newId(),
    sender: "client",
    senderName: input.name,
    text: input.message,
    createdAt
  };
}
function withClientMessage(current, input, createdAt) {
  return {
    ...current,
    name: input.name,
    ...input.email ? { email: input.email } : {},
    ...input.phone ? { phone: input.phone } : {},
    updatedAt: createdAt,
    messages: trimMessages([...current.messages, clientMessage(input, createdAt)])
  };
}
async function startClientThread(input) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const accessToken = newToken();
  const thread = {
    id: newId(),
    accessToken,
    name: input.name,
    ...input.email ? { email: input.email } : {},
    ...input.phone ? { phone: input.phone } : {},
    createdAt,
    updatedAt: createdAt,
    messages: [clientMessage(input, createdAt)]
  };
  await activeStore().insert(thread);
  return { thread: toContactThreadView(thread), accessToken };
}
async function continueClientThread(id, accessToken, input) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const updated = await activeStore().update(id, (current) => {
    if (!tokensMatch(current.accessToken, accessToken)) return null;
    return withClientMessage(current, input, createdAt);
  });
  if (!updated) return null;
  return { thread: toContactThreadView(updated), accessToken: updated.accessToken };
}
async function readClientThread(id, accessToken) {
  const thread = await activeStore().get(id);
  if (!thread || !tokensMatch(thread.accessToken, accessToken)) return null;
  return toContactThreadView(thread);
}
async function listContactThreads() {
  const threads = await activeStore().listRecent(100);
  return threads.map(toContactThreadView);
}
async function appendStaffReply(id, text2, senderName = "Iconic Images") {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const message = {
    id: newId(),
    sender: "staff",
    senderName: senderName.trim() || "Iconic Images",
    text: text2,
    createdAt
  };
  const updated = await activeStore().update(id, (current) => ({
    ...current,
    updatedAt: createdAt,
    messages: trimMessages([...current.messages, message])
  }));
  return updated ? toContactThreadView(updated) : null;
}
const router$2 = Router();
const THREAD_ID_RE = /^[a-f0-9]{32}$/;
const postLimiter = createRateLimiter({
  windowMs: LIVE_CHAT_WINDOW_MS,
  max: LIVE_CHAT_MAX_PER_WINDOW
});
function routeParam(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : "";
}
function threadToken(req) {
  const header = req.header("x-contact-thread-token");
  return typeof header === "string" ? header.trim() : "";
}
router$2.get("/staff/threads", requireCoordinator, async (_req, res) => {
  try {
    const threads = await listContactThreads();
    return res.json({ threads });
  } catch (error) {
    console.error("[ContactThread] List failed.", error);
    return res.status(500).json({ error: "Couldn't load contact chats." });
  }
});
router$2.post("/staff/threads/:id/reply", requireCoordinator, async (req, res) => {
  const id = routeParam(req.params.id);
  if (!THREAD_ID_RE.test(id)) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    return res.status(400).json({ error: "Please enter a reply." });
  }
  if (message.length > 2e3) {
    return res.status(400).json({ error: "Reply is too long. Please keep it under 2,000 characters." });
  }
  try {
    const thread = await appendStaffReply(id, message, "Iconic Images");
    if (!thread) return res.status(404).json({ error: "Conversation not found." });
    return res.json({ thread });
  } catch (error) {
    console.error("[ContactThread] Staff reply failed.", error);
    return res.status(500).json({ error: "Couldn't save the reply." });
  }
});
router$2.get("/threads/:id", async (req, res) => {
  const id = routeParam(req.params.id);
  const token = threadToken(req);
  if (!THREAD_ID_RE.test(id) || !token) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  try {
    const thread = await readClientThread(id, token);
    if (!thread) return res.status(404).json({ error: "Conversation not found." });
    return res.json({ thread });
  } catch (error) {
    console.error("[ContactThread] Read failed.", error);
    return res.status(500).json({ error: "Couldn't load this chat." });
  }
});
router$2.post("/threads", async (req, res) => {
  const parsed = parseLiveChatBody(req.body);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }
  const limit = postLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({
      error: `Too many messages. Please wait a few minutes or call us at ${BUSINESS_CONTACT.phoneDisplay}.`
    });
  }
  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId.trim() : "";
  const accessToken = typeof req.body?.accessToken === "string" ? req.body.accessToken.trim() : "";
  if (threadId && !accessToken || !threadId && accessToken) {
    return res.status(400).json({ error: "Conversation credentials are incomplete." });
  }
  try {
    if (threadId) {
      if (!THREAD_ID_RE.test(threadId)) {
        return res.status(404).json({ error: "Conversation not found." });
      }
      const continued = await continueClientThread(threadId, accessToken, parsed.value);
      if (!continued) return res.status(404).json({ error: "Conversation not found." });
      return res.json(continued);
    }
    const created = await startClientThread(parsed.value);
    return res.status(201).json(created);
  } catch (error) {
    console.error("[ContactThread] Client message failed.", error);
    return res.status(500).json({
      error: `We couldn't save your message. Please try again, or call ${BUSINESS_CONTACT.phoneDisplay}.`
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
  const fileName2 = safeFileName(req.query.name);
  const objectPath = `listings/${id}/photos/${Date.now()}_${fileName2.replace(/\.\w+$/, "")}.jpg`;
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
      name: fileName2,
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
function listingDrafts(listing, hidden) {
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
    if (rowHiddenFromPresentation(row, hidden)) return;
    pushDraft(drafts, row, index, folders);
  });
  return drafts;
}
function galleryDrafts(galleries, start, hidden) {
  const drafts = [];
  let index = start;
  for (const gallery of galleries || []) {
    const buckets = [gallery.mediaItems, gallery.images];
    for (const bucket2 of buckets) {
      if (!Array.isArray(bucket2)) continue;
      for (const item of bucket2) {
        if (!item || typeof item !== "object") continue;
        const row = item;
        if (rowHiddenFromPresentation(row, hidden)) continue;
        pushDraft(drafts, row, index, /* @__PURE__ */ new Map());
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
  const hidden = hiddenPresentationKeys(source.listing);
  const fromListing = listingDrafts(source.listing, hidden);
  const fromGalleries = galleryDrafts(source.galleries, fromListing.length, hidden);
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
  if (labeled !== "Untitled listing") return { address: labeled, street: labeled, locality: "" };
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
  const clientName2 = "";
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
    clientName: clientName2,
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
    `<title>${escapeHtml$1(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml$1(meta.description)}" />`,
    `<meta name="robots" content="noindex, nofollow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml$1(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml$1(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml$1(meta.url)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml$1(meta.image)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml$1(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml$1(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml$1(meta.image)}" />` : ""
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
function escapeHtml$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const router$1 = Router();
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
router$1.get("/presentations/:token", async (req, res) => {
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
router$1.get("/presentations/shell/:token", async (req, res) => {
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
    const shell = await readSpaShell$1();
    const html = shell ? injectPresentationMeta(shell, presentation.meta) : standalonePresentation(presentation);
    return { status: 200, html };
  } catch (err) {
    console.error("[Presentation] Shell failed.", err);
    return { status: 500, html: "<!doctype html><title>Presentation</title><p>This presentation could not be opened.</p>" };
  }
}
router$1.post("/listings/:id/presentation", requireStaff, async (req, res) => {
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
async function readSpaShell$1() {
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
      <figcaption style="position:absolute;left:1.25rem;bottom:1.5rem;color:#fff;font-family:Georgia,serif;font-size:2rem">${escapeHtml(photo.room || String(index + 1))}</figcaption>
    </figure>`).join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(presentation.meta.title)}</title>
  </head>
  <body style="margin:0;background:#070708;color:#fff">
    <header style="min-height:100svh;display:flex;align-items:flex-end;padding:2rem;background:#111 url('${escapeAttr(hero?.url || "")}') center/cover">
      <div>
        <p style="letter-spacing:.28em;text-transform:uppercase;font:600 11px/1 sans-serif">Iconic Images</p>
        <h1 style="font:500 4rem/0.95 Georgia,serif;margin:.4rem 0">${escapeHtml(title)}</h1>
      </div>
    </header>
    ${figures}
  </body>
</html>`;
  return injectPresentationMeta(html, presentation.meta);
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
const router = Router();
function adminReady(res) {
  if (admin.apps.length) return true;
  res.status(503).json({ error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT." });
  return false;
}
function sendKnownError(res, err, fallback) {
  const status = err instanceof PhotoEditRequestError ? err.status : err.status;
  if (status && status >= 400 && status < 500 || status === 503) {
    return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
  }
  console.error("[Photo edit request]", err);
  return res.status(500).json({ error: fallback });
}
async function advance(req, res, to) {
  if (!adminReady(res)) return;
  const listingId = portalListingId(req.params.id);
  const requestId = typeof req.params.requestId === "string" ? req.params.requestId.trim() : "";
  if (!listingId || !requestId) return res.status(400).json({ error: "That edit request could not be found." });
  try {
    const request = await markPhotoEditRequest({
      listingId,
      requestId,
      to,
      actorId: req.user.uid,
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return res.json({ request });
  } catch (err) {
    return sendKnownError(res, err, "Could not update that edit request.");
  }
}
router.post("/listings/:id/photo-edit-requests/:requestId/sent", requireStaff, async (req, res) => {
  return advance(req, res, "sent_out");
});
router.post("/listings/:id/photo-edit-requests/:requestId/received", requireStaff, async (req, res) => {
  return advance(req, res, "received_back");
});
router.post("/listings/:id/photo-edit-requests/:requestId/replacement", requireStaff, async (req, res) => {
  if (!adminReady(res)) return;
  const listingId = portalListingId(req.params.id);
  const requestId = typeof req.params.requestId === "string" ? req.params.requestId.trim() : "";
  if (!listingId || !requestId) return res.status(400).json({ error: "That edit request could not be found." });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const bytes = decodeReplacementBytes(body.dataBase64);
  if (!bytes) return res.status(400).json({ error: "The replacement file was empty." });
  try {
    const request = await savePhotoEditReplacement({
      listingId,
      requestId,
      fileName: typeof body.fileName === "string" ? body.fileName : "replacement.jpg",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      bytes,
      actorId: req.user.uid,
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return res.json({ request });
  } catch (err) {
    return sendKnownError(res, err, "Could not attach that replacement.");
  }
});
function ownerAllowlist(raw) {
  if (raw == null) return [];
  const emails = raw.split(/[,;\s]+/).map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@"));
  return [...new Set(emails)];
}
function isOwnerEmail(email, allowlist) {
  if (!email) return false;
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
const OWNER_FIXTURE_BEARER = "owner-fixture";
const OWNER_SESSION_COOKIE = "owners_session";
const SESSION_MS = 12 * 60 * 60 * 1e3;
const BLOCKED_BEARERS = /* @__PURE__ */ new Set(["temp-admin-token", OWNER_FIXTURE_BEARER]);
let tokenVerifier = defaultVerifyIdToken;
function ownerRuntimeEnv(env = process.env) {
  return {
    OWNER_EMAILS: env.OWNER_EMAILS,
    OWNER_SUITE_FIXTURES: env.OWNER_SUITE_FIXTURES,
    OWNER_SESSION_SECRET: env.OWNER_SESSION_SECRET,
    OWNER_SHEETS_SA_EMAIL: env.OWNER_SHEETS_SA_EMAIL,
    OWNER_SHEETS_SA_KEY: env.OWNER_SHEETS_SA_KEY,
    FIREBASE_SERVICE_ACCOUNT: env.FIREBASE_SERVICE_ACCOUNT,
    VERCEL: env.VERCEL,
    VERCEL_ENV: env.VERCEL_ENV,
    NODE_ENV: env["NODE_ENV"]
  };
}
function ownerFixturesEnabled(env = ownerRuntimeEnv()) {
  if (env.OWNER_SUITE_FIXTURES !== "true") return false;
  return !isHostedDeployment(env);
}
function ownerSessionSecret(env = ownerRuntimeEnv()) {
  const explicit = env.OWNER_SESSION_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount && serviceAccount.length >= 32) {
    return createHmac("sha256", "iconic-owners-suite-v1").update(serviceAccount).digest("hex");
  }
  const sheetsKey = env.OWNER_SHEETS_SA_KEY;
  if (sheetsKey && sheetsKey.length >= 32) {
    return createHmac("sha256", "iconic-owners-suite-v1").update(sheetsKey).digest("hex");
  }
  return null;
}
function signOwnerSession(identity, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({
    email: identity.email.trim().toLowerCase(),
    uid: identity.uid,
    exp: now + SESSION_MS
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function readOwnerSession(token, secret, now = Date.now()) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual$1(actualBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!parsed.email || !parsed.uid || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return { email: parsed.email.trim().toLowerCase(), uid: parsed.uid };
  } catch {
    return null;
  }
}
function sessionCookieHeader(token, env = ownerRuntimeEnv(), maxAge = SESSION_MS / 1e3) {
  const secure = isHostedDeployment(env);
  const parts = [
    `${OWNER_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
async function resolveOwnerIdentity(headers, env = ownerRuntimeEnv()) {
  const allow = ownerAllowlist(env.OWNER_EMAILS);
  if (allow.length === 0) return null;
  const authorization = headerString(headers.authorization);
  if (ownerFixturesEnabled(env) && authorization === `Bearer ${OWNER_FIXTURE_BEARER}`) {
    return { email: allow[0], uid: "owner-fixture" };
  }
  const secret = ownerSessionSecret(env);
  const cookie = readCookie(headerString(headers.cookie), OWNER_SESSION_COOKIE);
  if (cookie && secret) {
    const session = readOwnerSession(cookie, secret);
    if (session && isOwnerEmail(session.email, allow)) return session;
  }
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token || BLOCKED_BEARERS.has(token)) return null;
  const verified = await tokenVerifier(token);
  const email = verified?.email?.trim().toLowerCase();
  if (!email || !verified?.uid || !isOwnerEmail(email, allow)) return null;
  return { email, uid: verified.uid };
}
async function defaultVerifyIdToken(token) {
  if (!admin.apps.length) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { email: decoded.email, uid: decoded.uid };
  } catch {
    return null;
  }
}
function headerString(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}
function readCookie(header, name) {
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return rest.join("=") || null;
  }
  return null;
}
const PLAN_BUSINESSES = [
  "Iconic Images M&M",
  "Iconic Studios",
  "aICON",
  "Iconic Virtual",
  "DOT",
  "KDP"
];
const HEADER_KEYS = ["business", "section", "item", "date", "amount", "status", "notes"];
const BUSINESS_ALIASES = {
  "iconic images m m": "Iconic Images M&M",
  "iconic images mm": "Iconic Images M&M",
  "iconic images m and m": "Iconic Images M&M",
  "iconic studios": "Iconic Studios",
  "iconic studio": "Iconic Studios",
  aicon: "aICON",
  "a icon": "aICON",
  "iconic virtual": "Iconic Virtual",
  dot: "DOT",
  kdp: "KDP"
};
function emptyPlanBoard() {
  return {
    columns: PLAN_BUSINESSES.map((business2) => ({
      business: business2,
      revenue: null,
      expenses: null,
      calendar: [],
      social: [],
      events: [],
      email: [],
      todos: []
    }))
  };
}
function parsePlanBoard(sheets) {
  const board = emptyPlanBoard();
  try {
    const sheet = findPlanSheet(sheets);
    if (!sheet) return board;
    const rows = cleanRows(sheet.rows);
    const headerAt = rows.findIndex((row) => headerMap(row) != null);
    if (headerAt < 0) return board;
    const headers = headerMap(rows[headerAt]);
    if (!headers) return board;
    const lists = /* @__PURE__ */ new Map();
    for (const business2 of PLAN_BUSINESSES) {
      lists.set(business2, { calendar: [], social: [], events: [], email: [], todos: [] });
    }
    const money2 = /* @__PURE__ */ new Map();
    for (const business2 of PLAN_BUSINESSES) {
      money2.set(business2, { revenue: null, expenses: null, sawRevenue: false, sawExpense: false });
    }
    rows.slice(headerAt + 1).forEach((row, index) => {
      const business2 = businessOf(cellAt(row, headers.business));
      const kind = sectionOf(cellAt(row, headers.section));
      if (!business2 || !kind) return;
      const purse = money2.get(business2);
      const buckets = lists.get(business2);
      if (!purse || !buckets) return;
      if (kind === "revenue" || kind === "expense") {
        const amount = parseMoney(cellAt(row, headers.amount));
        if (kind === "revenue") {
          purse.sawRevenue = true;
          if (amount != null) purse.revenue = roundMoney((purse.revenue ?? 0) + amount);
        } else {
          purse.sawExpense = true;
          if (amount != null) purse.expenses = roundMoney((purse.expenses ?? 0) + amount);
        }
        return;
      }
      const item = cellAt(row, headers.item);
      if (!item) return;
      const status = cellAt(row, headers.status);
      buckets[kind].push({
        item,
        date: dateKey(cellAt(row, headers.date)),
        amount: parseMoney(cellAt(row, headers.amount)),
        status: status || null,
        notes: cellAt(row, headers.notes) || null,
        done: kind === "todos" && isDone(status),
        index
      });
    });
    for (const column of board.columns) {
      const purse = money2.get(column.business);
      const buckets = lists.get(column.business);
      if (!purse || !buckets) continue;
      column.revenue = purse.sawRevenue ? purse.revenue ?? 0 : null;
      column.expenses = purse.sawExpense ? purse.expenses ?? 0 : null;
      column.calendar = sortLines(buckets.calendar);
      column.social = sortLines(buckets.social);
      column.events = sortLines(buckets.events);
      column.email = sortLines(buckets.email);
      column.todos = sortLines(buckets.todos);
    }
    return board;
  } catch {
    return emptyPlanBoard();
  }
}
function findPlanSheet(sheets) {
  if (!Array.isArray(sheets)) return void 0;
  return sheets.find((sheet) => {
    if (!sheet || typeof sheet !== "object") return false;
    const title = normalizeTabTitle(String(sheet.title || ""));
    return title === "plan board" || title.includes("plan board");
  });
}
function cleanRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => Array.isArray(row) ? row.map((item) => item == null ? "" : String(item).trim()) : []);
}
function headerMap(row) {
  const map = {};
  row.forEach((value, index) => {
    const key = value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    if (HEADER_KEYS.includes(key) && map[key] == null) {
      map[key] = index;
    }
  });
  if (map.business == null || map.section == null) return null;
  return map;
}
function cellAt(row, index) {
  if (index == null) return "";
  return row[index] || "";
}
function businessOf(value) {
  const key = value.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return BUSINESS_ALIASES[key] || null;
}
function sectionOf(value) {
  const key = value.toLowerCase().replace(/[^a-z]+/g, "");
  if (key === "revenue") return "revenue";
  if (key === "expense" || key === "expenses") return "expense";
  if (key === "calendar") return "calendar";
  if (key === "social" || key === "socials") return "social";
  if (key === "event" || key === "events" || key === "promo" || key === "promos" || key === "promotion" || key === "promotions") return "events";
  if (key === "email" || key === "emails") return "email";
  if (key === "todo" || key === "todos") return "todos";
  return null;
}
function isDone(status) {
  const key = status.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return key === "done" || key === "complete" || key === "completed";
}
function dateKey(value) {
  const text2 = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text2)) return text2;
  const slash = text2.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  const month = slash[1].padStart(2, "0");
  const day = slash[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}
function sortLines(lines) {
  return [...lines].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.index - b.index;
  }).map(({ index: _index, ...line }) => line);
}
const WEEK_AMOUNT = ["cash this week", "this week cash", "collected this week", "week collected", "revenue this week"];
const WEEK_GOAL = ["week goal", "this week goal", "weekly goal", "goal this week"];
const MONTH_AMOUNT = ["cash this month", "this month cash", "collected this month", "month collected", "revenue this month", "mtd cash", "month to date"];
const MONTH_GOAL = ["month goal", "this month goal", "monthly goal", "goal this month"];
const SAVINGS_AMOUNT = ["savings", "savings balance", "saved", "reserve balance"];
const SAVINGS_GOAL = ["savings goal", "reserve goal", "savings target"];
const MONEY_SECTIONS = ["money in", "money in by payment", "payments", "by payment", "payment method"];
const AR_SECTIONS = ["accounts receivable", "receivables", "money owed to us", "outstanding invoices", "ar"];
const OWE_SECTIONS = ["owes", "we owe", "accounts payable", "bills"];
const CLOSED_DECISIONS = /* @__PURE__ */ new Set(["done", "closed", "decided", "yes", "no", "approved", "declined", "complete", "completed", "settled"]);
function normalizeTabTitle(title) {
  return title.toLowerCase().replace(/\$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function emptyOwnerSuiteData(now = /* @__PURE__ */ new Date()) {
  return {
    generatedAt: now.toISOString(),
    cashWeek: { amount: null, goal: null },
    cashMonth: { amount: null, goal: null },
    savings: { amount: null, goal: null, note: null },
    moneyIn: [],
    receivables: [],
    owes: [],
    businesses: [],
    today: [],
    calendar: [],
    decisions: [],
    tracker: { goal: null, current: null, rows: [] },
    horizons: [],
    bots: { state: "unknown", entries: [] },
    planBoard: emptyPlanBoard()
  };
}
function parseOwnerSuite(sheets, now = /* @__PURE__ */ new Date()) {
  const data = emptyOwnerSuiteData(now);
  const safeSheets = Array.isArray(sheets) ? sheets : [];
  data.cashWeek = {
    amount: labeledNumber(safeSheets, WEEK_AMOUNT, WEEK_GOAL),
    goal: labeledNumber(safeSheets, WEEK_GOAL)
  };
  data.cashMonth = {
    amount: labeledNumber(safeSheets, MONTH_AMOUNT, MONTH_GOAL),
    goal: labeledNumber(safeSheets, MONTH_GOAL)
  };
  data.savings = {
    amount: labeledNumber(safeSheets, SAVINGS_AMOUNT, SAVINGS_GOAL),
    goal: labeledNumber(safeSheets, SAVINGS_GOAL),
    note: labeledNote(findSheet(safeSheets, ["friday scorecard", "scorecard"])?.rows || [], SAVINGS_AMOUNT, SAVINGS_GOAL)
  };
  data.moneyIn = moneyIn(safeSheets);
  data.receivables = parties(safeSheets, AR_SECTIONS, ["receivable", "ar", "outstanding"]);
  data.owes = owes(safeSheets);
  data.businesses = businesses(findSheet(safeSheets, ["businesses", "business"]));
  const plan = weekPlan(findSheet(safeSheets, ["this week"]), now);
  data.today = plan.today;
  data.calendar = plan.calendar;
  data.decisions = decisions(findSheet(safeSheets, ["decisions", "needs your yes"]));
  data.tracker = tracker(findSheet(safeSheets, ["100k tracker", "100k"]));
  data.horizons = horizons(findSheet(safeSheets, ["30 60 90"]));
  data.bots = bots(findSheet(safeSheets, ["action log", "bot log"]));
  try {
    data.planBoard = parsePlanBoard(safeSheets);
  } catch {
    data.planBoard = emptyPlanBoard();
  }
  return data;
}
function findSheet(sheets, aliases) {
  return sheets.find((sheet) => {
    const title = normalizeTabTitle(sheet?.title || "");
    return aliases.some((alias) => title === alias || title.includes(alias));
  });
}
function cell(value) {
  if (value == null) return "";
  return String(value).trim();
}
function rowsOf(sheet) {
  if (!sheet || !Array.isArray(sheet.rows)) return [];
  return sheet.rows.map((row) => Array.isArray(row) ? row.map((item) => cell(item)) : []);
}
function parseMoney(raw) {
  const text2 = cell(raw);
  if (!text2 || /^(-|—|n\/a|na|tbd)$/i.test(text2)) return null;
  if (/[a-z]/i.test(text2.replace(/[$%,\s().-]/g, "")) && !/^\$/.test(text2)) return null;
  const negative = /^\(.*\)$/.test(text2) || text2.startsWith("-");
  const numeric2 = text2.replace(/[$,%\s]/g, "").replace(/[()]/g, "");
  if (!numeric2 || numeric2 === "-" || numeric2 === ".") return null;
  const value = Number(numeric2);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}
function parsePercent(raw) {
  const text2 = cell(raw);
  if (!text2) return null;
  const value = parseMoney(text2.replace(/%/g, ""));
  if (value == null) return null;
  if (text2.includes("%") || value > 1) return Math.round(value * 10) / 10;
  return Math.round(value * 1e3) / 10;
}
function norm(value) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim();
}
function matchesAlias(value, aliases, avoid = []) {
  const name = norm(value);
  if (!name) return false;
  if (avoid.some((alias) => name === alias || name.startsWith(`${alias} `))) return false;
  return aliases.some((alias) => name === alias || name.startsWith(`${alias} `) || name.startsWith(`${alias}:`));
}
function inlineNumber(value, aliases) {
  const name = norm(value);
  const alias = aliases.find((item) => name.startsWith(item));
  if (!alias) return null;
  value.slice(value.toLowerCase().indexOf(alias.slice(0, 4)) >= 0 ? 0 : 0);
  const money2 = value.match(/-?\$?\s*\d[\d,]*(?:\.\d+)?%?/);
  if (!money2) return null;
  const before = value.slice(0, money2.index).toLowerCase();
  if (!aliases.some((item) => norm(before).includes(item) || norm(value).startsWith(item))) return null;
  if (norm(before) === "" && !aliases.some((item) => name.startsWith(item))) return null;
  const parsed = parseMoney(money2[0]);
  if (parsed == null) return null;
  if (norm(value) === money2[0].toLowerCase()) return null;
  return parsed;
}
function labeledNumber(sheets, aliases, avoid = []) {
  for (const sheet of sheets) {
    const found = labeledNumberInRows(rowsOf(sheet), aliases, avoid);
    if (found != null) return found;
  }
  return null;
}
function labeledNumberInRows(rows, aliases, avoid = []) {
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const current = rows[r][c] || "";
      if (!matchesAlias(current, aliases, avoid)) continue;
      const inline = inlineNumber(current, aliases);
      if (inline != null) return inline;
      const right = parseMoney(rows[r][c + 1] || "");
      if (right != null) return right;
      const below = rows[r + 1]?.[c] || "";
      if (!matchesAlias(below, aliases, avoid)) {
        const down = parseMoney(below);
        if (down != null) return down;
      }
    }
  }
  return null;
}
function labeledNote(rows, aliases, avoid) {
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      if (!matchesAlias(rows[r][c] || "", aliases, avoid)) continue;
      const notes = rows[r].slice(c + 1).filter((item) => item && parseMoney(item) == null && !matchesAlias(item, [...aliases, ...avoid]));
      return notes[0] || null;
    }
  }
  return null;
}
function sectionBlock(rows, aliases) {
  for (let r = 0; r < rows.length; r += 1) {
    const filled = rows[r].filter(Boolean);
    if (filled.length !== 1 || !matchesAlias(filled[0], aliases)) continue;
    const block = [];
    for (let i = r + 1; i < rows.length; i += 1) {
      const next = rows[i].filter(Boolean);
      if (next.length === 0) {
        if (block.length) break;
        continue;
      }
      if (next.length === 1 && isSectionTitle(next[0])) break;
      block.push(rows[i]);
    }
    return block;
  }
  return null;
}
function isSectionTitle(value) {
  return matchesAlias(value, [...MONEY_SECTIONS, ...AR_SECTIONS, ...OWE_SECTIONS, "businesses", "decisions", "this week"]);
}
function isHeaderRow(row) {
  const filled = row.filter(Boolean);
  if (filled.length < 2) return false;
  const words = filled.filter((item) => /[a-z]/i.test(item) && parseMoney(item) == null);
  const amounts = filled.filter((item) => parseMoney(item) != null);
  if (amounts.length > 0) return false;
  return words.length >= 2;
}
function pairs(rows) {
  const items = [];
  for (const row of rows) {
    if (isHeaderRow(row)) continue;
    const texts = [];
    let amount = null;
    for (const item of row) {
      if (!item) continue;
      const money2 = parseMoney(item);
      if (money2 != null && amount == null && !/[a-z]/i.test(item.replace(/[$%,\s().-]/g, ""))) {
        amount = money2;
        continue;
      }
      texts.push(item);
    }
    if (!texts.length) continue;
    items.push({ name: texts[0], amount, detail: texts[1] || null });
  }
  return items.filter((item) => item.name && !matchesAlias(item.name, MONEY_SECTIONS));
}
function moneyIn(sheets) {
  const collected = [];
  for (const sheet of sheets) {
    const block = sectionBlock(rowsOf(sheet), MONEY_SECTIONS);
    if (block) collected.push(...pairs(block).map((item) => ({ method: item.name, amount: item.amount })));
  }
  if (collected.length) return collected;
  for (const sheet of sheets) {
    const records = tableRecords(rowsOf(sheet));
    const rows = records.map((record) => ({
      method: pick(record, ["method", "source", "payment", "tender"]),
      amount: parseMoney(pick(record, ["amount", "total", "in", "collected"]))
    })).filter((row) => row.method && !pickMatchesOnly(row.method));
    if (rows.length && records.some((record) => pick(record, ["method", "source", "payment", "tender"]))) {
      return rows;
    }
  }
  return [];
}
function pickMatchesOnly(value) {
  return matchesAlias(value, ["method", "source", "amount", "total"]);
}
function parties(sheets, sections, kinds) {
  const fromSections = [];
  for (const sheet of sheets) {
    const block = sectionBlock(rowsOf(sheet), sections);
    if (block) fromSections.push(...pairs(block));
  }
  if (fromSections.length) return fromSections;
  return recordsByKind(sheets, kinds);
}
function owes(sheets) {
  const sheet = findSheet(sheets, ["owes"]);
  const records = tableRecords(rowsOf(sheet));
  const typed = splitKind(records);
  if (typed.owes.length || typed.receivables.length) return typed.owes;
  const fromSheet = records.map(recordToParty).filter((item) => item.name);
  if (fromSheet.length) return fromSheet;
  return parties(sheets, OWE_SECTIONS, ["owe", "owes", "payable", "bill"]);
}
function recordsByKind(sheets, kinds) {
  const sheet = findSheet(sheets, ["owes"]);
  const typed = splitKind(tableRecords(rowsOf(sheet)));
  if (kinds.some((kind) => kind === "ar" || kind === "receivable" || kind === "outstanding")) return typed.receivables;
  return [];
}
function splitKind(records) {
  const owesRows = [];
  const receivables = [];
  let sawKind = false;
  for (const record of records) {
    const kind = norm(pick(record, ["type", "kind", "category"]));
    const party = recordToParty(record);
    if (!party.name) continue;
    if (!kind) continue;
    sawKind = true;
    if (["ar", "receivable", "receivables", "outstanding", "incoming"].includes(kind)) receivables.push(party);
    else owesRows.push(party);
  }
  if (!sawKind) return { owes: [], receivables: [] };
  return { owes: owesRows, receivables };
}
function recordToParty(record) {
  return {
    name: pick(record, ["name", "who", "client", "customer", "account", "vendor", "business"]),
    amount: parseMoney(pick(record, ["amount", "balance", "due", "total", "owes"])),
    detail: pick(record, ["detail", "note", "notes", "due date", "status", "when"]) || null
  };
}
function businesses(sheet) {
  const records = tableRecords(rowsOf(sheet));
  const fromTable = records.map((record) => {
    const name = pick(record, ["business", "name", "company"]);
    const status = pick(record, ["status", "health", "ryg", "color", "state"]);
    const note = pick(record, ["note", "notes", "detail", "comment"]) || null;
    return business(name, status, note);
  }).filter((item) => item.name);
  if (fromTable.length) return fromTable;
  return pairs(rowsOf(sheet)).map((item) => business(item.name, item.detail || "", null)).filter((item) => item.name && !isHeaderRow([item.name]));
}
function business(name, status, note) {
  const tone = toneOf(status);
  return { name, tone, label: toneLabel(tone), note };
}
function toneOf(raw) {
  const name = norm(raw);
  if (!name) return "unknown";
  if (name === "g" || name === "green" || name === "good" || name === "ok" || name === "okay" || name.includes("green") || name.includes("on track") || name.includes("healthy")) {
    return "green";
  }
  if (name === "y" || name === "yellow" || name.includes("yellow") || name.includes("watch") || name.includes("caution") || name.includes("attention")) {
    return "yellow";
  }
  if (name === "r" || name === "red" || name.includes("red") || name.includes("behind") || name.includes("off track") || name.includes("risk") || name.includes("late")) {
    return "red";
  }
  return "unknown";
}
function toneLabel(tone) {
  if (tone === "green") return "On track";
  if (tone === "yellow") return "Watch";
  if (tone === "red") return "Behind";
  return "No status";
}
function weekPlan(sheet, now) {
  const todayKey = chicagoDateKey(now);
  const weekday = chicagoWeekday(now);
  const records = tableRecords(rowsOf(sheet));
  const items = (records.length ? records.map((record) => planFromRecord(record)) : pairs(rowsOf(sheet)).map((item) => ({
    when: null,
    title: item.name,
    detail: item.detail,
    dateKey: null,
    weekday: null,
    flagged: false
  }))).filter((item) => item.title);
  const today = items.filter((item) => item.flagged || item.dateKey === todayKey || item.weekday === weekday);
  return {
    today: today.map(stripFlag),
    calendar: items.map(stripFlag)
  };
}
function planFromRecord(record) {
  const whenCell = pick(record, ["when", "today", "flag"]);
  const day = pick(record, ["day", "weekday"]);
  const date = pick(record, ["date"]);
  const calendar = pick(record, ["calendar", "event", "appointment"]);
  const plan = pick(record, ["plan", "focus", "item", "task", "title"]);
  const where = pick(record, ["where", "location", "place"]);
  const time = pick(record, ["time"]);
  const weekday = weekdayName(day) || weekdayName(date);
  return {
    when: time || null,
    title: plan || calendar || day,
    detail: [calendar && plan ? calendar : "", where].filter(Boolean).join(" · ") || null,
    dateKey: dateKeyFromCell(date),
    weekday,
    flagged: /^(today|yes|y)$/i.test(whenCell)
  };
}
function stripFlag(item) {
  return {
    when: item.when,
    title: item.title,
    detail: item.detail,
    dateKey: item.dateKey,
    weekday: item.weekday
  };
}
function decisions(sheet) {
  const records = tableRecords(rowsOf(sheet));
  const items = records.length ? records.map((record) => ({
    title: pick(record, ["decision", "title", "question", "item", "need"]),
    detail: pick(record, ["detail", "note", "notes", "context"]) || null,
    by: pick(record, ["by", "due", "needed", "when", "date"]) || null,
    status: pick(record, ["status", "state"])
  })) : pairs(rowsOf(sheet)).map((item) => ({ title: item.name, detail: item.detail, by: null, status: "" }));
  return items.filter((item) => item.title && !CLOSED_DECISIONS.has(norm(item.status || ""))).map(({ title, detail, by }) => ({ title, detail, by }));
}
function tracker(sheet) {
  const rows = rowsOf(sheet);
  const goal = labeledNumberInRows(rows, ["goal", "target", "tracker goal"], ["savings goal"]);
  const current = labeledNumberInRows(rows, ["current", "collected", "actual", "progress", "to date"]);
  const records = tableRecords(rows);
  const breakdown = records.map((record) => ({
    label: pick(record, ["source", "business", "name", "label", "stream"]),
    amount: parseMoney(pick(record, ["amount", "total", "current", "collected"]))
  })).filter((row) => row.label && !matchesAlias(row.label, ["goal", "current", "target", "source", "amount"]));
  return { goal, current, rows: breakdown };
}
function horizons(sheet) {
  const rows = rowsOf(sheet);
  const header = rows.find((row) => row.filter(Boolean).length >= 2);
  if (header) {
    const columns = header.map((value, index) => ({ horizon: horizonKey(value), index })).filter((column) => column.horizon != null);
    if (columns.length >= 2) {
      const headerAt = rows.indexOf(header);
      return columns.map((column) => ({
        horizon: column.horizon,
        items: rows.slice(headerAt + 1).map((row) => cell(row[column.index])).filter(Boolean)
      })).filter((column) => column.items.length);
    }
  }
  const records = tableRecords(rows);
  const grouped = /* @__PURE__ */ new Map();
  for (const record of records) {
    const horizon = horizonKey(pick(record, ["horizon", "window", "days", "phase"]));
    const item = pick(record, ["item", "plan", "focus", "goal", "task"]);
    if (!horizon || !item) continue;
    grouped.set(horizon, [...grouped.get(horizon) || [], item]);
  }
  return ["30", "60", "90"].flatMap((horizon) => {
    const items = grouped.get(horizon) || [];
    return items.length ? [{ horizon, items }] : [];
  });
}
function horizonKey(value) {
  const name = norm(value);
  if (name === "30" || name === "30 days" || name === "30 day" || name.startsWith("30 ")) return "30";
  if (name === "60" || name === "60 days" || name === "60 day" || name.startsWith("60 ")) return "60";
  if (name === "90" || name === "90 days" || name === "90 day" || name.startsWith("90 ")) return "90";
  return null;
}
function bots(sheet) {
  if (!sheet) return { state: "missing", entries: [] };
  const records = tableRecords(rowsOf(sheet));
  if (!records.length) return { state: "empty", entries: [] };
  const groups = /* @__PURE__ */ new Map();
  for (const record of records) {
    const bot = pick(record, ["bot", "agent", "name"]) || "Bot";
    const loop = pick(record, ["loop", "workflow", "lane"]) || "All loops";
    const key = `${norm(bot)}::${norm(loop)}`;
    const current = groups.get(key) || { bot, loop, actionsDone: 0, salesClosed: 0, accuracy: null, accuracySamples: [] };
    const actions = parseMoney(pick(record, ["actions", "actions done", "done", "count"]));
    const sales = parseMoney(pick(record, ["sales closed", "sales", "closed", "sold"]));
    const accuracy = parsePercent(pick(record, ["accuracy", "score"]));
    current.actionsDone = (current.actionsDone || 0) + (actions != null ? actions : 1);
    if (sales != null) current.salesClosed = (current.salesClosed || 0) + sales;
    else if (/\b(closed|sold|won|paid)\b/i.test(pick(record, ["result", "status", "outcome"]))) {
      current.salesClosed = (current.salesClosed || 0) + 1;
    }
    if (accuracy != null) current.accuracySamples.push(accuracy);
    current.bot = bot;
    current.loop = loop;
    groups.set(key, current);
  }
  const entries = [...groups.values()].map((entry2) => ({
    bot: entry2.bot,
    loop: entry2.loop,
    actionsDone: entry2.actionsDone,
    salesClosed: entry2.salesClosed,
    accuracy: entry2.accuracySamples.length ? Math.round(entry2.accuracySamples.reduce((sum, value) => sum + value, 0) / entry2.accuracySamples.length * 10) / 10 : null
  }));
  return { state: entries.length ? "ready" : "empty", entries };
}
function tableRecords(rows) {
  let headerAt = -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (!isHeaderRow(rows[i])) continue;
    headerAt = i;
    break;
  }
  if (headerAt < 0) return [];
  const headers = rows[headerAt].map((header) => norm(header));
  const records = [];
  for (const row of rows.slice(headerAt + 1)) {
    if (row.every((item) => !item)) continue;
    if (isSectionTitle(row.filter(Boolean)[0] || "") && row.filter(Boolean).length === 1) break;
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = cell(row[index]);
    });
    if (Object.values(record).some(Boolean)) records.push(record);
  }
  return records;
}
function pick(record, aliases) {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const exact = entries.find(([key]) => key === alias);
    if (exact?.[1]) return exact[1];
  }
  for (const alias of aliases) {
    const partial = entries.find(([key]) => key.startsWith(`${alias} `) || key.endsWith(` ${alias}`));
    if (partial?.[1]) return partial[1];
  }
  return "";
}
function weekdayName(value) {
  const name = norm(value);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days.find((day) => name === day || name.startsWith(`${day} `)) || null;
}
function dateKeyFromCell(value) {
  const text2 = cell(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text2)) return text2;
  const slash = text2.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
}
function chicagoDateKey(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}
function chicagoWeekday(now) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long" }).format(now).toLowerCase();
}
function ownerSuiteFixtureGrids(options = {}) {
  const sheets = [
    {
      title: "Friday Scorecard",
      rows: [
        ["Cash this week", "$4,280", "Week goal", "$5,000"],
        ["Cash this month", "$18,640", "Month goal", "$22,000"],
        ["Savings", "$12,400", "Savings goal", "$15,000", "Reserve"],
        [],
        ["Money in"],
        ["Method", "Amount"],
        ["Card", "$2,140"],
        ["Zelle", "$980"],
        ["Check", "$760"],
        ["Invoice", "$400"],
        [],
        ["Accounts receivable"],
        ["Name", "Amount", "Detail"],
        ["Northwind Realty", "$1,800", "Due Friday"],
        ["Harper and Co", "$640", "Net 15"]
      ]
    },
    {
      title: "This Week",
      rows: [
        ["Day", "Date", "Plan", "Time", "Calendar", "Where", "When"],
        ["Friday", "2026-10-09", "Review the scorecard", "9:00 AM", "Broker breakfast", "Downtown", ""],
        ["Saturday", "2026-10-10", "Edit the lake house", "10:30 AM", "Lake house delivery", "Lakeway", "Today"],
        ["Monday", "2026-10-12", "Send commercial proposals", "1:00 PM", "Proposal block", "Studio", ""]
      ]
    },
    {
      title: "$100k Tracker",
      rows: [
        ["Goal", "$100,000"],
        ["Current", "$63,400"],
        ["Source", "Amount"],
        ["Iconic Images", "$48,000"],
        ["Education", "$9,400"],
        ["Commercial", "$6,000"]
      ]
    },
    {
      title: "Businesses",
      rows: [
        ["Business", "Status", "Note"],
        ["Iconic Images", "Green", "Shoots on pace"],
        ["Studio 105", "G", "Rentals booked"],
        ["Education", "Yellow", "Course outline waiting"],
        ["Prints", "On track", "Lab on time"],
        ["Commercial", "Red", "Proposal needs a yes"],
        ["Workshops", "Watch", "Fall dates open"]
      ]
    },
    {
      title: "30-60-90",
      rows: [
        ["30", "60", "90"],
        ["Close two commercial proposals", "Launch the education waitlist", "Check the 100k pace"],
        ["Book November workshops", "Bring savings to the reserve goal", "Hire a weekend editor"]
      ]
    },
    {
      title: "Owes",
      rows: [
        ["Who", "Amount", "Detail"],
        ["Lab prints", "$220", "Due Monday"],
        ["Software", "$49", "Monthly"]
      ]
    },
    {
      title: "Decisions",
      rows: [
        ["Decision", "Detail", "By", "Status"],
        ["Raise the weekend retainer", "Weekend shoots are full", "Friday", "Waiting"],
        ["Buy a second lighting kit", "One kit is booked out", "This month", "Needs your yes"],
        ["Sponsor the broker breakfast", "The host asked this week", "Wednesday", "Open"],
        ["Archive last spring's prices", "Already settled in the sheet", "", "Done"]
      ]
    }
  ];
  if (options.planBoard !== false) {
    sheets.push(planBoardFixture());
  }
  if (options.actionLog !== false) {
    sheets.push({
      title: "Action Log",
      rows: [
        ["Bot", "Loop", "Actions", "Sales closed", "Accuracy"],
        ["Booking bot", "Follow-up", "14", "3", "98%"],
        ["Inbox bot", "Reply", "22", "1", "97%"],
        ["Billing bot", "Invoice", "9", "4", "99%"]
      ]
    });
  }
  return sheets;
}
function planBoardFixture() {
  return {
    title: "Plan Board",
    rows: [
      ["Business", "Section", "Item", "Date", "Amount", "Status", "Notes", "Lane"],
      ["iconic images m&m", "Revenue", "October retainers", "2026-10-01", "$8,400", "", "Retainer", "ignore-me"],
      ["Iconic Images M&M", "revenue", "Print add-on", "2026-10-08", "$640", "", "", ""],
      ["Iconic Images M&M", "Expense", "Lab", "2026-10-03", "$1,200", "", "Prints", ""],
      ["ICONIC IMAGES M&M", "EXPENSE", "Ads", "10/12/2026", "$350", "", "", ""],
      ["Iconic Images M&M", "Calendar", "Broker breakfast", "2026-10-16", "", "Set", "Downtown", ""],
      ["Iconic Images M&M", "calendar", "Gallery night", "2026-10-14", "", "", "Studio", ""],
      ["Iconic Images M&M", "Social", "Lake house reel", "2026-10-18", "", "Scheduled", "", ""],
      ["Iconic Images M&M", "Social", "Before and after", "2026-10-11", "", "", "", ""],
      ["Iconic Images M&M", "Event", "Fall mini sessions", "2026-10-24", "", "", "Outdoor", ""],
      ["Iconic Images M&M", "Promo", "Referral card", "2026-10-20", "", "", "", ""],
      ["Iconic Images M&M", "Email", "Newsletter", "2026-10-27", "", "", "", ""],
      ["Iconic Images M&M", "Email", "Past client note", "2026-10-13", "", "Draft", "", ""],
      ["Iconic Images M&M", "To-do", "File the lens receipt", "2026-10-09", "", "Done", "", ""],
      ["Iconic Images M&M", "To-do", "Confirm weekend crew", "2026-10-10", "", "Open", "", ""],
      ["Iconic Studios", "Revenue", "Booth rentals", "2026-10-02", "$3,200", "", "", ""],
      ["Iconic Studios", "Expense", "Utilities", "2026-10-04", "$800", "", "", ""],
      ["Iconic Studios", "Calendar", "Studio tour", "2026-10-15", "", "", "", ""],
      ["Iconic Studios", "Social", "Cyclorama reel", "2026-10-12", "", "", "", ""],
      ["Iconic Studios", "Event", "Open studio", "2026-10-22", "", "", "", ""],
      ["Iconic Studios", "Email", "Member reminder", "2026-10-17", "", "", "", ""],
      ["Iconic Studios", "To-do", "Order backdrops", "", "", "Open", "Seamless paper", ""],
      ["aICON", "Revenue", "Suite build", "2026-10-06", "$1,500", "", "", ""],
      ["aICON", "Expense", "Software", "2026-10-05", "$90", "", "", ""],
      ["aICON", "Calendar", "Ship the scorecard", "2026-10-10", "", "", "", ""],
      ["aicon", "Social", "Feature the board", "2026-10-19", "", "", "", ""],
      ["aICON", "Email", "Weekly ops note", "2026-10-14", "", "", "", ""],
      ["aICON", "To-do", "Review the owner gate", "2026-10-08", "", "Completed", "", ""],
      ["Iconic Virtual", "Revenue", "Tour packages", "2026-10-03", "$2,100", "", "", ""],
      ["Iconic Virtual", "Expense", "Hosting", "2026-10-07", "$400", "", "", ""],
      ["Iconic Virtual", "Calendar", "Listing refresh", "2026-10-13", "", "", "", ""],
      ["Iconic Virtual", "Social", "Virtual tour clip", "2026-10-16", "", "", "", ""],
      ["Iconic Virtual", "Promo", "October highlight", "2026-10-19", "", "", "", ""],
      ["Iconic Virtual", "Email", "Agent blast", "2026-10-15", "", "", "", ""],
      ["Iconic Virtual", "To-do", "Update floor plans", "", "", "Open", "", ""],
      ["KDP", "Revenue", "Paperback", "2026-10-09", "$720", "", "", ""],
      ["KDP", "Expense", "Proof copy", "2026-10-02", "$40", "", "", ""],
      ["KDP", "Calendar", "Upload week", "2026-10-18", "", "", "", ""],
      ["KDP", "Social", "Cover refresh", "2026-10-21", "", "", "", ""],
      ["KDP", "Email", "Reader note", "2026-10-11", "", "", "", ""],
      ["KDP", "To-do", "Proof chapter four", "", "", "Open", "", ""],
      ["Mystery Co", "Revenue", "Should not appear", "2026-10-01", "$9,999", "", "", ""],
      ["Iconic Images M&M", "Other", "Ignore this lane", "2026-10-01", "$50", "", "", ""]
    ]
  };
}
const OWNER_SHEET_ID = "1vHkdHRhAWKcnsv8-d1ZZSWRr-OZyy0xCaqK1Bi3VB3Q";
const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const CACHE_MS = 6e4;
const ERROR_CACHE_MS = 15e3;
const TAB_ALIASES = [
  { aliases: ["friday scorecard"] },
  { aliases: ["this week"] },
  { aliases: ["100k tracker"] },
  { aliases: ["businesses"] },
  { aliases: ["30 60 90"] },
  { aliases: ["owes"] },
  { aliases: ["decisions"] },
  { aliases: ["action log"] },
  { aliases: ["plan board"] }
];
let cache = null;
function resolveSheetsCredentials(env = ownerRuntimeEnv()) {
  const fromFirebase = credentialsFromJson(env.FIREBASE_SERVICE_ACCOUNT);
  if (fromFirebase) return fromFirebase;
  const email = env.OWNER_SHEETS_SA_EMAIL?.trim();
  const key = env.OWNER_SHEETS_SA_KEY?.replace(/\\n/g, "\n").trim();
  if (email && key) return { client_email: email, private_key: key };
  return null;
}
async function loadOwnerSuite(options = {}) {
  const env = ownerRuntimeEnv();
  const now = options.now ?? /* @__PURE__ */ new Date();
  if (ownerFixturesEnabled(env)) {
    return {
      data: parseOwnerSuite(ownerSuiteFixtureGrids(), now),
      source: "fixture",
      configured: true,
      notice: null,
      readerEmail: null
    };
  }
  if (!options.fresh && cache && cache.expires > Date.now()) return cache.payload;
  const credentials = resolveSheetsCredentials(env);
  if (!credentials) {
    const payload = {
      data: unknownData(now),
      source: "empty",
      configured: false,
      notice: "Scorecard is not connected.",
      readerEmail: null
    };
    cache = { expires: Date.now() + ERROR_CACHE_MS, payload };
    return payload;
  }
  try {
    const grids = await fetchScorecard(credentials);
    const payload = {
      data: parseOwnerSuite(grids, now),
      source: "sheet",
      configured: true,
      notice: null,
      readerEmail: credentials.client_email
    };
    cache = { expires: Date.now() + CACHE_MS, payload };
    return payload;
  } catch (error) {
    const status = error && typeof error === "object" && "code" in error ? String(error.code) : "error";
    console.error(`[Owners] Scorecard read failed (${status})`);
    const payload = {
      data: unknownData(now),
      source: "empty",
      configured: true,
      notice: "The scorecard could not be read.",
      readerEmail: credentials.client_email
    };
    cache = { expires: Date.now() + ERROR_CACHE_MS, payload };
    return payload;
  }
}
function unknownData(now) {
  const data = emptyOwnerSuiteData(now);
  data.bots.state = "unknown";
  return data;
}
function credentialsFromJson(raw) {
  if (!raw || !raw.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n")
    };
  } catch {
    return null;
  }
}
async function fetchScorecard(credentials) {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [READONLY_SCOPE]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: OWNER_SHEET_ID,
    fields: "sheets.properties.title"
  });
  const titles = (meta.data.sheets || []).map((sheet) => sheet.properties?.title || "").filter(Boolean);
  const matched = TAB_ALIASES.map((wanted) => titles.find((title) => {
    const name = title.toLowerCase().replace(/\$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    return wanted.aliases.some((alias) => name === alias || name.includes(alias));
  })).filter((title) => Boolean(title));
  if (!matched.length) return [];
  const values = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: OWNER_SHEET_ID,
    ranges: matched.map((title) => `'${title.replace(/'/g, "''")}'`),
    valueRenderOption: "FORMATTED_VALUE"
  });
  return (values.data.valueRanges || []).map((range, index) => ({
    title: matched[index] || "",
    rows: (range.values || []).map((row) => row.map((cell2) => cell2 == null ? "" : String(cell2)))
  }));
}
const OWNER_WHY = "Freedom to be outside with my dogs, kids, nieces, pig and garden, and to fly to Puerto Rico whenever I want. More traveling, more giving.";
const NOT_FOUND = { error: "Not found" };
function mountOwners(app) {
  const page = ["/admin/owners", "/admin/owners/", "/owners", "/owners/", "/api/owners/page"];
  app.get(page, (req, res) => {
    void handleOwnersPage(req, res);
  });
  app.get("/api/owners/suite", (req, res) => {
    void handleSuite(req, res);
  });
  app.post("/api/owners/session", (req, res) => {
    void handleSession(req, res);
  });
  app.post("/api/owners/logout", (_req, res) => {
    setPrivate(res);
    res.setHeader("Set-Cookie", sessionCookieHeader("", ownerRuntimeEnv(), 0));
    res.status(204).end();
  });
}
async function handleSuite(req, res) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  const fresh = req.query.fresh === "1";
  const payload = await loadOwnerSuite({ fresh });
  return res.status(200).json({ ...payload, why: OWNER_WHY });
}
async function handleSession(req, res) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  const secret = ownerSessionSecret();
  if (!owner || !secret) return res.status(404).json(NOT_FOUND);
  const token = signOwnerSession(owner, secret);
  res.setHeader("Set-Cookie", sessionCookieHeader(token));
  return res.status(200).json({ ok: true });
}
async function handleOwnersPage(req, res) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).type("html").send(NOT_FOUND_HTML);
  const html = injectDevPreamble(injectRobots(await readSpaShell() || FALLBACK_SHELL));
  return res.status(200).type("html").send(html);
}
function setPrivate(res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Vary", "Cookie, Authorization");
}
function injectDevPreamble(html) {
  if (process.env.ICONIC_VITE_DEV !== "1" || html.includes("/@react-refresh")) return html;
  const preamble = `<script type="module">
import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
<\/script>`;
  return html.includes("</head>") ? html.replace("</head>", `${preamble}
  </head>`) : `${preamble}${html}`;
}
function injectRobots(html) {
  if (html.includes('name="robots"')) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", '    <meta name="robots" content="noindex, nofollow" />\n  </head>');
  }
  return `<!doctype html><meta name="robots" content="noindex, nofollow" />${html}`;
}
async function readSpaShell() {
  const source = path.join(process.cwd(), "index.html");
  const dist = path.join(process.cwd(), "dist/spa/index.html");
  const preferred = process.env.ICONIC_VITE_DEV === "1" ? [source, dist] : [dist, source];
  for (const file of preferred) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
  }
  return null;
}
const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Page not found</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:Inter,system-ui,sans-serif;color:#111827">
    <div style="text-align:center">
      <h1 style="font-size:2.25rem;margin:0 0 .75rem">404</h1>
      <p style="margin:0 0 1rem;color:#4b5563">Page not found</p>
      <a href="/" style="color:#3b82f6">Return to Home</a>
    </div>
  </body>
</html>`;
const FALLBACK_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Iconic Images</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/client/main.tsx"><\/script>
  </body>
</html>`;
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
      const schedule = await listCalendarScheduleEvents({ calendars, timeMin, timeMax });
      return res.json(schedule);
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
  mountOwners(app);
  app.use("/api/bookings", router$m);
  app.use("/api/orders", router$l);
  app.use("/api/galleries", router$k);
  app.use("/api/payments", router$j);
  app.use("/api/vsai", router$i);
  app.use("/api/messages", router$h);
  app.use("/api/clients", router$g);
  app.get("/api/portal/listings/:id", handleGetPublicPortalListing);
  app.use("/api/staff", router$f);
  app.use("/api", router$1);
  app.use("/api/listings", router$e);
  app.use("/api", router);
  app.use("/api/campaigns", router$d);
  app.use("/api/marketing", router$c);
  app.use("/api/marketing", router$b);
  app.use("/api/agents", router$a);
  app.use("/api/media-jobs", router$9);
  app.use("/api/studio", router$8);
  app.use("/api/studio/scratch", router$7);
  app.use("/api/places", router$6);
  app.use("/api/sms", router$5);
  app.use("/api/contact", router$2);
  app.use("/api/contact", router$3);
  app.use("/api/contact", router$4);
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
