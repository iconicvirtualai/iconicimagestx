import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "./bookingCatalog.ts";
import { payAtCloseListedPrice, payAtClosePublicOffer } from "./payAtClose.ts";
import { mergePricingAdjustments } from "./pricingSettings.ts";
import { estimateTitusPayAtClose } from "./titusPayAtCloseSchedule.ts";
import {
  PAY_AT_CLOSE_ESTATES,
  bookPayAtCloseHref,
  payAtCloseEstateGallery,
  payAtCloseFeatureRow,
  pricedSlot,
} from "./payAtClosePage.ts";

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
    expect(page).not.toMatch(/shore-tour/);
    expect(page).not.toMatch(/gotitus|Get your Partner estimate/i);
    expect(page).not.toMatch(/surcharge|\+6%|(?<!\d)6%/i);
  });

  it("lists Showcase at the Pay at Close price and adds the Partner fee after that", () => {
    const offer = payAtClosePublicOffer(undefined, mergePricingAdjustments([]));
    const showcase = packagesForStaffEditor([]).find((item) => item.id === "listing-showcase");
    const legacy = packagesForStaffEditor([]).find((item) => item.id === "listing-legacy");
    expect(showcase?.price).toBe(549);
    expect(legacy?.price).toBe(899);
    expect(payAtCloseListedPrice(showcase?.price || 0, offer)).toBe(582);
    expect(payAtCloseListedPrice(legacy?.price || 0, offer)).toBe(953);
    const estimate = estimateTitusPayAtClose({
      role: "agent",
      tier: "prime",
      property: "single-family",
      media: payAtCloseListedPrice(showcase?.price || 0, offer) + payAtCloseListedPrice(legacy?.price || 0, offer),
    });
    expect(estimate.media).toBe(1535);
    expect(Math.round(estimate.fee || 0)).toBe(61);
    expect(Math.round(estimate.payoff || 0)).toBe(1596);
  });

  it("lists estates as data and skips an empty feature", () => {
    const joined = JSON.stringify(PAY_AT_CLOSE_ESTATES);
    expect(joined).not.toMatch(/shore-tour/);
    expect(joined).toContain("/shore/01-aerial-lake.jpg");
    const media = new URL("../public/media/pay-at-close/luxury/shore/", import.meta.url);
    expect(existsSync(new URL("01-aerial-lake.jpg", media))).toBe(true);
    expect(existsSync(new URL("02-aerial-front.jpg", media))).toBe(true);
    expect(existsSync(new URL("shore-tour-30s.mp4", media))).toBe(false);
    const features = payAtCloseFeatureRow(PAY_AT_CLOSE_ESTATES);
    expect(features.map((item) => item.kind)).toEqual(["still", "reel"]);
    expect(features[0]?.kind === "still" && features[0].still.src).toContain("pool-rd/02-backyard-pool.jpg");
    expect(features[1]?.kind === "reel" && features[1].reel.startAt).toBeGreaterThan(0);
    const gallery = payAtCloseEstateGallery(PAY_AT_CLOSE_ESTATES);
    expect(gallery.length).toBe(4);
    const withNext = payAtCloseEstateGallery([
      ...PAY_AT_CLOSE_ESTATES,
      { id: "next-estate", gallery: [{ src: "/media/pay-at-close/luxury/next/front.jpg", alt: "Daytime estate", caption: "Next estate" }] },
    ]);
    expect(withNext.at(-1)?.caption).toBe("Next estate");
    expect(payAtCloseFeatureRow([{ id: "bare", gallery: [] }])).toEqual([]);
    expect(payAtCloseEstateGallery([{ id: "bare", gallery: [] }])).toEqual([]);
    expect(payAtCloseFeatureRow([{
      id: "dark-open",
      gallery: [],
      reel: { src: "/reel.mp4", poster: "/poster.jpg", alt: "Reel", startAt: 0, caption: "Reel" },
    }])).toEqual([]);
  });
});
