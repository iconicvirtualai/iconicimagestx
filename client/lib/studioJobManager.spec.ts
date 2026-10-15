import { describe, expect, it } from "vitest";
import { resumeProject } from "@shared/studioProjects";
import { createStudioJobManager, type StudioJobPorts } from "./studioJobManager";

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out");
}

function harness() {
  const saved: Array<Record<string, unknown>> = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sequence = 0;
  const ports: StudioJobPorts = {
    now: () => 5_000,
    newId: () => `id-${sequence += 1}`,
    persistJob: async (job) => {
      saved.push(JSON.parse(JSON.stringify(job)) as Record<string, unknown>);
    },
    persistProject: async () => undefined,
    startUpload: async ({ onProgress, signal }) => {
      onProgress(40);
      await gate;
      if (signal.cancelled) throw new Error("cancelled");
      onProgress(100);
    },
    startRender: async (job) => ({
      job: {
        ...job,
        status: "done",
        progress: 100,
        outputRef: `studio-projects/${job.ownerUid}/${job.projectId}/${job.id}/output.jpg`,
        error: "",
      },
      outputBytes: new Uint8Array([7, 7]),
    }),
  };
  return { manager: createStudioJobManager(ports), saved, release };
}

describe("studio job manager", () => {
  it("keeps a resumable upload and render running after the page detaches", async () => {
    const { manager, saved, release } = harness();
    const project = manager.ensureProject("owner-1", "Scratch pad");
    const stop = manager.subscribe(() => undefined);
    manager.enqueue({
      id: "job-1",
      projectId: project.id,
      ownerUid: "owner-1",
      fileName: "living-room.jpg",
      kind: "edit",
      action: "edit",
      prompt: "Brighten the room",
      steps: [{ action: "edit", prompt: "Brighten the room" }],
      data: new Uint8Array([1, 2, 3]),
    });
    await waitFor(() => saved.some((job) => job.status === "uploading" && job.progress === 40));
    stop();
    manager.notePageDetached();
    expect(manager.isUploadCancelled("job-1")).toBe(false);
    release();
    await waitFor(() => manager.getState().jobs[0]?.status === "done");
    const done = manager.getState().jobs[0];
    expect(done.ownerUid).toBe("owner-1");
    expect(done.inputRef).toContain("input.jpg");
    expect(done.outputRef).toContain("output.jpg");
    expect(done.progress).toBe(100);
    expect(manager.outputBytes("job-1")).toEqual(new Uint8Array([7, 7]));
    expect(saved.some((job) => job.status === "done" && job.recordType === "studio-project")).toBe(true);
    const restored = resumeProject(manager.jobsFor(project.id, "owner-1"), project.id, "owner-1");
    expect(restored.frames[0].status).toBe("done");
    expect(restored.frames[0].outputRef).toContain("output.jpg");
  });

  it("resumes an in-progress project and retries only the owner's failed job", async () => {
    const { manager, release } = harness();
    const project = manager.ensureProject("owner-1", "Scratch pad");
    manager.hydrate([
      {
        id: "rendering",
        projectId: project.id,
        ownerUid: "owner-1",
        status: "rendering",
        progress: 55,
        fileName: "kitchen.jpg",
        kind: "edit",
        inputRef: "in.jpg",
        outputRef: "",
        recordType: "studio-project",
        label: "Edit",
        action: "edit",
        prompt: "Warm it",
        steps: [],
        error: "",
        createdAt: 1,
        updatedAt: 2,
        thumbnailDataUrl: "",
        listingId: "",
        roomType: "",
        style: "",
      },
      {
        id: "failed",
        projectId: project.id,
        ownerUid: "owner-1",
        status: "failed",
        progress: 10,
        fileName: "porch.jpg",
        kind: "staging",
        inputRef: "porch-in.jpg",
        outputRef: "",
        recordType: "studio-project",
        label: "Virtual Staging",
        action: "staging",
        prompt: "",
        steps: [],
        error: "stopped",
        createdAt: 1,
        updatedAt: 2,
        thumbnailDataUrl: "",
        listingId: "",
        roomType: "living",
        style: "modern",
      },
      {
        id: "theirs",
        projectId: project.id,
        ownerUid: "owner-2",
        status: "failed",
        progress: 10,
        fileName: "secret.jpg",
        kind: "edit",
        inputRef: "secret-in.jpg",
        outputRef: "",
        recordType: "studio-project",
        label: "Edit",
        action: "edit",
        prompt: "",
        steps: [],
        error: "no",
        createdAt: 1,
        updatedAt: 2,
        thumbnailDataUrl: "",
        listingId: "",
        roomType: "",
        style: "",
      },
    ], [{ ...manager.getState().projects[0] }], project.id);

    const restored = resumeProject(manager.jobsFor(project.id, "owner-1"), project.id, "owner-1");
    expect(restored.inProgress).toBe(true);
    expect(restored.frames.map((frame) => frame.name)).toEqual(["kitchen.jpg", "porch.jpg"]);
    expect(restored.frames[0].status).toBe("editing");
    expect(restored.frames[0].progress).toBe(55);
    expect(manager.retry("theirs", "owner-1")).toBeNull();
    expect(manager.retry("failed", "owner-1")?.status).toBe("queued");
    release();
  });
});
