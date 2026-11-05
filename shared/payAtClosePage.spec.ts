import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "./bookingCatalog.ts";
import { payAtCloseCustomerOffer, payAtCloseListedPrice, payAtClosePublicOffer } from "./payAtClose.ts";
import { mergePricingAdjustments } from "./pricingSettings.ts";
import { PAY_AT_CLOSE_PACKAGES_FOOTNOTE, TITUS_BROWSER_SDK_URL, TITUS_PAY_AT_CLOSE_BUSINESS_ID, titusPayAtCloseBusinessId } from "./titusEstimate.ts";
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

  it("names Titus, uses the SDK estimate, and does not publish rates", () => {
    const page = readFileSync(new URL("../client/pages/PayAtClose.tsx", import.meta.url), "utf8");
    const sdk = readFileSync(new URL("../client/lib/titusSdk.ts", import.meta.url), "utf8");
    expect(page).not.toMatch(/\$\s?\d/);
    expect(page).not.toMatch(/shore-tour/);
    expect(page).not.toMatch(/surcharge|\+6%|(?<!\d)6%|0%–8%|16%|6 months/i);
    expect(page).not.toMatch(/estimateTitusPayAtClose|payAtCloseListedPrice|credit score|Partner fee/i);
    expect(page).toContain("Titus");
    expect(page).toContain("PAY_AT_CLOSE_PACKAGES_FOOTNOTE");
    expect(page).toContain("openTitusEstimateModal");
    expect(page).toContain("titus-pill-");
    expect(PAY_AT_CLOSE_PACKAGES_FOOTNOTE).toBe("$0 due until closing with financing arranged by Titus.");
    expect(sdk).toContain("showEstimateModal");
    expect(sdk).toContain("businessId");
    expect(TITUS_BROWSER_SDK_URL).toBe("https://assets.gotitus.com/sdk/v1/titus.js");
    expect(titusPayAtCloseBusinessId("")).toBe(TITUS_PAY_AT_CLOSE_BUSINESS_ID);
    expect(titusPayAtCloseBusinessId("  custom-id  ")).toBe("custom-id");
    expect(TITUS_PAY_AT_CLOSE_BUSINESS_ID).toBe("550ccb3e-4384-4441-90f1-20456bce82e6");
  });

  it("lists packages at the catalog price and does not add the Pay at Close percent", () => {
    const offer = payAtClosePublicOffer(undefined, mergePricingAdjustments([]));
    const customer = payAtCloseCustomerOffer(offer);
    const showcase = packagesForStaffEditor([]).find((item) => item.id === "listing-showcase");
    const legacy = packagesForStaffEditor([]).find((item) => item.id === "listing-legacy");
    expect(showcase?.price).toBe(549);
    expect(legacy?.price).toBe(899);
    expect(offer.feeRate).toBe(6);
    expect(customer.feeRate).toBe(0);
    expect(customer.enabledByOffice).toBe(true);
    expect(payAtCloseListedPrice(showcase?.price || 0, customer)).toBe(549);
    expect(payAtCloseListedPrice(legacy?.price || 0, customer)).toBe(899);
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
