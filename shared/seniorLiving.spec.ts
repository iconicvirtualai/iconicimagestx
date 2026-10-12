import { describe, expect, it } from "vitest";
import {
  SENIOR_FACILITY_RATE_PER_SQFT,
  SENIOR_LIVING_DEPOSIT_LINE,
  SENIOR_LIVING_DEPOSIT_LINE_ONLINE,
  SENIOR_LIVING_DEPOSIT_PERCENT,
  SENIOR_LIVING_DEPOSIT_RECEIVED,
  SENIOR_LIVING_DEPOSIT_REQUIRED,
  SENIOR_LIVING_HOSTING_NOTE,
  SENIOR_LIVING_MANUAL_DEPOSIT_NOTE,
  SENIOR_LIVING_PAY_STEP,
  seniorDepositCheckoutLive,
  seniorLivingDepositCopy,
  seniorLivingDepositReturnPath,
  SENIOR_LIVING_OPS_EMAIL,
  SENIOR_LIVING_PROCESSING_RATE,
  parseSeniorLivingOrder,
  quoteSeniorLivingOrder,
  seniorFacilityExampleLine,
  seniorFacilityPrice,
  seniorFacilityRateLine,
  SENIOR_ROOM_RATES,
  SENIOR_TOUR_PRICE,
  formatSeniorFacilityRate,
  formatUsd,
  parseSeniorLivingRequest,
  seniorLivingOfficeEnv,
  seniorLivingOfficeRecord,
} from "./seniorLiving";

const valid = {
  name: "Ada Lovelace",
  community: "A Woodlands-area senior living community",
  email: "ada@community.example",
  phone: "(281) 555-0199",
  address: "100 Oak St, Spring, TX 77380",
  services: ["tour-3d", "rooms"],
  preferredDates: "April 14 or 15",
  notes: "Front desk can let you in.",
};

describe("senior living pricing config", () => {
  it("keeps the facility rate on one constant", () => {
    expect(SENIOR_FACILITY_RATE_PER_SQFT).toBe(0.1);
    expect(formatSeniorFacilityRate()).toBe("$0.10");
    expect(formatSeniorFacilityRate(SENIOR_FACILITY_RATE_PER_SQFT)).toBe(
      formatUsd(0.1),
    );
    expect(seniorFacilityRateLine()).toBe("Whole-building facilities: $0.10 per sq ft");
    expect(seniorFacilityExampleLine()).toBe("a 20,000 sq ft community = $2,000");
    expect(seniorFacilityRateLine()).not.toMatch(/\$0\.0[5-7]/);
    expect(seniorFacilityExampleLine()).not.toMatch(/\$0\.0[5-7]/);
    expect(SENIOR_LIVING_DEPOSIT_LINE).toBe(
      "Reserve your date with a 50% deposit. We'll send your deposit invoice shortly. The balance is due after the shoot.",
    );
    expect(SENIOR_LIVING_DEPOSIT_LINE_ONLINE).toBe(
      "Reserve your date with a 50% deposit, paid securely online. The balance is due after the shoot.",
    );
    expect(seniorLivingDepositCopy(false)).toBe(SENIOR_LIVING_DEPOSIT_LINE);
    expect(seniorLivingDepositCopy(true)).toBe(SENIOR_LIVING_DEPOSIT_LINE_ONLINE);
    expect(SENIOR_LIVING_DEPOSIT_RECEIVED).toBe("Deposit received");
    expect(SENIOR_LIVING_PAY_STEP).toBe("Pay 50% deposit");
    expect(seniorLivingDepositReturnPath("ORD - L - 10001")).toBe(
      "/senior-living?deposit=received&order=ORD+-+L+-+10001",
    );
    expect(SENIOR_LIVING_MANUAL_DEPOSIT_NOTE).toBe("Invoice the 50% deposit manually");
    expect(seniorDepositCheckoutLive({})).toBe(false);
    expect(seniorDepositCheckoutLive({ SENIOR_DEPOSIT_CHECKOUT_LIVE: "TRUE" })).toBe(false);
    expect(seniorDepositCheckoutLive({ SENIOR_DEPOSIT_CHECKOUT_LIVE: "true" })).toBe(true);
    expect(formatUsd(SENIOR_TOUR_PRICE)).toBe("$250");
    expect(SENIOR_ROOM_RATES.map((tier) => tier.each)).toEqual([199, 175]);
  });
});

describe("senior living deposit math", () => {
  it("adds the 2.8% processing line on top and takes half of that total", () => {
    expect(SENIOR_LIVING_PROCESSING_RATE).toBe(0.028);
    const quoted = quoteSeniorLivingOrder({
      tour: true,
      roomCount: 0,
      facilitySqft: 0,
      address: "100 Oak St, Spring, TX 77380",
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    expect(quoted.quote.travel.travelQuoted).toBe(false);
    expect(quoted.quote.travelLine.price).toBe(0);
    expect(quoted.quote.serviceSubtotal).toBe(250);
    expect(quoted.quote.processing).toBe(7);
    expect(quoted.quote.total).toBe(257);
    expect(quoted.quote.depositAmount).toBe(128.5);
    expect(quoted.quote.balanceDue).toBe(128.5);
    expect(quoted.quote.depositAmount + quoted.quote.balanceDue).toBe(quoted.quote.total);
  });

  it("prices 20,000 sq ft at $0.10 and takes half of the total with processing", () => {
    const quoted = quoteSeniorLivingOrder({
      tour: false,
      roomCount: 0,
      facilitySqft: 20_000,
      address: "100 Oak St, Spring, TX 77380",
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    expect(seniorFacilityPrice(20_000)).toBe(2000);
    expect(quoted.quote.serviceSubtotal).toBe(2000);
    expect(quoted.quote.travelLine.price).toBe(0);
    expect(quoted.quote.processing).toBe(56);
    expect(quoted.quote.total).toBe(2056);
    expect(quoted.quote.depositAmount).toBe(1028);
    expect(quoted.quote.balanceDue).toBe(1028);
    const order = parseSeniorLivingOrder({
      tour: false,
      roomCount: 0,
      facilitySqft: 20_000,
      community: "A Woodlands-area senior living community",
      address: "100 Oak St, Spring, TX 77380",
      name: "Ada Lovelace",
      title: "Director",
      phone: "281-555-0199",
      email: "ada@community.example",
      onsiteContact: "Front desk",
      notes: "",
      scheduledDate: "2099-01-15",
      scheduledTime: "9:00 AM",
      hosting: "monthly-hosting",
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(order.quote.total).toBe(2056);
    expect(order.value.hosting).toBe("monthly-hosting");
    expect(order.quote.lines.some((line) => line.name === "Monthly hosting")).toBe(false);
  });

  it("prices rooms by the tier, travel, and processing before the 50% deposit", () => {
    const quoted = quoteSeniorLivingOrder({
      tour: false,
      roomCount: 12,
      facilitySqft: 0,
      address: "100 Oak St, Spring, TX 77380",
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const rooms = quoted.quote.lines.find((line) => line.id === "rooms");
    expect(rooms).toMatchObject({ qty: 12, unitPrice: 175, price: 2100 });
    const travelCents = quoted.quote.travel.travelFeeCents || 0;
    const pricedCents = 210000 + travelCents;
    const processingCents = Math.round(pricedCents * SENIOR_LIVING_PROCESSING_RATE);
    const totalCents = pricedCents + processingCents;
    const depositCents = Math.round(totalCents * (SENIOR_LIVING_DEPOSIT_PERCENT / 100));
    expect(Math.round(quoted.quote.processing * 100)).toBe(processingCents);
    expect(Math.round(quoted.quote.total * 100)).toBe(totalCents);
    expect(Math.round(quoted.quote.depositAmount * 100)).toBe(depositCents);
    expect(Math.round(quoted.quote.balanceDue * 100)).toBe(totalCents - depositCents);
  });
});

describe("senior living request validation", () => {
  it("accepts a complete request", () => {
    const parsed = parseSeniorLivingRequest(valid);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.services).toEqual(["tour-3d", "rooms"]);
    expect(parsed.value.email).toBe("ada@community.example");
  });

  it("rejects a missing service, a bad email, and a short phone", () => {
    expect(parseSeniorLivingRequest({ ...valid, services: [] })).toMatchObject({
      ok: false,
      error: "Choose at least one service.",
    });
    expect(
      parseSeniorLivingRequest({ ...valid, email: "not-an-email" }),
    ).toMatchObject({
      ok: false,
      error: "Enter a valid email.",
    });
    expect(parseSeniorLivingRequest({ ...valid, phone: "555" })).toMatchObject({
      ok: false,
      error: "Enter a phone number.",
    });
  });

  it("treats a filled honeypot as a drop and ignores an unknown service", () => {
    expect(
      parseSeniorLivingRequest({
        ...valid,
        companyWebsite: "https://spam.example",
      }),
    ).toEqual({
      ok: false,
      honeypot: true,
    });
    expect(
      parseSeniorLivingRequest({ ...valid, services: ["aerial"] }),
    ).toMatchObject({
      ok: false,
      error: "Choose a listed service.",
    });
  });

  it("builds an office record the notify helper can read without billing the client", () => {
    const saved = seniorLivingOfficeRecord("req1", {
      ...valid,
      services: ["tour-3d", "facility"],
      notes: "Gate code is at the desk.",
    });
    expect(saved.email).toBe(valid.email);
    expect(saved.clientEmail).toBe(valid.email);
    expect(saved.community).toBe(valid.community);
    expect(saved.selectedService).toBe(
      "Senior Living (3D tour, Whole-building facility)",
    );
    expect(String(saved.vibeNote)).toContain("Quote request. Not invoiced.");
    expect(String(saved.vibeNote)).not.toContain("confirmation email");
    expect(saved.depositRequired).toBe(SENIOR_LIVING_DEPOSIT_REQUIRED);
    expect(saved.depositPercent).toBe(SENIOR_LIVING_DEPOSIT_PERCENT);
    expect(saved.depositRequired).toBe(true);
    expect(saved.depositPercent).toBe(50);
    expect(String(saved.vibeNote)).toContain("Deposit required: yes");
    expect(String(saved.vibeNote)).toContain("Deposit percent: 50");
    expect(String(saved.vibeNote)).toContain(SENIOR_LIVING_DEPOSIT_LINE);
  });

  it("adds ops to the existing office recipient list", () => {
    const env = seniorLivingOfficeEnv({
      ADMIN_EMAIL: "photos@iconicimagestx.com",
      COORDINATOR_EMAIL: "coord@iconicimagestx.com",
    });
    expect(env.ADMIN_EMAIL).toContain(SENIOR_LIVING_OPS_EMAIL);
    expect(env.ADMIN_EMAIL).toContain("photos@iconicimagestx.com");
    expect(env.COORDINATOR_EMAIL).toBe("coord@iconicimagestx.com");
    const again = seniorLivingOfficeEnv({
      ADMIN_EMAIL: "ops@iconicimagestx.com",
    });
    expect(again.ADMIN_EMAIL).toBe("ops@iconicimagestx.com");
  });
});
