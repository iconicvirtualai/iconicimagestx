import { describe, expect, it } from "vitest";
import {
  BLAZE_CLOSER_FILE_HOLD_MS,
  BLAZE_HASHTAG,
  BLAZE_SLOT_DURATION_MS,
  HOMEPAGE_BLAZE_LOOP,
  blazeAdvance,
  blazeCopyIsBrandSafe,
  blazeLoopShouldRender,
  blazePublicCopy,
  blazeSlotIsPlayable,
  playableBlazeSlots,
} from "./homepageBlazeLoop";

const withFinalSrc = HOMEPAGE_BLAZE_LOOP.map((slot) => ({
  ...slot,
  approval: "final" as const,
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
    expect(BLAZE_SLOT_DURATION_MS).toBe(12_000);
  });

  it("leaves the closer's black hold inside the file instead of adding a second card", () => {
    const closer = HOMEPAGE_BLAZE_LOOP.find((slot) => slot.id === "TEN_YEARS");
    expect(closer?.endCardHoldMs).toBe(0);
    expect(BLAZE_CLOSER_FILE_HOLD_MS).toBeGreaterThanOrEqual(1_200);
    expect(BLAZE_CLOSER_FILE_HOLD_MS).toBeLessThanOrEqual(1_500);
    expect(HOMEPAGE_BLAZE_LOOP.filter((slot) => slot.showMark).map((slot) => slot.id)).toEqual([
      "TEN_YEARS",
    ]);
    expect(HOMEPAGE_BLAZE_LOOP.every((slot) => slot.overlayBurnIn === false)).toBe(true);
  });

  it("wires the three finals in locked order", () => {
    expect(blazeLoopShouldRender()).toBe(true);
    expect(playableBlazeSlots().map((slot) => slot.src)).toEqual([
      "/media/blaze/01_BUILT_v2.mp4",
      "/media/blaze/02_US_v3.mp4",
      "/media/blaze/03_TEN_YEARS_v2.mp4",
    ]);
    const shipped = JSON.stringify(HOMEPAGE_BLAZE_LOOP);
    expect(shipped).not.toMatch(/drive\.google|googleusercontent/i);
    for (const slot of HOMEPAGE_BLAZE_LOOP) {
      expect(slot.approval).toBe("final");
      expect(blazeSlotIsPlayable(slot)).toBe(true);
    }
  });

  it("refuses Drive drafts and held slots even when a src is filled in", () => {
    const heldWithSrc = {
      ...HOMEPAGE_BLAZE_LOOP[1],
      src: "https://drive.google.com/file/d/1UTpe1GIaAXmWp5VEaGnf612gyDwiDQll/view",
    };
    const finalButDrive = { ...heldWithSrc, approval: "final" as const };
    expect(blazeSlotIsPlayable(heldWithSrc)).toBe(false);
    expect(blazeSlotIsPlayable(finalButDrive)).toBe(false);
    expect(playableBlazeSlots([heldWithSrc, finalButDrive])).toEqual([]);
    expect(blazeLoopShouldRender([heldWithSrc, finalButDrive])).toBe(false);
  });

  it("plays approved slots in locked order and skips blanks", () => {
    const shuffled = [withFinalSrc[2], withFinalSrc[0], { ...withFinalSrc[1], src: "  " }];
    expect(playableBlazeSlots(shuffled).map((slot) => slot.id)).toEqual(["BUILT", "TEN_YEARS"]);
  });

  it("hard-cuts through the series and loops to BUILT", () => {
    const slots = playableBlazeSlots(withFinalSrc);
    expect(blazeAdvance(slots, 0, "clip")).toEqual({ index: 1, phase: "clip" });
    expect(blazeAdvance(slots, 1, "clip")).toEqual({ index: 2, phase: "clip" });
    expect(blazeAdvance(slots, 2, "clip")).toEqual({ index: 0, phase: "clip" });
  });

  it("loops a single approved slot without an end card", () => {
    const slots = playableBlazeSlots([
      { ...HOMEPAGE_BLAZE_LOOP[0], approval: "final" as const, src: "https://cdn.example/built.mp4" },
    ]);
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
