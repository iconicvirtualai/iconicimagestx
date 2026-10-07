import { describe, expect, it } from "vitest";
import { editInstructionSteps, preferenceSteps, studioSteps } from "./scratchDesk";

describe("scratch desk pathways", () => {
  it("sends full iconic polish and special instructions on one edit", () => {
    const steps = preferenceSteps("full-iconic", "Prioritize twilight window views.");
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe("edit");
    expect(steps[0].prompt).toMatch(/dirt and debris/i);
    expect(steps[0].prompt).toMatch(/Prioritize twilight window views/);
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
});
