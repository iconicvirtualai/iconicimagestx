import { describe, expect, it } from "vitest";
import { formatOrderNumber } from "./orderNumber";
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
});

import { clientOrderConfirmedSubject } from "../server/services/email";
describe("client subject", () => {
  it("carries #NNN when present", () => {
    expect(clientOrderConfirmedSubject("1 Main St", "#004")).toBe("Your Iconic order #004 is confirmed: 1 Main St");
    expect(clientOrderConfirmedSubject("1 Main St")).toBe("Your Iconic order is confirmed: 1 Main St");
  });
});
