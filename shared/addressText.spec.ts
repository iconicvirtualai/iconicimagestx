import { describe, expect, it } from "vitest";
import { addressText, recordAddressText } from "./addressText.ts";

const places = {
  formatted: "100 Congress Ave, Austin, TX 78701",
  lat: 30.2648,
  lng: -97.7431,
  placeId: "place_congress",
};

describe("addressText", () => {
  it("returns a legacy string address", () => {
    expect(addressText("  456 QA Lane  ")).toBe("456 QA Lane");
  });

  it("reads a Google Places address object", () => {
    expect(addressText(places)).toBe("100 Congress Ave, Austin, TX 78701");
    expect(addressText(places)).not.toContain("place_congress");
  });

  it("reads an older street, city, state, and zip object", () => {
    expect(addressText({ street: "10 Oak", city: "Austin", state: "TX", zip: "78701" })).toBe("10 Oak, Austin, TX, 78701");
  });

  it("returns empty when the address is missing", () => {
    expect(addressText(undefined)).toBe("");
    expect(addressText(null)).toBe("");
    expect(addressText("")).toBe("");
    expect(addressText("   ")).toBe("");
    expect(addressText({})).toBe("");
  });

  it("picks the first readable field on a booking or listing", () => {
    expect(recordAddressText({ address: places, shootLocation: "Studio" })).toBe("100 Congress Ave, Austin, TX 78701");
    expect(recordAddressText({ addressLabel: "456 QA Lane", address: places })).toBe("456 QA Lane");
    expect(recordAddressText(null)).toBe("");
    expect(recordAddressText({})).toBe("");
  });
});
