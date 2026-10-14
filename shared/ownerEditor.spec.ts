import { describe, expect, it } from "vitest";
import {
  ownerEditorFrameSvg,
  ownerEditorStatusLabel,
  parseOwnerEditorStart,
} from "./ownerEditor";

describe("owner editor jobs", () => {
  it("accepts a render or a process and rejects an empty name", () => {
    expect(parseOwnerEditorStart({ name: "  Lake house  ", mode: "render", note: "  Twilight  " })).toEqual({
      ok: true,
      value: { name: "Lake house", mode: "render", note: "Twilight" },
    });
    expect(parseOwnerEditorStart({ name: "Kitchen", mode: "PROCESS", note: "" })).toMatchObject({
      ok: true,
      value: { mode: "process", note: "" },
    });
    expect(parseOwnerEditorStart({ name: "   ", mode: "render" })).toEqual({
      ok: false,
      error: "Enter a project name.",
    });
    expect(parseOwnerEditorStart({ name: "Lake", mode: "stage" })).toEqual({
      ok: false,
      error: "Choose render or process.",
    });
    expect(parseOwnerEditorStart({ name: "x".repeat(81), mode: "render" })).toEqual({
      ok: false,
      error: "Project names are limited to 80 characters.",
    });
    expect(parseOwnerEditorStart({ name: "Lake", mode: "render", note: "n".repeat(401) })).toEqual({
      ok: false,
      error: "Notes are limited to 400 characters.",
    });
  });

  it("names in-progress work by the mode she started", () => {
    expect(ownerEditorStatusLabel({ status: "queued", mode: "render" })).toBe("Queued");
    expect(ownerEditorStatusLabel({ status: "processing", mode: "render" })).toBe("Rendering");
    expect(ownerEditorStatusLabel({ status: "processing", mode: "process" })).toBe("Processing");
    expect(ownerEditorStatusLabel({ status: "ready", mode: "process" })).toBe("Ready");
    expect(ownerEditorStatusLabel({ status: "failed", mode: "render" })).toBe("Failed");
  });

  it("draws a sans-serif result frame and escapes the project name", () => {
    const svg = ownerEditorFrameSvg({ name: `Lake <house> & "twilight"`, mode: "render" });
    expect(svg).toContain("Inter, Arial, Helvetica, sans-serif");
    expect(svg).toContain("Lake &lt;house&gt; &amp; &quot;twilight&quot;");
    expect(svg).toContain("Finished on the server");
    expect(svg.toLowerCase()).not.toContain("cormorant");
    expect(svg.toLowerCase()).not.toContain("times");
    expect(svg.toLowerCase()).not.toContain("georgia");
    expect(svg).not.toContain("font-serif");
  });
});
