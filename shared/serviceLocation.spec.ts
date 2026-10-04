import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  orderAddressFromBooking,
  serviceLocationAfterPick,
  serviceLocationAfterType,
  storedRecordPin,
  storedServiceLocationFields,
} from "./serviceLocation";

const bookingForm = readFileSync(new URL("../client/components/BookingForm.tsx", import.meta.url), "utf8");
const locationField = readFileSync(new URL("../client/components/ServiceLocationField.tsx", import.meta.url), "utf8");
const placesClient = readFileSync(new URL("../client/lib/placesAddress.ts", import.meta.url), "utf8");
const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
const portal = readFileSync(new URL("./portalListingDetail.ts", import.meta.url), "utf8");

const picked = {
  placeId: "ChIJpicked",
  formatted: "100 Main St, Austin, TX 78701, USA",
  lat: 30.2672,
  lng: -97.7431,
};

describe("service location pin", () => {
  it("keeps coordinates only when a suggestion was picked", () => {
    expect(storedServiceLocationFields("100 Main St, Austin, TX 78701, USA")).toEqual({
      address: "100 Main St, Austin, TX 78701, USA",
    });
    expect(storedServiceLocationFields({
      formatted: "100 Main St, Austin, TX 78701, USA",
      lat: 30.2672,
      lng: -97.7431,
    })).toEqual({
      address: "100 Main St, Austin, TX 78701, USA",
    });
    expect(storedServiceLocationFields(picked)).toEqual({
      address: picked,
      lat: 30.2672,
      lng: -97.7431,
      latitude: 30.2672,
      longitude: -97.7431,
      placeId: "ChIJpicked",
    });
    expect(storedRecordPin({ address: "100 Main St, Austin, TX 78701, USA" })).toBeNull();
    expect(storedRecordPin({ address: picked })).toEqual({ lat: 30.2672, lng: -97.7431 });
    expect(storedRecordPin({
      address: "100 Main St, Austin, TX 78701, USA",
      lat: 30.2672,
      lng: -97.7431,
    })).toEqual({ lat: 30.2672, lng: -97.7431 });
  });

  it("drops the pin when the typed text changes and restores it only from a place", () => {
    const selected = serviceLocationAfterPick(picked, "100 Main");
    expect(selected).toEqual({ query: picked.formatted, picked });
    expect(serviceLocationAfterType(selected, "100 Main St, Austin")).toEqual({
      query: "100 Main St, Austin",
      picked: null,
    });
    expect(serviceLocationAfterPick(null, "100 Main St")).toEqual({
      query: "100 Main St",
      picked: null,
    });
    expect(orderAddressFromBooking({
      address: "100 Main St, Austin",
      servicePlace: null,
    })).toBe("100 Main St, Austin");
    expect(orderAddressFromBooking({
      address: "something else",
      servicePlace: picked,
    })).toEqual(picked);
  });

  it("uses Places API (New) in the browser and does not geocode a typed string later", () => {
    expect(placesClient).toContain("https://places.googleapis.com/v1/places:autocomplete");
    expect(placesClient).toContain("import.meta.env");
    expect(placesClient).toContain("VITE_GOOGLE_PLACES_API_KEY");
    expect(placesClient).not.toContain("nominatim");
    expect(bookingForm).toContain("ServiceLocationField");
    expect(bookingForm).toContain('htmlFor="service-location"');
    expect(locationField).toContain('id="service-location"');
    expect(bookingForm).not.toContain("/api/places/autocomplete");
    expect(bookings).toContain("storedServiceLocationFields");
    expect(bookings).not.toContain("geocode(");
    expect(portal).not.toContain("geocode(");
    expect(portal).not.toContain("nominatim");
    expect(portal).not.toContain("places.googleapis.com");
    expect(portal).toContain("mapEmbedUrl");
  });
});
