/**
 * A service location is either a Places pick or plain typed text.
 * Coordinates are kept only for a pick. Typed text never grows a pin.
 */

const ADDRESS_LIMIT = 300;
const PLACE_ID_LIMIT = 300;

export interface PickedServiceLocation {
  placeId: string;
  formatted: string;
  lat: number;
  lng: number;
}

export type ServiceLocation =
  | { kind: "picked"; place: PickedServiceLocation }
  | { kind: "text"; formatted: string };

export interface StoredServiceLocationFields {
  address: string | PickedServiceLocation;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export function serviceLocationFromInput(value: unknown): ServiceLocation | null {
  if (typeof value === "string") {
    const formatted = clip(value, ADDRESS_LIMIT);
    return formatted ? { kind: "text", formatted } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const formatted = clip(firstString(row, ["formatted", "description", "label"]), ADDRESS_LIMIT);
  const placeId = clip(firstString(row, ["placeId", "place_id"]), PLACE_ID_LIMIT);
  const lat = readCoord(row.lat ?? row.latitude, "lat");
  const lng = readCoord(row.lng ?? row.longitude, "lng");
  if (formatted && placeId && lat != null && lng != null) {
    return { kind: "picked", place: { placeId, formatted, lat, lng } };
  }
  if (formatted) return { kind: "text", formatted };
  return null;
}

/** Fields written on an order. A typed address is stored with no coordinates. */
export function storedServiceLocationFields(value: unknown): StoredServiceLocationFields {
  const location = serviceLocationFromInput(value);
  if (!location) return { address: "" };
  if (location.kind === "text") return { address: location.formatted };
  const { place } = location;
  return {
    address: place,
    lat: place.lat,
    lng: place.lng,
    latitude: place.lat,
    longitude: place.lng,
    placeId: place.placeId,
  };
}

export interface ServiceLocationValue {
  query: string;
  picked: PickedServiceLocation | null;
}

/** Editing the field drops the pin until a suggestion is picked again. */
export function serviceLocationAfterType(current: ServiceLocationValue, next: string): ServiceLocationValue {
  return {
    query: next,
    picked: current.picked && current.picked.formatted === next ? current.picked : null,
  };
}

/** A place details result with coordinates is the only way to set the pin. */
export function serviceLocationAfterPick(place: PickedServiceLocation | null, fallbackQuery: string): ServiceLocationValue {
  if (!place) return { query: fallbackQuery, picked: null };
  return { query: place.formatted, picked: place };
}

/**
 * Prefer a completed pick. A typed string, or coordinates with no place id,
 * stays text and does not carry a pin.
 */
export function orderAddressFromBooking(input: { address?: unknown; servicePlace?: unknown }): string | PickedServiceLocation {
  const picked = serviceLocationFromInput(input.servicePlace);
  if (picked?.kind === "picked") return picked.place;
  const address = serviceLocationFromInput(input.address);
  if (!address) return "";
  return address.kind === "picked" ? address.place : address.formatted;
}

/** Coordinates already stored on a booking record. Does not read them out of an address string. */
export function storedRecordPin(record: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  if (!record) return null;
  for (const key of ["address", "propertyAddress", "shootLocation"]) {
    const location = serviceLocationFromInput(record[key]);
    if (location?.kind === "picked") return { lat: location.place.lat, lng: location.place.lng };
  }
  const lat = readCoord(record.lat ?? record.latitude, "lat");
  const lng = readCoord(record.lng ?? record.longitude, "lng");
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function clip(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function readCoord(value: unknown, axis: "lat" | "lng"): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  if (axis === "lat" && (number < -90 || number > 90)) return null;
  if (axis === "lng" && (number < -180 || number > 180)) return null;
  return number;
}
