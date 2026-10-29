import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT, BUSINESS_CONTACT_LINE } from "./businessContact";
import {
  THANKFUL_RSVP_CONFIRM_TEMPLATE,
  thankfulRsvpConfirmHtml,
  thankfulRsvpConfirmIcs,
  thankfulRsvpConfirmLive,
  thankfulRsvpConfirmSubject,
  thankfulRsvpConfirmText,
} from "./thankfulRsvpConfirm";
import { emailAllowed } from "./clientNotify";

describe("thankful RSVP confirm gate", () => {
  it("stays off unless THANKFUL_RSVP_CONFIRM_LIVE is exactly true", () => {
    expect(thankfulRsvpConfirmLive({})).toBe(false);
    expect(thankfulRsvpConfirmLive({ THANKFUL_RSVP_CONFIRM_LIVE: "" })).toBe(false);
    expect(thankfulRsvpConfirmLive({ THANKFUL_RSVP_CONFIRM_LIVE: "TRUE" })).toBe(false);
    expect(thankfulRsvpConfirmLive({ THANKFUL_RSVP_CONFIRM_LIVE: "1" })).toBe(false);
    expect(thankfulRsvpConfirmLive({ THANKFUL_RSVP_CONFIRM_LIVE: "true" })).toBe(true);
  });

  it("allows the confirm template under RED when its own flag is on, without CLIENT_NOTIFY_LIVE", () => {
    const off = { CLIENT_COMMS_ZONE: "RED" };
    expect(emailAllowed(THANKFUL_RSVP_CONFIRM_TEMPLATE, off)).toBe(false);
    expect(
      emailAllowed(THANKFUL_RSVP_CONFIRM_TEMPLATE, {
        ...off,
        THANKFUL_RSVP_CONFIRM_LIVE: "true",
      }),
    ).toBe(true);
    expect(emailAllowed("account_password_setup", { THANKFUL_RSVP_CONFIRM_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe(false);
    expect(emailAllowed("booking_received", { CLIENT_COMMS_ZONE: "RED" })).toBe(true);
  });
});

describe("thankful RSVP confirm copy", () => {
  const input = {
    clientName: "Ada <Client>",
    photoTime: "12:00 PM",
    headcount: "3",
    menuVote: "The Harvest Table",
    santa: "Yes, please",
    requestId: "req-ada",
  };

  it("names the guest, event, studio, and phone with direct links only", () => {
    const html = thankfulRsvpConfirmHtml(input);
    expect(thankfulRsvpConfirmSubject("Ada Client", "12:00 PM")).toContain("12:00 PM");
    expect(html).toContain("Hi Ada");
    expect(html).toContain("Sat, Nov 7, 2026");
    expect(html).toContain("11 AM");
    expect(html).toContain(BUSINESS_CONTACT.address);
    expect(html).toContain("12:00 PM");
    expect(html).toContain("The Harvest Table");
    expect(html).toContain("3");
    expect(html).toContain(BUSINESS_CONTACT.phoneDisplay);
    expect(html).toContain(BUSINESS_CONTACT.phoneHref);
    expect(html).toContain("https://iconicimagestx.vercel.app/thankful");
    expect(html).not.toContain("utm_");
    expect(html).not.toContain("bit.ly");
    expect(html).not.toContain("iconicimagestx.com/thankful");
    expect(html).toContain(BUSINESS_CONTACT_LINE.split(" | ")[0]);
    const text = thankfulRsvpConfirmText(input);
    expect(text).toContain("12:00 PM");
    expect(text).toContain(BUSINESS_CONTACT.phoneDisplay);
  });

  it("builds a whole-event .ics in America/Chicago", () => {
    const ics = thankfulRsvpConfirmIcs(input);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART;TZID=America/Chicago:20261107T110000");
    expect(ics).toContain("DTEND;TZID=America/Chicago:20261107T150000");
    expect(ics).toContain(BUSINESS_CONTACT.address.replace(/,/g, "\\,"));
    expect(ics).toContain("12:00 PM");
    expect(ics).not.toContain("utm_");
  });
});
