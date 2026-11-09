import { publicClientUrl } from "../../shared/publicSiteUrl";
import { createRateLimiter } from "../lib/rateLimit";
import {
  claimStaffThreadAlert,
  recordStaffAlertStatus,
  staffThreadAlertDue,
} from "./contactThreads";
import {
  LIVE_CHAT_MAX_PER_WINDOW,
  LIVE_CHAT_WINDOW_MS,
  deliverLiveChat,
  type LiveChatMessage,
} from "./liveChat";

/** Visitor text copied into the staff email. The admin link is appended after this. */
const STAFF_ALERT_MESSAGE_LIMIT = 500;
const GLOBAL_ALERT_KEY = "contact-thread-staff";

let alertNow: () => Date = () => new Date();

/**
 * Office-wide cap on staff alerts. Same window and max as the visitor post
 * limiter, keyed once for the office line so many IPs cannot flood SMS.
 */
const globalAlertLimiter = createRateLimiter({
  windowMs: LIVE_CHAT_WINDOW_MS,
  max: LIVE_CHAT_MAX_PER_WINDOW,
  now: () => alertNow().getTime(),
});

export function resetContactThreadAlertLimiterForTests(): void {
  globalAlertLimiter.reset();
}

export function setContactThreadAlertClockForTests(clock: (() => Date) | null): void {
  alertNow = clock ?? (() => new Date());
}

export function contactThreadAdminUrl(threadId: string): string {
  return publicClientUrl(`/admin/messages?tab=contact&thread=${encodeURIComponent(threadId)}`);
}

/**
 * Staff-only alert for a visitor thread message.
 * Uses the live-chat office email and Google Voice SMS. Never messages the visitor.
 * Failure is logged and stored on the thread. This function does not throw.
 */
export async function alertStaffOfVisitorThread(threadId: string, input: LiveChatMessage): Promise<void> {
  const now = alertNow();
  try {
    const due = await staffThreadAlertDue(threadId, now);
    if (due !== "due") return;

    if (!globalAlertLimiter.check(GLOBAL_ALERT_KEY).allowed) {
      await recordStaffAlertStatus(threadId, "throttled");
      console.warn("[ContactThread] Staff alert skipped. Office alert cap reached.");
      return;
    }

    const claimed = await claimStaffThreadAlert(threadId, now);
    if (!claimed) return;

    try {
      const delivery = await deliverLiveChat(input, {
        replyTo: input.email,
        adminUrl: contactThreadAdminUrl(threadId),
        messageLimit: STAFF_ALERT_MESSAGE_LIMIT,
      });
      const status = delivery.emailDelivered || delivery.smsDelivered ? "sent" : "failed";
      await recordStaffAlertStatus(threadId, status);
    } catch (error) {
      console.error("[ContactThread] Staff alert failed.", error);
      try {
        await recordStaffAlertStatus(threadId, "failed");
      } catch (recordError) {
        console.error("[ContactThread] Staff alert status was not saved.", recordError);
      }
    }
  } catch (error) {
    console.error("[ContactThread] Staff alert failed.", error);
  }
}
