import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn(async (message: { to?: string; html?: string }) => {
  void message;
  return { messageId: "test-message" };
}));

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
      throw new Error("Firestore should not be read while proving the notify switch.");
    },
  },
}));

import { sendEmail } from "./email";

const bookings = readFileSync(new URL("../routes/bookings.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

const ENV_KEYS = ["CLIENT_NOTIFY_LIVE", "CLIENT_COMMS_ZONE", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "EMAIL_FROM"] as const;
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

const client = "ada@example.com";

describe("client booking mail and the notify switch", () => {
  it("does not turn client notifications on", () => {
    expect(envExample).toMatch(/^CLIENT_NOTIFY_LIVE=$/m);
    expect(envExample).not.toMatch(/^CLIENT_NOTIFY_LIVE=true/m);
    expect(bookings).not.toContain('to: "photos@iconicimagestx.com"');
    expect(bookings.match(/template: "booking_received"/g)).toHaveLength(1);
    expect(bookings).toContain("to: email");
  });

  it("holds the appointment confirmation and password-setup email while the switch is off", async () => {
    useNotifyEnv({});
    const confirmed = await sendEmail({
      to: client,
      template: "order_confirmed",
      variables: { clientName: "Ada", address: "1 Main St" },
    });
    const password = await sendEmail({
      to: client,
      template: "account_password_setup",
      variables: { clientName: "Ada", clientEmail: client, setupUrl: "https://example.test/setup" },
    });
    expect(confirmed).toEqual({ sent: false, delivery: "suppressed" });
    expect(password).toEqual({ sent: false, delivery: "suppressed" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends the appointment confirmation and password-setup email when the switch is on", async () => {
    useNotifyEnv({ CLIENT_NOTIFY_LIVE: "true" });
    const confirmed = await sendEmail({
      to: client,
      template: "order_confirmed",
      variables: { clientName: "Ada", address: "1 Main St" },
    });
    const password = await sendEmail({
      to: client,
      template: "account_password_setup",
      variables: { clientName: "Ada", clientEmail: client, setupUrl: "https://example.test/setup" },
    });
    expect(confirmed).toEqual({ sent: true, delivery: "sent" });
    expect(password).toEqual({ sent: true, delivery: "sent" });
    expect(sendMail).toHaveBeenCalledTimes(2);
    for (const call of sendMail.mock.calls) {
      expect(call[0].to).toBe(client);
      expect(call[0].to).not.toContain("photos@iconicimagestx.com");
    }
  });

  it("keeps the appointment confirmation and password-setup off when the zone is RED", async () => {
    useNotifyEnv({ CLIENT_NOTIFY_LIVE: "true", CLIENT_COMMS_ZONE: "RED" });
    const confirmed = await sendEmail({
      to: client,
      template: "order_confirmed",
      variables: { clientName: "Ada", address: "1 Main St" },
    });
    const password = await sendEmail({
      to: client,
      template: "account_password_setup",
      variables: { clientName: "Ada", clientEmail: client, setupUrl: "https://example.test/setup" },
    });
    expect(confirmed).toEqual({ sent: false, delivery: "suppressed" });
    expect(password).toEqual({ sent: false, delivery: "suppressed" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("still sends the client booking_received copy while the switch is off", async () => {
    useNotifyEnv({});
    const received = await sendEmail({
      to: client,
      template: "booking_received",
      variables: { clientName: "Ada", address: "1 Main St", total: "$199.00" },
    });
    expect(received).toEqual({ sent: true, delivery: "sent" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]?.[0];
    expect(message?.to).toBe(client);
    expect(message?.html).toContain("Ada");
    expect(message?.to).not.toContain("photos@iconicimagestx.com");
  });
});
