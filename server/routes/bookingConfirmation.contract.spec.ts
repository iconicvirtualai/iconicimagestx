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

function handlerSlice(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

describe("live order confirmation emails", () => {
  it("sends booking_received only to the client", () => {
    const blocks = sendBlocks(bookings, "booking_received");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("to: email");
    expect(blocks[0]).not.toContain("photos@iconicimagestx.com");
    expect(blocks[0]).toContain("clientName");
    expect(blocks[0]).toContain("address: displayAddress");
    expect(blocks[0]).toContain("total: money(total)");
    expect(blocks[0]).toContain("requestId: docRef.id");
    expect(blocks[0]).toContain("dashboardUrl:");
    expect(bookings).not.toContain('to: "photos@iconicimagestx.com"');
    expect(bookings).not.toContain("officeEmailStatus");
  });

  it("sends exactly one office email on a new booking, the saved-order alert", () => {
    const post = handlerSlice(bookings, 'router.post("/",', 'router.get("/",');
    const clientReceived = sendBlocks(post, "booking_received");
    expect(clientReceived).toHaveLength(1);
    expect(clientReceived[0]).toContain("to: email");

    const directSends = post.match(/await sendEmail\(\{/g) ?? [];
    expect(directSends.length).toBeGreaterThan(0);
    expect(post).not.toContain('template: "office_new_order"');
    expect(post).not.toContain('audience: "staff"');
    expect(post).not.toContain("photos@iconicimagestx.com");
    expect(post.match(/notifyOfficeOfOrder\(/g)).toHaveLength(1);
    expect(post).toContain("isNewOrder: true");
    expect(post).toContain("saved: savedOrder");
    expect(post.indexOf("const savedSnap = await docRef.get()")).toBeLessThan(
      post.indexOf("notifyOfficeOfOrder"),
    );

    const confirm = handlerSlice(bookings, 'router.patch("/:id/confirm"', 'router.patch("/:id/decline"');
    expect(confirm).not.toContain("notifyOfficeOfOrder");
    expect(confirm).not.toContain('template: "booking_received"');
    expect(sendBlocks(confirm, "order_confirmed")).toHaveLength(1);
    expect(sendBlocks(confirm, "order_confirmed")[0]).toContain("to: requestEmail");

    const officeNotify = readFileSync(new URL("../services/officeOrderNotify.ts", import.meta.url), "utf8");
    expect(officeNotify).toContain('export const OFFICE_NEW_ORDER_EMAIL_TEMPLATE = "office_new_order"');
    expect(officeNotify.match(/await sendEmail\(\{/g)).toHaveLength(1);
    expect(officeNotify).toContain("template: OFFICE_NEW_ORDER_EMAIL_TEMPLATE");
    expect(officeNotify).toContain('audience: "staff"');
    expect(officeNotify).not.toContain("booking_received");
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
    expect(bookings).toContain("clientNotifyLive() || isNotifyTestAllowlisted(normalizedEmail)");
    expect(bookings).not.toContain("BOOKING_NOTIFY_LIVE");
    expect(bookings).not.toContain("bookingNotificationsLive");
    expect(bookings).not.toContain("appointmentReminder");
    expect(bookings).not.toContain('template: "invoice"');
  });

  it("sends booking confirms before the password-setup gate", () => {
    const receivedAt = bookings.indexOf('template: "booking_received"');
    const smsAt = bookings.indexOf('kind: "booking_confirmation"');
    const gateAt = bookings.indexOf("if (!passwordSetupAllowed)");
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
