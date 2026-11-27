import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLIENT_EMAIL_NOTIFY_TEST_SINK,
  DEFAULT_APPOINTMENT_REMINDER_HOURS,
  INVOICE_LICENSE_NOTE,
  clientEmailNotifyLive,
  contextFromRecord,
  hardSuppressionReason,
  intentsForEvent,
  legacyClientOrderEmailEnabled,
  reminderDueAt,
  renderNotification,
  sampleNotifyContext,
} from "./aryeoEmailNotify";

describe("CLIENT_EMAIL_NOTIFY_LIVE", () => {
  it("stays off unless the flag is exactly true", () => {
    expect(clientEmailNotifyLive({})).toBe(false);
    expect(clientEmailNotifyLive({ CLIENT_EMAIL_NOTIFY_LIVE: "" })).toBe(false);
    expect(clientEmailNotifyLive({ CLIENT_EMAIL_NOTIFY_LIVE: "TRUE" })).toBe(false);
    expect(clientEmailNotifyLive({ CLIENT_EMAIL_NOTIFY_LIVE: "true" })).toBe(true);
    expect(CLIENT_EMAIL_NOTIFY_TEST_SINK).toBe("ops+deliveryqa@iconicimagestx.com");
  });

  it("suppresses the older client confirmations only when the Aryeo flag is on", () => {
    expect(legacyClientOrderEmailEnabled({})).toBe(true);
    expect(legacyClientOrderEmailEnabled({ CLIENT_EMAIL_NOTIFY_LIVE: "" })).toBe(true);
    expect(legacyClientOrderEmailEnabled({ CLIENT_EMAIL_NOTIFY_LIVE: "TRUE" })).toBe(true);
    expect(legacyClientOrderEmailEnabled({ CLIENT_NOTIFY_LIVE: "true" })).toBe(true);
    expect(legacyClientOrderEmailEnabled({ CLIENT_EMAIL_NOTIFY_LIVE: "true", CLIENT_NOTIFY_LIVE: "true" })).toBe(false);

    const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
    for (const template of ["booking_received", "order_confirmed"]) {
      const at = bookings.indexOf(`template: "${template}"`);
      const guard = bookings.lastIndexOf("legacyClientOrderEmailEnabled()", at);
      expect(at).toBeGreaterThan(guard);
      expect(at - guard).toBeLessThan(600);
    }
    expect(bookings.match(/legacyClientOrderEmailEnabled\(\)/g)).toHaveLength(2);
  });
});

describe("hard suppression", () => {
  it("blocks Marco Brito and Delia Grimaldo by name or mailbox", () => {
    expect(hardSuppressionReason({ name: "Marco Brito" })).toBe("Marco Brito");
    expect(hardSuppressionReason({ name: "Delia Grimaldo" })).toBe("Delia Grimaldo");
    expect(hardSuppressionReason({ email: "marcobrito@gmail.com" })).toBe("Marco Brito");
    expect(hardSuppressionReason({ email: "marco.brito@example.com" })).toBe("Marco Brito");
    expect(hardSuppressionReason({ email: "delia.grimaldo@example.com" })).toBe("Delia Grimaldo");
    expect(hardSuppressionReason({ name: "Jordan Hale", email: "jordan@example.com" })).toBeNull();
  });
});

describe("Aryeo customer copy", () => {
  const ctx = sampleNotifyContext();

  it("uses Appointment Confirmed and drops the open house", () => {
    const scheduled = renderNotification("customer_appointment_scheduled", ctx);
    expect(scheduled.subject).toBe("Order #1042 Appointment Confirmed");
    expect(scheduled.html).not.toMatch(/Open House/i);
    expect(scheduled.html).not.toContain("Aug. 15");
    expect(scheduled.html).toContain(INVOICE_LICENSE_NOTE);
    expect(scheduled.html).toContain("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
    expect(scheduled.html).toContain("photos@iconicimagestx.com");
  });

  it("shows the pending line only when media is outstanding", () => {
    const ready = renderNotification("listing_delivery", ctx);
    expect(ready.html).not.toContain("Pending:");
    expect(ready.html).not.toContain("If Any Media is Still Outstanding");
    const waiting = renderNotification("listing_delivery", {
      ...ctx,
      mediaOutstanding: true,
      mediaOutstandingDetail: "Twilight photos are still outstanding.",
    });
    expect(waiting.html).toContain("Pending:");
    expect(waiting.html).toContain("Twilight photos are still outstanding.");
    expect(waiting.html).not.toContain("The Woodlands");
  });

  it("omits the showcase link when the URL is not stored", () => {
    const showcase = renderNotification("listing_delivery_showcase_select", ctx);
    expect(showcase.subject).toContain("Media delivery notification");
    expect(showcase.html).not.toContain("Access your media with this link");
    expect(showcase.gaps.some((gap) => gap.tag === "listing.showcase_media_url")).toBe(true);
  });

  it("keeps the reminder default at 24 hours before the appointment", () => {
    expect(DEFAULT_APPOINTMENT_REMINDER_HOURS).toBe(24);
    const start = "2026-11-28T16:30:00.000Z";
    expect(reminderDueAt(start, 24)).toBe("2026-11-27T16:30:00.000Z");
  });
});

describe("order field translation", () => {
  it("reads appointment time in America/Chicago and flags missing status urls", () => {
    const ctx = contextFromRecord({
      orderNumber: "#1050",
      address: "10 Pine St, Spring, TX 77380",
      clientName: "Ada Lovelace",
      clientEmail: "ada@example.com",
      scheduledDate: "2026-12-01",
      scheduledTime: "2:00 PM",
      lineItems: [{ name: "Photos", price: 200 }],
      total: 200,
      balanceDue: 200,
    });
    expect(ctx.appointmentWhen).toContain("2:00");
    expect(ctx.appointmentWhen).toContain("CT");
    expect(ctx.firstName).toBe("Ada");
    expect(ctx.unpaid).toBe(true);
    expect(ctx.statusUrl).toBe("");
  });

  it("schedules, reschedules, and does not invent a second order confirmation", () => {
    const before = { scheduledDate: "2026-12-01", scheduledTime: "2:00 PM", assignedPhotographerId: "a" };
    const after = { scheduledDate: "2026-12-02", scheduledTime: "9:00 AM", assignedPhotographerId: "b" };
    const keys = intentsForEvent({ type: "appointment_changed", before, after }).map((item) => item.key);
    expect(keys).toContain("customer_appointment_rescheduled");
    expect(keys).toContain("creator_appointment_assigned");
    expect(keys).not.toContain("customer_order_confirmation");
    const first = intentsForEvent({
      type: "appointment_changed",
      before: {},
      after: { scheduledDate: "2026-12-01", scheduledTime: "2:00 PM" },
    }).map((item) => item.key);
    expect(first).toContain("customer_appointment_scheduled");
  });
});
