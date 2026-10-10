import { buildAdminOrderTile } from "@shared/adminOrderTile";
import { BUSINESS_CONTACT } from "@shared/businessContact";

export interface BookingSubmitResult {
  requestId?: string;
  /** Short code /admin/orders shows for this saved request. */
  orderNumber?: string;
  /** Used only to derive the admin order code when the response omitted orderNumber. */
  selectedService?: string | null;
  accountCreated?: boolean;
  /**
   * True only when client notifications are live (CLIENT_NOTIFY_LIVE is exactly
   * "true" and CLIENT_COMMS_ZONE is not RED).
   */
  clientNotificationsLive?: boolean;
  notifications?: {
    appointmentEmail?: string;
    sms?: string;
    passwordSetup?: string;
    accountAttached?: boolean;
    accountSkipReason?: string | null;
  } | null;
}

/** Same short order id the admin orders board prints for this saved request. */
export function bookingOrderNumber(result: BookingSubmitResult): string {
  const explicit = typeof result.orderNumber === "string" ? result.orderNumber.trim() : "";
  if (explicit) return explicit;
  const requestId = typeof result.requestId === "string" ? result.requestId.trim() : "";
  if (!requestId) return "";
  return buildAdminOrderTile({
    id: requestId,
    selectedService: result.selectedService || null,
  }).orderCode;
}

/** Reads the existing client-notification flag. Never sends mail. */
export async function readClientNotificationsLive(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch("/api/client-notify", { signal: controller.signal });
    if (!res.ok) return false;
    const data = (await res.json()) as { live?: unknown };
    return data?.live === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const PORTAL_PATH = "Sign in at the client portal (/portal), or use Forgot password on that page.";

export function bookingFollowUp(result: BookingSubmitResult) {
  const live = result.clientNotificationsLive === true;
  const notes = ["We saved your appointment request."];
  const emailStatus = result.notifications?.appointmentEmail;
  if (live && emailStatus === "sent") notes.push("A confirmation email is on its way.");
  else if (live) notes.push(`If the confirmation email does not arrive in a few minutes, call ${BUSINESS_CONTACT.phoneDisplay}.`);
  else notes.push("Save your order number. We'll reach out to confirm your shoot time.");
  if (result.notifications?.sms === "sent") {
    notes.push("A text confirmation was sent to the phone number on this form.");
  }
  if (result.accountCreated && live && result.notifications?.passwordSetup === "sent") {
    notes.push("A separate email has the link to set your portal password.");
  } else if (result.accountCreated) {
    notes.push(`Your portal login was created. ${PORTAL_PATH}`);
  } else if (result.notifications?.accountAttached) {
    notes.push("This request is on the portal account for this email.");
  }
  return notes.join(" ");
}
