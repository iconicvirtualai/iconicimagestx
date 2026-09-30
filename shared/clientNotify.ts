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
 */
export const ORDER_RECEIVED_EMAIL_TEMPLATE = "booking_received";
export const ORDER_RECEIVED_SMS_KIND = "booking_confirmation";

export function clientNotifyLive(env: Record<string, string | undefined> = process.env): boolean {
  if (env.CLIENT_COMMS_ZONE === "RED") return false;
  return env.CLIENT_NOTIFY_LIVE === "true";
}

/** booking_received always sends. Every other template follows the blast kill. */
export function emailAllowed(template: string, env: Record<string, string | undefined> = process.env): boolean {
  if (template === ORDER_RECEIVED_EMAIL_TEMPLATE) return true;
  return clientNotifyLive(env);
}

/** Client bookingConfirmation SMS always sends. Every other SMS follows the blast kill. */
export function smsAllowed(kind?: string, env: Record<string, string | undefined> = process.env): boolean {
  if (kind === ORDER_RECEIVED_SMS_KIND) return true;
  return clientNotifyLive(env);
}

export function clientNotifyBlockReason(env: Record<string, string | undefined> = process.env): string {
  if (env.CLIENT_COMMS_ZONE === "RED") return "CLIENT_COMMS_ZONE=RED";
  return "CLIENT_NOTIFY_LIVE is not exactly true";
}
