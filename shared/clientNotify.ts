/**
 * Kill switch for non-order client email and SMS (marketing, portal,
 * password setup, contact auto-acks, campaigns, reminders).
 *
 * Those sends are allowed only when CLIENT_NOTIFY_LIVE is exactly "true"
 * AND CLIENT_COMMS_ZONE is not "RED". Unset, empty, "TRUE", "1", or
 * "false" stays OFF.
 *
 * Order-received client confirmation is excluded: email template booking_received
 * and SMS kind booking_confirmation. Both stay default-on and are not blocked
 * by RED or by this flag.
 * Do not set BOOKING_NOTIFY_LIVE.
 *
 * Staff-only inbound is also excluded: live chat from a site visitor to the
 * office (template live_chat with audience "staff", SMS kind staff_inbound).
 * That path never messages the visitor. staff_inbound may only be sent to
 * the Iconic Google Voice number.
 *
 * NOTIFY_TEST_ALLOWLIST is a comma-separated list of exact mailbox addresses
 * for QA. Matching is trim and lowercase only. A plus-tag is part of the
 * address: ops+deliveryqa@iconicimagestx.com does not match ops@iconicimagestx.com.
 * Domains and wildcards are not patterns; *@iconicimagestx.com matches only
 * that literal mailbox. An empty or unset list changes nothing.
 *
 * While the global switch is off — including when CLIENT_COMMS_ZONE is RED —
 * a gated client email may still be sent, but only to addresses on that list.
 * RED continues to block every real client. Allowlisted addresses are internal
 * test inboxes, so they may receive gated client mail during RED.
 * To, Cc, Bcc, and Reply-To are filtered together. A non-matching address is
 * never left on the message, so a test send cannot fan out to a client.
 * When the switch is on, the allowlist is not consulted.
 * The booking_received and staff carve-outs are unchanged and are not
 * narrowed to the allowlist.
 */
export const ORDER_RECEIVED_EMAIL_TEMPLATE = "booking_received";
export const ORDER_RECEIVED_SMS_KIND = "booking_confirmation";

/** Visitor live chat → office inbox. Not a client send. */
export const STAFF_INBOUND_EMAIL_TEMPLATE = "live_chat";
/** Saved new-order alert → ADMIN_EMAIL and COORDINATOR_EMAIL. Not a client send. */
export const OFFICE_NEW_ORDER_EMAIL_TEMPLATE = "office_new_order";
/** Visitor live chat → office Google Voice. Not a client send. */
export const STAFF_INBOUND_SMS_KIND = "staff_inbound";
/** Iconic Images Google Voice, E.164. */
export const STAFF_INBOUND_SMS_TO = "+12813560965";

export function clientNotifyLive(env: Record<string, string | undefined> = process.env): boolean {
  if (env.CLIENT_COMMS_ZONE === "RED") return false;
  return env.CLIENT_NOTIFY_LIVE === "true";
}

/**
 * booking_received always sends.
 * live_chat sends only when the caller marks audience "staff".
 * Every other template follows the blast kill.
 */
export function emailAllowed(
  template: string,
  env: Record<string, string | undefined> = process.env,
  audience?: "client" | "staff",
): boolean {
  if (template === ORDER_RECEIVED_EMAIL_TEMPLATE) return true;
  if (audience === "staff" && template === STAFF_INBOUND_EMAIL_TEMPLATE) return true;
  if (audience === "staff" && template === OFFICE_NEW_ORDER_EMAIL_TEMPLATE) return true;
  return clientNotifyLive(env);
}

/**
 * Client bookingConfirmation SMS always sends.
 * staff_inbound (office Voice only) always sends.
 * Every other SMS follows the blast kill.
 */
export function smsAllowed(kind?: string, env: Record<string, string | undefined> = process.env): boolean {
  if (kind === ORDER_RECEIVED_SMS_KIND) return true;
  if (kind === STAFF_INBOUND_SMS_KIND) return true;
  return clientNotifyLive(env);
}

/** staff_inbound may target only the office Google Voice number. */
export function isStaffInboundSmsDestination(to: string): boolean {
  const digits = to.replace(/\D/g, "");
  return digits === "12813560965" || digits === "2813560965";
}

export function clientNotifyBlockReason(env: Record<string, string | undefined> = process.env): string {
  if (env.CLIENT_COMMS_ZONE === "RED") return "CLIENT_COMMS_ZONE=RED";
  return "CLIENT_NOTIFY_LIVE is not exactly true";
}

const MAILBOX = /^[^\s@,;<>"]+@[^\s@,;<>"]+$/;

/**
 * One addr-spec. Display names are unwrapped. The local part, including any
 * plus-tag, is kept verbatim aside from case.
 */
export function mailboxAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const wrapped = trimmed.match(/^(?:"[^"]*"|[^<"]*?)\s*<([^<>]+)>\s*$/);
  const candidate = (wrapped ? wrapped[1] : trimmed).trim().toLowerCase();
  if (!MAILBOX.test(candidate)) return null;
  return candidate;
}

/** Exact allowlist entries. Empty when the variable is unset, blank, or has no mailboxes. */
export function notifyTestAllowlist(env: Record<string, string | undefined> = process.env): ReadonlySet<string> {
  const raw = env.NOTIFY_TEST_ALLOWLIST;
  const allow = new Set<string>();
  if (!raw) return allow;
  for (const part of raw.split(",")) {
    const address = mailboxAddress(part);
    if (address) allow.add(address);
  }
  return allow;
}

export function isNotifyTestAllowlisted(
  address: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const mailbox = mailboxAddress(address);
  if (!mailbox) return false;
  return notifyTestAllowlist(env).has(mailbox);
}

export interface NarrowedClientMail {
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  held: string[];
}

function recipientTokens(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}

function keepExact(value: string | undefined, allow: ReadonlySet<string>, held: string[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
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

/**
 * Recipients for a gated client send.
 * Returns null when the allowlist is empty or no delivery recipient remains.
 * Reply-To is not a delivery recipient and never causes a send by itself.
 */
export function narrowGatedClientRecipients(
  input: { to?: string; cc?: string; bcc?: string; replyTo?: string },
  env: Record<string, string | undefined> = process.env,
): NarrowedClientMail | null {
  const allow = notifyTestAllowlist(env);
  if (allow.size === 0) return null;

  const held: string[] = [];
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
    cc: cc.length > 0 ? cc.join(", ") : undefined,
    bcc: bcc.length > 0 ? bcc.join(", ") : undefined,
    replyTo: replyTo.length > 0 ? replyTo.join(", ") : undefined,
    held,
  };
}
