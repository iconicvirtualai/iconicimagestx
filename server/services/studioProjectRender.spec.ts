import { describe, expect, it } from "vitest";
import { blankStudioJob } from "../../shared/studioProjects";
import { renderStudioProjectJob } from "./studioProjectRender";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function job() {
  return {
    ...blankStudioJob({
      id: "job-1",
      projectId: "project-1",
      ownerUid: "owner-1",
      fileName: "living-room.jpg",
      kind: "edit",
      now: 10,
    }),
    action: "edit",
    prompt: "Brighten the room",
    steps: [{ action: "edit", prompt: "Brighten the room" }],
  };
}

describe("studio project render", () => {
  it("finishes the render and updates the job after the client is gone", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const files = new Map<string, Buffer>();
    const result = await renderStudioProjectJob({
      job: job(),
      disconnected: () => true,
      readInput: async () => jpeg,
      writeOutput: async (path, bytes) => {
        files.set(path, bytes);
      },
      edit: async () => ({ bytes: Buffer.from("edited-jpeg"), contentType: "image/jpeg", downloadName: "living-room.jpg" }),
      update: async (patch) => {
        updates.push(patch);
      },
    });
    expect(updates.map((patch) => patch.status)).toEqual(["rendering", "rendering", "done"]);
    expect(result.status).toBe("done");
    expect(result.progress).toBe(100);
    expect(result.ownerUid).toBe("owner-1");
    expect(result.outputRef).toBe("studio-projects/owner-1/project-1/job-1/output.jpg");
    expect(files.get(result.outputRef)?.toString()).toBe("edited-jpeg");
  });

  it("records a failure on the job doc without dropping the owner", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const result = await renderStudioProjectJob({
      job: job(),
      disconnected: () => true,
      readInput: async () => jpeg,
      writeOutput: async () => undefined,
      edit: async () => {
        throw new Error("OpenAI key missing");
      },
      update: async (patch) => {
        updates.push(patch);
      },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("OpenAI key missing");
    expect(result.ownerUid).toBe("owner-1");
    expect(updates.at(-1)?.status).toBe("failed");
  });
});
