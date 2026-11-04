import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.join(process.cwd(), "client/pages/StockFootage.tsx"), "utf8");

describe("stock footage amenity galleries", () => {
  it("uses the real amenity photos and the corrected community names", () => {
    expect(page).not.toMatch(/unsplash|picsum|pexels|placeholder\.com/i);
    expect(page).toContain('amenityGallery("east-shore", "East Shore"');
    expect(page).toContain('amenityGallery("woodlands-waterway", "The Woodlands Waterway"');
    expect(page).toContain('amenityGallery("woodforest", "Woodforest"');
    expect(page).not.toMatch(/neighborhood:\s*"Memorial"|neighborhood:\s*"Uptown"|neighborhood:\s*"Energy Corridor"/);
    expect(page).not.toContain("imageCount: 20");

    const galleries = [...page.matchAll(/amenityGallery\("([^"]+)", "([^"]+)", \[([\s\S]*?)\]\),/g)];
    expect(galleries.map((match) => match[2])).toEqual([
      "Artavia",
      "Bender's Landing",
      "Carlton Woods",
      "East Shore",
      "The Woodlands Waterway",
      "Woodforest",
    ]);

    const urls: string[] = [];
    for (const match of galleries) {
      const files = [...match[3].matchAll(/file: "([^"]+)"/g)].map((file) => file[1]);
      expect(new Set(files).size, match[1]).toBe(files.length);
      expect(files, match[1]).toHaveLength(6);
      for (const file of files) urls.push(`/media/amenities/${match[1]}/${file}`);
    }
    expect(urls).toHaveLength(36);
    expect(new Set(urls).size).toBe(36);
    for (const url of urls) {
      const file = path.join(process.cwd(), "public", url);
      expect(existsSync(file), url).toBe(true);
      expect(existsSync(file.replace(/\.jpg$/, ".webp")), `${url} webp`).toBe(true);
    }
  });
});
