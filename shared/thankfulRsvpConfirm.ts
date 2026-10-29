/**
 * Thankful (Sat Nov 7, 2026) RSVP appointment confirmation email.
 * Live send only when THANKFUL_RSVP_CONFIRM_LIVE is exactly "true".
 * Independent of CLIENT_NOTIFY_LIVE / CLIENT_COMMS_ZONE. Do not flip those.
 */

import { BUSINESS_CONTACT } from "./businessContact.ts";
import { clientEmailContactLineHtml } from "./clientEmailContact.ts";
import { publicClientUrl } from "./publicSiteUrl.ts";
import {
  holidayHeadcountLabel,
  holidayMenuVote,
  holidaySantaLabel,
} from "./holidayCalendar.ts";
import { THANKFUL_EVENT_DATE, THANKFUL_EVENT_HOURS, THANKFUL_EVENT_WHEN } from "./thankfulEvent.ts";

export const THANKFUL_RSVP_CONFIRM_TEMPLATE = "thankful_rsvp_confirm";
export const THANKFUL_RSVP_CONFIRM_ENV = "THANKFUL_RSVP_CONFIRM_LIVE";

export function thankfulRsvpConfirmLive(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[THANKFUL_RSVP_CONFIRM_ENV] === "true";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function thankfulRsvpConfirmSubject(clientName: string, photoTime: string): string {
  const name = clientName.trim() || "friend";
  const slot = photoTime.trim();
  if (slot) return `You're on the list, ${name} — Sat Nov 7 at ${slot}`;
  return `You're on the list, ${name} — Iconic Client Holiday Event`;
}

export interface ThankfulRsvpConfirmInput {
  clientName: string;
  photoTime: string;
  headcount?: string;
  menuVote?: string;
  santa?: string;
  notes?: string;
  requestId?: string;
}

/** Prefer structured fields; fall back to vibeNote lines on the order. */
export function thankfulRsvpConfirmFieldsFromOrder(order: Record<string, unknown>): {
  headcount: string;
  menuVote: string;
  santa: string;
} {
  return {
    headcount: holidayHeadcountLabel(order),
    menuVote: holidayMenuVote(order),
    santa: holidaySantaLabel(order),
  };
}

export function thankfulRsvpConfirmHtml(input: ThankfulRsvpConfirmInput): string {
  const pageUrl = publicClientUrl("/thankful");
  const first = (input.clientName.trim().split(/\s+/)[0] || "friend");
  const photoTime = input.photoTime.trim() || "we'll confirm your photo time";
  const rows: Array<[string, string]> = [
    ["When", `${THANKFUL_EVENT_WHEN} · ${THANKFUL_EVENT_HOURS}`],
    ["Where", BUSINESS_CONTACT.address],
    ["Your photo time", photoTime],
  ];
  if (input.headcount?.trim()) rows.push(["Headcount", input.headcount.trim()]);
  if (input.menuVote?.trim()) rows.push(["Menu vote", input.menuVote.trim()]);
  if (input.santa?.trim()) rows.push(["Photos with Santa", input.santa.trim()]);
  if (input.notes?.trim()) rows.push(["Notes", input.notes.trim()]);

  const detailRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#8a7464;font-size:13px;width:140px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 0;color:#1a120e;font-size:15px;font-weight:500;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const requestLine = input.requestId?.trim()
    ? `<p style="color:#8a7464;font-size:12px;margin:24px 0 0;">Confirmation ID: <strong style="color:#1a120e;">${escapeHtml(input.requestId.trim())}</strong></p>`
    : "";

  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:600px;margin:0 auto;padding:0;background:#f6efe4;">
  <div style="background:#1a120e;padding:28px 24px;text-align:center;">
    <p style="color:#e7d3a1;margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Iconic Images</p>
    <h1 style="color:#f6efe4;margin:10px 0 0;font-size:26px;font-weight:500;line-height:1.25;">You're on the list</h1>
    <p style="color:#c4a574;margin:8px 0 0;font-size:14px;">Iconic Client Holiday Event · Thankful for You, ALWAYS ♥</p>
  </div>
  <div style="padding:28px 24px 8px;background:#ffffff;">
    <p style="color:#1a120e;font-size:17px;line-height:1.55;margin:0 0 16px;">Hi ${escapeHtml(first)},</p>
    <p style="color:#1a120e;font-size:16px;line-height:1.6;margin:0 0 16px;">Your RSVP went through — we can't wait to see you. Come hungry, bring everyone, and let us make you look amazing for 2027.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 20px;">${detailRows}</table>
    <p style="color:#1a120e;font-size:15px;line-height:1.6;margin:0 0 8px;">Need to change your time or headcount? Call us at <a href="${BUSINESS_CONTACT.phoneHref}" style="color:#9b2c3a;font-weight:600;text-decoration:underline;">${escapeHtml(BUSINESS_CONTACT.phoneDisplay)}</a>.</p>
    <p style="margin:22px 0 8px;text-align:center;"><a href="${escapeHtml(pageUrl)}" style="display:inline-block;background:#9b2c3a;color:#f6efe4;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;letter-spacing:0.04em;">View the event page</a></p>
    ${requestLine}
  </div>
  <div style="border-top:1px solid #e8dcc8;padding:18px 24px 28px;background:#ffffff;text-align:center;color:#8a7464;font-size:12px;line-height:1.6;">
    <p style="margin:0 0 6px;">${clientEmailContactLineHtml("#8a7464")}</p>
    <p style="margin:0;"><a href="${escapeHtml(pageUrl)}" style="color:#8a7464;text-decoration:underline;">iconicimagestx.vercel.app/thankful</a></p>
  </div>
</div>`;
}

export function thankfulRsvpConfirmText(input: ThankfulRsvpConfirmInput): string {
  const first = (input.clientName.trim().split(/\s+/)[0] || "friend");
  const photoTime = input.photoTime.trim() || "we'll confirm your photo time";
  const lines = [
    `Hi ${first},`,
    "",
    "Your RSVP went through — we can't wait to see you.",
    "",
    `When: ${THANKFUL_EVENT_WHEN} · ${THANKFUL_EVENT_HOURS}`,
    `Where: ${BUSINESS_CONTACT.address}`,
    `Your photo time: ${photoTime}`,
  ];
  if (input.headcount?.trim()) lines.push(`Headcount: ${input.headcount.trim()}`);
  if (input.menuVote?.trim()) lines.push(`Menu vote: ${input.menuVote.trim()}`);
  if (input.santa?.trim()) lines.push(`Photos with Santa: ${input.santa.trim()}`);
  if (input.notes?.trim()) lines.push(`Notes: ${input.notes.trim()}`);
  lines.push(
    "",
    `Need to change anything? Call ${BUSINESS_CONTACT.phoneDisplay}.`,
    "",
    publicClientUrl("/thankful"),
  );
  if (input.requestId?.trim()) lines.push("", `Confirmation ID: ${input.requestId.trim()}`);
  return lines.join("\n");
}

/** Whole-event .ics (11 AM – 3 PM CT). Photo time lives in the description. */
export function thankfulRsvpConfirmIcs(input: ThankfulRsvpConfirmInput): string {
  const uid = `thankful-rsvp-${(input.requestId || "guest").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}@iconicimagestx.com`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const photoTime = input.photoTime.trim() || "TBD";
  const description = [
    "Iconic Client Holiday Event — Thankful for You, ALWAYS.",
    `Your photo time: ${photoTime}.`,
    input.headcount?.trim() ? `Headcount: ${input.headcount.trim()}.` : "",
    input.menuVote?.trim() ? `Menu vote: ${input.menuVote.trim()}.` : "",
    `Questions: ${BUSINESS_CONTACT.phoneDisplay}.`,
    publicClientUrl("/thankful"),
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Iconic Images//Thankful RSVP//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Chicago:${THANKFUL_EVENT_DATE.replace(/-/g, "")}T110000`,
    `DTEND;TZID=America/Chicago:${THANKFUL_EVENT_DATE.replace(/-/g, "")}T150000`,
    `SUMMARY:${escapeIcsText("Iconic Client Holiday Event — Thankful for You")}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(BUSINESS_CONTACT.address)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}
