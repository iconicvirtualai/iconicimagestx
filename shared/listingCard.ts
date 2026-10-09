/**
 * Address, amenities, and shoot date for a client project tile.
 * Package identity, skin label, and price display live in packageSkins.ts.
 * Foundation, Evolution, and Bundle stay on the plain project tile.
 */

import { addressText } from "./addressText.ts";
import {
  resolvePackageSkin,
  resolvePackageSkinFromOrder,
  type ListingCardLook,
} from "./packageSkins.ts";

export { LISTING_CARD_LOOKS, type ListingCardLook } from "./packageSkins.ts";

export interface ListingCardAddress {
  street: string;
  locality: string;
}

export interface ListingCardAmenities {
  beds: string;
  baths: string;
  garage: string;
  pool: string;
}

export function listingCardLookFromValue(value: unknown): ListingCardLook | null {
  return resolvePackageSkin(value)?.look ?? null;
}

/** The listing package, or the service list when no package field is stored. */
export function resolveListingCardLook(data: Record<string, unknown>): ListingCardLook | null {
  return resolvePackageSkinFromOrder(data)?.look ?? null;
}

export function listingCardAddress(data: Record<string, unknown>): ListingCardAddress {
  const records = addressRecords(data);
  let street = "";
  let city = "";
  let state = "";
  let zip = "";
  for (const record of records) {
    if (!street) street = firstText(record, ["street", "line1", "addressLine1", "streetAddress"]);
    if (!city) city = firstText(record, ["city"]);
    if (!state) state = firstText(record, ["state"]);
    if (!zip) zip = firstText(record, ["zip", "postalCode"]);
  }
  let locality = joinLocality(city, state, zip);
  if (!street || !locality) {
    const parsed = parseAddressLine(addressString(data));
    if (!street) street = parsed.street;
    if (!locality) locality = parsed.locality;
  }
  return { street, locality };
}

export function listingCardAmenities(data: Record<string, unknown>): ListingCardAmenities {
  return {
    beds: countLabel(readRaw(data, ["bedrooms", "beds", "bedCount"])),
    baths: countLabel(readRaw(data, ["bathrooms", "baths", "bathCount"])),
    garage: countLabel(readRaw(data, ["garage", "garages", "garageSpaces", "garageCount"])),
    pool: poolLabel(readRaw(data, ["pool", "hasPool"])),
  };
}

/** Sample cards print the shoot day as MM.DD.YYYY. */
export function formatShootDateLabel(isoDay: string | null, raw?: unknown): string {
  if (isoDay && /^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
    const [year, month, day] = isoDay.split("-");
    return `${month}.${day}.${year}`;
  }
  if (typeof raw === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(raw.trim())) return raw.trim();
  return "";
}

function addressRecords(data: Record<string, unknown>): Record<string, unknown>[] {
  const records = [data];
  for (const key of ["address", "propertyAddress", "shootLocation"]) {
    const nested = asRecord(data[key]);
    if (nested) records.push(nested);
  }
  return records;
}

function addressString(data: Record<string, unknown>): string {
  for (const key of ["address", "propertyAddress", "shootLocation", "addressLabel"]) {
    const label = addressText(data[key]);
    if (label) return label;
  }
  return "";
}

function parseAddressLine(raw: string): ListingCardAddress {
  const trimmed = raw.trim();
  if (!trimmed) return { street: "", locality: "" };
  const piped = trimmed.split(/\s*\|\s*/);
  if (piped.length === 2 && piped[0] && piped[1]) return { street: piped[0], locality: piped[1] };
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean)
    .filter((part) => !/^(usa|u\.s\.a\.|united states)$/i.test(part));
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZip) {
      return {
        street: parts.slice(0, -2).join(", "),
        locality: `${parts[parts.length - 2]}, ${stateZip[1].toUpperCase()} ${stateZip[2]}`,
      };
    }
    if (/^\d{5}(?:-\d{4})?$/.test(last) && /^[A-Za-z]{2}$/.test(parts[parts.length - 2] || "")) {
      return {
        street: parts.slice(0, -3).join(", "),
        locality: `${parts[parts.length - 3]}, ${parts[parts.length - 2].toUpperCase()} ${last}`,
      };
    }
    if (/^[A-Za-z]{2}$/.test(last)) {
      return {
        street: parts.slice(0, -2).join(", "),
        locality: `${parts[parts.length - 2]}, ${last.toUpperCase()}`,
      };
    }
  }
  return { street: trimmed, locality: "" };
}

function joinLocality(city: string, state: string, zip: string): string {
  const region = [state.length === 2 ? state.toUpperCase() : state, zip].filter(Boolean).join(" ");
  return [city, region].filter(Boolean).join(", ");
}

function readRaw(data: Record<string, unknown>, keys: string[]): unknown {
  for (const record of factRecords(data)) {
    for (const key of keys) {
      const value = record[key];
      if (value == null || value === "") continue;
      return value;
    }
  }
  return undefined;
}

function factRecords(data: Record<string, unknown>): Record<string, unknown>[] {
  const records = [data];
  for (const key of ["property", "details", "facts", "propertyFacts", "homeFacts"]) {
    const nested = asRecord(data[key]);
    if (nested) records.push(nested);
  }
  const portal = asRecord(data.portalData);
  if (portal) {
    records.push(portal);
    const facts = asRecord(portal.facts);
    if (facts) records.push(facts);
  }
  return records;
}

function countLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const match = value.trim().match(/\d+(?:\.\d+)?/);
    return match ? match[0] : "";
  }
  return "";
}

function poolLabel(value: unknown): string {
  if (value === true) return "Y";
  if (value === false || value == null || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return "";
    return value === 1 ? "Y" : String(value);
  }
  const text = String(value).trim();
  if (/^(y|yes|true)$/i.test(text)) return "Y";
  if (/^(n|no|false|0)$/i.test(text)) return "";
  if (/^\d+(?:\.\d+)?$/.test(text)) return text === "1" || text === "1.0" ? "Y" : text;
  return "";
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
