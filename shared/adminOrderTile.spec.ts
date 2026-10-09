import { describe, expect, it } from "vitest";
import { buildAdminOrderTile, sampleAdminOrderTiles } from "./adminOrderTile.ts";
import {
  clientSkinLabel,
  packageIdentity,
  packagePriceDisplay,
  resolvePackageSkin,
  resolvePackageSkinFromOrder,
} from "./packageSkins.ts";

describe("admin order tiles share packageSkins", () => {
  it("prints the sample listing and business orders from the shared catalog", () => {
    const [listing, business] = sampleAdminOrderTiles();
    const showcase = resolvePackageSkin("listing-showcase")!;
    const partner = resolvePackageSkin("branding-content-partner")!;

    expect(listing.packageName).toBe(showcase.title);
    expect(listing.skinLabel).toBe(clientSkinLabel(showcase));
    expect(listing.priceLabel).toBe(packagePriceDisplay(showcase));
    expect(listing.priceNote).toBe(showcase.priceNote);
    expect(listing).toMatchObject({
      typeLabel: "Listing",
      channel: "Listings & Spaces",
      paidLabel: "Paid",
      deliveryLabel: "In progress",
      clientName: "Alex Rivera",
      appointmentDate: "01.01.2026",
      location: "123 Main Street, Conroe, TX 77304",
      orderCode: "ORD - L - 10482",
      studio: null,
    });

    expect(business.packageName).toBe(partner.title);
    expect(business.skinLabel).toBe(clientSkinLabel(partner));
    expect(business.priceLabel).toBe(packagePriceDisplay(partner));
    expect(business.priceNote).toBe(partner.priceNote);
    expect(business).toMatchObject({
      typeLabel: "Business",
      channel: "Human Brand",
      paidLabel: "Paid",
      deliveryLabel: "Delivered",
      clientName: "Alex Rivera",
      appointmentDate: "01.15.2026",
      location: "N/A — brand session",
      orderCode: "ORD - B - 22017",
      studio: "studio-blanc",
    });
  });

  it("uses the same identity a client tile reads for that order", () => {
    const record = { serviceIds: ["business-authority-stack"], projectType: "social" };
    const skin = resolvePackageSkinFromOrder(record)!;
    const tile = buildAdminOrderTile(record);
    const identity = packageIdentity(skin);
    expect(tile.packageName).toBe(identity.title);
    expect(tile.skinLabel).toBe(identity.clientSkinLabel);
    expect(tile.priceLabel).toBe(identity.priceDisplay);
    expect(tile.priceNote).toBe(skin.priceNote);
    expect(tile.channel).toBe("Social");
    expect(tile.studio).toBe("offsite");
  });

  it("leaves foundation off the catalog and shows the stored package and price", () => {
    const record = { package: "The Foundation", total: 100, projectType: "business" };
    expect(resolvePackageSkinFromOrder(record)).toBeNull();
    expect(buildAdminOrderTile(record)).toMatchObject({
      packageName: "The Foundation",
      skinLabel: "Client skin: Custom",
      priceLabel: "$100",
    });
  });

  it("shows a Hollywood booking from its package label and price when it is not a client skin", () => {
    const tile = buildAdminOrderTile({
      id: "6y4F0RVWBQw5z5IJxbWe",
      selectedService: "Hollywood — $199",
      total: 199,
      clientName: "Sytoya Harvin",
      scheduledDate: "2026-10-12",
      scheduledTime: "Morning",
      photographerPreference: "Armando",
      services: [],
    });
    expect(tile.packageName).toBe("Hollywood");
    expect(tile.priceLabel).toBe("$199");
    expect(tile.appointmentDate).toContain("10.12.2026");
    expect(tile.appointmentDate).toContain("Morning");
    expect(tile.appointmentDate).toContain("Armando");
  });
});
