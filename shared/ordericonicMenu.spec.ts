import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addOns,
  basicsList,
  hardcodedChargePrice,
  photoOnlyPackages,
} from "./bookingCatalog";
import { services } from "../client/lib/services";

const html = readFileSync(new URL("../public/ordericonic.html", import.meta.url), "utf8");
const pricing = readFileSync(new URL("../client/pages/Pricing.tsx", import.meta.url), "utf8");

function ordericonicSeeds(): Array<{ id: string; price: number }> {
  const found = new Map<string, number>();
  const pattern = /data-catalog="([^"]+)"[^>]*data-seed="(\d+)"|data-seed="(\d+)"[^>]*data-catalog="([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const id = match[1] || match[4];
    const price = Number(match[2] || match[3]);
    if (id && !found.has(id)) found.set(id, price);
  }
  return [...found.entries()].map(([id, price]) => ({ id, price }));
}

describe("ordericonic is the shared price list", () => {
  it("matches every ordericonic catalog price", () => {
    const seeds = ordericonicSeeds();
    expect(seeds.length).toBeGreaterThan(20);
    const mismatches = seeds
      .filter((item) => hardcodedChargePrice(item.id) !== item.price)
      .map((item) => `${item.id}: ordericonic ${item.price}, catalog ${hardcodedChargePrice(item.id)}`);
    expect(mismatches).toEqual([]);
  });

  it("shows the ordericonic photo cards, including the older 20, 35, and 50 counts", () => {
    expect(photoOnlyPackages.map((item) => [item.cardTitle || item.name, item.price])).toEqual([
      ["18 Photos", 139],
      ["25 Photos", 169],
      ["40 Photos", 199],
      ["20 Photos", 99],
      ["35 Photos", 150],
      ["50 Photos", 200],
      ["Aerial Only", 99],
    ]);
    expect(basicsList.map((item) => item.id)).toContain("photos-18");
    expect(services.map((item) => item.id)).toEqual(expect.arrayContaining([
      "hollywood",
      "hall-of-fame",
      "red-carpet",
      "luxe-video",
      "luxe-3d",
    ]));
  });

  it("prices Basic Video at $300 and the floor plan at $75 for /pricing and /book", () => {
    const video = addOns.flatMap((group) => group.items).find((item) => item.id === "basic-video");
    const floor = addOns.flatMap((group) => group.items).find((item) => item.id === "floorplan-2d");
    expect(video?.price).toBe(300);
    expect(floor?.price).toBe(75);
    expect(pricing).toContain("PRICING_ADD_ONS");
    expect(pricing).toContain("photoOnlyPackages");
    expect(pricing).not.toContain("350-500+");
    expect(pricing).not.toContain("floorplan-addon");
    expect(pricing).not.toContain("video-addon");
  });
});
