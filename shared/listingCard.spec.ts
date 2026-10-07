import { describe, expect, it } from "vitest";
import {
  formatShootDateLabel,
  listingCardAddress,
  listingCardAmenities,
  listingCardLookFromValue,
  resolveListingCardLook,
} from "./listingCard.ts";

describe("listing card package looks", () => {
  it("maps photo-count packages to just photos and apprenticeship on its own", () => {
    expect(listingCardLookFromValue("Photos Only")).toBe("just-photos");
    expect(listingCardLookFromValue("Just Photos")).toBe("just-photos");
    expect(listingCardLookFromValue("photos-35")).toBe("just-photos");
    expect(listingCardLookFromValue("35 Photos")).toBe("just-photos");
    expect(listingCardLookFromValue("The Apprenticeship Program — 25 Photos")).toBe("apprenticeship");
    expect(listingCardLookFromValue("apprentice-50")).toBe("apprenticeship");
  });

  it("maps each of the sixteen package names and ids", () => {
    expect(listingCardLookFromValue("The Essentials")).toBe("essentials");
    expect(listingCardLookFromValue("listing-essentials")).toBe("essentials");
    expect(listingCardLookFromValue("THE SHOWCASE")).toBe("showcase");
    expect(listingCardLookFromValue("listing-showcase")).toBe("showcase");
    expect(listingCardLookFromValue("The Legacy")).toBe("legacy");
    expect(listingCardLookFromValue("listing-legacy")).toBe("legacy");
    expect(listingCardLookFromValue("The Market Leader")).toBe("market-leader");
    expect(listingCardLookFromValue("listing-market-leader")).toBe("market-leader");
    expect(listingCardLookFromValue("The Refresh")).toBe("refresh");
    expect(listingCardLookFromValue("branding-refresh")).toBe("refresh");
    expect(listingCardLookFromValue("The Content Partner")).toBe("content-partner");
    expect(listingCardLookFromValue("branding-content-partner")).toBe("content-partner");
    expect(listingCardLookFromValue("The Local Legend")).toBe("local-legend");
    expect(listingCardLookFromValue("branding-local-legend")).toBe("local-legend");
    expect(listingCardLookFromValue("The Baseline")).toBe("baseline");
    expect(listingCardLookFromValue("business-baseline")).toBe("baseline");
    expect(listingCardLookFromValue("The Growth Engine")).toBe("growth-engine");
    expect(listingCardLookFromValue("business-growth-engine")).toBe("growth-engine");
    expect(listingCardLookFromValue("The Professional Suite")).toBe("professional-suite");
    expect(listingCardLookFromValue("business-professional-suite")).toBe("professional-suite");
    expect(listingCardLookFromValue("The Signature Tier")).toBe("signature-tier");
    expect(listingCardLookFromValue("business-signature-tier")).toBe("signature-tier");
    expect(listingCardLookFromValue("The Iconic Partnership")).toBe("iconic-partnership");
    expect(listingCardLookFromValue("business-iconic-partnership")).toBe("iconic-partnership");
    expect(listingCardLookFromValue("The Connected Core")).toBe("connected-core");
    expect(listingCardLookFromValue("business-connected-core")).toBe("connected-core");
    expect(listingCardLookFromValue("The Authority Stack")).toBe("authority-stack");
    expect(listingCardLookFromValue("business-authority-stack")).toBe("authority-stack");
  });

  it("does not invent a look for add-ons or strategic packages", () => {
    expect(listingCardLookFromValue("Aerial Drone Stills")).toBeNull();
    expect(listingCardLookFromValue("The Foundation")).toBeNull();
    expect(listingCardLookFromValue("growth-foundation")).toBeNull();
    expect(listingCardLookFromValue("The Evolution")).toBeNull();
    expect(listingCardLookFromValue("growth-evolution")).toBeNull();
    expect(listingCardLookFromValue("The Bundle")).toBeNull();
    expect(listingCardLookFromValue("growth-bundle")).toBeNull();
    expect(listingCardLookFromValue("")).toBeNull();
  });

  it("uses the package field before the service list", () => {
    expect(resolveListingCardLook({
      package: "Photos Only",
      services: ["The Showcase"],
    })).toBe("just-photos");
    expect(resolveListingCardLook({
      selectedService: { id: "listing-legacy", name: "The Legacy" },
      services: ["20 Photos"],
    })).toBe("legacy");
  });

  it("picks the listing tier out of a service list and leaves an unknown package alone", () => {
    expect(resolveListingCardLook({
      serviceIds: ["aerial-drone", "listing-showcase"],
      services: ["Aerial Drone Stills", "The Showcase"],
    })).toBe("showcase");
    expect(resolveListingCardLook({
      services: ["20 Photos", "Basic Reel"],
    })).toBe("just-photos");
    expect(resolveListingCardLook({ package: "Custom order", services: ["The Showcase"] })).toBeNull();
    expect(resolveListingCardLook({})).toBeNull();
  });
});

describe("listing card address, date, and counts", () => {
  it("splits a stored street from the city line", () => {
    expect(listingCardAddress({ address: "123 Main Street, Conroe, TX 77304" })).toEqual({
      street: "123 Main Street",
      locality: "Conroe, TX 77304",
    });
    expect(listingCardAddress({
      address: { street: "123 Main Street", city: "Conroe", state: "TX", zip: "77304" },
    })).toEqual({
      street: "123 Main Street",
      locality: "Conroe, TX 77304",
    });
    expect(listingCardAddress({ addressLabel: "10 Oak St | Houston, TX" })).toEqual({
      street: "10 Oak St",
      locality: "Houston, TX",
    });
  });

  it("prints the shoot day with dots", () => {
    expect(formatShootDateLabel("2026-01-01")).toBe("01.01.2026");
    expect(formatShootDateLabel(null, "01.01.2026")).toBe("01.01.2026");
    expect(formatShootDateLabel(null)).toBe("");
  });

  it("reads bed, bath, garage counts and a pool yes", () => {
    expect(listingCardAmenities({
      bedrooms: 3,
      bathrooms: "2",
      garageSpaces: 3,
      pool: true,
    })).toEqual({ beds: "3", baths: "2", garage: "3", pool: "Y" });
    expect(listingCardAmenities({ portalData: { facts: { beds: "4", baths: "3" } } })).toEqual({
      beds: "4",
      baths: "3",
      garage: "",
      pool: "",
    });
  });
});
