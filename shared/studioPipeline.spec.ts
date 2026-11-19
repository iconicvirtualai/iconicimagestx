import { describe, expect, it } from "vitest";
import { nextOrderPipelineStatus, parseStudioExportFrames } from "./studioPipeline";

describe("studio order pipeline", () => {
  it("moves an order forward at upload, export, and deliver", () => {
    expect(nextOrderPipelineStatus("scheduled", "upload")).toBe("editing");
    expect(nextOrderPipelineStatus("", "upload")).toBe("editing");
    expect(nextOrderPipelineStatus("editing", "export")).toBe("ready_for_review");
    expect(nextOrderPipelineStatus("ready_for_review", "deliver")).toBe("delivered");
  });

  it("does not walk a later status backward", () => {
    expect(nextOrderPipelineStatus("delivered", "upload")).toBe("delivered");
    expect(nextOrderPipelineStatus("approved", "export")).toBe("approved");
    expect(nextOrderPipelineStatus("cancelled", "deliver")).toBe("cancelled");
    expect(nextOrderPipelineStatus("ready_for_review", "upload")).toBe("ready_for_review");
  });

  it("requires a selected photo and rejects an oversized edit", () => {
    expect(parseStudioExportFrames({})).toEqual({ ok: false, error: "Select the photos to export." });
    expect(parseStudioExportFrames({ frames: [{ name: "front.jpg" }] }).ok).toBe(false);
    const ok = parseStudioExportFrames({
      frames: [{ path: "listings/teststudio01/photos/front.jpg", name: "front.jpg" }],
    });
    expect(ok.ok).toBe(true);
    const huge = parseStudioExportFrames({ frames: [{ bytesBase64: "A".repeat(7_000_000) }] });
    expect(huge.ok).toBe(false);
  });
});
