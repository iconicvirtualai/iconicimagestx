import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clientNotifyBlockReason,
  clientNotifyLive,
  emailAllowed,
  isStaffInboundSmsDestination,
  smsAllowed,
} from "./clientNotify";

describe("clientNotifyLive", () => {
  it("stays off unless CLIENT_NOTIFY_LIVE is exactly true", () => {
    expect(clientNotifyLive({})).toBe(false);
    expect(clientNotifyLive({ CLIENT_NOTIFY_LIVE: "" })).toBe(false);
    expect(clientNotifyLive({ CLIENT_NOTIFY_LIVE: "TRUE" })).toBe(false);
    expect(clientNotifyLive({ CLIENT_NOTIFY_LIVE: "True" })).toBe(false);
    expect(clientNotifyLive({ CLIENT_NOTIFY_LIVE: "1" })).toBe(false);
    expect(clientNotifyLive({ CLIENT_NOTIFY_LIVE: "false" })).toBe(false);
    expect(clientNotifyLive({ CLIENT_NOTIFY_LIVE: "true" })).toBe(true);
  });

  it("stays off when CLIENT_COMMS_ZONE is RED even if the live flag is true", () => {
    expect(clientNotifyLive({ CLIENT_NOTIFY_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe(false);
    expect(clientNotifyBlockReason({ CLIENT_COMMS_ZONE: "RED" })).toBe("CLIENT_COMMS_ZONE=RED");
    expect(clientNotifyBlockReason({})).toBe("CLIENT_NOTIFY_LIVE is not exactly true");
  });
});

describe("booking_received stays on under RED", () => {
  it("sends the order-received template with no flags set and while the zone is RED", () => {
    expect(emailAllowed("booking_received", {})).toBe(true);
    expect(emailAllowed("booking_received", { CLIENT_COMMS_ZONE: "RED" })).toBe(true);
    expect(emailAllowed("booking_received", { CLIENT_NOTIFY_LIVE: "false", CLIENT_COMMS_ZONE: "RED" })).toBe(true);
  });

  it("keeps marketing, portal, and other non-order templates off", () => {
    for (const template of ["marketing", "manual_message", "contact_confirmation", "contact_form", "order_confirmed", "gallery_delivery", "invoice", "live_chat"]) {
      expect(emailAllowed(template, {})).toBe(false);
      expect(emailAllowed(template, { CLIENT_NOTIFY_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe(false);
    }
    expect(emailAllowed("marketing", { CLIENT_NOTIFY_LIVE: "true" })).toBe(true);
  });

  it("lets staff-only live chat email through under RED, and only with audience staff", () => {
    expect(emailAllowed("live_chat", { CLIENT_COMMS_ZONE: "RED" }, "staff")).toBe(true);
    expect(emailAllowed("live_chat", {}, "staff")).toBe(true);
    expect(emailAllowed("live_chat", { CLIENT_COMMS_ZONE: "RED" })).toBe(false);
    expect(emailAllowed("live_chat", { CLIENT_COMMS_ZONE: "RED" }, "client")).toBe(false);
    expect(emailAllowed("contact_confirmation", { CLIENT_COMMS_ZONE: "RED" }, "staff")).toBe(false);
  });

  it("sends the client bookingConfirmation SMS with no flags set and while the zone is RED", () => {
    expect(smsAllowed("booking_confirmation", {})).toBe(true);
    expect(smsAllowed("booking_confirmation", { CLIENT_COMMS_ZONE: "RED" })).toBe(true);
    expect(smsAllowed("booking_confirmation", { CLIENT_NOTIFY_LIVE: "false", CLIENT_COMMS_ZONE: "RED" })).toBe(true);
    expect(smsAllowed(undefined, {})).toBe(false);
    expect(smsAllowed("reminder", { CLIENT_NOTIFY_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe(false);
  });

  it("lets staff-inbound SMS through under RED and only to the office Voice number", () => {
    expect(smsAllowed("staff_inbound", {})).toBe(true);
    expect(smsAllowed("staff_inbound", { CLIENT_COMMS_ZONE: "RED" })).toBe(true);
    expect(isStaffInboundSmsDestination("+12813560965")).toBe(true);
    expect(isStaffInboundSmsDestination("281-356-0965")).toBe(true);
    expect(isStaffInboundSmsDestination("+17135550100")).toBe(false);
    expect(isStaffInboundSmsDestination("")).toBe(false);
  });
});

describe("outbound transports check the gate before sending", () => {
  it("blocks nodemailer until the gate allows it", () => {
    const policy = readFileSync(new URL("./clientNotify.ts", import.meta.url), "utf8");
    const email = readFileSync(new URL("../server/services/email.ts", import.meta.url), "utf8");
    expect(policy).toContain("template === ORDER_RECEIVED_EMAIL_TEMPLATE");
    const gate = email.indexOf("if (!emailAllowed(template, process.env, audience))");
    const send = email.indexOf("await transporter.sendMail");
    expect(gate).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(gate);
  });

  it("lets booking confirmation and destination-locked staff SMS through the twilio gate", () => {
    const policy = readFileSync(new URL("./clientNotify.ts", import.meta.url), "utf8");
    const sms = readFileSync(new URL("../server/services/sms.ts", import.meta.url), "utf8");
    const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
    expect(policy).toContain("kind === ORDER_RECEIVED_SMS_KIND");
    expect(policy).toContain("kind === STAFF_INBOUND_SMS_KIND");
    expect(policy).toContain('STAFF_INBOUND_SMS_TO = "+12813560965"');
    const destinationGuard = sms.indexOf("isStaffInboundSmsDestination");
    expect(destinationGuard).toBeGreaterThan(-1);
    const gate = sms.indexOf("if (!smsAllowed(kind))");
    const send = sms.indexOf("client.messages.create");
    expect(gate).toBeGreaterThan(-1);
    expect(destinationGuard).toBeLessThan(send);
    expect(send).toBeGreaterThan(gate);
    const clientSms = bookings.indexOf('kind: "booking_confirmation"');
    const adminSms = bookings.indexOf("SMS_TEMPLATES.newBookingAlert");
    expect(clientSms).toBeGreaterThan(-1);
    expect(adminSms).toBeGreaterThan(clientSms);
    expect(bookings.slice(clientSms, adminSms)).not.toContain("newBookingAlert");
    for (const marker of ["client_sdk.conversations.v1.conversations.create", ".messages.create({ body, author })"]) {
      const at = sms.indexOf(marker);
      expect(sms.lastIndexOf("if (!clientNotifyLive())", at)).toBeGreaterThan(-1);
    }
    const campaignSend = sms.lastIndexOf("client.messages.create");
    expect(sms.lastIndexOf("if (!clientNotifyLive())", campaignSend)).toBeGreaterThan(gate);
  });
});
