import { describe, expect, it } from "vitest";
import { HOMEPAGE_BEFORE_AFTER, isHiddenShowcaseMedia } from "./beforeAfter";
import { ABOUT_RETROSPECTIVE, framesPeople, resolveAboutTiles } from "./aboutRetrospective";
import { PRICING_HERO_VIDEO, WE_ARE_THE_BAR_VIDEO, lifestyleBrandSrc, pricingHeroVideo } from "./pricingMedia";
import { SNAP_REEL_STRIP, scrubSnapCopy } from "./snapReels";
import { SOLUTION_LINEUP, resolveSolutionLineup } from "./solutionLineup";
import { VOICE_SAMPLE_SLOTS } from "./voiceSamples";

const ADDRESS = /maria'?s?\s*way|heron\s*wing|blue\s*lake/i;

describe("walkthrough media", () => {
  it("drops grandma, the animals, and the grilling pair from the homepage reel", () => {
    expect(HOMEPAGE_BEFORE_AFTER.map((pair) => pair.id)).toEqual(["twilight-pool"]);
    expect(isHiddenShowcaseMedia("/media/before-after/living-occupied.jpg")).toBe(true);
    expect(isHiddenShowcaseMedia("/media/before-after/pasture-lifestyle.jpg")).toBe(true);
    expect(isHiddenShowcaseMedia("/media/before-after/pavilion-lifestyle.jpg")).toBe(true);
    expect(isHiddenShowcaseMedia("/media/before-after/twilight-pool-day.jpg")).toBe(false);
  });

  it("alternates the all-in-one lineup and keeps the bar video off it", () => {
    expect(SOLUTION_LINEUP.map((clip) => clip.aspect)).toEqual(["16/9", "9/16", "16/9", "9/16", "16/9", "9/16"]);
    expect(SOLUTION_LINEUP.some((clip) => clip.url.includes("content-web-clip"))).toBe(false);
    const stale = resolveSolutionLineup([
      { id: "content", url: WE_ARE_THE_BAR_VIDEO, title: "Content Package" },
    ]);
    expect(stale).toEqual(SOLUTION_LINEUP);
    for (const clip of SOLUTION_LINEUP) {
      expect(clip.title).not.toMatch(ADDRESS);
    }
  });

  it("scrubs property names off snap reel labels", () => {
    for (const reel of SNAP_REEL_STRIP) {
      expect(`${reel.title} ${reel.vibe}`).not.toMatch(ADDRESS);
    }
    expect(scrubSnapCopy("Blue Lake", "Golden hour from the terrace to the lake").title).toBe("Golden Hour");
    expect(scrubSnapCopy("Heron Wing", "old").title).toBe("Still Water");
    expect(scrubSnapCopy("Marias Way", "old").title).toBe("Evening Light");
  });

  it("replaces the category tile bar and keeps a different pricing background", () => {
    expect(resolveAboutTiles([
      { img: "/media/about/tiles/03_scale.jpg", label: "Scale" },
      { img: "/media/about/tiles/06_cinematic.jpg", label: "Cinematic" },
    ])).toEqual(ABOUT_RETROSPECTIVE);
    expect(ABOUT_RETROSPECTIVE.some((tile) => tile.img.includes("/media/about/tiles/"))).toBe(false);
    expect(framesPeople("/media/photos/family-bryant-mtz09081.jpg")).toBe(true);
    expect(framesPeople("/media/launch/hero_day_exterior_front.jpg")).toBe(false);
    expect(pricingHeroVideo(WE_ARE_THE_BAR_VIDEO)).toBe(PRICING_HERO_VIDEO);
    expect(PRICING_HERO_VIDEO).not.toContain("content-web-clip");
    expect(lifestyleBrandSrc("lifestyle", "/media/photos/lifestyle-kennedy-mtz01127.jpg")).toContain("lifestyle-mtz04655");
    expect(lifestyleBrandSrc("corporate", "/media/photos/lifestyle-mtz04327.jpg")).toContain("lifestyle-mtz04327");
    expect(lifestyleBrandSrc("standard", "/media/photos/standard-headshot.jpg")).toContain("standard-headshot");
  });

  it("exposes five voice sample slots and no audio files", () => {
    expect(VOICE_SAMPLE_SLOTS).toHaveLength(5);
    expect(VOICE_SAMPLE_SLOTS.map((slot) => slot.id)).toEqual([
      "sample-1",
      "sample-2",
      "sample-3",
      "sample-4",
      "sample-5",
    ]);
    for (const slot of VOICE_SAMPLE_SLOTS) {
      expect(slot).not.toHaveProperty("src");
    }
  });
});
