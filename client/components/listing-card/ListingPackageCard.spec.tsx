import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ClientListingCard } from "@shared/clientHome";
import { PACKAGE_SKINS, isTopTierPackage } from "@shared/packageSkins";
import { ListingPackageCard } from "./ListingPackageCard";

function card(look: ClientListingCard["look"]): ClientListingCard {
  return {
    id: look || "plain",
    address: "123 Main Street, Conroe, TX 77304",
    status: "delivered",
    projectType: "real_estate",
    imageCount: 1,
    coverUrl: "https://files.example/cover.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
    appointmentDate: "2026-01-01",
    href: "/portal/listings/x",
    look,
    street: "123 Main Street",
    locality: "Conroe, TX 77304",
    shootDateLabel: "01.01.2026",
    beds: "3",
    baths: "2",
    garage: "3",
    pool: "Y",
  };
}

function htmlFor(look: ClientListingCard["look"]) {
  return renderToString(
    <MemoryRouter>
      <ListingPackageCard listing={card(look)} />
    </MemoryRouter>,
  );
}

const PINK = ["#F8C7B4", "#F3A3B8", "#D85C8C", "#EE6A84", "#F6B89A", "fuchsia", "magenta", "#ff00ff", "#ec4899"];

describe("client package tiles", () => {
  it("renders all sixteen skins from the shared catalog", () => {
    for (const skin of PACKAGE_SKINS) {
      const html = htmlFor(skin.look);
      expect(html).toContain(`data-look="${skin.look}"`);
      expect(html).toContain(skin.accent ? skin.title.replace(skin.accent, "").trim() : skin.title);
      if (skin.accent) expect(html).toContain(skin.accent);
      expect(html).toContain(skin.price);
      expect(html).toContain(skin.features.replace(/&/g, "&amp;"));
      expect(html).toContain("https://files.example/cover.jpg");
      expect(html).toContain("Inter, system-ui, sans-serif");
      expect(html).not.toContain("Cormorant");
      expect(html).not.toContain("font-serif");
      expect(html).not.toContain('data-part="pill"');
      for (const pink of PINK) expect(html.toLowerCase()).not.toContain(pink.toLowerCase());
      if (skin.category === "listing") {
        expect(html).toContain('data-part="address"');
        expect(html).toContain("123 Main Street");
        expect(html).toContain("Conroe, TX 77304");
      } else {
        expect(html).not.toContain('data-part="address"');
      }
      if (skin.tier === "top") expect(isTopTierPackage(skin.look)).toBe(true);
      if (!isTopTierPackage(skin.look)) expect(html.toLowerCase()).not.toContain("#e8d5a3");
    }
  });

  it("pins the local legend blend and the listing shoot date", () => {
    const legend = htmlFor("local-legend");
    expect(legend).toContain("The Local");
    expect(legend).toContain("Legend");
    expect(legend).toContain("$2,499");
    expect(legend).toContain("per campaign");
    expect(legend).toContain("Campaign");
    expect(legend).toContain("Market Takeover");

    const showcase = htmlFor("showcase");
    expect(showcase).toContain("Shoot Date: 01.01.2026");
    expect(showcase).toContain("$549");
    expect(showcase).toContain('aria-label="3 Beds"');
    expect(showcase).not.toContain("123 MAIN STREET");
  });
});
