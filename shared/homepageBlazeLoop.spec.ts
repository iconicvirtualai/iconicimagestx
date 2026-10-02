import { describe, expect, it } from "vitest";
import {
  BLAZE_END_CARD_HOLD_MS,
  BLAZE_HASHTAG,
  BLAZE_SLOT_DURATION_MS,
  HOMEPAGE_BLAZE_LOOP,
  blazeAdvance,
  blazeCopyIsBrandSafe,
  blazeLoopShouldRender,
  blazePublicCopy,
  playableBlazeSlots,
} from "./homepageBlazeLoop";

const withSrc = HOMEPAGE_BLAZE_LOOP.map((slot) => ({
  ...slot,
  src: `https://cdn.example/blaze/${slot.id}.mp4`,
}));

describe("homepage blaze loop slots", () => {
  it("keeps the locked hard-cut order and burn-ins", () => {
    expect(HOMEPAGE_BLAZE_LOOP.map((slot) => slot.id)).toEqual(["BUILT", "US", "TEN_YEARS"]);
    expect(HOMEPAGE_BLAZE_LOOP.map((slot) => slot.order)).toEqual([1, 2, 3]);
    expect(HOMEPAGE_BLAZE_LOOP.map((slot) => slot.burnIn)).toEqual([
      "BUILT.",
      "US.",
      "Ten years. Still Iconic.",
    ]);
    expect(HOMEPAGE_BLAZE_LOOP.every((slot) => slot.durationMs === BLAZE_SLOT_DURATION_MS)).toBe(true);
    expect(BLAZE_SLOT_DURATION_MS).toBe(10_000);
  });

  it("holds the closer on black long enough to read, and only on that beat", () => {
    const closer = HOMEPAGE_BLAZE_LOOP.find((slot) => slot.id === "TEN_YEARS");
    expect(closer?.endCardHoldMs).toBe(BLAZE_END_CARD_HOLD_MS);
    expect(BLAZE_END_CARD_HOLD_MS).toBeGreaterThanOrEqual(1_200);
    expect(BLAZE_END_CARD_HOLD_MS).toBeLessThanOrEqual(1_500);
    expect(HOMEPAGE_BLAZE_LOOP.filter((slot) => slot.showMark).map((slot) => slot.id)).toEqual([
      "TEN_YEARS",
    ]);
    expect(HOMEPAGE_BLAZE_LOOP.filter((slot) => slot.endCardHoldMs > 0).map((slot) => slot.id)).toEqual([
      "TEN_YEARS",
    ]);
  });

  it("leaves src empty so draft Drive files are not wired as finals", () => {
    expect(blazeLoopShouldRender()).toBe(false);
    expect(playableBlazeSlots()).toEqual([]);
    for (const slot of HOMEPAGE_BLAZE_LOOP) {
      expect(slot.src).toBe("");
      expect(slot.src).not.toMatch(/drive\.google|googleusercontent/i);
    }
  });

  it("plays filled slots in locked order and skips blanks", () => {
    const shuffled = [withSrc[2], withSrc[0], { ...withSrc[1], src: "  " }];
    expect(playableBlazeSlots(shuffled).map((slot) => slot.id)).toEqual(["BUILT", "TEN_YEARS"]);
  });

  it("hard-cuts through the series, holds the closer, then loops", () => {
    const slots = playableBlazeSlots(withSrc);
    expect(blazeAdvance(slots, 0, "clip")).toEqual({ index: 1, phase: "clip" });
    expect(blazeAdvance(slots, 1, "clip")).toEqual({ index: 2, phase: "clip" });
    expect(blazeAdvance(slots, 2, "clip")).toEqual({ index: 2, phase: "endcard" });
    expect(blazeAdvance(slots, 2, "endcard")).toEqual({ index: 0, phase: "clip" });
  });

  it("loops a single filled slot without an end card", () => {
    const slots = playableBlazeSlots([{ ...HOMEPAGE_BLAZE_LOOP[0], src: "https://cdn.example/built.mp4" }]);
    expect(blazeAdvance(slots, 0, "clip")).toEqual({ index: 0, phase: "clip" });
  });

  it("keeps on-screen copy brand-safe", () => {
    const copy = blazePublicCopy();
    expect(copy).toContain("BUILT.");
    expect(copy).toContain("US.");
    expect(copy).toContain("Ten years. Still Iconic.");
    expect(copy).toContain(BLAZE_HASHTAG);
    expect(copy.filter((line) => line === BLAZE_HASHTAG)).toHaveLength(1);
    for (const line of copy) {
      expect(blazeCopyIsBrandSafe(line)).toBe(true);
    }
  });
});
