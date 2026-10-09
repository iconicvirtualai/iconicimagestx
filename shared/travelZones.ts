/**
 * Iconic travel zones.
 *
 * Concentric circles centered on the studio. Distance is straight-line
 * haversine miles. Tolls are not considered. Driving distance is not used.
 *
 * PROVISIONAL outer radii, measured off the old Wix zone map. Cadi will
 * confirm the mileage bands. Fees are the published zone prices. To change
 * a band or a fee, edit TRAVEL_ZONES below — this is the only zone config.
 *
 *   Zone 1  ≤ 17 mi   FREE
 *   Zone 2  ≤ 30 mi   $50
 *   Zone 3  ≤ 42 mi   $75
 *   Zone 4  ≤ 55 mi   $100
 *   Zone 5  ≤ 69 mi   $125
 *   Zone 6  ≤ 84 mi   $150
 *   Beyond zone 6     "Travel quoted" (no dollar amount, never $0)
 */

import { addressText } from "./addressText.ts";
import { normalizeBookingLineItems, sumLineItemPrices, type BookingLineItem } from "./bookingPricing.ts";
import { serviceLocationFromInput } from "./serviceLocation.ts";
import { TX_ZIP_CENTROIDS } from "./txZipCentroids.ts";

/** Mean Earth radius in miles. Zone tests use this same value. */
export const EARTH_RADIUS_MILES = 3958.7613;

/**
 * Studio pin for 26410 Oak Ridge Dr Ste 105, The Woodlands, TX 77380.
 * Geocoded once with the US Census Public Address Ranges geocoder
 * (matched "26410 OAKRIDGE DR, THE WOODLANDS, TX, 77380"; suite 105 does
 * not move the pin). Do not geocode this address at runtime.
 */
export const TRAVEL_ORIGIN = {
  label: "26410 Oak Ridge Dr Ste 105, The Woodlands, TX 77380",
  lat: 30.145492547135,
  lng: -95.448893600358,
} as const;

export interface TravelZone {
  zone: number;
  /** PROVISIONAL. Inclusive outer radius in straight-line miles. Cadi will confirm. */
  outerMiles: number;
  feeCents: number;
}

/**
 * PROVISIONAL mileage bands. outerMiles is the inclusive outer edge.
 * Cadi will confirm these radii; fees are the published prices.
 */
export const TRAVEL_ZONES: readonly TravelZone[] = [
  { zone: 1, outerMiles: 17, feeCents: 0 },
  { zone: 2, outerMiles: 30, feeCents: 5_000 },
  { zone: 3, outerMiles: 42, feeCents: 7_500 },
  { zone: 4, outerMiles: 55, feeCents: 10_000 },
  { zone: 5, outerMiles: 69, feeCents: 12_500 },
  { zone: 6, outerMiles: 84, feeCents: 15_000 },
];

export const TRAVEL_LINE_ID = "travel-fee";

/** Shown on the draft invoice when nobody has priced an out-of-area trip yet. */
export const TRAVEL_QUOTED_NOTE = "Staff must price travel before publishing.";

export interface TravelAssessment {
  /** 1–6, or null when the trip is quoted or the location did not resolve. */
  travelZone: number | null;
  /** Straight-line miles, rounded to 0.01. Null when the location did not resolve. */
  travelMiles: number | null;
  /** Cents. 0 in zone 1. Null when quoted — never a fake $0 fee. */
  travelFeeCents: number | null;
  travelQuoted: boolean;
}

export interface TravelCustomerLine {
  label: string;
  /** Dollar amount, "FREE (Zone 1)", or null when the label is already "Travel quoted". */
  amount: string | null;
}

const TX_ZIP = /\b(7[5-9]\d{3})(?:-\d{4})?\b/g;
const BOUNDARY_EPSILON_MILES = 1e-6;

export function haversineMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A point `miles` due north of the studio. Boundary tests use this. */
export function pointMilesFromOrigin(miles: number, bearingDegrees = 0): { lat: number; lng: number } {
  const angular = miles / EARTH_RADIUS_MILES;
  const bearing = toRad(bearingDegrees);
  const lat1 = toRad(TRAVEL_ORIGIN.lat);
  const lng1 = toRad(TRAVEL_ORIGIN.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/**
 * Quote a booking location.
 * A Places pin ({ formatted, lat, lng, placeId }) wins. A ZIP with no pin
 * uses TX_ZIP_CENTROIDS. Anything else is "Travel quoted".
 * Client fee fields on the same object are ignored.
 */
export function assessTravel(value: unknown): TravelAssessment {
  const pin = pinFrom(value);
  if (pin) return quoteFromMiles(haversineMiles(TRAVEL_ORIGIN, pin));

  const zip = zipFrom(value);
  if (zip) {
    const centroid = TX_ZIP_CENTROIDS[zip];
    if (centroid) return quoteFromMiles(haversineMiles(TRAVEL_ORIGIN, centroid));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (row.address != null && row.address !== value) return assessTravel(row.address);
  }

  return unresolved();
}

export function travelFeeDollars(travel: TravelAssessment): number {
  if (travel.travelQuoted || travel.travelFeeCents == null) return 0;
  return travel.travelFeeCents / 100;
}

export function travelCustomerLine(travel: TravelAssessment): TravelCustomerLine {
  if (travel.travelQuoted || travel.travelZone == null) {
    return { label: "Travel quoted", amount: null };
  }
  if (travel.travelZone === 1) {
    return { label: "Travel fee — Zone 1", amount: "FREE (Zone 1)" };
  }
  return {
    label: `Travel fee — Zone ${travel.travelZone}`,
    amount: sidebarMoney(travel.travelFeeCents ?? 0),
  };
}

/** Email, calendar, and office copy. Never includes $0. */
export function travelSummaryText(travel: TravelAssessment, options?: { miles?: boolean }): string {
  const line = travelCustomerLine(travel);
  const miles = options?.miles && travel.travelMiles != null
    ? ` (${travel.travelMiles.toFixed(2)} mi)`
    : "";
  if (travel.travelQuoted || travel.travelZone == null) return `${line.label}${miles}`;
  if (travel.travelZone === 1) return `FREE (Zone 1)${miles}`;
  return `${line.label} — ${emailMoney(travel.travelFeeCents ?? 0)}${miles}`;
}

export function isTravelFeeLine(item: { id?: string; name?: string } | null | undefined): boolean {
  if (!item) return false;
  if (String(item.id || "") === TRAVEL_LINE_ID) return true;
  const name = String(item.name || "").trim();
  return name === "Travel quoted" || name === "FREE (Zone 1)" || /^Travel fee\b/i.test(name);
}

/**
 * Draft invoice line. Zone trips are "Travel fee — Zone N".
 * A quoted trip is a $0 placeholder plus a note to price before publishing.
 * The customer-facing estimator does not show that $0.
 */
export function travelInvoiceLine(travel: TravelAssessment): BookingLineItem {
  if (travel.travelQuoted || travel.travelZone == null) {
    return {
      id: TRAVEL_LINE_ID,
      name: "Travel quoted",
      description: TRAVEL_QUOTED_NOTE,
      unitPrice: 0,
      qty: 1,
      price: 0,
    };
  }
  const price = travel.travelFeeCents == null ? 0 : travel.travelFeeCents / 100;
  return {
    id: TRAVEL_LINE_ID,
    name: `Travel fee — Zone ${travel.travelZone}`,
    unitPrice: price,
    qty: 1,
    price,
  };
}

export interface AppliedTravel {
  lineItems: BookingLineItem[];
  total: number;
  travel: TravelAssessment;
}

/**
 * Replace any client travel line with a server quote from `address`.
 * `clientTravelFeeCents` is accepted and ignored so a posted fee cannot win.
 */
export function applyServerTravel(
  lineItems: BookingLineItem[] | unknown,
  address: unknown,
  clientTravelFeeCents?: unknown,
): AppliedTravel {
  void clientTravelFeeCents;
  const travel = assessTravel(address);
  const kept = normalizeBookingLineItems(lineItems).filter((item) => !isTravelFeeLine(item));
  const next = [...kept, travelInvoiceLine(travel)];
  return {
    lineItems: next,
    total: roundMoney(sumLineItemPrices(next)),
    travel,
  };
}

/** Saved quote on an order or request. Missing fields do not invent a zone. */
export function travelFromRecord(record: Record<string, unknown> | null | undefined): TravelAssessment | null {
  if (!record || typeof record.travelQuoted !== "boolean") return null;
  return {
    travelZone: finiteOrNull(record.travelZone),
    travelMiles: finiteOrNull(record.travelMiles),
    travelFeeCents: finiteOrNull(record.travelFeeCents),
    travelQuoted: record.travelQuoted,
  };
}

/**
 * Office/email text for a saved order. Uses the stored quote when the server
 * already wrote one. Otherwise quotes the address. Null when there is no
 * address and no stored quote ("Not provided" stays the caller's choice).
 */
export function travelTextForRecord(
  record: Record<string, unknown> | null | undefined,
  options?: { miles?: boolean },
): string | null {
  if (!record) return null;
  const stored = travelFromRecord(record);
  if (stored) return travelSummaryText(stored, options);
  const address = record.address ?? record.propertyAddress ?? record.shootLocation ?? record.addressLabel;
  if (address == null || address === "") return null;
  return travelSummaryText(assessTravel(address), options);
}

function quoteFromMiles(miles: number): TravelAssessment {
  const travelMiles = roundMiles(miles);
  for (const zone of TRAVEL_ZONES) {
    if (miles <= zone.outerMiles + BOUNDARY_EPSILON_MILES) {
      return {
        travelZone: zone.zone,
        travelMiles,
        travelFeeCents: zone.feeCents,
        travelQuoted: false,
      };
    }
  }
  return {
    travelZone: null,
    travelMiles,
    travelFeeCents: null,
    travelQuoted: true,
  };
}

function unresolved(): TravelAssessment {
  return {
    travelZone: null,
    travelMiles: null,
    travelFeeCents: null,
    travelQuoted: true,
  };
}

function pinFrom(value: unknown): { lat: number; lng: number } | null {
  const location = serviceLocationFromInput(value);
  if (location?.kind === "picked") return { lat: location.place.lat, lng: location.place.lng };
  return null;
}

function zipFrom(value: unknown): string | null {
  const text = addressText(value) || (typeof value === "string" ? value : "");
  if (!text) return null;
  const matches = text.match(TX_ZIP);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1].slice(0, 5);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sidebarMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function emailMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function roundMiles(miles: number): number {
  return Math.round(miles * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDeg(radians: number): number {
  return radians * 180 / Math.PI;
}
