/**
 * @vitest-environment happy-dom
 */
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ListingSiteView } from "./ListingSite";
import { LISTING_SITE_DESIGNS, LISTING_SITE_TEMPLATES, type PublicListingSite } from "@shared/listingSite";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function site(design: PublicListingSite["design"]): PublicListingSite {
  return {
    slug: "123-main-st-spring",
    design,
    font: "sans",
    color: "ink",
    style: "classic",
    address: "123 Main St, Spring, TX",
    street: "123 Main St",
    city: "Spring",
    price: "$485,000",
    facts: [{ label: "Beds", value: "4" }],
    photos: [{ name: "Kitchen", url: "/api/media/display/listing1234/0" }],
    filmPosterUrl: "/api/media/display/listing1234/1",
    tourEmbedUrl: "",
    floorplan: null,
    agent: { name: "Ada Agent", brokerage: "Harbor Realty", license: "000000", phone: "", email: "agent@example.com" },
  };
}

function render(design: PublicListingSite["design"]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ListingSiteView site={site(design)} />);
  });
  return host;
}

describe("listing site designs", () => {
  it("renders each design with a direct Iconic credit and no download", () => {
    expect(LISTING_SITE_DESIGNS).toHaveLength(10);
    for (const design of LISTING_SITE_DESIGNS) {
      const host = render(design);
      const html = host.innerHTML;
      const template = LISTING_SITE_TEMPLATES.find((item) => item.id === design);
      expect(host.querySelector("[data-listing-design]")?.getAttribute("data-listing-design")).toBe(design);
      expect(template?.marker).toBeTruthy();
      expect(html).toContain(template?.marker || "");
      expect(html).toContain("https://iconicimagestx.com");
      expect(html).toContain("Powered by Iconic Images");
      expect(html).toContain("/api/media/display/listing1234/0");
      expect(html).not.toContain("download");
      expect(html).not.toMatch(/\.zip|\.pdf/i);
      expect(html).toContain("123 Main St");
      expect(html).not.toContain("18 Lantern Oak");
      act(() => root?.unmount());
      root = null;
      document.body.innerHTML = "";
    }
  });
});
