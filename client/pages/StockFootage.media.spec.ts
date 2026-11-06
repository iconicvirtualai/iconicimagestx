import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AMENITY_STOCK_CARDS } from "../../shared/amenityStock";
import { AMENITY_STOCK_FILES } from "../../server/data/amenityStockCatalog";

const page = readFileSync(path.join(process.cwd(), "client/pages/StockFootage.tsx"), "utf8");
const publicModule = readFileSync(path.join(process.cwd(), "shared/amenityStock.ts"), "utf8");
const route = readFileSync(path.join(process.cwd(), "server/routes/stockFootage.ts"), "utf8");

describe("stock footage amenity galleries", () => {
  it("keeps a covered front photo public and locks the rest of each set", () => {
    expect(page).not.toMatch(/unsplash|picsum|pexels|placeholder\.com/i);
    expect(page).toContain("Pay Now");
    expect(page).toContain("delivered manually");
    expect(page).not.toMatch(/\bBrowse\b|License Now|Pay Securely with Stripe|Thumbnail Strip|Download/);
    expect(page).not.toContain("AMENITY_STOCK_FILES");
    expect(publicModule).not.toContain("AMENITY_STOCK_FILES");

    expect(AMENITY_STOCK_CARDS.map((card) => card.neighborhood)).toEqual([
      "Artavia",
      "Bender's Landing",
      "Carlton Woods",
      "East Shore",
      "The Woodlands Waterway",
      "Woodforest",
    ]);

    const hiddenNames: string[] = [];
    for (const card of AMENITY_STOCK_CARDS) {
      const files = AMENITY_STOCK_FILES[card.id];
      expect(files, card.id).toBeDefined();
      expect(new Set(files.map((photo) => photo.file)).size, card.id).toBe(files.length);
      expect(files, card.id).toHaveLength(6);
      expect(card.coverFile).toBe(files[0]?.file);
      expect(card.imageCount).toBe(files.length);

      files.forEach((photo, index) => {
        const publicJpg = path.join(process.cwd(), "public/media/amenities", card.id, photo.file);
        const publicWebp = publicJpg.replace(/\.jpg$/, ".webp");
        const privateJpg = path.join(process.cwd(), "server/private/amenities", card.id, photo.file);
        const privateWebp = privateJpg.replace(/\.jpg$/, ".webp");
        expect(existsSync(privateJpg), photo.file).toBe(true);
        expect(existsSync(privateWebp), `${photo.file} webp`).toBe(true);
        if (index === 0) {
          expect(existsSync(publicJpg), photo.file).toBe(true);
          expect(existsSync(publicWebp), `${photo.file} webp`).toBe(true);
          return;
        }
        hiddenNames.push(photo.file);
        expect(existsSync(publicJpg), photo.file).toBe(false);
        expect(existsSync(publicWebp), `${photo.file} webp`).toBe(false);
      });
    }

    expect(hiddenNames).toHaveLength(30);
    expect(new Set(hiddenNames).size).toBe(30);
    for (const file of hiddenNames) {
      expect(page, file).not.toContain(file);
      expect(publicModule, file).not.toContain(file);
    }
  });

  it("does not notify clients or unlock a download from Pay Now", () => {
    expect(route).not.toMatch(/CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE|sendEmail|sendSMS|sendMail/);
    expect(route).not.toMatch(/downloadEnabled|downloadsReleased|lockDownloads|galleryId/);
    expect(route).toContain("manualDelivery: true");
    expect(route).toContain("createHolidaySquareCheckout");
  });
});
