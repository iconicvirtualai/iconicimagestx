import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientNotifyBlockReason, clientNotifyLive, emailAllowed } from "./clientNotify";

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
    for (const template of ["marketing", "manual_message", "contact_confirmation", "order_confirmed", "gallery_delivery", "invoice"]) {
      expect(emailAllowed(template, {})).toBe(false);
      expect(emailAllowed(template, { CLIENT_NOTIFY_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe(false);
    }
    expect(emailAllowed("marketing", { CLIENT_NOTIFY_LIVE: "true" })).toBe(true);
  });
});

describe("outbound transports check the gate before sending", () => {
  it("blocks nodemailer until the gate allows it", () => {
    const policy = readFileSync(new URL("./clientNotify.ts", import.meta.url), "utf8");
    const email = readFileSync(new URL("../server/services/email.ts", import.meta.url), "utf8");
    expect(policy).toContain("template === ORDER_RECEIVED_EMAIL_TEMPLATE");
    const gate = email.indexOf("if (!emailAllowed(template))");
    const send = email.indexOf("await transporter.sendMail");
    expect(gate).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(gate);
  });

  it("blocks twilio SMS, campaigns, and conversations until the gate allows it", () => {
    const sms = readFileSync(new URL("../server/services/sms.ts", import.meta.url), "utf8");
    const sends = [
      "client.messages.create",
      "client_sdk.conversations.v1.conversations.create",
      ".messages.create({ body, author })",
    ];
    for (const marker of sends) {
      const send = sms.indexOf(marker);
      const gate = sms.lastIndexOf("if (!clientNotifyLive())", send);
      expect(send).toBeGreaterThan(-1);
      expect(gate).toBeGreaterThan(-1);
    }
  });
});
