import { describe, expect, it } from "vitest";
import { editInstructionSteps, preferenceSteps, stagingApi, stagingGuidance, studioSteps, type StagingRequest } from "./scratchDesk";

describe("scratch desk pathways", () => {
  it("sends full iconic polish, then the lawn composite, without asking the model to invent grass", () => {
    const steps = preferenceSteps("full-iconic", "Prioritize twilight window views.");
    expect(steps.map((step) => step.action)).toEqual(["edit", "grass"]);
    expect(steps[0].prompt).toMatch(/dirt and debris/i);
    expect(steps[0].prompt).toMatch(/foliage/i);
    expect(steps[0].prompt).toMatch(/Prioritize twilight window views/);
    expect(steps[0].prompt).not.toMatch(/\badd grass\b/i);
    expect(preferenceSteps("polish", "").map((step) => step.action)).toEqual(["edit", "grass"]);
    expect(preferenceSteps("grass", "Warm the porch light.").map((step) => step.action)).toEqual(["edit", "grass"]);
  });

  it("runs twilight, then the note as a revision", () => {
    const steps = preferenceSteps("twilight", "Warm the interior lights.");
    expect(steps.map((step) => step.action)).toEqual(["twilight", "revise"]);
  });

  it("builds a sky replacement prompt and leaves floorplan local", () => {
    const sky = studioSteps("sky", { skyPreset: "dramatic", intensity: 72, blend: 38, instruction: "Keep the roofline." });
    expect(sky?.[0].prompt).toMatch(/dramatic/);
    expect(sky?.[0].prompt).toMatch(/roofline/);
    expect(studioSteps("floorplan", { skyPreset: "clear", intensity: 0, blend: 0, instruction: "" })).toBeNull();
    expect(editInstructionSteps("Lift the shadows.")[0].prompt).toBe("Lift the shadows.");
  });

  it("maps virtual staging onto the public room and style values and keeps notes for a revision", () => {
    const defaults: StagingRequest = {
      roomId: "living",
      furnitureId: "sofa",
      angleId: "single",
      styleId: "modern",
      intensity: 70,
      density: 60,
      notes: "",
      aiNotes: "",
    };
    expect(stagingApi(defaults)).toMatchObject({ roomType: "living", style: "modern" });
    expect(stagingApi({ roomId: "office", styleId: "midcentury" })).toMatchObject({
      roomType: "home_office",
      style: "mid-century modern",
    });
    expect(stagingGuidance(defaults)).toBeNull();
    const prompt = stagingGuidance({
      ...defaults,
      furnitureId: "mixed",
      intensity: 40,
      notes: "Keep the fireplace.",
      aiNotes: "Light neutrals, no clutter.",
    });
    expect(prompt).toMatch(/Mixed/);
    expect(prompt).toMatch(/40 of 100/);
    expect(prompt).toMatch(/Keep the fireplace/);
    expect(prompt).toMatch(/Light neutrals, no clutter/);
  });
});
