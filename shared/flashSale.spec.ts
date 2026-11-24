import { describe, expect, it } from "vitest";
import { matchingRedirect, redirectLocation } from "./spaRouting";
import {
  SALE_ENDS_MS,
  FLASH_SALE_BAR_FULL,
  FLASH_SALE_BAR_HREF,
  FLASH_SALE_BAR_SHORT,
  flashSaleCheckoutPath,
  flashSaleOpen,
  formatFlashCents,
  quoteFlashSale,
} from "./flashSale";

describe("flash sale", () => {
  it("ends Friday Nov 27, 2026 at 11:59pm Central", () => {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h11",
    }).format(new Date(SALE_ENDS_MS));
    expect(formatted).toContain("Friday");
    expect(formatted).toContain("Nov 27, 2026");
    expect(formatted).toContain("11:59");
    expect(flashSaleOpen(SALE_ENDS_MS)).toBe(true);
    expect(flashSaleOpen(SALE_ENDS_MS + 1)).toBe(false);
    const rule = matchingRedirect("/flash-sale");
    expect(rule?.destination).toBe("/black-friday");
    expect(redirectLocation(rule!, "/flash-sale", "/flash-sale?bundle=10")).toBe("/black-friday?bundle=10");
  });

  it("adds the same 2.8% processing line other checkouts charge", () => {
    const five = quoteFlashSale(5);
    const ten = quoteFlashSale(10);
    expect(five).toMatchObject({ subtotalCents: 125000, processingCents: 3500, totalCents: 128500 });
    expect(ten).toMatchObject({ subtotalCents: 225000, processingCents: 6300, totalCents: 231300 });
    expect(five?.processingLabel).toBe("Processing (2.8%)");
    expect(formatFlashCents(five!.totalCents)).toBe("$1,285.00");
    expect(formatFlashCents(ten!.totalCents)).toBe("$2,313.00");
    expect(flashSaleCheckoutPath(5)).toBe("/black-friday?bundle=5");
    expect(FLASH_SALE_BAR_HREF).toBe("/black-friday");
    expect(FLASH_SALE_BAR_FULL).toContain("BLACK FRIDAY SALE");
    expect(FLASH_SALE_BAR_SHORT).toContain("BLACK FRIDAY");
    expect(FLASH_SALE_BAR_SHORT.length).toBeLessThan(FLASH_SALE_BAR_FULL.length);
    expect(flashSaleCheckoutPath(10)).toBe("/black-friday?bundle=10");
    expect(quoteFlashSale(7)).toBeNull();
  });
});
