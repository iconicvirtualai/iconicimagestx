import { describe, expect, it } from "vitest";
import {
  chooseStaffNotify,
  formatTeamSms,
  inQuietHours,
  parseInboundTeamSms,
  presentDirectory,
  presentSmsLog,
  teamSmsFrom,
  teamSmsLive,
  teamThreadLabel,
  ICONIC_TEAM_SMS_FROM,
} from "./teamChat.ts";

const codes = new Set(["A7K2", "C4P2"]);

describe("TEAM_SMS_LIVE", () => {
  it("stays off unless the flag is exactly true", () => {
    expect(teamSmsLive({})).toBe(false);
    expect(teamSmsLive({ TEAM_SMS_LIVE: "" })).toBe(false);
    expect(teamSmsLive({ TEAM_SMS_LIVE: "TRUE" })).toBe(false);
    expect(teamSmsLive({ TEAM_SMS_LIVE: "1" })).toBe(false);
    expect(teamSmsLive({ TEAM_SMS_LIVE: "true" })).toBe(true);
    expect(teamSmsFrom({})).toBe(ICONIC_TEAM_SMS_FROM);
    expect(teamSmsFrom({ TWILIO_PHONE_NUMBER: "+15555550100" })).toBe("+15555550100");
  });
});

describe("team SMS routing", () => {
  it("keeps a reply on the most recent thread unless a code switches it", () => {
    expect(parseInboundTeamSms("On my way", codes)).toEqual({ type: "message", text: "On my way" });
    expect(parseInboundTeamSms("A7K2 Gate is 4481", codes)).toEqual({
      type: "switch",
      code: "A7K2",
      text: "Gate is 4481",
    });
    expect(parseInboundTeamSms("#C4P2 Taking the 10am", codes)).toEqual({
      type: "switch",
      code: "C4P2",
      text: "Taking the 10am",
    });
    expect(parseInboundTeamSms("#ZZZZ nope", codes)).toEqual({ type: "switch-unknown", code: "ZZZZ" });
    expect(parseInboundTeamSms("Meet at noon", codes)).toEqual({ type: "message", text: "Meet at noon" });
  });

  it("treats STOP and HELP as the whole message", () => {
    expect(parseInboundTeamSms("stop", codes).type).toBe("stop");
    expect(parseInboundTeamSms("HELP", codes).type).toBe("help");
    expect(parseInboundTeamSms("START", codes).type).toBe("start");
    expect(parseInboundTeamSms("STOP by the office", codes).type).toBe("message");
  });

  it("formats the Iconic text without a personal number", () => {
    const body = formatTeamSms({
      label: teamThreadLabel("channel", "dispatch"),
      body: "Client asked to start in the backyard.",
      link: "https://iconicimagestx.com/shooter?thread=dispatch",
      code: "a7k2",
    });
    expect(body.startsWith("[Iconic · #dispatch] Client asked to start in the backyard.")).toBe(true);
    expect(body).toContain("https://iconicimagestx.com/shooter?thread=dispatch");
    expect(body).toContain("Code A7K2");
    expect(body).not.toMatch(/\+1\d{10}/);
  });
});

describe("quiet hours and push-first delivery", () => {
  it("covers an overnight window in Chicago", () => {
    const late = new Date("2026-11-11T05:30:00.000Z");
    const noon = new Date("2026-11-10T18:00:00.000Z");
    expect(inQuietHours(late, "22:00", "07:00", "America/Chicago")).toBe(true);
    expect(inQuietHours(noon, "22:00", "07:00", "America/Chicago")).toBe(false);
    expect(inQuietHours(late, "22:00", "22:00", "America/Chicago")).toBe(false);
    expect(inQuietHours(late, null, null, "America/Chicago")).toBe(false);
  });

  it("uses push first and never texts a client", () => {
    expect(chooseStaffNotify({
      hasPush: true,
      teamSmsLive: true,
      smsMuted: false,
      smsOptOut: false,
      quiet: false,
    })).toMatchObject({ channel: "push" });
    expect(chooseStaffNotify({
      hasPush: false,
      teamSmsLive: false,
      smsMuted: false,
      smsOptOut: false,
      quiet: false,
    })).toMatchObject({ channel: "dry-run", reason: "TEAM_SMS_LIVE is off." });
    expect(chooseStaffNotify({
      hasPush: false,
      teamSmsLive: true,
      smsMuted: false,
      smsOptOut: false,
      quiet: false,
    })).toMatchObject({ channel: "sms" });
    expect(chooseStaffNotify({
      hasPush: true,
      teamSmsLive: true,
      smsMuted: false,
      smsOptOut: false,
      quiet: false,
      isClient: true,
    })).toMatchObject({ channel: "skip" });
  });
});

describe("public team chat records", () => {
  it("drops nothing phone-shaped because the public shape has no phone", () => {
    const log = presentSmsLog({
      id: "log-1",
      recipientUid: "alex",
      recipientName: "Alex Rivera",
      threadId: "dispatch",
      threadLabel: "#dispatch",
      body: "[Iconic · #dispatch] On my way",
      status: "dry-run",
      reason: "TEAM_SMS_LIVE is off.",
      createdAt: "2026-11-10T18:00:00.000Z",
    });
    const directory = presentDirectory([
      { uid: "alex", name: "Alex Rivera", role: "photographer" },
    ]);
    const packed = JSON.stringify({ log, directory });
    expect(packed).not.toMatch(/phone/i);
    expect(packed).not.toMatch(/\+1\d{10}/);
    expect(log.recipientName).toBe("Alex Rivera");
  });
});
