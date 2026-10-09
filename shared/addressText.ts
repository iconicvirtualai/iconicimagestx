/**
 * Display text for a booking, listing, order, or project address.
 * Legacy rows store a string. Google Places picks store
 * { formatted, lat, lng, placeId }. Older forms store street, city, state, and zip.
 * Empty and missing values stay empty so callers can choose their own placeholder.
 */

const RECORD_ADDRESS_KEYS = ["addressLabel", "address", "propertyAddress", "shootLocation", "location"] as const;

export function addressText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object" || Array.isArray(value)) return "";
  const address = value as Record<string, unknown>;
  const formatted = text(address.formatted) || text(address.label);
  if (formatted) return formatted;
  return [address.street, address.city, address.state, address.zip]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ");
}

/** First readable address on a stored booking, listing, order, or appointment. */
export function recordAddressText(record: unknown): string {
  if (!record || typeof record !== "object") return addressText(record);
  const row = record as Record<string, unknown>;
  for (const key of RECORD_ADDRESS_KEYS) {
    const label = addressText(row[key]);
    if (label) return label;
  }
  return "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
