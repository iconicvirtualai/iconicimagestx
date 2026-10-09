import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBookingInvoiceDraft } from "./bookingInvoice.ts";
import { bookingEventDescription } from "../server/services/calendar.ts";
import {
  applyServerTravel,
  assessTravel,
  pointMilesFromOrigin,
  TRAVEL_ORIGIN,
  TRAVEL_QUOTED_NOTE,
  TRAVEL_ZONES,
  travelCustomerLine,
  travelFeeDollars,
  travelInvoiceLine,
  travelSummaryText,
  type TravelAssessment,
} from "./travelZones.ts";

const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
const bookingForm = readFileSync(new URL("../client/components/BookingForm.tsx", import.meta.url), "utf8");
const email = readFileSync(new URL("../server/services/email.ts", import.meta.url), "utf8");
const notify = readFileSync(new URL("./clientNotify.ts", import.meta.url), "utf8");

function place(miles: number) {
  const point = pointMilesFromOrigin(miles);
  return {
    formatted: `${miles} mi north of the studio`,
    lat: point.lat,
    lng: point.lng,
    placeId: `miles-${miles}`,
  };
}

/**
 * Sample points for the PR table.
 * Market Street is the OpenStreetMap retail polygon centroid in The Woodlands.
 * The ZIP rows use the Zippopotam.us centroid in txZipCentroids.ts.
 */
const SAMPLES: Array<{
  label: string;
  address: unknown;
  zone: number | null;
  miles: number;
  feeCents: number | null;
  quoted: boolean;
}> = [
  {
    label: "The Woodlands (Market St)",
    address: {
      formatted: "Market Street, The Woodlands, TX 77380",
      lat: 30.1640251,
      lng: -95.4643064,
      placeId: "market-street-woodlands",
    },
    zone: 1,
    miles: 1.58,
    feeCents: 0,
    quoted: false,
  },
  { label: "Spring 77373", address: "Spring, TX 77373", zone: 1, miles: 7.68, feeCents: 0, quoted: false },
  { label: "downtown Houston 77002", address: "Houston, TX 77002", zone: 2, miles: 27.21, feeCents: 5000, quoted: false },
  { label: "Katy 77494", address: "Katy, TX 77494", zone: 3, miles: 36.13, feeCents: 7500, quoted: false },
  { label: "Huntsville 77340", address: "Huntsville, TX 77340", zone: 3, miles: 35.37, feeCents: 7500, quoted: false },
  { label: "Galveston 77550", address: "Galveston, TX 77550", zone: 6, miles: 70.54, feeCents: 15000, quoted: false },
  { label: "Beaumont 77701", address: "Beaumont, TX 77701", zone: 6, miles: 80.57, feeCents: 15000, quoted: false },
  { label: "Austin 78701", address: "Austin, TX 78701", zone: null, miles: 137.23, feeCents: null, quoted: true },
];

describe("travel zone config", () => {
  it("keeps the published fees and the confirmed radii in one table", () => {
    expect(TRAVEL_ZONES.map((zone) => [zone.zone, zone.outerMiles, zone.feeCents])).toEqual([
      [1, 17, 0],
      [2, 30, 5_000],
      [3, 42, 7_500],
      [4, 55, 10_000],
      [5, 69, 12_500],
      [6, 84, 15_000],
    ]);
    expect(TRAVEL_ORIGIN.lat).toBeCloseTo(30.145492547135, 8);
    expect(TRAVEL_ORIGIN.lng).toBeCloseTo(-95.448893600358, 8);
  });
});

describe("zone boundaries", () => {
  it("includes the outer radius in the inner zone and steps up just past it", () => {
    const atStudio = assessTravel(place(0));
    expect(atStudio.travelZone).toBe(1);
    expect(atStudio.travelFeeCents).toBe(0);
    expect(atStudio.travelQuoted).toBe(false);

    for (const zone of TRAVEL_ZONES) {
      const onEdge = assessTravel(place(zone.outerMiles));
      expect(onEdge.travelZone, `zone ${zone.zone} outer edge`).toBe(zone.zone);
      expect(onEdge.travelFeeCents).toBe(zone.feeCents);
      expect(onEdge.travelQuoted).toBe(false);

      const past = assessTravel(place(zone.outerMiles + 0.02));
      if (zone.zone === 6) {
        expect(past.travelQuoted).toBe(true);
        expect(past.travelZone).toBeNull();
        expect(past.travelFeeCents).toBeNull();
      } else {
        expect(past.travelZone, `just past zone ${zone.zone}`).toBe(zone.zone + 1);
        expect(past.travelQuoted).toBe(false);
      }
    }
  });

  it("quotes Austin and any trip past zone 6 without a dollar amount", () => {
    const austin = assessTravel("Austin, TX 78701");
    expect(austin.travelQuoted).toBe(true);
    expect(austin.travelZone).toBeNull();
    expect(austin.travelFeeCents).toBeNull();
    expect(austin.travelMiles).toBeGreaterThan(84);
    expect(travelCustomerLine(austin)).toEqual({ label: "Travel quoted", amount: null });
    expect(travelSummaryText(austin)).toBe("Travel quoted");
    expect(travelSummaryText(austin)).not.toMatch(/\$0/);
    expect(travelFeeDollars(austin)).toBe(0);
  });
});

describe("unresolved locations", () => {
  it("quotes when there is no pin and no known ZIP", () => {
    for (const value of [null, "", "   ", "123 Main St, Conroe, TX", { formatted: "Somewhere in Texas" }]) {
      const travel = assessTravel(value);
      expect(travel).toEqual({
        travelZone: null,
        travelMiles: null,
        travelFeeCents: null,
        travelQuoted: true,
      });
      expect(travelCustomerLine(travel).amount).toBeNull();
      expect(travelSummaryText(travel)).not.toMatch(/\$/);
    }
  });

  it("uses a Places pin instead of a ZIP written into the same address", () => {
    const spoofed = assessTravel({
      formatted: "Austin, TX 78701",
      lat: TRAVEL_ORIGIN.lat,
      lng: TRAVEL_ORIGIN.lng,
      placeId: "studio-pin",
    });
    expect(spoofed.travelZone).toBe(1);
    expect(spoofed.travelQuoted).toBe(false);
    expect(assessTravel("Austin, TX 78701").travelQuoted).toBe(true);
  });
});

describe("sample addresses", () => {
  it("matches the confirmed zone table", () => {
    for (const sample of SAMPLES) {
      const travel = assessTravel(sample.address);
      expect(travel.travelZone, sample.label).toBe(sample.zone);
      expect(travel.travelMiles, sample.label).toBeCloseTo(sample.miles, 2);
      expect(travel.travelFeeCents, sample.label).toBe(sample.feeCents);
      expect(travel.travelQuoted, sample.label).toBe(sample.quoted);
      expect(travelSummaryText(travel), sample.label).not.toMatch(/\$0/);
    }
    expect(travelCustomerLine(assessTravel(SAMPLES[0].address))).toEqual({
      label: "Travel fee — Zone 1",
      amount: "FREE (Zone 1)",
    });
    expect(travelSummaryText(assessTravel(SAMPLES[0].address))).toBe("FREE (Zone 1)");
    expect(travelCustomerLine(assessTravel(SAMPLES[2].address))).toEqual({
      label: "Travel fee — Zone 2",
      amount: "$50",
    });
    expect(travelSummaryText(assessTravel(SAMPLES[2].address))).toBe("Travel fee — Zone 2 — $50.00");
  });
});

describe("server recompute", () => {
  it("ignores a client travel fee and prices the pin", () => {
    const services = [
      { id: "listing-essentials", name: "The Essentials", unitPrice: 249, qty: 1, price: 249 },
      { id: "travel-fee", name: "Travel fee — Zone 1", unitPrice: 0, qty: 1, price: 0 },
    ];
    const houston = {
      formatted: "100 Main St, Houston, TX 77002",
      lat: 29.7594,
      lng: -95.3594,
      placeId: "houston-pin",
    };
    const applied = applyServerTravel(services, houston, 0);

    expect(applied.travel.travelZone).toBe(2);
    expect(applied.travel.travelFeeCents).toBe(5000);
    expect(applied.travel.travelQuoted).toBe(false);
    expect(applied.lineItems.filter((item) => item.id === "travel-fee")).toEqual([
      {
        id: "travel-fee",
        name: "Travel fee — Zone 2",
        unitPrice: 50,
        qty: 1,
        price: 50,
      },
    ]);
    expect(applied.total).toBe(299);
  });

  it("does not block a quoted trip and does not store the fee as zero cents", () => {
    const applied = applyServerTravel(
      [{ name: "The Essentials", unitPrice: 249, qty: 1, price: 249 }],
      "not a place",
      15000,
    );
    expect(applied.travel.travelQuoted).toBe(true);
    expect(applied.travel.travelFeeCents).toBeNull();
    expect(applied.total).toBe(249);
    expect(applied.lineItems).toHaveLength(2);
  });
});

describe("invoice line creation", () => {
  it("adds Travel fee — Zone N on the draft and a $0 quoted placeholder with a staff note", () => {
    const zone: TravelAssessment = {
      travelZone: 4,
      travelMiles: 50,
      travelFeeCents: 10_000,
      travelQuoted: false,
    };
    expect(travelInvoiceLine(zone)).toMatchObject({
      id: "travel-fee",
      name: "Travel fee — Zone 4",
      price: 100,
      qty: 1,
    });

    const draft = buildBookingInvoiceDraft({
      lineItems: [{ name: "The Essentials", price: 249, qty: 1, unitPrice: 249 }],
      total: 1,
      clientEmail: "ada@example.com",
      clientName: "Ada",
      travel: zone,
    });
    expect(draft.status).toBe("draft");
    expect(draft.lineItems.map((item) => [item.name, item.price])).toEqual([
      ["The Essentials", 249],
      ["Travel fee — Zone 4", 100],
    ]);
    expect(draft.total).toBe(349);
    expect(draft.amountDue).toBe(349);
    expect(draft.travelZone).toBe(4);
    expect(draft.travelFeeCents).toBe(10_000);
    expect(draft.travelQuoted).toBe(false);

    const quoted = travelInvoiceLine(assessTravel("nope"));
    expect(quoted).toMatchObject({
      id: "travel-fee",
      name: "Travel quoted",
      price: 0,
      description: TRAVEL_QUOTED_NOTE,
    });
    expect(quoted.name).not.toMatch(/\$0/);
    const quotedDraft = buildBookingInvoiceDraft({
      lineItems: [{ name: "The Essentials", price: 249, qty: 1, unitPrice: 249 }],
      total: 9999,
      clientEmail: "ada@example.com",
      clientName: "Ada",
      travel: assessTravel(null),
    });
    expect(quotedDraft.total).toBe(249);
    expect(quotedDraft.travelFeeCents).toBeNull();
    expect(quotedDraft.travelQuoted).toBe(true);
    expect(quotedDraft.lineItems[1]?.description).toBe(TRAVEL_QUOTED_NOTE);
  });
});

describe("booking pipeline wiring", () => {
  it("recomputes on the server, shows the line in the form, and leaves notify gates alone", () => {
    expect(bookings).toContain("applyServerTravel(");
    expect(bookings).not.toMatch(/req\.body\.travelFee/);
    expect(bookings).not.toMatch(/body\.travelFeeCents/);
    expect(bookings).toContain("travelFee: travelSummaryText(");
    expect(bookings).toContain('template: "booking_received"');
    expect(bookings).toContain('template: "order_confirmed"');
    expect(bookings).not.toContain('template: "invoice"');

    expect(bookingForm).toContain("calculateSidebarTotal(bookingPriceInput())");
    expect(bookingForm).toContain("travelFeeDollars(travel)");
    expect(bookingForm).toContain('data-testid="booking-estimator"');
    expect(bookingForm).toContain('data-testid="travel-fee-line"');
    expect(bookingForm).toContain('data-testid="order-summary-before-submit"');

    expect(email).toContain("${vars.travelFee");
    expect(notify).toContain('return env.CLIENT_NOTIFY_LIVE === "true"');
    expect(notify).toContain('if (template === ORDER_RECEIVED_EMAIL_TEMPLATE) return true;');

    const description = bookingEventDescription({
      orderId: "ord-1",
      clientName: "Ada",
      address: "100 Main St",
      services: ["The Essentials"],
      travelSummary: "Travel fee — Zone 2 — $50.00 (27.21 mi)",
    });
    expect(description).toContain("Travel: Travel fee — Zone 2 — $50.00 (27.21 mi)");
    expect(description).toContain("Services: The Essentials");
  });
});
