import { describe, expect, it } from "vitest";
import { bookingFollowUp } from "./bookingFollowUp";

describe("bookingFollowUp", () => {
  it("tells a new client about the confirmation email, the text, and the separate password email", () => {
    const note = bookingFollowUp({
      accountCreated: true,
      notifications: { appointmentEmail: "sent", sms: "sent", passwordSetup: "sent" },
    });
    expect(note).toContain("confirmation email");
    expect(note).toContain("text confirmation");
    expect(note).toContain("separate email");
    expect(note).not.toContain("held until");
  });

  it("keeps the booking confirmation when only the password email is gated", () => {
    const note = bookingFollowUp({
      accountCreated: true,
      notifications: { appointmentEmail: "sent", sms: "sent", passwordSetup: "gated" },
    });
    expect(note).toContain("confirmation email is on its way");
    expect(note).toContain("text confirmation was sent");
    expect(note).toContain("password-setup email stays off");
    expect(note).not.toContain("Email and text confirmations are held");
  });

  it("does not promise a text or a new password when the account already existed", () => {
    const note = bookingFollowUp({
      accountCreated: false,
      notifications: { appointmentEmail: "sent", sms: "not_configured", passwordSetup: "not_needed", accountAttached: true },
    });
    expect(note).toContain("portal account for this email");
    expect(note).toContain("confirmation email");
    expect(note).not.toContain("text confirmation");
    expect(note).not.toContain("password");
  });
});
