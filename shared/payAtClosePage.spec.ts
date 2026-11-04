import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "./bookingCatalog.ts";
import { bookPayAtCloseHref, pricedSlot } from "./payAtClosePage.ts";

describe("Pay at Close page prices", () => {
  it("reads the catalog and follows a saved edit", () => {
    const seed = packagesForStaffEditor([]);
    const showcase = seed.find((item) => item.id === "listing-showcase");
    expect(showcase).toBeTruthy();
    expect(pricedSlot(seed, "listing-showcase", { blurb: "", features: [] }).price).toBe(showcase?.price);
    const edited = packagesForStaffEditor([{
      id: "listing-showcase",
      name: "The Showcase",
      price: (showcase?.price || 0) + 80,
      isActive: true,
    }]);
    expect(pricedSlot(edited, "listing-showcase", { blurb: "", features: [] }).price).toBe((showcase?.price || 0) + 80);
  });

  it("links an order to booking with Pay at Close and the package id", () => {
    expect(bookPayAtCloseHref("listing-legacy")).toBe("/book?payment=pay-at-close&package=listing-legacy");
    expect(bookPayAtCloseHref()).toBe("/book?payment=pay-at-close");
  });

  it("does not hard-code dollar amounts in the page", () => {
    const page = readFileSync(new URL("../client/pages/PayAtClose.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/\$\s?\d/);
  });
});
