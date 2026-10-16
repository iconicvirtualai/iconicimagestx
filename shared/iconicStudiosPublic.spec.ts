import { describe, expect, it } from "vitest";
import {
  FOUNDING_PASS_DRAFT_LABEL,
  FOUNDING_PASS_NOT_FINAL,
  FOUNDING_PASSES,
  STUDIOS_CALENDAR_NOTE,
  parseStudiosRequest,
} from "./iconicStudiosPublic";
import { readSquarePayLink } from "./publicRequests";

const contact = {
  name: "Grace Hopper",
  email: "grace@example.com",
  phone: "(281) 555-0199",
  notes: "Brand film.",
  website: "",
};

describe("founding passes", () => {
  it("lists draft monthly amounts and says they are not final", () => {
    expect(FOUNDING_PASSES.map((pass) => [pass.name, pass.draftMonthly])).toEqual([
      ["Backstage", 199],
      ["VIP", 499],
      ["Headliner", 999],
    ]);
    expect(FOUNDING_PASS_DRAFT_LABEL).toBe("DRAFT — prices pending");
    expect(FOUNDING_PASS_NOT_FINAL).toMatch(/not final/i);
    expect(STUDIOS_CALENDAR_NOTE).toMatch(/calendar/i);
  });
});

describe("studios request validation", () => {
  it("requires a room, date, time, and length for a session", () => {
    expect(parseStudiosRequest({ ...contact, kind: "session" })).toMatchObject({
      ok: false,
      error: "Choose a room.",
    });
    expect(parseStudiosRequest({
      ...contact,
      kind: "session",
      roomId: "noir",
      preferredDate: "2026-11-02",
      preferredTime: "25:00",
      lengthId: "60",
    })).toMatchObject({ ok: false, error: "Choose a start time." });
  });

  it("saves a session request with no charge and an office flag", () => {
    const parsed = parseStudiosRequest({
      ...contact,
      kind: "session",
      roomId: "blanc",
      preferredDate: "2026-11-02",
      preferredTime: "14:30",
      lengthId: "120",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.total).toBe(0);
    expect(parsed.record.priceStatus).toBe("quote-pending");
    expect(parsed.record.officeFlag).toBe(true);
    expect(parsed.record.calendarConnected).toBe(false);
    expect(parsed.record.clientEmailSent).toBe(false);
    expect(parsed.record.roomName).toBe("Studio Blanc");
    expect(parsed.record.lengthLabel).toBe("2 hours");
    expect(JSON.stringify(parsed.record)).not.toContain("cadi@");
    expect(JSON.stringify(parsed.record)).not.toContain("squareup.com");
  });

  it("stores a founding pass as a draft label, not a charge", () => {
    const parsed = parseStudiosRequest({ ...contact, kind: "pass", passId: "vip" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.total).toBe(0);
    expect(parsed.record.draftMonthly).toBe(499);
    expect(parsed.record.priceStatus).toBe("draft");
    expect(parsed.record.lineItems[0].price).toBe(0);
    expect(parsed.record.lineItems[0].name).toContain("DRAFT — prices pending");
    expect(parsed.record.officeFlag).toBe(true);
  });
});

describe("square pay links", () => {
  it("ignores empty, non-square, and vercel.app values", () => {
    expect(readSquarePayLink("")).toBeNull();
    expect(readSquarePayLink(undefined)).toBeNull();
    expect(readSquarePayLink("https://iconicimagestx.vercel.app/pay")).toBeNull();
    expect(readSquarePayLink("https://example.com/pay")).toBeNull();
    expect(readSquarePayLink("http://square.link/abc")).toBeNull();
    expect(readSquarePayLink("https://square.link/holiday")).toBe("https://square.link/holiday");
  });
});
