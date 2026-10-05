/**
 * External booking forms and site embeds.
 *
 * Aryeo-style widgets that other websites drop in are a later pass.
 * This catalog change stops at the Iconic booking form and the staff
 * `packages` catalog it charges from. Do not add an embed route here.
 */

export const BOOKING_EMBEDS_STATUS = "deferred" as const;

export function bookingEmbedAvailability(): {
  status: typeof BOOKING_EMBEDS_STATUS;
  reason: string;
} {
  return {
    status: BOOKING_EMBEDS_STATUS,
    reason: "External booking forms and site embeds are a later pass. The Iconic booking form reads the packages catalog.",
  };
}
