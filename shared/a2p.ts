/**
 * A2P 10DLC copy and consent checks shared by the public pages,
 * the crawlable HTML shells, and the SMS send paths.
 * Consent text versions are the strings a reviewer and a stored record share.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";

export const LEGAL_LAST_UPDATED = "November 27, 2026";

export const PRIVACY_POLICY_URL = "https://www.iconicimagestx.com/privacy";
export const TERMS_URL = "https://www.iconicimagestx.com/terms";

export const TRANSACTIONAL_SMS_CONSENT_VERSION = "2026-11-27-transactional-marketing-v1";

/** Visible booking-checkbox copy, including the policy link labels. */
export const TRANSACTIONAL_SMS_CONSENT_TEXT =
  "I agree to receive text messages from Iconic Images, including transactional and notification texts (booking confirmations, appointment reminders, shoot updates, gallery delivery alerts, and account/order updates) and marketing and promotional texts (special offers, seasonal promotions, and marketing updates from Iconic Images). Message frequency varies. Message & data rates may apply. Reply STOP to opt out, HELP for help, or contact 281.356.0965 or photos@iconicimagestx.com. Consent is not a condition of purchase. Privacy Policy · Terms and Conditions.";

export const MARKETING_SMS_CONSENT_VERSION = "2026-10-01-marketing-v1";

/** Checkbox label on /sms. Policy names are links in the page. */
export const MARKETING_SMS_CONSENT_TEXT =
  "I agree to receive promotional and marketing text messages from Iconic Images Photography, LLC about photography services, offers, and events. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help, or contact 281.356.0965 or photos@iconicimagestx.com. Consent is not a condition of purchase. View our Privacy Policy and Terms.";

export const MARKETING_SMS_NO_SHARE_TEXT =
  "Iconic Images does not share mobile numbers or messaging consent with third parties or affiliates for marketing.";

/** Sent only when CAMPAIGN_SEND_LIVE is exactly true. */
export const MARKETING_OPT_IN_CONFIRMATION =
  "Iconic Images Photography, LLC: You're signed up for promotional texts about photography services, offers, and events. Message frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to opt out.";

export const SMS_HELP_REPLY =
  "Iconic Images Photography, LLC. Help: photos@iconicimagestx.com or 281.356.0965. Msg & data rates may apply. Reply STOP to opt out.";

const HELP_WORDS = ["HELP", "INFO"];

export function isHelpKeyword(body: string): boolean {
  return HELP_WORDS.includes(String(body || "").trim().toUpperCase());
}

export function phoneDigits10(value: string): string {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** Formats we may have saved a client or contact phone under. Firestore `in` allows 10. */
export function phoneLookupValues(value: string): string[] {
  const digits = phoneDigits10(value);
  if (!digits) return [];
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6);
  return [...new Set([
    value.trim(),
    digits,
    `1${digits}`,
    `+1${digits}`,
    `+${digits}`,
    `${area}-${prefix}-${line}`,
    `${area}.${prefix}.${line}`,
    `(${area}) ${prefix}-${line}`,
    `${area} ${prefix} ${line}`,
  ])].slice(0, 10);
}

export function hasTransactionalSmsConsent(record: { smsConsent?: unknown } | null | undefined): boolean {
  return record?.smsConsent === true;
}

export function transactionalSmsBlockReason(input: {
  smsConsent: unknown;
  stopped: boolean;
}): "no_sms_consent" | "sms_stopped" | null {
  if (input.smsConsent !== true) return "no_sms_consent";
  if (input.stopped) return "sms_stopped";
  return null;
}

/** Explicit marketing opt-in. A missing flag is not consent. STOP and do-not-contact lose. */
export function explicitMarketingSmsOptIn(record: {
  marketingSmsOptIn?: unknown;
  smsOptIn?: unknown;
  smsStopped?: unknown;
  doNotContact?: unknown;
} | null | undefined): boolean {
  if (!record) return false;
  if (record.smsStopped === true || record.doNotContact === true) return false;
  return record.marketingSmsOptIn === true || record.smsOptIn === true;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twimlMessage(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(text)}</Message></Response>`;
}

export function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
}

export function contactLineHtml(linkStyle = "color:#0f766e"): string {
  const address = escapeXml(BUSINESS_CONTACT.address);
  const phone = escapeXml(BUSINESS_CONTACT.phoneDisplay);
  const email = escapeXml(BUSINESS_CONTACT.email);
  return `<p>${LEGAL_BUSINESS_NAME}<br/>Iconic Images / Iconic Images TX</p><p><a href="${escapeXml(BUSINESS_CONTACT.mapsHref)}" style="${linkStyle}">${address}</a> | <a href="${escapeXml(BUSINESS_CONTACT.phoneHref)}" style="${linkStyle}">${phone}</a> | <a href="mailto:${email}" style="${linkStyle}">${email}</a></p>`;
}
