import { describe, expect, it } from "vitest";
import {
  clipDemand,
  fitAnimationPoint,
  listTemplateSummaries,
  planFolderCoverage,
  planMappedCoverage,
  planTemplateTiming,
  templateDuration,
  validateTemplateJob,
  VIDEO_TEMPLATES,
} from "./studioVideoTemplates";

describe("studio video templates", () => {
  it("loads the five engine templates with the measured durations", () => {
    expect(VIDEO_TEMPLATES.map((template) => template.id)).toEqual([
      "glamping_whip_tour",
      "luxury_slow_glide",
      "agent_intro_tour",
      "social_teaser_15",
      "twilight_aerial_drone",
    ]);
    const glamping = VIDEO_TEMPLATES[0];
    expect(clipDemand(glamping)).toBe(41);
    expect(glamping.slots).toHaveLength(39);
    expect(glamping.slots.filter((slot) => slot.optional)).toHaveLength(13);
    expect(templateDuration(glamping)).toBeCloseTo(50.25, 2);
    expect(templateDuration(VIDEO_TEMPLATES[1])).toBeCloseTo(33.95, 2);
    expect(templateDuration(VIDEO_TEMPLATES[2])).toBeCloseTo(25.8667, 3);
    expect(templateDuration(VIDEO_TEMPLATES[3])).toBeCloseTo(14.65, 2);
    expect(templateDuration(VIDEO_TEMPLATES[4])).toBeCloseTo(30.7833, 3);
    const social = planTemplateTiming(VIDEO_TEMPLATES[3]);
    expect(social.slots[0]).toMatchObject({ id: "s01", outType: "whip" });
    expect(social.slots[0].relMin).toBeCloseTo(0, 3);
    expect(social.slots[0].relMax).toBeCloseTo(2.0374, 3);
    expect(social.slots[1].relMin).toBeCloseTo(-0.22, 2);
    expect(social.slots[1].relMax).toBeCloseTo(1.6123, 3);
    expect(social.slots[2].relMin).toBeCloseTo(-0.22, 2);
    expect(listTemplateSummaries()[0].layers[0].text).toMatch(/Cameron Ranch|Glamping|title/i);
  });

  it("drops optional slots and reuses clips the way the engine does", () => {
    const glamping = VIDEO_TEMPLATES[0];
    const minimum = planFolderCoverage(glamping, 22);
    expect(minimum.dropped).toEqual(["s05", "s35", "s11", "s34", "s13", "s30", "s07", "s29", "s23", "s33", "s10", "s17"]);
    expect(minimum.reused).toBe(7);
    expect(minimum.message).toBe("12 optional slots will be skipped; 7 slots will reuse clips");
    const social = VIDEO_TEMPLATES[3];
    expect(planFolderCoverage(social, 11).message).toBe("Every slot has its own clip.");
    const short = planFolderCoverage(social, 6);
    expect(short.dropped).toEqual(["s09", "s08"]);
    expect(short.reused).toBe(3);
    expect(short.message).toBe("2 optional slots will be skipped; 3 slots will reuse clips");
  });

  it("keeps the animation point inside a 4–14 second trim of a 20 second clip", () => {
    const social = planTemplateTiming(VIDEO_TEMPLATES[3]);
    const slot = social.slots[1];
    const fitted = fitAnimationPoint({
      inPoint: 4,
      outPoint: 14,
      relMin: slot.relMin,
      relMax: slot.relMax,
      userPoint: 8,
    });
    expect(fitted.point).toBeCloseTo(8, 2);
    expect(fitted.windowStart).toBeGreaterThanOrEqual(4);
    expect(fitted.windowEnd).toBeLessThanOrEqual(14);
    const nudged = fitAnimationPoint({
      inPoint: 4,
      outPoint: 14,
      relMin: slot.relMin,
      relMax: slot.relMax,
      userPoint: 4,
    });
    expect(nudged.point).toBeGreaterThan(4);
    expect(nudged.windowStart).toBeGreaterThanOrEqual(4);
    expect(nudged.note).toMatch(/moved/);
    const auto = fitAnimationPoint({
      inPoint: 4,
      outPoint: 14,
      relMin: -0.5,
      relMax: 0.5,
      userPoint: null,
      analysis: {
        duration: 20,
        rate: 10,
        mag: Array.from({ length: 200 }, (_, index) => (index > 85 && index < 95 ? 5 : 0.1)),
      },
    });
    expect(auto.auto).toBe(true);
    expect(auto.point).toBeGreaterThan(7);
    expect(auto.point).toBeLessThan(11);
  });

  it("skips empty optional slots and reuses empty required slots", () => {
    const social = VIDEO_TEMPLATES[3];
    const plan = planMappedCoverage(social, new Set(["s01", "s11"]));
    expect(plan.dropped).toEqual(["s08", "s09"]);
    expect(plan.reused).toBe(7);
    expect(plan.message).toMatch(/optional slots will be skipped/);
    expect(plan.message).toMatch(/reuse clips/);
  });

  it("rejects a clip that is not on the listing, in staff uploads, Dropbox, or Drive", () => {
    const good = validateTemplateJob({
      templateId: "social_teaser_15",
      listingId: "list_oak",
      slots: { s01: "studio-video/uploads/list_oak/arrival.mp4" },
      size: "1080x1920",
      trims: { s01: { in: 4, out: 14 } },
      points: { s01: 8 },
    });
    expect(good.ok).toBe(true);
    const drive = validateTemplateJob({
      templateId: "social_teaser_15",
      listingId: "list_oak",
      slots: { s01: "https://drive.google.com/file/d/abc/view" },
      size: "1920x1080",
    });
    expect(drive.ok).toBe(true);
    const foreign = validateTemplateJob({
      templateId: "social_teaser_15",
      listingId: "list_oak",
      slots: { s01: "galleries/someone-else/clip.mp4" },
      size: "1080x1920",
    });
    expect(foreign.ok).toBe(false);
  });
});
