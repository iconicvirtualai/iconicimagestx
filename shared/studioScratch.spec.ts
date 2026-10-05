import { describe, expect, it } from "vitest";
import { orderExteriorTwilightPrompt } from "./orderEditPlan";
import {
  GRASS_REFERENCE_PUBLIC_PATH,
  GRASS_REFERENCE_RELATIVE_PATH,
  GRASS_REPLACE_PROMPT,
  parseScratchEdit,
  scratchDownloadName,
  scratchJpegAllowed,
  scratchSelection,
} from "./studioScratch";

describe("scratch pad edits", () => {
  it("accepts a jpeg and rejects RAW", () => {
    expect(scratchJpegAllowed("front.jpg", "image/jpeg").ok).toBe(true);
    expect(scratchJpegAllowed("front.JPEG", "").ok).toBe(true);
    const raw = scratchJpegAllowed("frame.CR2", "");
    expect(raw.ok).toBe(false);
    if (raw.ok === false) expect(raw.error).toMatch(/RAW/);
    const png = scratchJpegAllowed("room.png", "image/png");
    expect(png.ok).toBe(false);
  });

  it("uses the order twilight line and the fixed grass prompt", () => {
    const twilight = parseScratchEdit({
      action: "twilight",
      prompt: "",
      byteLength: 100,
      contentType: "image/jpeg",
    });
    expect(twilight).toMatchObject({ ok: true, prompt: orderExteriorTwilightPrompt(), attachGrass: false });

    const grass = parseScratchEdit({
      action: "grass",
      prompt: "ignore this",
      byteLength: 100,
      contentType: "image/jpeg",
    });
    expect(grass).toMatchObject({ ok: true, prompt: GRASS_REPLACE_PROMPT, attachGrass: true });
    expect(GRASS_REFERENCE_PUBLIC_PATH).toBe("/studio/grass-reference.jpg");
    expect(GRASS_REFERENCE_RELATIVE_PATH).toBe("public/studio/grass-reference.jpg");
  });

  it("requires a description for a free-text edit and a revision", () => {
    expect(parseScratchEdit({ action: "edit", prompt: "  ", byteLength: 20, contentType: "image/jpeg" })).toMatchObject({
      ok: false,
    });
    const revise = parseScratchEdit({
      action: "revise",
      prompt: "Warm the sky",
      byteLength: 20,
      contentType: "image/jpeg",
    });
    expect(revise).toMatchObject({ ok: true, action: "revise", prompt: "Warm the sky", attachGrass: false });
  });

  it("names the download from the source file", () => {
    expect(scratchDownloadName("Front Yard.jpg")).toBe("Front-Yard-edit.jpg");
    expect(scratchDownloadName("../etc/passwd")).toBe("passwd-edit.jpg");
  });

  it("selects one frame, toggles, and ranges", () => {
    const ids = ["a", "b", "c", "d"];
    const one = scratchSelection({ ids, selectedIds: [], anchorId: null, clickedId: "b", mode: "replace" });
    expect(one).toEqual({ selectedIds: ["b"], anchorId: "b", focusId: "b" });
    const added = scratchSelection({ ids, selectedIds: one.selectedIds, anchorId: one.anchorId, clickedId: "d", mode: "toggle" });
    expect(added.selectedIds).toEqual(["b", "d"]);
    const range = scratchSelection({ ids, selectedIds: added.selectedIds, anchorId: "b", clickedId: "d", mode: "range" });
    expect(range.selectedIds).toEqual(["b", "c", "d"]);
    expect(range.focusId).toBe("d");
  });
});
