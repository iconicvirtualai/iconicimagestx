import { afterEach, describe, expect, it, vi } from "vitest";

interface SentMessage {
  to?: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

const sendMail = vi.hoisted(() => vi.fn(async (_message: SentMessage) => ({ messageId: "test-message" })));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail,
      close: () => undefined,
    }),
  },
}));

vi.mock("firebase-admin", () => ({
  default: {
    apps: [],
    firestore: () => {
      throw new Error("Firestore should not be read while proving the notify allowlist.");
    },
  },
}));

import { sendEmail } from "./email";

const ENV_KEYS = [
  "CLIENT_NOTIFY_LIVE",
  "CLIENT_COMMS_ZONE",
  "NOTIFY_TEST_ALLOWLIST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_HOST",
  "SMTP_PORT",
  "EMAIL_FROM",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function useNotifyEnv(overrides: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1";
  process.env.SMTP_USER = "test-smtp@example.com";
  process.env.SMTP_PASS = "not-a-real-password";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  sendMail.mockClear();
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const QA = "ops+deliveryqa@iconicimagestx.com";
const CLIENT = "ada@example.com";
const GATED = ["gallery_delivery", "invoice", "payment_receipt", "account_password_setup"] as const;

function lastSent(): SentMessage {
  const message = sendMail.mock.calls[sendMail.mock.calls.length - 1]?.[0];
  if (!message) throw new Error("No message was sent.");
  return message;
}

function mailedTo(): string {
  const message = lastSent();
  return [message.to, message.cc, message.bcc, message.replyTo].filter(Boolean).join(", ");
}

describe("client notify test allowlist", () => {
  it("sends delivery, invoice, receipt, and password setup to an allowlisted address while notifications are off", async () => {
    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: ` ${QA.toUpperCase()} ` });
    for (const template of GATED) {
      sendMail.mockClear();
      const result = await sendEmail({
        to: `Ops QA <${QA}>`,
        template,
        variables: { clientName: "Ops", clientEmail: QA, setupUrl: "https://example.test/setup" },
      });
      expect(result).toEqual({ sent: true });
      expect(sendMail).toHaveBeenCalledTimes(1);
      const message = lastSent();
      expect(message.to).toBe(QA);
      expect(message.cc).toBeUndefined();
      expect(message.bcc).toBeUndefined();
      expect(message.replyTo).toBeUndefined();
      expect(mailedTo()).toBe(QA);
    }
  });

  it("sends nothing to a client who is not on the allowlist", async () => {
    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: QA });
    for (const template of GATED) {
      sendMail.mockClear();
      const result = await sendEmail({ to: CLIENT, template });
      expect(result).toEqual({ sent: false });
      expect(sendMail).not.toHaveBeenCalled();
    }
  });

  it("sends a multi-recipient order only to the exact allowlisted addresses", async () => {
    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: QA });
    const result = await sendEmail({
      to: `${CLIENT}, ${QA.toUpperCase()}, Agent <agent@broker.com>`,
      cc: `assistant@broker.com; ${QA}`,
      bcc: "billing@broker.com",
      replyTo: CLIENT,
      template: "invoice",
      variables: { clientName: "Ada", invoiceNumber: "INV-1", amount: "$10.00" },
    });
    expect(result).toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = lastSent();
    expect(message.to).toBe(QA);
    expect(message.cc).toBe(QA);
    expect(message.bcc).toBeUndefined();
    expect(message.replyTo).toBeUndefined();
    expect(JSON.stringify(message)).not.toContain(CLIENT);
    expect(JSON.stringify(message)).not.toContain("agent@broker.com");
    expect(JSON.stringify(message)).not.toContain("assistant@broker.com");
    expect(JSON.stringify(message)).not.toContain("billing@broker.com");
  });

  it("keeps an allowlisted Cc and drops client To, Bcc, and Reply-To", async () => {
    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: QA, CLIENT_COMMS_ZONE: "RED", CLIENT_NOTIFY_LIVE: "true" });
    const result = await sendEmail({
      to: "ops@iconicimagestx.com <ada@example.com>",
      cc: `Studio <${QA}>`,
      bcc: "photos@iconicimagestx.com",
      replyTo: "cadi@iconicimagestx.com",
      template: "gallery_delivery",
    });
    expect(result).toEqual({ sent: true });
    const message = lastSent();
    expect(message.to).toBe(QA);
    expect(message.cc).toBeUndefined();
    expect(message.bcc).toBeUndefined();
    expect(message.replyTo).toBeUndefined();
    expect(JSON.stringify(message)).not.toContain("ada@example.com");
    expect(JSON.stringify(message)).not.toContain("ops@iconicimagestx.com");
    expect(JSON.stringify(message)).not.toContain("photos@iconicimagestx.com");
    expect(JSON.stringify(message)).not.toContain("cadi@iconicimagestx.com");
  });

  it("does not send when Reply-To is allowlisted but every delivery recipient is a real client", async () => {
    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: QA });
    const result = await sendEmail({
      to: CLIENT,
      cc: "agent@broker.com",
      bcc: "billing@broker.com",
      replyTo: QA,
      template: "payment_receipt",
    });
    expect(result).toEqual({ sent: false });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not treat ops@ or other @iconicimagestx.com addresses as allowlisted unless listed exactly", async () => {
    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: `${QA}, *@iconicimagestx.com` });
    for (const address of [
      "ops@iconicimagestx.com",
      "photos@iconicimagestx.com",
      "cadi@iconicimagestx.com",
      "ops+other@iconicimagestx.com",
      "ops+deliveryqa@iconicimagestx.com.evil.test",
    ]) {
      sendMail.mockClear();
      const result = await sendEmail({ to: address, cc: QA, template: "invoice" });
      expect(result).toEqual({ sent: true });
      expect(lastSent().to).toBe(QA);
      expect(JSON.stringify(lastSent())).not.toContain(address);
      sendMail.mockClear();
      const alone = await sendEmail({ to: address, template: "account_password_setup" });
      expect(alone).toEqual({ sent: false });
      expect(sendMail).not.toHaveBeenCalled();
    }

    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: "ops@iconicimagestx.com" });
    const listedBase = await sendEmail({ to: " OPS@IconicImagesTX.com ", template: "gallery_delivery" });
    expect(listedBase).toEqual({ sent: true });
    expect(lastSent().to).toBe("ops@iconicimagestx.com");
    sendMail.mockClear();
    const plusTag = await sendEmail({ to: QA, template: "gallery_delivery" });
    expect(plusTag).toEqual({ sent: false });
    expect(sendMail).not.toHaveBeenCalled();
    const otherIconic = await sendEmail({ to: "photos@iconicimagestx.com", template: "invoice" });
    expect(otherIconic).toEqual({ sent: false });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("matches current behavior when the allowlist is empty or unset", async () => {
    for (const value of [undefined, "", "   ", " , , "]) {
      useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: value });
      for (const template of GATED) {
        sendMail.mockClear();
        const result = await sendEmail({
          to: `${CLIENT}, ${QA}`,
          cc: QA,
          bcc: CLIENT,
          replyTo: QA,
          template,
        });
        expect(result).toEqual({ sent: false });
        expect(sendMail).not.toHaveBeenCalled();
      }
      sendMail.mockClear();
      const received = await sendEmail({ to: CLIENT, template: "booking_received" });
      expect(received).toEqual({ sent: true });
      expect(lastSent().to).toBe(CLIENT);
    }
  });

  it("does not filter recipients when client notifications are on", async () => {
    useNotifyEnv({ CLIENT_NOTIFY_LIVE: "true", NOTIFY_TEST_ALLOWLIST: QA });
    const result = await sendEmail({
      to: CLIENT,
      cc: "agent@broker.com",
      bcc: "billing@broker.com",
      replyTo: "agent@broker.com",
      template: "order_confirmed",
    });
    expect(result).toEqual({ sent: true });
    expect(lastSent()).toMatchObject({
      to: CLIENT,
      cc: "agent@broker.com",
      bcc: "billing@broker.com",
      replyTo: "agent@broker.com",
    });
  });

  it("still sends carved-out order and staff mail to addresses that are not on the allowlist", async () => {
    useNotifyEnv({ NOTIFY_TEST_ALLOWLIST: QA, CLIENT_COMMS_ZONE: "RED" });
    const received = await sendEmail({
      to: CLIENT,
      cc: "agent@broker.com",
      template: "booking_received",
    });
    expect(received).toEqual({ sent: true });
    expect(lastSent().to).toBe(CLIENT);
    expect(lastSent().cc).toBe("agent@broker.com");

    sendMail.mockClear();
    const office = await sendEmail({
      to: "photos@iconicimagestx.com, coord@iconicimagestx.com",
      template: "office_new_order",
      audience: "staff",
    });
    expect(office).toEqual({ sent: true });
    expect(lastSent().to).toBe("photos@iconicimagestx.com, coord@iconicimagestx.com");
  });
});
