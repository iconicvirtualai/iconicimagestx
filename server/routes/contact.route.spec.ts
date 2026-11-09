import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../index";
import { contactFormStaffTo } from "./contact";
import { setEmailDeliveryOverride } from "../services/email";

interface Delivered {
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  html: string;
}

const delivered: Delivered[] = [];
let deliver: (message: Delivered) => Promise<void> = async (message) => {
  delivered.push(message);
};

const ENV_KEYS = [
  "CLIENT_NOTIFY_LIVE",
  "CLIENT_COMMS_ZONE",
  "NOTIFY_TEST_ALLOWLIST",
  "CONTACT_FORM_EMAIL",
  "SMTP_PASS",
  "SMTP_USER",
  "EMAIL_FROM",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let server: Server;
let baseUrl = "";

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function flagsOff() {
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.CLIENT_COMMS_ZONE;
  delete process.env.NOTIFY_TEST_ALLOWLIST;
  process.env.CONTACT_FORM_EMAIL = "photos@iconicimagestx.com";
}

beforeAll(async () => {
  flagsOff();
  setEmailDeliveryOverride(async (message) => deliver(message));
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  setEmailDeliveryOverride(null);
  restoreEnv();
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  delivered.length = 0;
  deliver = async (message) => {
    delivered.push(message);
  };
  flagsOff();
});

function postContact(body: unknown) {
  return fetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sender = "ada@example.com";

describe("POST /api/contact staff delivery", () => {
  it("uses CONTACT_FORM_EMAIL and falls back to the office inbox", () => {
    expect(contactFormStaffTo("ada@example.com", {})).toBe("photos@iconicimagestx.com");
    expect(contactFormStaffTo("ada@example.com", { CONTACT_FORM_EMAIL: "office@iconicimagestx.com" })).toBe("office@iconicimagestx.com");
    expect(contactFormStaffTo("ada@example.com", { CONTACT_FORM_EMAIL: "ada@example.com" })).toBeNull();
  });

  it("delivers the office email only when client notifications are unset", async () => {
    expect(process.env.CLIENT_NOTIFY_LIVE).toBeUndefined();
    const res = await postContact({
      name: 'Ada & "Co"',
      email: sender,
      phone: "281-555-0199",
      subject: "Listing <shoot>",
      message: "Hello <script>alert(1)</script>\nSecond line",
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(delivered).toHaveLength(1);
    const mail = delivered[0];
    expect(mail.to).toBe("photos@iconicimagestx.com");
    expect(mail.cc).toBeUndefined();
    expect(mail.bcc).toBeUndefined();
    expect(mail.replyTo).toBe(sender);
    expect(`${mail.to} ${mail.cc ?? ""} ${mail.bcc ?? ""}`).not.toContain(sender);
    expect(mail.subject).toBe("New Contact Form: Listing <shoot>");
    expect(mail.html).toContain("Ada &amp; &quot;Co&quot;");
    expect(mail.html).toContain("Listing &lt;shoot&gt;");
    expect(mail.html).toContain("Hello &lt;script&gt;alert(1)&lt;/script&gt;<br>Second line");
    expect(mail.html).not.toContain("<script>");
    expect(mail.subject).not.toContain("We received your message");
  });

  it("still delivers only the office email when the zone is RED", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    process.env.CLIENT_COMMS_ZONE = "RED";
    const res = await postContact({
      name: "Ada",
      email: sender,
      subject: "Shoot",
      message: "Thursday",
    });
    expect(res.status).toBe(200);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].to).toBe("photos@iconicimagestx.com");
    expect(delivered[0].replyTo).toBe(sender);
  });

  it("sends the client auto-reply only when client notifications are live", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    const res = await postContact({
      name: "Ada",
      email: sender,
      subject: "Shoot",
      message: "Thursday",
    });
    expect(res.status).toBe(200);
    expect(delivered.map((mail) => mail.to)).toEqual(["photos@iconicimagestx.com", sender]);
    expect(delivered[0].replyTo).toBe(sender);
    expect(delivered[1].subject).toBe("We received your message");
  });

  it("drops the sender from a staff address list and still suppresses the auto-reply", async () => {
    process.env.CONTACT_FORM_EMAIL = `Ada <${sender}>, photos@iconicimagestx.com`;
    const res = await postContact({
      name: "Ada",
      email: sender,
      subject: "Shoot",
      message: "Thursday",
    });
    expect(res.status).toBe(200);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].to).toBe("photos@iconicimagestx.com");
    expect(delivered[0].replyTo).toBe(sender);
    expect(delivered[0].cc).toBeUndefined();
    expect(delivered[0].bcc).toBeUndefined();
  });

  it("does not email the visitor when the only staff address is the sender", async () => {
    process.env.CONTACT_FORM_EMAIL = sender;
    const res = await postContact({
      name: "Ada",
      email: sender,
      subject: "Shoot",
      message: "Thursday",
    });
    expect(res.status).toBe(500);
    expect(delivered).toHaveLength(0);
  });

  it("keeps an allowlisted client auto-reply and still sends the office copy off-list", async () => {
    process.env.NOTIFY_TEST_ALLOWLIST = sender.toUpperCase();
    const res = await postContact({
      name: "Ada",
      email: sender,
      subject: "Shoot",
      message: "Thursday",
    });
    expect(res.status).toBe(200);
    expect(delivered.map((mail) => mail.to)).toEqual(["photos@iconicimagestx.com", sender]);
    expect(delivered[0].replyTo).toBe(sender);
    expect(delivered[0].subject).toContain("New Contact Form");
    expect(delivered[1].subject).toBe("We received your message");
    expect(delivered[1].replyTo).toBeUndefined();
    expect(delivered[1].to).not.toBe("photos@iconicimagestx.com");
  });

  it("rejects an oversized subject or message before any send", async () => {
    const res = await postContact({
      name: "Ada",
      email: sender,
      subject: "S".repeat(201),
      message: "Hello",
    });
    expect(res.status).toBe(400);
    const tooLong = await postContact({
      name: "Ada",
      email: sender,
      subject: "Hello",
      message: "M".repeat(4001),
    });
    expect(tooLong.status).toBe(400);
    expect(delivered).toHaveLength(0);
  });

  it("returns 500 when the staff send throws and does not log SMTP credentials", async () => {
    const secret = "smtp-secret-should-not-leak";
    const user = "smtp-user-should-not-leak@example.com";
    process.env.SMTP_PASS = secret;
    process.env.SMTP_USER = user;
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map((part) => (typeof part === "string" ? part : String(part))).join(" "));
    });
    deliver = async () => {
      throw new Error(`535 authentication failed pass=${secret} user=${user}`);
    };
    try {
      const res = await postContact({
        name: "Ada",
        email: sender,
        subject: "Shoot",
        message: "Thursday",
      });
      const data = await res.json();
      expect(res.status).toBe(500);
      expect(data.error).toBe("Failed to send message. Please try again later.");
      expect(data.error).not.toContain(secret);
      const logged = errors.join("\n");
      expect(logged).toContain("[Contact] Error:");
      expect(logged).not.toContain(secret);
      expect(logged).not.toContain(user);
      expect(delivered).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});
