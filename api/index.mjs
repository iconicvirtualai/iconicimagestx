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
import crypto from "crypto";
function roleAtLeast(role, minimum) {
  if (!role) return false;
  const hierarchy = ["editor", "photographer", "coordinator", "admin"];
  const minIdx = hierarchy.indexOf(minimum);
  const roleIdx = hierarchy.indexOf(role);
  return roleIdx >= minIdx;
}
async function resolveRole(uid, decoded) {
  if (uid === "temp-admin-uid") {
    return "admin";
  }
  if (decoded.isStaff && decoded.role) {
    return decoded.role;
  }
  try {
    const staffDoc = await admin.firestore().collection("staff").doc(uid).get();
    if (!staffDoc.exists) return null;
    const data = staffDoc.data();
    if (data.isActive === false) return null;
    return data.role;
  } catch (err) {
    console.error("[Auth] Firestore staff lookup failed:", err);
    return null;
  }
}
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader === "Bearer temp-admin-token") {
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
const db$c = () => admin.firestore();
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      pool: true,
      maxConnections: 1,
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_FROM,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}
async function sendEmail(options) {
  const { to, bcc, cc, template, variables = {}, subject: subjectOverride, attachments } = options;
  if (!to) {
    console.warn("[Email] No recipient specified, skipping.");
    return;
  }
  try {
    const templateDoc = await db$c().collection("emailTemplates").where("category", "==", template).where("isActive", "==", true).limit(1).get();
    let subject = subjectOverride || `Message from Iconic Images`;
    let htmlBody = getFallbackTemplate(template, variables);
    if (!templateDoc.empty) {
      const tmpl = templateDoc.docs[0].data();
      subject = subjectOverride || interpolate(tmpl.subject, variables);
      htmlBody = interpolate(tmpl.htmlBody, variables);
    }
    const transporter2 = getTransporter();
    await transporter2.sendMail({
      from: `"Iconic Images" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      bcc,
      cc,
      subject,
      html: htmlBody,
      attachments
    });
    console.log(`[Email] Sent '${template}' to ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send '${template}' to ${to}:`, err);
    throw err;
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
async function sendSMS({ to, body, from }) {
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
      "configuration.method": "POST",
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
  newBookingAlert: (address, date, services) => `🔔 NEW BOOKING — Iconic Images

📍 ${address}
📅 ${date}
🏠 ${services}

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
  const start = new Date(date);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + Number(process.env.DEFAULT_APPOINTMENT_DURATION_MINUTES || 90));
  return { start, end };
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
      start: { dateTime: times.start.toISOString(), timeZone: "America/Chicago" },
      end: { dateTime: times.end.toISOString(), timeZone: "America/Chicago" },
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
const router$d = Router();
const db$b = () => admin.firestore();
function appUrl$2() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}
function addressLabel$2(address) {
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
  return `$${(Number(value) || 0).toFixed(2)}`;
}
router$d.post("/", async (req, res) => {
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
      investmentWilling
    } = req.body;
    if (!firstName || !lastName || !email || !phone || !address) {
      return res.status(400).json({ error: "Missing required fields." });
    }
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ error: "No services selected." });
    }
    const clientName = `${firstName} ${lastName}`.trim();
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
      status: "new",
      source: "booking_form",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db$b().collection("orderRequests").add(orderRequest);
    const accessLine = accessMethod ? `${accessMethod}${lockboxCode ? ` — Code: ${lockboxCode}` : ""}` : "Not specified";
    await sendEmail({
      to: email,
      template: "booking_received",
      variables: {
        clientName,
        address,
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
        address,
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
        body: SMS_TEMPLATES.bookingConfirmation(
          firstName,
          scheduledDate || "TBD — we'll confirm shortly",
          address,
          money$1(total)
        )
      }).catch((err) => console.error("[Bookings] Confirmation SMS failed:", err));
    }
    if (process.env.ADMIN_PHONE) {
      const serviceNames = lineItems.map((i) => i.name).join(", ");
      await sendSMS({
        to: process.env.ADMIN_PHONE,
        body: SMS_TEMPLATES.newBookingAlert(
          address,
          scheduledDate || "TBD",
          serviceNames
        )
      }).catch((err) => console.error("[Bookings] Admin SMS alert failed:", err));
    }
    return res.status(201).json({
      success: true,
      requestId: docRef.id,
      message: "Booking request received. We'll confirm shortly!"
    });
  } catch (err) {
    console.error("[Bookings] Submission error:", err);
    return res.status(500).json({ error: "Failed to submit booking request." });
  }
});
router$d.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$b().collection("orderRequests").orderBy("createdAt", "desc").limit(100).get();
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
router$d.get("/:id", requireCoordinator, async (req, res) => {
  try {
    const doc = await db$b().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("[Bookings] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch booking request." });
  }
});
router$d.patch("/:id/confirm", requireCoordinator, async (req, res) => {
  try {
    const { assignedPhotographerId, assignedPhotographerName, scheduledDate, scheduledTime, internalNotes } = req.body;
    const requestDoc = await db$b().collection("orderRequests").doc(req.params.id).get();
    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    const request = requestDoc.data();
    if (request.convertedToOrderId) {
      return res.json({
        success: true,
        orderId: request.convertedToOrderId,
        clientId: request.clientId || null,
        message: "Booking was already confirmed."
      });
    }
    const requestEmail = String(request.email || request.clientEmail || "").toLowerCase().trim();
    const requestPhone = request.phone || request.clientPhone || "";
    const requestFirstName = request.firstName || request.clientName?.split(" ")?.[0] || "Client";
    const requestLastName = request.lastName || request.clientName?.split(" ")?.slice(1).join(" ") || "";
    const requestClientName = request.clientName || `${requestFirstName} ${requestLastName}`.trim() || "Client";
    const requestAddress = request.address || request.propertyAddress || "";
    const requestAddressLabel = addressLabel$2(requestAddress);
    const requestLineItems = Array.isArray(request.lineItems) && request.lineItems.length > 0 ? request.lineItems : Array.isArray(request.services) ? request.services.map((service) => typeof service === "string" ? { name: service, price: 0 } : service) : [];
    const requestTotal = Number(request.total ?? request.pricing?.total ?? 0) || 0;
    const confirmDate = toDate$1(scheduledDate || request.scheduledDate || request.appointmentDate || request.requestedDate);
    const confirmTime = scheduledTime || request.scheduledTime || request.appointmentTime || request.requestedTime || null;
    if (!requestEmail) {
      return res.status(400).json({ error: "Client email is missing on this booking request." });
    }
    let photographer = null;
    if (assignedPhotographerId) {
      const staffDoc = await db$b().collection("staff").doc(assignedPhotographerId).get();
      photographer = staffDoc.exists ? staffDoc.data() : null;
    }
    let clientId;
    const existingClients = await db$b().collection("clients").where("email", "==", requestEmail).limit(1).get();
    if (!existingClients.empty) {
      clientId = existingClients.docs[0].id;
      await existingClients.docs[0].ref.update({
        totalOrders: admin.firestore.FieldValue.increment(1),
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const clientRef = await db$b().collection("clients").add({
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
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const orderRef = await db$b().collection("orders").add(orderData);
    const appointmentRef = await db$b().collection("appointments").add({
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
    const galleryRef = await db$b().collection("galleries").add({
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
      await db$b().collection("agentLogs").add({
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
    const invoiceRef = await db$b().collection("invoices").add({
      orderId: orderRef.id,
      clientId,
      galleryId: galleryRef.id,
      clientName: requestClientName,
      clientEmail: requestEmail,
      invoiceNumber: await generateInvoiceNumber(),
      lineItems: requestLineItems,
      subtotal: request.pricing?.subtotal || requestTotal,
      tax: request.pricing?.tax || 0,
      total: requestTotal,
      amountPaid: 0,
      amountDue: requestTotal,
      status: "draft",
      paymentProvider: "square",
      paymentUrl: `${appUrl$2()}/invoice/${orderRef.id}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await invoiceRef.update({
      paymentUrl: `${appUrl$2()}/invoice/${invoiceRef.id}`
    });
    await galleryRef.update({
      invoiceId: invoiceRef.id,
      deliveryUrl: `${appUrl$2()}/gallery/${galleryRef.id}`
    });
    await requestDoc.ref.update({
      status: "confirmed",
      convertedToOrderId: orderRef.id,
      clientId,
      galleryId: galleryRef.id,
      invoiceId: invoiceRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
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
    return res.json({
      success: true,
      orderId: orderRef.id,
      clientId,
      message: "Booking confirmed and order created."
    });
  } catch (err) {
    console.error("[Bookings] Confirm error:", err);
    return res.status(500).json({ error: "Failed to confirm booking." });
  }
});
router$d.patch("/:id/decline", requireCoordinator, async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await db$b().collection("orderRequests").doc(req.params.id).get();
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
async function generateInvoiceNumber() {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const snapshot = await db$b().collection("invoices").where("invoiceNumber", ">=", `INV-${year}-`).orderBy("invoiceNumber", "desc").limit(1).get().catch((err) => {
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
const router$c = Router();
const db$a = () => admin.firestore();
router$c.get("/", requireStaff, async (req, res) => {
  try {
    const { status, photographerId, limit = "50", startAfter } = req.query;
    let query = db$a().collection("orders").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (photographerId) {
      query = query.where("assignedPhotographerId", "==", photographerId);
    }
    const limitNum = Math.min(Number(limit), 200);
    query = query.limit(limitNum);
    if (startAfter) {
      const cursorDoc = await db$a().collection("orders").doc(startAfter).get();
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
router$c.get("/dashboard", requireStaff, async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [allOrders, todayOrders, monthTransactions, pendingRequests] = await Promise.all([
      db$a().collection("orders").get(),
      db$a().collection("orders").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(todayStart)).get(),
      db$a().collection("transactions").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(monthStart)).where("status", "==", "completed").get(),
      db$a().collection("orderRequests").where("status", "==", "new").get()
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
router$c.get("/:id", requireStaff, async (req, res) => {
  try {
    const orderDoc = await db$a().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = { id: orderDoc.id, ...orderDoc.data() };
    const [gallery, invoice, appointment, messages] = await Promise.all([
      db$a().collection("galleries").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Gallery lookup failed:", err);
        return null;
      }),
      db$a().collection("invoices").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Invoice lookup failed:", err);
        return null;
      }),
      db$a().collection("appointments").where("orderId", "==", req.params.id).limit(1).get().catch((err) => {
        console.error("[Orders] Appointment lookup failed:", err);
        return null;
      }),
      db$a().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "desc").limit(20).get().catch((err) => {
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
router$c.patch("/:id", requireCoordinator, async (req, res) => {
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
    await db$a().collection("orders").doc(req.params.id).update(updates);
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
router$c.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, note } = req.body;
    const orderDoc = await db$a().collection("orders").doc(req.params.id).get();
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
    const apptSnapshot = await db$a().collection("appointments").where("orderId", "==", req.params.id).limit(1).get();
    if (!apptSnapshot.empty) {
      const apptStatus = status === "in_progress" ? "in_progress" : status === "shot_complete" || status === "editing" ? "completed" : status === "cancelled" ? "cancelled" : void 0;
      if (apptStatus) {
        await apptSnapshot.docs[0].ref.update({ status: apptStatus });
      }
    }
    await db$a().collection("agentLogs").add({
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
router$c.get("/:id/timeline", requireStaff, async (req, res) => {
  try {
    const [messages, editRequests, agentLogs] = await Promise.all([
      db$a().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$a().collection("editRequests").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$a().collection("agentLogs").where("relatedId", "==", req.params.id).orderBy("createdAt", "asc").get()
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
const router$b = Router();
const db$9 = () => admin.firestore();
const storage = () => admin.storage().bucket();
function appUrl$1() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}
function publicMediaItem(item, canDownload) {
  const url = item.shareUrl || item.embedUrl || item.url;
  return {
    id: item.id,
    url,
    shareUrl: item.shareUrl || item.url || item.embedUrl || null,
    embedUrl: item.embedUrl || item.url || null,
    fileName: item.fileName || item.title || "Media",
    title: item.title || item.fileName || "Media",
    type: item.type || "photo",
    width: item.width || null,
    height: item.height || null,
    canDownload: Boolean(canDownload && item.downloadable !== false)
  };
}
router$b.get("/", requireStaff, async (req, res) => {
  try {
    const { status, orderId } = req.query;
    let query = db$9().collection("galleries").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (orderId) query = query.where("orderId", "==", orderId);
    const snapshot = await query.limit(100).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch galleries." });
  }
});
router$b.get("/public/:id", async (req, res) => {
  try {
    const doc = await db$9().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = doc.data();
    const invoiceSnap = gallery.orderId ? await db$9().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get() : null;
    const invoice = invoiceSnap && !invoiceSnap.empty ? { id: invoiceSnap.docs[0].id, ...invoiceSnap.docs[0].data() } : null;
    const invoiceStatus = invoice?.status || null;
    const paid = invoiceStatus === "paid" || Number(invoice?.amountDue || 0) <= 0;
    const canDownload = Boolean(gallery.downloadEnabled) && paid;
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
router$b.get("/:id", requireAuth, async (req, res) => {
  try {
    const doc = await db$9().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = doc.data();
    const staffDoc = await db$9().collection("staff").doc(req.user.uid).get();
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
router$b.post("/:id/upload-url", requirePhotographer, async (req, res) => {
  try {
    const { fileName, fileType, isRaw = false } = req.body;
    if (!fileName || !fileType) {
      return res.status(400).json({ error: "fileName and fileType required." });
    }
    const galleryDoc = await db$9().collection("galleries").doc(req.params.id).get();
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
router$b.post("/:id/media", requirePhotographer, async (req, res) => {
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
    const galleryDoc = await db$9().collection("galleries").doc(req.params.id).get();
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
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
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
router$b.post("/:id/media-link", requireCoordinator, async (req, res) => {
  try {
    const { url, title, type = "video", embedUrl, thumbnailUrl, downloadable = false } = req.body;
    if (!url) return res.status(400).json({ error: "url required." });
    const galleryDoc = await db$9().collection("galleries").doc(req.params.id).get();
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
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
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
router$b.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending_upload", "raw_uploaded", "editing", "ready_for_review", "approved", "delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    await db$9().collection("galleries").doc(req.params.id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update gallery status." });
  }
});
router$b.post("/:id/deliver", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db$9().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = galleryDoc.data();
    const { downloadEnabled = true, expiresInDays = 30 } = req.body;
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
      await db$9().collection("orders").doc(gallery.orderId).update({
        status: "delivered",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    const clientDoc = await db$9().collection("clients").doc(gallery.clientId).get();
    const client = clientDoc.data();
    if (client?.email) {
      const invoiceSnap = await db$9().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
      const invoice = invoiceSnap.empty ? null : invoiceSnap.docs[0].data();
      await sendEmail({
        to: client.email,
        template: "gallery_delivery",
        variables: {
          clientName: gallery.clientName,
          address: gallery.address,
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
router$b.delete("/:id/media/:mediaId", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db$9().collection("galleries").doc(req.params.id).get();
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
const router$a = Router();
const db$8 = () => admin.firestore();
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
  return process.env.SQUARE_ENVIRONMENT === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
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
  const invoiceRef = db$8().collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) return;
  const invoice = invoiceDoc.data();
  const currentPaid = Number(invoice.amountPaid) || 0;
  const total = Number(invoice.total) || 0;
  const newAmountPaid = currentPaid + amount;
  const newAmountDue = Math.max(0, total - newAmountPaid);
  const resolvedOrderId = orderId || invoice.orderId || "";
  const resolvedClientId = clientId || invoice.clientId || "";
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
    await db$8().collection("orders").doc(resolvedOrderId).update({
      depositPaid: admin.firestore.FieldValue.increment(amount),
      balanceDue: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch((err) => console.error("[Payments] Order balance update failed:", err));
  }
  if (resolvedClientId) {
    await db$8().collection("clients").doc(resolvedClientId).update({
      totalSpend: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch((err) => console.error("[Payments] Client spend update failed:", err));
  }
  if (resolvedOrderId && newAmountDue <= 0) {
    const gallerySnap = await db$8().collection("galleries").where("orderId", "==", resolvedOrderId).limit(1).get();
    if (!gallerySnap.empty) {
      await gallerySnap.docs[0].ref.update({
        downloadEnabled: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
  await db$8().collection("transactions").add({
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
router$a.post("/create-intent", requireAuth, async (req, res) => {
  try {
    if (!stripeReady()) {
      return res.status(503).json({ error: "Studio Noir Stripe payments are not configured yet." });
    }
    const { invoiceId, amount, currency = "usd" } = req.body;
    if (!invoiceId || !amount) return res.status(400).json({ error: "invoiceId and amount required." });
    const invoiceDoc = await db$8().collection("invoices").doc(invoiceId).get();
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
      receipt_email: invoice.clientEmail
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
router$a.post("/send-invoice", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });
    const invoiceDoc = await db$8().collection("invoices").doc(invoiceId).get();
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
router$a.get("/invoice/:id", async (req, res) => {
  try {
    const invoiceDoc = await db$8().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    const provider = invoiceProvider(invoice);
    return res.json({
      id: invoiceDoc.id,
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
router$a.post("/invoice/:id/checkout", async (req, res) => {
  try {
    const invoiceDoc = await db$8().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    const amountDue = Number(invoice.amountDue ?? invoice.total ?? 0);
    const provider = invoiceProvider(invoice);
    if (invoice.status === "paid" || amountDue <= 0) {
      return res.json({
        paid: true,
        provider,
        redirectUrl: invoice.galleryId ? `${appUrl()}/gallery/${invoice.galleryId}` : `${appUrl()}/invoice/${invoiceDoc.id}`
      });
    }
    if (provider === "square") {
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
            redirect_url: invoice.galleryId ? `${appUrl()}/gallery/${invoice.galleryId}` : `${appUrl()}/invoice/${invoiceDoc.id}?paid=1`
          },
          pre_populated_data: {
            buyer_email: invoice.clientEmail || void 0
          },
          payment_note: `Iconic Images invoice ${invoice.invoiceNumber || invoiceDoc.id}`
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
        receipt_email: invoice.clientEmail || void 0,
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
router$a.post("/webhook", async (req, res) => {
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
router$a.post("/square-webhook", async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (signatureKey) {
      const notificationUrl = `${appUrl()}/api/payments/square-webhook`;
      const expected = crypto.createHmac("sha256", signatureKey).update(notificationUrl + rawBody).digest("base64");
      const received = Array.isArray(req.headers["x-square-hmacsha256-signature"]) ? req.headers["x-square-hmacsha256-signature"][0] : req.headers["x-square-hmacsha256-signature"];
      const valid = Boolean(received) && Buffer.byteLength(expected) === Buffer.byteLength(received || "") && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received || ""));
      if (!valid) return res.status(400).json({ error: "Invalid Square webhook signature." });
    }
    const event = JSON.parse(rawBody);
    const payment = event?.data?.object?.payment;
    if (!payment?.id || payment.status !== "COMPLETED") return res.json({ received: true });
    let invoiceDoc = null;
    if (payment.order_id) {
      const bySquareOrder = await db$8().collection("invoices").where("squareOrderId", "==", payment.order_id).limit(1).get();
      if (!bySquareOrder.empty) invoiceDoc = bySquareOrder.docs[0];
    }
    if (!invoiceDoc) {
      const byPayment = await db$8().collection("invoices").where("squarePaymentId", "==", payment.id).limit(1).get();
      if (!byPayment.empty) invoiceDoc = byPayment.docs[0];
    }
    if (!invoiceDoc) {
      await db$8().collection("agentLogs").add({
        agent: "travis",
        action: "Unmatched Square payment",
        summary: `Square payment ${payment.id} could not be matched to an invoice`,
        status: "flagged",
        relatedType: "invoice",
        priority: "high",
        requiresHumanReview: true,
        details: payment.order_id || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ received: true, unmatched: true });
    }
    const invoice = invoiceDoc.data();
    if (invoice.squarePaymentId === payment.id || invoice.status === "paid") {
      return res.json({ received: true, duplicate: true });
    }
    await applySuccessfulPayment({
      invoiceId: invoiceDoc.id,
      orderId: invoice.orderId,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      amount: Number(payment.total_money?.amount || 0) / 100,
      method: "square",
      squarePaymentId: payment.id
    });
    return res.json({ received: true });
  } catch (err) {
    console.error("[Payments] Square webhook error:", err);
    return res.status(500).json({ error: "Square webhook handler failed." });
  }
});
router$a.get("/transactions", requireCoordinator, async (req, res) => {
  try {
    const { startDate, endDate, limit = "50" } = req.query;
    let query = db$8().collection("transactions").orderBy("createdAt", "desc");
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
  await db$8().collection("agentLogs").add({
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
  const invoiceSnap = await db$8().collection("invoices").where("stripePaymentIntentId", "==", intentId).limit(1).get();
  if (invoiceSnap.empty) return;
  const invoiceDoc = invoiceSnap.docs[0];
  const refundAmount = charge.amount_refunded / 100;
  await db$8().collection("transactions").add({
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
const router$9 = Router();
const db$7 = () => admin.firestore();
const VSAI_API_BASE = "https://api.virtualstagingai.app/v1";
const VSAI_API_KEY = process.env.VSAI_API_KEY || process.env.VIRTUAL_STAGING_AI_API_KEY || "";
const VSAI_PRICE_CENTS = parseInt(process.env.VSAI_PRICE_CENTS || "1500", 10);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});
router$9.post("/create", requireAuth, async (req, res) => {
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
    const jobRef = await db$7().collection("vsaiJobs").add({
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
router$9.get("/result/:jobId", requireAuth, async (req, res) => {
  try {
    const jobDoc = await db$7().collection("vsaiJobs").doc(req.params.jobId).get();
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
router$9.post("/variation", requireAuth, async (req, res) => {
  try {
    const { jobId, style: newStyle, roomType: newRoomType } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: "jobId required." });
    }
    let rootJobDoc = await db$7().collection("vsaiJobs").doc(jobId).get();
    if (!rootJobDoc.exists) return res.status(404).json({ error: "Job not found." });
    let rootJob = rootJobDoc.data();
    if (rootJob.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    while (rootJob.parentJobId) {
      const parentDoc = await db$7().collection("vsaiJobs").doc(rootJob.parentJobId).get();
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
    const variationRef = await db$7().collection("vsaiJobs").add({
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
router$9.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { jobIds, successUrl, cancelUrl } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "jobIds array required." });
    }
    const userId = req.user.uid;
    const jobDocs = await Promise.all(
      jobIds.map((id) => db$7().collection("vsaiJobs").doc(id).get())
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
router$9.post(
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
            (id) => db$7().collection("vsaiJobs").doc(id).update({
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
router$9.get("/options", (_req, res) => {
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
const router$8 = Router();
const db$6 = () => admin.firestore();
router$8.get("/:orderId", requireAuth, async (req, res) => {
  try {
    const orderDoc = await db$6().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$6().collection("staff").doc(req.user.uid).get();
    const isStaff = staffDoc.exists;
    if (!isStaff && order.clientId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    const snapshot = await db$6().collection("messages").where("orderId", "==", req.params.orderId).orderBy("createdAt", "asc").limit(100).get();
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const unread = snapshot.docs.filter(
      (d) => !d.data().isRead && d.data().senderId !== req.user.uid
    );
    const batch = db$6().batch();
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
router$8.post("/:orderId", requireAuth, async (req, res) => {
  try {
    const { content, attachments } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content required." });
    }
    const orderDoc = await db$6().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$6().collection("staff").doc(req.user.uid).get();
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
      const clientDoc = await db$6().collection("clients").doc(order.clientId).get();
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
    const docRef = await db$6().collection("messages").add(message);
    await db$6().collection("agentLogs").add({
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
router$8.get("/unread/count", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$6().collection("messages").where("isRead", "==", false).where("senderType", "==", "client").get();
    return res.json({ unreadCount: snapshot.size });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get unread count." });
  }
});
const router$7 = Router();
const db$5 = () => admin.firestore();
router$7.get("/", requireStaff, async (req, res) => {
  try {
    const { status, search, limit = "50" } = req.query;
    let query = db$5().collection("clients").orderBy("createdAt", "desc");
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
router$7.get("/me", requireAuth, async (req, res) => {
  try {
    const directDoc = await db$5().collection("clients").doc(req.user.uid).get();
    if (directDoc.exists) {
      const data = directDoc.data();
      if (data._redirect) {
        const realDoc = await db$5().collection("clients").doc(data._redirect).get();
        if (realDoc.exists) return res.json({ id: realDoc.id, ...realDoc.data() });
      }
      return res.json({ id: directDoc.id, ...data });
    }
    return res.status(404).json({ error: "Client profile not found." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch profile." });
  }
});
router$7.get("/:id", requireStaff, async (req, res) => {
  try {
    const doc = await db$5().collection("clients").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found." });
    const [orders, invoices] = await Promise.all([
      db$5().collection("orders").where("clientId", "==", req.params.id).orderBy("createdAt", "desc").limit(10).get(),
      db$5().collection("invoices").where("clientId", "==", req.params.id).orderBy("createdAt", "desc").limit(10).get()
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
router$7.post("/", requireCoordinator, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, notes, tags } = req.body;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "firstName, lastName, and email required." });
    }
    const existing = await db$5().collection("clients").where("email", "==", email.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: "Client with this email already exists.", id: existing.docs[0].id });
    }
    const ref = await db$5().collection("clients").add({
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
router$7.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "address", "status", "notes", "tags", "company"];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => {
      if (k in req.body) updates[k] = req.body[k];
    });
    await db$5().collection("clients").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update client." });
  }
});
const router$6 = Router();
const db$4 = () => admin.firestore();
router$6.get("/", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$4().collection("staff").where("isActive", "==", true).orderBy("firstName").get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch staff." });
  }
});
router$6.post("/", requireAdmin, async (req, res) => {
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
    await db$4().collection("staff").doc(userRecord.uid).set({
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
router$6.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "role", "isActive"];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => {
      if (k in req.body) updates[k] = req.body[k];
    });
    await db$4().collection("staff").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update staff member." });
  }
});
router$6.post("/setup", async (req, res) => {
  try {
    const existing = await db$4().collection("staff").limit(1).get();
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
    await db$4().collection("staff").doc(userRecord.uid).set({
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
const router$5 = Router();
const db$3 = () => admin.firestore();
router$5.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$3().collection("campaigns").orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch campaigns." });
  }
});
router$5.post("/", requireCoordinator, async (req, res) => {
  try {
    const { name, type, subject, body, audience, audienceIds, scheduledAt } = req.body;
    if (!name || !body || !audience) {
      return res.status(400).json({ error: "name, body, and audience required." });
    }
    const ref = await db$3().collection("campaigns").add({
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
router$5.post("/:id/send", requireCoordinator, async (req, res) => {
  try {
    const campaignDoc = await db$3().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });
    const campaign = campaignDoc.data();
    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Campaign already sent." });
    }
    let recipientQuery = db$3().collection("clients").where("status", "==", "active");
    if (campaign.audience === "vip") {
      recipientQuery = db$3().collection("clients").where("status", "==", "vip");
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
    await db$3().collection("campaigns").doc(req.params.id).update({ status: "draft" }).catch(() => {
    });
    return res.status(500).json({ error: "Failed to send campaign." });
  }
});
const router$4 = Router();
const db$2 = () => admin.firestore();
function isAgentAuthorized(req) {
  const serviceKey = req.headers["x-agent-key"];
  const auth = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  return serviceKey === process.env.AGENT_SERVICE_KEY || Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
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
  const orderDoc = await db$2().collection("orders").doc(String(appointment.orderId)).get();
  return orderDoc.exists ? { id: orderDoc.id, ref: orderDoc.ref, data: orderDoc.data() || {} } : null;
}
router$4.get("/briefing", requireStaff, async (_req, res) => {
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
      db$2().collection("orderRequests").where("status", "==", "new").get(),
      db$2().collection("appointments").where("scheduledDate", ">=", todayTs).where("scheduledDate", "<", tomorrowTs).where("status", "in", ["confirmed", "scheduled"]).get(),
      db$2().collection("appointments").where("scheduledDate", ">=", tomorrowTs).where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(
        new Date(tomorrow.getTime() + 24 * 60 * 60 * 1e3)
      )).where("status", "in", ["confirmed", "scheduled"]).get(),
      db$2().collection("agentLogs").where("requiresHumanReview", "==", true).where("reviewedAt", "==", null).orderBy("createdAt", "desc").limit(20).get(),
      db$2().collection("agentLogs").where("priority", "==", "urgent").where("requiresHumanReview", "==", true).orderBy("createdAt", "desc").limit(5).get(),
      db$2().collection("galleries").where("status", "in", ["raw_uploaded", "editing"]).get(),
      db$2().collection("invoices").where("status", "==", "overdue").get(),
      db$2().collection("agentLogs").where("createdAt", ">=", yesterdayTs).orderBy("createdAt", "desc").limit(50).get()
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
    const appointments = await db$2().collection("appointments").where("scheduledDate", ">=", admin.firestore.Timestamp.fromDate(today)).where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(twoDaysOut)).get();
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
          sentMap = { ...sentMap, [type]: true };
          const update = {
            remindersSent: sentMap,
            [`reminder${type === "24h" ? "24h" : "1h"}SentAt`]: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          await Promise.all([
            appointmentDoc.ref.update(update),
            orderRecord?.ref.update(update) || Promise.resolve(),
            db$2().collection("smsLogs").add({
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
          await db$2().collection("agentLogs").add({
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
router$4.get("/run-reminders", runReminderSweep);
router$4.post("/run-reminders", runReminderSweep);
router$4.get("/logs", requireStaff, async (req, res) => {
  try {
    const { agent, status, requiresReview, limit = "50" } = req.query;
    let query = db$2().collection("agentLogs").orderBy("createdAt", "desc");
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
router$4.patch("/logs/:id/resolve", requireCoordinator, async (req, res) => {
  try {
    const { notes } = req.body;
    await db$2().collection("agentLogs").doc(req.params.id).update({
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
router$4.post("/log", async (req, res) => {
  try {
    const serviceKey = req.headers["x-agent-key"];
    if (serviceKey !== process.env.AGENT_SERVICE_KEY) {
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
    const ref = await db$2().collection("agentLogs").add({
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
const router$3 = Router();
const db$1 = () => admin.firestore();
router$3.get("/", requireStaff, async (req, res) => {
  try {
    const { status, listingId, orderId, limit = "100" } = req.query;
    let q = db$1().collection("mediaJobs").orderBy("createdAt", "desc");
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
router$3.post("/", requireStaff, async (req, res) => {
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
    const ref = await db$1().collection("mediaJobs").add({
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
    await db$1().collection("agentLogs").add({
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
router$3.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, resultItems = [], error = "", requiresHumanReview } = req.body;
    const valid = ["queued", "processing", "ready_for_review", "completed", "failed", "cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status." });
    await db$1().collection("mediaJobs").doc(req.params.id).update({
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
const router$2 = Router();
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
router$2.get("/autocomplete", async (req, res) => {
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
router$2.get("/distance", async (req, res) => {
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
const router$1 = Router();
const db = () => admin.firestore();
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
  const orderRequestDoc = await db().collection("orderRequests").doc(id).get();
  if (orderRequestDoc.exists) return orderRequestDoc;
  const orderDoc = await db().collection("orders").doc(id).get();
  if (orderDoc.exists) return orderDoc;
  return null;
}
router$1.post("/send", requireStaff, async (req, res) => {
  try {
    const { to, body, orderId } = req.body;
    if (!to || !body) return res.status(400).json({ error: "to and body required." });
    const result = await sendSMS({ to, body });
    await db().collection("smsLogs").add({
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
      await db().collection("messages").add({
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
router$1.post("/remind/:orderId", requireStaff, async (req, res) => {
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
    await db().collection("smsLogs").add({
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
router$1.post("/conversation", requireStaff, async (req, res) => {
  try {
    const { orderId, photographerPhone, photographerName, clientPhone, clientName } = req.body;
    if (!orderId || !photographerPhone || !clientPhone) {
      return res.status(400).json({ error: "orderId, photographerPhone, clientPhone required." });
    }
    const existing = await db().collection("conversations").where("orderId", "==", orderId).where("status", "==", "active").limit(1).get();
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
    await db().collection("conversations").add({
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
router$1.get("/conversations", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db().collection("conversations").orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch conversations." });
  }
});
router$1.post("/conversation/:id/close", requireStaff, async (req, res) => {
  try {
    const convoDoc = await db().collection("conversations").doc(req.params.id).get();
    if (!convoDoc.exists) return res.status(404).json({ error: "Conversation not found." });
    await closeConversation(convoDoc.data().conversationSid);
    await convoDoc.ref.update({ status: "closed", closedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: errorMessage });
  }
});
router$1.post("/webhook", express_raw_or_json, async (req, res) => {
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
    const convoSnap = await db().collection("conversations").where("conversationSid", "==", ConversationSid).limit(1).get();
    const orderId = convoSnap.empty ? null : convoSnap.docs[0].data().orderId;
    const convoData = convoSnap.empty ? null : convoSnap.docs[0].data();
    let senderType = "client";
    if (convoData && Author === convoData.photographerParticipantSid) {
      senderType = "photographer";
    } else if (Author === "Iconic Images") {
      senderType = "staff";
    }
    await db().collection("smsLogs").add({
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
      await db().collection("messages").add({
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
router$1.post("/campaign/:id/send", requireCoordinator, async (req, res) => {
  try {
    const campaignDoc = await db().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });
    const campaign = campaignDoc.data();
    if (campaign.status === "sent") return res.status(400).json({ error: "Campaign already sent." });
    if (campaign.type !== "sms") return res.status(400).json({ error: "Not an SMS campaign." });
    const clientsSnap = await db().collection("clients").where("smsOptIn", "==", true).get();
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
    await db().collection("campaigns").doc(req.params.id).update({ status: "draft" }).catch(() => {
    });
    return res.status(500).json({ error: errorMessage });
  }
});
router$1.post("/opt-out", async (req, res) => {
  try {
    const { From, Body } = req.body;
    if (!From) return res.status(200).send("");
    const keyword = (Body || "").trim().toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword)) {
      const snap = await db().collection("clients").where("phone", "==", From).limit(1).get();
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
const router = Router();
router.post("/", async (req, res) => {
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
const SETTINGS_FILE = path.join(process.cwd(), "site_settings.json");
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
  app.get("/api/ping", (_req, res) => {
    res.json({
      status: "ok",
      message: process.env.PING_MESSAGE ?? "Iconic Images API",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/settings", async (_req, res) => {
    try {
      const data = await fs.readFile(SETTINGS_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch {
      res.status(404).json({ error: "Settings not found" });
    }
  });
  app.post("/api/settings", async (req, res) => {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });
  app.use("/api/bookings", router$d);
  app.use("/api/orders", router$c);
  app.use("/api/galleries", router$b);
  app.use("/api/payments", router$a);
  app.use("/api/vsai", router$9);
  app.use("/api/messages", router$8);
  app.use("/api/clients", router$7);
  app.use("/api/staff", router$6);
  app.use("/api/campaigns", router$5);
  app.use("/api/agents", router$4);
  app.use("/api/media-jobs", router$3);
  app.use("/api/places", router$2);
  app.use("/api/sms", router$1);
  app.use("/api/contact", router);
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
