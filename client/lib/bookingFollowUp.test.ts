import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdminOrderTile } from "@shared/adminOrderTile";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { bookingFollowUp, bookingOrderNumber } from "./bookingFollowUp";

const INTERNAL_NOTE = "password-setup email stays off until client notifications are live";

describe("bookingFollowUp", () => {
  it("tells a new client about the confirmation email, the text, and the separate password email", () => {
    const note = bookingFollowUp({
      accountCreated: true,
      clientNotificationsLive: true,
      notifications: { appointmentEmail: "sent", sms: "sent", passwordSetup: "sent" },
    });
    expect(note).toContain("A confirmation email is on its way.");
    expect(note).toContain("text confirmation");
    expect(note).toContain("separate email");
    expect(note).not.toContain(INTERNAL_NOTE);
    expect(note).not.toContain("password-setup");
  });

  it("does not promise a confirmation email when client notifications are off", () => {
    const note = bookingFollowUp({
      accountCreated: true,
      clientNotificationsLive: false,
      orderNumber: "ORD - L - 00534",
      notifications: { appointmentEmail: "sent", sms: "sent", passwordSetup: "gated" },
    });
    expect(note).not.toMatch(/confirmation email/i);
    expect(note).toContain("Save your order number. We'll reach out to confirm your shoot time.");
    expect(note).toContain("text confirmation was sent");
    expect(note).not.toContain(INTERNAL_NOTE);
    expect(note).not.toContain("password-setup");
    expect(note).not.toContain("client notifications are live");
    expect(note).toContain("Your portal login was created.");
    expect(note).toContain("/portal");
    expect(note).toContain("Forgot password");
  });

  it("uses the public phone when notifications are live and the email was not sent", () => {
    const note = bookingFollowUp({
      clientNotificationsLive: true,
      notifications: { appointmentEmail: "failed" },
    });
    expect(note).toContain(`call ${BUSINESS_CONTACT.phoneDisplay}`);
    expect(note).not.toContain("281-356-0965");
  });

  it("does not promise a text or a new password when the account already existed", () => {
    const note = bookingFollowUp({
      accountCreated: false,
      clientNotificationsLive: true,
      notifications: { appointmentEmail: "sent", sms: "not_configured", passwordSetup: "not_needed", accountAttached: true },
    });
    expect(note).toContain("portal account for this email");
    expect(note).toContain("A confirmation email is on its way.");
    expect(note).not.toContain("text confirmation");
    expect(note).not.toContain("password");
    expect(note).not.toContain(INTERNAL_NOTE);
  });

  it("uses the admin order code when the booking response only has the saved id", () => {
    const requestId = "6y4F0RVWBQw5z5IJxbWe";
    expect(bookingOrderNumber({ requestId })).toBe(buildAdminOrderTile({ id: requestId }).orderCode);
    expect(bookingOrderNumber({ requestId, orderNumber: "ORD - L - 00534" })).toBe("ORD - L - 00534");
  });

  it("returns that same order number on the booking response", () => {
    const source = readFileSync(new URL("../../server/routes/bookings.ts", import.meta.url), "utf8");
    const responseAt = source.indexOf("return res.status(201).json({");
    const response = source.slice(responseAt, source.indexOf("});", responseAt));
    expect(response).toContain("orderNumber");
    expect(response).toContain("requestId: docRef.id");
    expect(source).toContain("buildAdminOrderTile");
  });
});
