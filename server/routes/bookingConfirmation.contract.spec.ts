import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bookings = readFileSync(new URL("./bookings.ts", import.meta.url), "utf8");
const email = readFileSync(new URL("../services/email.ts", import.meta.url), "utf8");

function sendBlocks(source: string, template: string): string[] {
  const pattern = new RegExp(
    `await sendEmail\\(\\{[\\s\\S]*?template:\\s*"${template}"[\\s\\S]*?\\}\\)`,
    "g",
  );
  return source.match(pattern) ?? [];
}

describe("live order confirmation emails", () => {
  it("still sends booking_received to the client and the office", () => {
    const blocks = sendBlocks(bookings, "booking_received");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("to: email");
    expect(blocks[1]).toContain('to: "photos@iconicimagestx.com"');
    for (const block of blocks) {
      expect(block).toContain("clientName");
      expect(block).toContain("address: displayAddress");
      expect(block).toContain("total: money(total)");
      expect(block).toContain("requestId: docRef.id");
      expect(block).toContain("dashboardUrl:");
    }
  });

  it("still sends order_confirmed to the client on booking confirm", () => {
    const blocks = sendBlocks(bookings, "order_confirmed");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("to: requestEmail");
    expect(blocks[0]).toContain("clientName: requestClientName");
    expect(blocks[0]).toContain("address: requestAddressLabel");
    expect(blocks[0]).toContain("orderId: orderRef.id");
    expect(blocks[0]).toContain("portalUrl:");
  });

  it("attaches a portal account and keeps password setup off the order-received email", () => {
    expect(bookings).toContain("attachBookingClient");
    expect(bookings).toContain("createRequestedAppointment");
    expect(bookings).toContain('template: "account_password_setup"');
    expect(bookings).toContain("sendFirebasePasswordEmail");
    expect(bookings).toContain("SMS_TEMPLATES.bookingConfirmation");
    expect(email).toContain("account_password_setup:");
    const received = sendBlocks(bookings, "booking_received").join("\n");
    expect(received).not.toContain("account_password_setup");
    expect(received).not.toContain("setupUrl");
    expect(bookings).not.toContain("BOOKING_NOTIFY_LIVE");
    expect(bookings).not.toContain("bookingNotificationsLive");
    expect(bookings).not.toContain("appointmentReminder");
    expect(bookings).not.toContain('template: "invoice"');
  });

  it("sends booking confirms before the password-setup gate", () => {
    const receivedAt = bookings.indexOf('template: "booking_received"');
    const smsAt = bookings.indexOf('kind: "booking_confirmation"');
    const gateAt = bookings.indexOf("if (!clientNotifyLive())");
    const passwordAt = bookings.indexOf('template: "account_password_setup"');
    expect(receivedAt).toBeGreaterThan(-1);
    expect(smsAt).toBeGreaterThan(receivedAt);
    expect(gateAt).toBeGreaterThan(smsAt);
    expect(passwordAt).toBeGreaterThan(gateAt);
    expect(bookings.slice(receivedAt, smsAt)).not.toContain("clientNotifyLive(");
    const notificationsAt = bookings.indexOf("const notifications = {");
    const saved = bookings.slice(notificationsAt, bookings.indexOf("await docRef.update({", notificationsAt));
    expect(saved).not.toContain("passwordSetupLink");
    expect(saved).not.toContain("setupUrl");
  });

  it("still resolves those categories through the shared email sender", () => {
    expect(email).toContain('.where("category", "==", template)');
    expect(email).toContain('.where("isActive", "==", true)');
    expect(email).toContain("getFallbackTemplate(template, variables)");
    expect(email).toContain("await transporter.sendMail");
    expect(email).toContain("from: `\"Iconic Images\" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`");
  });
});
