import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../lib/rateLimit";
import { STAFF_INBOUND_SMS_TO } from "../../shared/clientNotify";
import {
  LIVE_CHAT_MAX_PER_WINDOW,
  liveChatSmsBody,
  liveChatStaffEmail,
  parseLiveChatBody,
} from "./liveChat";

describe("parseLiveChatBody", () => {
  it("requires a name, a message, and an email or phone", () => {
    expect(parseLiveChatBody({ message: "Hi" }).ok).toBe(false);
    expect(parseLiveChatBody({ name: "Ada", message: "Hi" }).ok).toBe(false);
    expect(parseLiveChatBody({ name: "Ada", email: "not-an-email", message: "Hi" }).ok).toBe(false);
    expect(parseLiveChatBody({ name: "Ada", phone: "123", message: "Hi" }).ok).toBe(false);
    expect(parseLiveChatBody(null).ok).toBe(false);
  });

  it("accepts email only or phone only", () => {
    const byEmail = parseLiveChatBody({
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Need a shoot Thursday.",
    });
    const byPhone = parseLiveChatBody({
      name: "Ada Lovelace",
      phone: "(281) 555-0100",
      message: "Need a shoot Thursday.",
    });
    expect(byEmail).toEqual({
      ok: true,
      value: { name: "Ada Lovelace", email: "ada@example.com", message: "Need a shoot Thursday." },
    });
    expect(byPhone.ok).toBe(true);
  });
});

describe("liveChatSmsBody", () => {
  it("includes the visitor reply path and stays a short staff alert", () => {
    const body = liveChatSmsBody({
      name: "Ada\nLovelace",
      email: "ada@example.com",
      phone: "281-555-0100",
      message: "x".repeat(500),
    });
    expect(body.startsWith("Iconic live chat\nAda Lovelace\n")).toBe(true);
    expect(body).toContain("ada@example.com");
    expect(body).toContain("281-555-0100");
    expect(body.length).toBeLessThanOrEqual(640);
    expect(body).not.toContain("\n\n\n");
  });
});

describe("live chat staff routing", () => {
  it("emails CONTACT_FORM_EMAIL or photos@ and texts the office Voice number", () => {
    expect(liveChatStaffEmail({})).toBe("photos@iconicimagestx.com");
    expect(liveChatStaffEmail({ CONTACT_FORM_EMAIL: "office@example.com" })).toBe("office@example.com");
    expect(STAFF_INBOUND_SMS_TO).toBe("+12813560965");
  });

  it("does not message the visitor", () => {
    const source = readFileSync(new URL("./liveChat.ts", import.meta.url), "utf8");
    const widget = readFileSync(new URL("../../client/components/ChatWidget.tsx", import.meta.url), "utf8");
    expect(source).toContain('audience: "staff"');
    expect(source).toContain("template: STAFF_INBOUND_EMAIL_TEMPLATE");
    expect(source).toContain("to: STAFF_INBOUND_SMS_TO");
    expect(source).toContain('kind: STAFF_INBOUND_SMS_KIND');
    expect(source).not.toContain("contact_confirmation");
    expect(source).not.toContain("BOOKING_NOTIFY_LIVE");
    expect(source).not.toContain("to: input.email");
    expect(source).not.toContain("to: input.phone");
    expect(widget).toContain('fetch("/api/contact/threads"');
    expect(widget).not.toContain("/api/contact/live-chat");
    expect(widget).toContain("text-gray-900 placeholder:text-gray-500");
    expect(widget).not.toContain("setTimeout");
    const email = readFileSync(new URL("./email.ts", import.meta.url), "utf8");
    expect(email).not.toContain("pool: true");
  });
});

describe("live chat rate limit", () => {
  it("blocks the next send after the window fills", () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: LIVE_CHAT_MAX_PER_WINDOW,
      now: () => now,
    });
    for (let i = 0; i < LIVE_CHAT_MAX_PER_WINDOW; i += 1) {
      expect(limiter.check("203.0.113.5").allowed).toBe(true);
    }
    const blocked = limiter.check("203.0.113.5");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(limiter.check("203.0.113.6").allowed).toBe(true);
    now += 60_001;
    expect(limiter.check("203.0.113.5").allowed).toBe(true);
  });
});
