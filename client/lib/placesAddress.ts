/**
 * Places API (New) autocomplete for the booking form.
 * The key is the existing referrer-locked browser key in Vercel.
 * Read it only from import.meta.env.VITE_GOOGLE_PLACES_API_KEY.
 * Never log the key or put it in a URL.
 */

import type { PickedServiceLocation } from "@shared/serviceLocation";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACE_URL = "https://places.googleapis.com/v1/places/";
const AUTOCOMPLETE_FIELDS = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text",
  "suggestions.placePrediction.structuredFormat",
].join(",");
const PLACE_FIELDS = "id,formattedAddress,location";

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceSuggestionResult {
  suggestions: PlaceSuggestion[];
  unavailable: boolean;
  cancelled?: boolean;
}

type PlacesEnv = { VITE_GOOGLE_PLACES_API_KEY?: string };

type PlacesRequest = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export function googlePlacesApiKey(env: PlacesEnv = import.meta.env): string {
  const value = env?.VITE_GOOGLE_PLACES_API_KEY;
  return typeof value === "string" ? value.trim() : "";
}

export function newPlacesSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `places-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function fetchPlaceSuggestions(
  input: string,
  sessionToken: string,
  options: PlacesRequest = {},
): Promise<PlaceSuggestionResult> {
  const query = input.trim();
  const apiKey = options.apiKey ?? googlePlacesApiKey();
  if (query.length < 3 || !apiKey) {
    return { suggestions: [], unavailable: query.length >= 3 && !apiKey };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(AUTOCOMPLETE_URL, {
      method: "POST",
      referrerPolicy: "origin",
      credentials: "omit",
      signal: options.signal,
      headers: placesHeaders(apiKey, AUTOCOMPLETE_FIELDS),
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["us"],
        languageCode: "en",
        regionCode: "us",
        sessionToken,
      }),
    });
    if (!response.ok) return { suggestions: [], unavailable: true };
    const body = await response.json();
    return { suggestions: parseSuggestions(body), unavailable: false };
  } catch (err) {
    if (isAbortError(err)) return { suggestions: [], unavailable: false, cancelled: true };
    return { suggestions: [], unavailable: true };
  }
}

/** Place Details for one suggestion. Missing coordinates are not a pin. */
export async function fetchPickedPlace(
  placeId: string,
  sessionToken: string,
  options: PlacesRequest = {},
): Promise<PickedServiceLocation | null> {
  const id = placeId.trim();
  const apiKey = options.apiKey ?? googlePlacesApiKey();
  if (!id || !apiKey) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`${PLACE_URL}${encodeURIComponent(id)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      referrerPolicy: "origin",
      credentials: "omit",
      signal: options.signal,
      headers: placesHeaders(apiKey, PLACE_FIELDS),
    });
    if (!response.ok) return null;
    return parsePickedPlace(id, await response.json());
  } catch {
    return null;
  }
}

function placesHeaders(apiKey: string, fieldMask: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": fieldMask,
  };
}

function parseSuggestions(body: unknown): PlaceSuggestion[] {
  const suggestions = body && typeof body === "object" ? (body as { suggestions?: unknown }).suggestions : null;
  if (!Array.isArray(suggestions)) return [];
  const parsed: PlaceSuggestion[] = [];
  for (const item of suggestions) {
    const prediction = item && typeof item === "object"
      ? (item as { placePrediction?: unknown }).placePrediction
      : null;
    if (!prediction || typeof prediction !== "object") continue;
    const row = prediction as {
      placeId?: unknown;
      text?: { text?: unknown };
      structuredFormat?: { mainText?: { text?: unknown }; secondaryText?: { text?: unknown } };
    };
    const placeId = typeof row.placeId === "string" ? row.placeId.trim() : "";
    const description = textOf(row.text?.text);
    const mainText = textOf(row.structuredFormat?.mainText?.text) || description;
    const secondaryText = textOf(row.structuredFormat?.secondaryText?.text);
    if (!placeId || !mainText) continue;
    parsed.push({
      placeId,
      description: description || mainText,
      mainText,
      secondaryText,
    });
  }
  return parsed;
}

function parsePickedPlace(requestedId: string, body: unknown): PickedServiceLocation | null {
  if (!body || typeof body !== "object") return null;
  const row = body as {
    id?: unknown;
    formattedAddress?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
  };
  const formatted = textOf(row.formattedAddress);
  const lat = coord(row.location?.latitude, "lat");
  const lng = coord(row.location?.longitude, "lng");
  const placeId = textOf(row.id) || requestedId;
  if (!formatted || lat == null || lng == null || !placeId) return null;
  return { placeId, formatted, lat, lng };
}

function isAbortError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { name?: string }).name === "AbortError");
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function coord(value: unknown, axis: "lat" | "lng"): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  if (axis === "lat" && (number < -90 || number > 90)) return null;
  if (axis === "lng" && (number < -180 || number > 180)) return null;
  return number;
}
