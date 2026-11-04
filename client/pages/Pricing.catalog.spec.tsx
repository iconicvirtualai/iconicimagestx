import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { packagesForStaffEditor } from "@shared/bookingCatalog";
import { mergePricingAdjustments } from "@shared/pricingSettings";
import Pricing from "./Pricing";

describe("public pricing page", () => {
  it("prints the seed prices before a saved edit", () => {
    const html = renderToString(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    );
    expect(html).toContain(">$<!-- -->249<");
    expect(html).toContain(">$<!-- -->549<");
    expect(html).toContain(">$<!-- -->1,599<");
    expect(html).toContain(">$<!-- -->4,500<");
    expect(html).toContain(">$<!-- -->75<");
    expect(html).toContain(">350-500+<");
  });

  it("shows a price saved on the catalog instead of the old number", () => {
    const catalog = packagesForStaffEditor([{
      id: "listing-showcase",
      name: "The Showcase",
      price: 4242,
      description: "A complete visual deep-dive.",
      isActive: true,
    }]);
    const html = renderToString(
      <MemoryRouter>
        <Pricing catalog={catalog} adjustments={mergePricingAdjustments([{ id: "business-iconic-partnership", amount: 4600 }])} />
      </MemoryRouter>,
    );
    expect(html).toContain(">$<!-- -->4,242<");
    expect(html).not.toContain(">$<!-- -->549<");
    expect(html).toContain(">$<!-- -->249<");
    expect(html).toContain(">$<!-- -->4,600<");
    expect(html).not.toContain(">$<!-- -->4,500<");
  });
});
