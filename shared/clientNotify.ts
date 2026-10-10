/**
 * Kill switch for non-order client email and SMS (marketing, booking
 * password-setup, contact auto-acks, campaigns, reminders).
 *
 * Client login "Forgot password?" is not this gate. Firebase Auth sends that
 * email with sendPasswordResetEmail.
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
