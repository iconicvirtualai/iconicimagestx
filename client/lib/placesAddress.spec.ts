import { describe, expect, it, vi } from "vitest";
import { fetchPickedPlace, fetchPlaceSuggestions, googlePlacesApiKey } from "./placesAddress";

const KEY = "test-places-key";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Places API (New) address lookup", () => {
  it("reads the browser key from the Vite env and ignores blanks", () => {
    expect(googlePlacesApiKey({ VITE_GOOGLE_PLACES_API_KEY: "  abc  " })).toBe("abc");
    expect(googlePlacesApiKey({})).toBe("");
    expect(googlePlacesApiKey({ VITE_GOOGLE_PLACES_API_KEY: "   " })).toBe("");
  });

  it("asks Places autocomplete as the person types and keeps the key out of the URL", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
      expect(url).not.toContain(KEY);
      expect(init.method).toBe("POST");
      const headers = new Headers(init.headers);
      expect(headers.get("X-Goog-Api-Key")).toBe(KEY);
      expect(headers.get("X-Goog-FieldMask")).toContain("suggestions.placePrediction.placeId");
      expect(JSON.parse(String(init.body))).toMatchObject({
        input: "100 Main",
        includedRegionCodes: ["us"],
        sessionToken: "session-1",
      });
      return jsonResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJpicked",
              text: { text: "100 Main St, Austin, TX, USA" },
              structuredFormat: {
                mainText: { text: "100 Main St" },
                secondaryText: { text: "Austin, TX, USA" },
              },
            },
          },
          { queryPrediction: { text: { text: "100 Main Street" } } },
        ],
      });
    });

    const result = await fetchPlaceSuggestions("100 Main", "session-1", {
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.unavailable).toBe(false);
    expect(result.suggestions).toEqual([{
      placeId: "ChIJpicked",
      description: "100 Main St, Austin, TX, USA",
      mainText: "100 Main St",
      secondaryText: "Austin, TX, USA",
    }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not call Google when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchPlaceSuggestions("100 Main", "session-1", {
      apiKey: "",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ suggestions: [], unavailable: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("saves formatted address and coordinates from the picked place", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://places.googleapis.com/v1/places/ChIJpicked?sessionToken=session-1");
      expect(url).not.toContain(KEY);
      expect(new Headers(init.headers).get("X-Goog-Api-Key")).toBe(KEY);
      expect(new Headers(init.headers).get("X-Goog-FieldMask")).toBe("id,formattedAddress,location");
      return jsonResponse({
        id: "ChIJpicked",
        formattedAddress: "100 Main St, Austin, TX 78701, USA",
        location: { latitude: 30.2672, longitude: -97.7431 },
      });
    });
    const place = await fetchPickedPlace("ChIJpicked", "session-1", {
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(place).toEqual({
      placeId: "ChIJpicked",
      formatted: "100 Main St, Austin, TX 78701, USA",
      lat: 30.2672,
      lng: -97.7431,
    });
  });

  it("does not invent a pin when place details have no coordinates", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      id: "ChIJpicked",
      formattedAddress: "100 Main St, Austin, TX 78701, USA",
    }));
    const place = await fetchPickedPlace("ChIJpicked", "session-1", {
      apiKey: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(place).toBeNull();
  });
});
