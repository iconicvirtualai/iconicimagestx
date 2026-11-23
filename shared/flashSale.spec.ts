import { describe, expect, it } from "vitest";
import {
  FLASH_SALE_ENDS_MS,
  flashSaleCheckoutPath,
  flashSaleOpen,
  formatFlashCents,
  quoteFlashSale,
} from "./flashSale";

describe("flash sale", () => {
  it("ends Wednesday Nov 25, 2026 at 11:59pm Central", () => {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h11",
    }).format(new Date(FLASH_SALE_ENDS_MS));
    expect(formatted).toContain("Nov 25, 2026");
    expect(formatted).toContain("11:59");
    expect(flashSaleOpen(FLASH_SALE_ENDS_MS)).toBe(true);
    expect(flashSaleOpen(FLASH_SALE_ENDS_MS + 1)).toBe(false);
  });

  it("adds the same 2.8% processing line other checkouts charge", () => {
    const five = quoteFlashSale(5);
    const ten = quoteFlashSale(10);
    expect(five).toMatchObject({ subtotalCents: 125000, processingCents: 3500, totalCents: 128500 });
    expect(ten).toMatchObject({ subtotalCents: 225000, processingCents: 6300, totalCents: 231300 });
    expect(five?.processingLabel).toBe("Processing (2.8%)");
    expect(formatFlashCents(five!.totalCents)).toBe("$1,285.00");
    expect(formatFlashCents(ten!.totalCents)).toBe("$2,313.00");
    expect(flashSaleCheckoutPath(5)).toBe("/flash-sale?bundle=5");
    expect(flashSaleCheckoutPath(10)).toBe("/flash-sale?bundle=10");
    expect(quoteFlashSale(7)).toBeNull();
  });
});
