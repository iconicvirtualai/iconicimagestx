import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { payTokenMatches } from "./payToken";

describe("payTokenMatches", () => {
  it("accepts an exact match and rejects a different token", () => {
    const stored = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
    expect(payTokenMatches(stored, stored)).toBe(true);
    expect(payTokenMatches(stored, `${stored.slice(0, -1)}B`)).toBe(false);
    expect(payTokenMatches("", stored)).toBe(false);
    expect(payTokenMatches(stored, "")).toBe(false);
  });

  it("compares equal-length buffers when the presented token is a different length", () => {
    const stored = "abcdefghijklmnopqrstuvwxyz012345";
    const lengths: number[] = [];
    const matched = payTokenMatches(stored, "short", (left, right) => {
      lengths.push(left.length, right.length);
      return left.equals(right);
    });
    expect(matched).toBe(false);
    expect(lengths).toEqual([stored.length, stored.length]);
    expect(readFileSync(new URL("./payToken.ts", import.meta.url), "utf8")).toContain("timingSafeEqual");
  });
});
