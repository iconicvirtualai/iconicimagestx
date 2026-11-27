import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aryeoOrderNumber, compactOrderLabel, formatOrderNumber } from "./orderNumber";
import { buildAdminOrderTile } from "./adminOrderTile";

describe("formatOrderNumber", () => {
  it("pads to three digits and never yields zero", () => {
    expect(formatOrderNumber(3)).toBe("#003");
    expect(formatOrderNumber(42)).toBe("#042");
    expect(formatOrderNumber(1234)).toBe("#1234");
    expect(() => formatOrderNumber(0)).toThrow();
  });
  it("admin tile shows the stored #NNN code", () => {
    expect(buildAdminOrderTile({ id: "abcDEFghi", orderNumber: "#004" } as never).orderCode).toBe("#004");
  });
  it("shows a short desk label and leaves the document id alone", () => {
    expect(compactOrderLabel({ id: "abcDEFghi", orderNumber: "#004" })).toBe("#004");
    expect(compactOrderLabel({ id: "abcDEFghi", orderNumber: 42 })).toBe("#042");
    expect(compactOrderLabel({ id: "fixture-pine", orderCode: "ORD - L - 33018" })).toBe("#33018");
    expect(compactOrderLabel({ id: "AbCdEfGhIjKlMnOpQrStUv", orderCode: "ORD - L - 104829" })).toBe("#104829");
    const fromId = compactOrderLabel({ id: "AbCdEfGhIjKlMnOpQrStUv" });
    expect(fromId).toMatch(/^#\d{4}$/);
    expect(compactOrderLabel({ id: "AbCdEfGhIjKlMnOpQrStUv" })).toBe(fromId);
  });
  it("reads an Aryeo order number without inventing one", () => {
    expect(aryeoOrderNumber({ aryeoOrderNumber: "ARY-10482" })).toBe("ARY-10482");
    expect(aryeoOrderNumber({ staffOnly: { aryeoId: "#88421" } })).toBe("#88421");
    expect(aryeoOrderNumber({ orderNumber: "#012" })).toBe("");
    expect(aryeoOrderNumber(null)).toBe("");
  });
  it("keeps rendered order numbers bold and body-sized", () => {
    const css = [
      "client/global.css",
      "client/styles/portal-v2.css",
      "client/styles/portal-inbox.css",
    ].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).join("\n");
    expect(css).toContain("font-variant-numeric: tabular-nums");
    expect(css).not.toMatch(/\.order-number strong \{[^}]*font-size:\s*28px/);
    expect(css).not.toMatch(/\.order-number strong \{[^}]*font-size:\s*2[4-9]px/);
  });
});

import { clientOrderConfirmedSubject } from "../server/services/email";
describe("client subject", () => {
  it("carries #NNN when present", () => {
    expect(clientOrderConfirmedSubject("1 Main St", "#004")).toBe("Your Iconic order #004 is confirmed: 1 Main St");
    expect(clientOrderConfirmedSubject("1 Main St")).toBe("Your Iconic order is confirmed: 1 Main St");
  });
});
