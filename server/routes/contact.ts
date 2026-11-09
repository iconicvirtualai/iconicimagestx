import { Router } from "express";
import { CONTACT_FORM_EMAIL_TEMPLATE, mailboxAddress } from "../../shared/clientNotify";
import { sendEmail } from "../services/email";

const router = Router();

const STAFF_INBOX_FALLBACK = "photos@iconicimagestx.com";
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Staff inbox only. CONTACT_FORM_EMAIL, or photos@ when that is unset.
 * The visitor address is never a To, Cc, or Bcc recipient.
 */
export function contactFormStaffTo(
  senderEmail: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const configured = (env.CONTACT_FORM_EMAIL || STAFF_INBOX_FALLBACK).trim();
  const sender = mailboxAddress(senderEmail) ?? senderEmail.trim().toLowerCase();
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const part of configured.split(/[,;]/)) {
    const email = part.trim();
    const key = mailboxAddress(email) ?? email.toLowerCase();
    if (!email || key === sender || seen.has(key)) continue;
    seen.add(key);
    kept.push(email);
  }
  return kept.length > 0 ? kept.join(", ") : null;
}

/** Message only. Nodemailer errors can carry SMTP auth. */
function contactFailureLog(error: unknown): string {
  const message = error instanceof Error ? error.message : "Contact form send failed.";
  const secrets = [process.env.SMTP_PASS, process.env.SMTP_USER, process.env.EMAIL_FROM]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  let safe = message;
  for (const secret of secrets) safe = safe.split(secret).join("[redacted]");
  return safe.slice(0, 300);
}

/**
 * POST /api/contact
 * Sends the inquiry to the office inbox and a gated confirmation to the sender.
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message, phone } = req.body ?? {};

    if (
      typeof name !== "string"
      || typeof email !== "string"
      || typeof subject !== "string"
      || typeof message !== "string"
      || !name.trim()
      || !email.trim()
      || !subject.trim()
      || !message.trim()
    ) {
      return res.status(400).json({
        error: "Missing required fields: name, email, subject, message",
      });
    }

    const safeSubject = subject.replace(/[\r\n]+/g, " ").trim();
    const safeMessage = message.trim();
    if (safeSubject.length > MAX_SUBJECT_LENGTH || safeMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer and message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const senderEmail = email.trim();
    if (!emailRegex.test(senderEmail)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const staffTo = contactFormStaffTo(senderEmail);
    if (!staffTo) {
      console.error("[Contact] Staff inbox matched the sender. No staff recipient remained.");
      return res.status(500).json({
        error: "Failed to send message. Please try again later.",
      });
    }

    const senderPhone = typeof phone === "string" && phone.trim() ? phone.trim() : "Not provided";

    await sendEmail({
      to: staffTo,
      replyTo: senderEmail,
      template: CONTACT_FORM_EMAIL_TEMPLATE,
      audience: "staff",
      subject: `New Contact Form: ${safeSubject}`,
      variables: {
        senderName: escapeHtml(name.trim()),
        senderEmail: escapeHtml(senderEmail),
        senderPhone: escapeHtml(senderPhone),
        subject: escapeHtml(safeSubject),
        message: escapeHtml(safeMessage),
      },
    });

    // Client auto-reply stays on CLIENT_NOTIFY_LIVE / RED / NOTIFY_TEST_ALLOWLIST.
    await sendEmail({
      to: senderEmail,
      template: "contact_confirmation",
      subject: "We received your message",
      variables: {
        name: name.trim(),
      },
    });

    res.json({
      success: true,
      message: "Your message has been sent successfully. We'll get back to you soon!",
    });
  } catch (error) {
    console.error("[Contact] Error:", contactFailureLog(error));
    res.status(500).json({
      error: "Failed to send message. Please try again later.",
    });
  }
});

export default router;
