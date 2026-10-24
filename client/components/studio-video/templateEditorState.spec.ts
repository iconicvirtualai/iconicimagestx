import { describe, expect, it } from "vitest";
import { templateCoverage, templateEditorReducer, emptyTemplateEditor } from "./templateEditorState";

describe("template editor reducer", () => {
  it("assigns, trims inside 4–14, swaps, clears, and reports coverage", () => {
    let state = emptyTemplateEditor();
    state = templateEditorReducer(state, { type: "select-template", templateId: "social_teaser_15" });
    expect(state.text.hook).toBe("Just Listed");
    expect(state.musicId).toBe("heartbeat_mixkit1000");
    state = templateEditorReducer(state, { type: "trim", slotId: "s03", inPoint: 4, outPoint: 14 });
    expect(state.slots.s03).toMatchObject({ sourceIds: [], inPoint: 4, outPoint: 14 });
    state = templateEditorReducer(state, { type: "assign", slotId: "s01", sourceId: "clip-a", duration: 20 });
    state = templateEditorReducer(state, { type: "assign", slotId: "s11", sourceId: "clip-b", duration: 12 });
    state = templateEditorReducer(state, { type: "trim", slotId: "s01", inPoint: 4, outPoint: 14 });
    state = templateEditorReducer(state, { type: "set-point", slotId: "s01", point: 8 });
    expect(state.slots.s01).toMatchObject({ inPoint: 4, outPoint: 14, point: 8, sourceIds: ["clip-a"] });
    state = templateEditorReducer(state, { type: "set-point", slotId: "s01", point: 1 });
    expect(state.slots.s01.point).toBe(4);
    state = templateEditorReducer(state, { type: "auto-point", slotId: "s01" });
    expect(state.slots.s01.point).toBeNull();
    state = templateEditorReducer(state, { type: "swap", slotId: "s01", direction: 1 });
    expect(state.slots.s02.sourceIds).toEqual(["clip-a"]);
    expect(state.slots.s01).toBeUndefined();
    const coverage = templateCoverage(state);
    expect(coverage.dropped).toEqual(["s08", "s09"]);
    expect(coverage.reused).toBeGreaterThan(0);
    expect(coverage.message).toMatch(/optional slots will be skipped/);
    state = templateEditorReducer(state, { type: "clear", slotId: "s02" });
    expect(state.slots.s02).toBeUndefined();
    state = templateEditorReducer(state, { type: "set-text", layerId: "hook", text: "Open Sunday" });
    expect(state.text.hook).toBe("Open Sunday");
  });

  it("fills slots from a folder and drops optional slots when clips run short", () => {
    let state = templateEditorReducer(emptyTemplateEditor(), { type: "select-template", templateId: "social_teaser_15" });
    const sourceIds = ["a", "b", "c", "d", "e", "f"];
    const durations = Object.fromEntries(sourceIds.map((id) => [id, 8]));
    state = templateEditorReducer(state, { type: "import-all", sourceIds, durations });
    expect(state.slots.s08).toBeUndefined();
    expect(state.slots.s09).toBeUndefined();
    expect(state.slots.s01.sourceIds[0]).toBe("a");
    expect(Object.keys(state.slots).length).toBe(9);
  });
});
