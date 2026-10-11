import { describe, expect, it } from "vitest";
import { posterFrameSeconds } from "./videoPosterFrame";

describe("video poster frame", () => {
  it("seeks about 2 seconds in, or 10% when the clip is shorter", () => {
    expect(posterFrameSeconds(undefined)).toBe(2);
    expect(posterFrameSeconds(Number.NaN)).toBe(2);
    expect(posterFrameSeconds(12)).toBe(2);
    expect(posterFrameSeconds(1.5)).toBe(0.15);
  });
});
