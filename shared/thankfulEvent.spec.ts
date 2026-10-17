import { describe, expect, it } from "vitest";
import { metaPlan } from "./siteSeo";
import {
  THANKFUL_BUFFER_MINUTES,
  THANKFUL_MENUS,
  THANKFUL_SLOT_MINUTES,
  THANKFUL_STEP_MINUTES,
  openThankfulSlots,
  parseThankfulRsvp,
  thankfulBusyIntervals,
  quoteThankfulSocial,
  thankfulMoney,
  thankfulRsvpOpen,
  thankfulSocialOfferOpen,
  thankfulZonedTimeToUtc,
} from "./thankfulEvent";
import { processingFeeCents } from "./invoiceProcessing";

const NOW = new Date("2026-10-15T15:00:00.000Z");

function at(hour: number, minute: number) {
  return thankfulZonedTimeToUtc(2026, 11, 14, hour, minute).toISOString();
}

describe("thankful photo slots", () => {
  it("offers 15-minute steps from 11:00 AM through 2:45 PM when the calendar is open", () => {
    const slots = openThankfulSlots({ now: NOW, busy: [] });
    expect(THANKFUL_SLOT_MINUTES).toBe(15);
    expect(THANKFUL_BUFFER_MINUTES).toBe(5);
    expect(THANKFUL_STEP_MINUTES).toBe(15);
    expect(slots).toHaveLength(16);
    const last = slots[slots.length - 1];
    expect(slots[0]?.time).toBe("11:00 AM");
    expect(slots[0]?.start).toBe(at(11, 0));
    expect(last?.time).toBe("2:45 PM");
    expect(last?.end).toBe(at(15, 0));
    for (const slot of slots) {
      expect(Date.parse(slot.end) - Date.parse(slot.start)).toBe(15 * 60 * 1000);
      expect(slot.date).toBe("2026-11-14");
    }
    for (let index = 1; index < slots.length; index += 1) {
      const gap = Date.parse(slots[index].start) - Date.parse(slots[index - 1].start);
      expect(gap).toBe(15 * 60 * 1000);
    }
  });

  it("keeps a 5-minute buffer around an existing photos calendar event", () => {
    const slots = openThankfulSlots({
      now: NOW,
      busy: [{ start: at(12, 0), end: at(12, 15) }],
    });
    const times = slots.map((slot) => slot.time);
    expect(times).not.toContain("11:45 AM");
    expect(times).not.toContain("12:00 PM");
    expect(times).not.toContain("12:15 PM");
    expect(times).toContain("11:30 AM");
    expect(times).toContain("12:30 PM");
  });

  it("blocks the day when an all-day event covers November 14", () => {
    const busy = thankfulBusyIntervals([
      { start: "2026-11-14", end: "2026-11-15", allDay: true },
    ]);
    expect(openThankfulSlots({ now: NOW, busy })).toEqual([]);
    expect(openThankfulSlots({
      now: NOW,
      busy: [{ start: "2026-11-15", end: "2026-11-16", allDay: true }],
    })).toHaveLength(16);
  });
});

describe("thankful RSVP deadline", () => {
  it("stays open through Monday, Nov 9, 2026 and closes at midnight Central", () => {
    expect(thankfulRsvpOpen(thankfulZonedTimeToUtc(2026, 11, 9, 23, 59))).toBe(true);
    expect(thankfulRsvpOpen(new Date(thankfulZonedTimeToUtc(2026, 11, 10, 0, 0).getTime() - 1))).toBe(true);
    expect(thankfulRsvpOpen(thankfulZonedTimeToUtc(2026, 11, 10, 0, 0))).toBe(false);
    expect(thankfulRsvpOpen(thankfulZonedTimeToUtc(2026, 11, 14, 11, 0))).toBe(false);
  });
});

describe("thankful RSVP parse", () => {
  const body = {
    name: "Ada Lovelace",
    email: "Ada@Example.com",
    phone: "(281) 555-0199",
    partySize: 4,
    menuVote: "menu-2",
    santa: true,
    notes: "One dog",
    slotStart: at(11, 0),
  };

  it("keeps party size, one menu, and Santa", () => {
    const parsed = parseThankfulRsvp(body);
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(parsed.value.partySize).toBe(4);
    expect(parsed.value.menuVote).toBe("menu-2");
    expect(parsed.value.menuDishes).toEqual([...THANKFUL_MENUS[1].dishes]);
    expect(parsed.value.santa).toBe(true);
    expect(parsed.value.email).toBe("ada@example.com");
  });

  it("rejects a missing menu and a party under 1", () => {
    expect(parseThankfulRsvp({ ...body, menuVote: "" }).ok).toBe(false);
    expect(parseThankfulRsvp({ ...body, partySize: 0 }).ok).toBe(false);
    expect(parseThankfulRsvp({ ...body, santa: "maybe" }).ok).toBe(false);
  });
});

describe("thankful social packages", () => {
  it("closes the pre-event price at the start of Nov 14 Central", () => {
    expect(thankfulSocialOfferOpen(thankfulZonedTimeToUtc(2026, 11, 13, 23, 59))).toBe(true);
    expect(thankfulSocialOfferOpen(thankfulZonedTimeToUtc(2026, 11, 14, 0, 0))).toBe(false);
  });

  it("prices half off, then the term extra, from the Social Monopoly monthly rates", () => {
    const baselineYear = quoteThankfulSocial("baseline", "12");
    const growthSix = quoteThankfulSocial("growth-engine", "6");
    const suiteThree = quoteThankfulSocial("professional-suite", "3");
    const connectedYear = quoteThankfulSocial("connected-core", "12");
    const signatureSix = quoteThankfulSocial("signature-tier", "6");
    const authorityMonth = quoteThankfulSocial("authority-stack", "month");
    expect(baselineYear?.regularMonthlyCents).toBe(50_000);
    expect(baselineYear?.saleMonthlyCents).toBe(22_500);
    expect(baselineYear?.subtotalCents).toBe(270_000);
    expect(thankfulMoney(baselineYear?.subtotalCents || 0)).toBe("$2,700");
    expect(growthSix?.subtotalCents).toBe(242_250);
    expect(suiteThree?.regularMonthlyCents).toBe(150_000);
    expect(suiteThree?.subtotalCents).toBe(215_000);
    expect(connectedYear?.subtotalCents).toBe(1_080_000);
    expect(signatureSix?.subtotalCents).toBe(798_000);
    expect(authorityMonth?.saleMonthlyCents).toBe(160_000);
    expect(authorityMonth?.subtotalCents).toBe(160_000);
    for (const quote of [baselineYear, growthSix, suiteThree, connectedYear, signatureSix, authorityMonth]) {
      expect(quote?.processingCents).toBe(processingFeeCents(quote?.subtotalCents || 0));
      expect(quote?.totalCents).toBe((quote?.subtotalCents || 0) + (quote?.processingCents || 0));
    }
  });
});

describe("thankful public meta", () => {
  it("does not publish a vercel.app or cadi address", () => {
    const plan = metaPlan("/thankful");
    expect(plan.kind).toBe("public");
    if (plan.kind !== "public") return;
    const visible = `${plan.title} ${plan.description} ${plan.canonical} ${plan.image}`;
    expect(plan.canonical).toBe("https://iconicimagestx.com/thankful");
    expect(visible).not.toContain("vercel.app");
    expect(visible.toLowerCase()).not.toContain("cadi@");
    expect(plan.title).toContain("Thankful for You Always");
  });
});
