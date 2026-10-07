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

  it("leaves foundation off the catalog instead of inventing a price", () => {
    const record = { package: "The Foundation", total: 100, projectType: "business" };
    expect(resolvePackageSkinFromOrder(record)).toBeNull();
    expect(buildAdminOrderTile(record)).toMatchObject({
      packageName: "Custom order",
      skinLabel: "Client skin: Custom",
      priceLabel: "—",
    });
  });
});
