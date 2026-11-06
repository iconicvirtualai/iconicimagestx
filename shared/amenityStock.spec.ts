import { describe, expect, it } from "vitest";
import {
  amenityMediaRequestAllowed,
  amenityStockIntro,
  amenityStockReturnPath,
  isSquareCheckoutUrl,
} from "./amenityStock";

describe("amenity stock public gate", () => {
  it("allows only the published cover still", () => {
    expect(amenityMediaRequestAllowed("/media/amenities/artavia/A7303322.jpg")).toBe(true);
    expect(amenityMediaRequestAllowed("/media/amenities/artavia/A7303322.webp")).toBe(true);
    expect(amenityMediaRequestAllowed("/media/amenities/woodforest/DJI_0088.jpg?v=1")).toBe(true);
    expect(amenityMediaRequestAllowed("/media/photos/drone-hero.jpg")).toBe(true);
    expect(amenityMediaRequestAllowed("/api/ping")).toBe(true);
  });

  it("blocks the rest of the set, directories, and traversal", () => {
    expect(amenityMediaRequestAllowed("/media/amenities/artavia/A7303323.jpg")).toBe(false);
    expect(amenityMediaRequestAllowed("/media/amenities/artavia/A7303323.webp")).toBe(false);
    expect(amenityMediaRequestAllowed("/media/amenities/artavia/")).toBe(false);
    expect(amenityMediaRequestAllowed("/media/amenities")).toBe(false);
    expect(amenityMediaRequestAllowed("/media/amenities/artavia/A7303322.jpg/../../photos/drone-hero.jpg")).toBe(false);
    expect(amenityMediaRequestAllowed("/media/amenities/%2e%2e/photos/drone-hero.jpg")).toBe(false);
  });

  it("returns buyers to this library without a download", () => {
    expect(amenityStockReturnPath("east-shore", "STK-ABC")).toBe("/stock-footage?paid=1&set=east-shore&order=STK-ABC");
    expect(amenityStockReturnPath("east-shore", "STK-ABC")).not.toMatch(/download|zip|gallery/i);
  });

  it("accepts Square checkout hosts only", () => {
    expect(isSquareCheckoutUrl("https://square.link/u/amenity")).toBe(true);
    expect(isSquareCheckoutUrl("https://sandbox.square.link/u/amenity")).toBe(true);
    expect(isSquareCheckoutUrl("https://checkout.square.site/pay")).toBe(true);
    expect(isSquareCheckoutUrl("http://square.link/u/amenity")).toBe(false);
    expect(isSquareCheckoutUrl("https://evil.example/square.link")).toBe(false);
    expect(isSquareCheckoutUrl("https://iconicimagestx.vercel.app/stock-footage")).toBe(false);
  });

  it("replaces copy that advertises an instant download", () => {
    expect(amenityStockIntro("License instantly and download the set.")).not.toMatch(/license instantly|download/i);
    expect(amenityStockIntro("Neighborhood amenity photos from Iconic Images.")).toBe(
      "Neighborhood amenity photos from Iconic Images.",
    );
  });
});
