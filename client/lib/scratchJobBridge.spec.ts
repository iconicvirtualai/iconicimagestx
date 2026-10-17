import { describe, expect, it } from "vitest";
import { blankStudioJob } from "@shared/studioProjects";
import { reconcileScratchItems, type ScratchPersistShape } from "./scratchJobBridge";

describe("scratch job resume", () => {
  it("restores an in-progress edit onto the editor frames", () => {
    const current: ScratchPersistShape[] = [];
    const job = blankStudioJob({
      id: "frame-1",
      projectId: "project-1",
      ownerUid: "owner-1",
      fileName: "living-room.jpg",
      kind: "edit",
      now: 50,
    });
    job.status = "rendering";
    job.progress = 64;
    const bytes = new Uint8Array([4, 5]);
    const frames = reconcileScratchItems(
      current,
      [job],
      () => bytes,
      (value) => `blob:${value.length}`,
      (name) => `card:${name}`,
    );
    expect(frames).toHaveLength(1);
    expect(frames[0].status).toBe("editing");
    expect(frames[0].name).toBe("living-room.jpg");
    expect(frames[0].afterBytes).toEqual(bytes);
    expect(frames[0].afterUrl).toBe("blob:2");
  });
});
