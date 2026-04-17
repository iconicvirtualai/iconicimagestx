/**
 * Iconic Images — Twilio SMS Service
 *
 * Handles:
 *   • One-way transactional SMS (confirmations, alerts, reminders)
 *   • Bulk campaign SMS via Messaging Service (auto opt-out handling)
 *   • Masked two-way conversations via Twilio Conversations API
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER        — Your Twilio number (e.g. +18325551234)
 *   TWILIO_MESSAGING_SERVICE_SID  — For bulk campaigns (optional, falls back to phone number)
 *   TWILIO_CONVERSATIONS_SERVICE_SID — For masked messaging (optional, uses default)
 */

import twilio from "twilio";

// ─── Client ──────────────────────────────────────────────────────────────────

let _client: ReturnType<typeof twilio> | null = null;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a phone number to E.164 format (+1XXXXXXXXXX for US numbers) */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// ─── Transactional SMS ────────────────────────────────────────────────────────

export interface SendSMSOptions {
  to: string;          // raw phone number
  body: string;        // message text (≤ 1600 chars)
  from?: string;       // override sender (defaults to TWILIO_PHONE_NUMBER)
}

export async function sendSMS({ to, body, from }: SendSMSOptions) {
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) throw new Error("TWILIO_PHONE_NUMBER not set.");

  const client = getClient();
  const message = await client.messages.create({
    to: normalisePhone(to),
    from: fromNumber,
    body,
  });

  console.log(`[SMS] Sent to ${to} — SID: ${message.sid}`);
  return { sid: message.sid, status: message.status };
}

// ─── Bulk campaign SMS ────────────────────────────────────────────────────────

export interface BulkSMSRecipient {
  phone: string;
  name?: string;
}

export async function sendSMSCampaign(
  recipients: BulkSMSRecipient[],
  bodyTemplate: string,       // use {{name}} for personalisation
  messagingServiceSid?: string
) {
  const client = getClient();
  const sid = messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  const results: { phone: string; sid?: string; error?: string }[] = [];

  for (const recipient of recipients) {
    if (!recipient.phone) continue;
    const body = bodyTemplate.replace(/\{\{name\}\}/gi, recipient.name || "there");

    try {
      const msg = await client.messages.create({
        to: normalisePhone(recipient.phone),
        ...(sid ? { messagingServiceSid: sid } : { from: fromNumber }),
        body,
      });
      results.push({ phone: recipient.phone, sid: msg.sid });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[SMS] Campaign send failed for ${recipient.phone}:`, errorMessage);
      results.push({ phone: recipient.phone, error: errorMessage });
    }

    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 50));
  }

  return results;
}

// ─── Masked Conversations (Photographer ↔ Client) ─────────────────────────────
//
// Twilio Conversations API creates a virtual conversation where both parties
// text a Twilio proxy number — neither side sees the other's real number.
// Messages flow through the webhook back into Firestore.

export interface ConversationParticipant {
  phone: string;       // real phone number
  name?: string;       // friendly label
}

export async function createMaskedConversation(
  friendlyName: string,                   // e.g. "Booking #ABC123 – Jane + Alex"
  photographer: ConversationParticipant,
  client: ConversationParticipant,
  webhookUrl?: string
) {
  const client_sdk = getClient();

  // 1. Create the conversation
  const conversation = await client_sdk.conversations.v1.conversations.create({
    friendlyName,
    timers: {
      inactive: "P30D",   // auto-close after 30 days inactive
      closed: "P60D",
    },
  });

  const conversationSid = conversation.sid;

  // 2. Optionally attach a webhook for inbound messages
  if (webhookUrl) {
    await client_sdk.conversations.v1
      .conversations(conversationSid)
      .webhooks.create({
        target: "webhook",
        "configuration.method": "POST",
        "configuration.url": webhookUrl,
        "configuration.filters": ["onMessageAdded"],
      });
  }

  // 3. Add photographer as SMS participant
  const photographerParticipant = await client_sdk.conversations.v1
    .conversations(conversationSid)
    .participants.create({
      "messagingBinding.type": "sms",
      "messagingBinding.address": normalisePhone(photographer.phone),
      identity: `photographer_${normalisePhone(photographer.phone).replace("+", "")}`,
    });

  // 4. Add client as SMS participant
  const clientParticipant = await client_sdk.conversations.v1
    .conversations(conversationSid)
    .participants.create({
      "messagingBinding.type": "sms",
      "messagingBinding.address": normalisePhone(client.phone),
      identity: `client_${normalisePhone(client.phone).replace("+", "")}`,
    });

  console.log(`[Conversations] Created: ${conversationSid} (${friendlyName})`);

  return {
    conversationSid,
    photographerParticipantSid: photographerParticipant.sid,
    clientParticipantSid: clientParticipant.sid,
  };
}

/** Send a message into a conversation from the "system" (appears as Iconic Images) */
export async function sendConversationMessage(
  conversationSid: string,
  body: string,
  author = "Iconic Images"
) {
  const client_sdk = getClient();
  const message = await client_sdk.conversations.v1
    .conversations(conversationSid)
    .messages.create({ body, author });

  return { sid: message.sid };
}

/** Close/delete a conversation when the booking is complete */
export async function closeConversation(conversationSid: string) {
  const client_sdk = getClient();
  await client_sdk.conversations.v1
    .conversations(conversationSid)
    .update({ state: "closed" });
  console.log(`[Conversations] Closed: ${conversationSid}`);
}

// ─── Pre-built SMS templates ───────────────────────────────────────────────────

export const SMS_TEMPLATES = {
  bookingConfirmation: (
    name: string,
    date: string,
    address: string,
    total: string
  ) =>
    `Hi ${name}! 📸 Your Iconic Images session is confirmed!\n\n` +
    `📅 ${date}\n📍 ${address}\n💳 Total: ${total}\n\n` +
    `We'll send a reminder 24 hrs before. Questions? Reply to this text!`,

  appointmentReminder24h: (name: string, date: string, time: string, address: string) =>
    `Hey ${name}, reminder! Your Iconic Images shoot is tomorrow 📸\n\n` +
    `🕐 ${time}\n📍 ${address}\n\n` +
    `Reply CONFIRM to confirm or call us to reschedule.`,

  appointmentReminder1h: (name: string, time: string) =>
    `Hi ${name}! Your photographer is on the way — arriving around ${time} 📸\n` +
    `Reply to this text with any last-minute notes!`,

  photosDelivered: (name: string, galleryUrl: string) =>
    `🎉 ${name}, your photos are ready!\n\n` +
    `View your gallery: ${galleryUrl}\n\n` +
    `Questions or edits? Just reply here. — Iconic Images`,

  photographerIntro: (photographerName: string, clientName: string, date: string) =>
    `Hi ${clientName}! I'm ${photographerName}, your Iconic Images photographer for ${date}. ` +
    `Feel free to text me here with any questions before the shoot! 📸`,

  newBookingAlert: (address: string, date: string, services: string) =>
    `🔔 NEW BOOKING — Iconic Images\n\n📍 ${address}\n📅 ${date}\n🏠 ${services}\n\nCheck dashboard for details.`,
};
