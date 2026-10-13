import { describe, expect, it } from "vitest";
import {
  activeJobCount,
  blankStudioJob,
  canDownloadJob,
  canRetryJob,
  formatJobTime,
  isStudioEditorPath,
  jobsFinishedElsewhere,
  midRenderPreview,
  resumeProject,
  studioJobDocPath,
  studioOutputStoragePath,
} from "./studioProjects";

function job(overrides: Partial<ReturnType<typeof blankStudioJob>> = {}) {
  return {
    ...blankStudioJob({
      id: "job-1",
      projectId: "project-1",
      ownerUid: "owner-1",
      fileName: "living-room.jpg",
      kind: "edit",
      now: 1_000,
    }),
    ...overrides,
  };
}

describe("studio project jobs", () => {
  it("persists jobs under projects/{id}/jobs with owner, progress, and refs", () => {
    const stored = job({
      status: "rendering",
      progress: 64,
      inputRef: "studio-projects/owner-1/project-1/job-1/input.jpg",
      outputRef: "",
    });
    expect(studioJobDocPath(stored.projectId, stored.id)).toBe("projects/project-1/jobs/job-1");
    expect(stored.ownerUid).toBe("owner-1");
    expect(stored.status).toBe("rendering");
    expect(stored.progress).toBe(64);
    expect(stored.inputRef).toContain("input.jpg");
    expect(studioOutputStoragePath(stored.ownerUid, stored.projectId, stored.id)).toContain("output.jpg");
  });

  it("restores the in-progress project for its owner", () => {
    const jobs = [
      job({ id: "rendering", status: "rendering", progress: 64 }),
      job({ id: "ready", status: "done", outputRef: "", kind: "upload" }),
      job({ id: "other", projectId: "project-2", status: "rendering" }),
      job({ id: "stranger", ownerUid: "owner-2", status: "rendering" }),
    ];
    const restored = resumeProject(jobs, "project-1", "owner-1");
    expect(restored.inProgress).toBe(true);
    expect(restored.frames.map((frame) => frame.id)).toEqual(["rendering", "ready"]);
    expect(restored.frames[0].status).toBe("editing");
    expect(restored.frames[0].progress).toBe(64);
    expect(restored.frames[1].status).toBe("ready");
  });

  it("counts active jobs and limits retry and download to the owner", () => {
    const jobs = [
      job({ status: "uploading" }),
      job({ id: "render", status: "rendering" }),
      job({ id: "failed", status: "failed" }),
      job({ id: "done", status: "done", outputRef: "out.jpg" }),
    ];
    expect(activeJobCount(jobs, "owner-1")).toBe(2);
    expect(canRetryJob(jobs[2], "owner-1")).toBe(true);
    expect(canRetryJob(jobs[2], "owner-2")).toBe(false);
    expect(canRetryJob(jobs[1], "owner-1")).toBe(false);
    expect(canDownloadJob(jobs[3], "owner-1")).toBe(true);
    expect(canDownloadJob(jobs[3], "owner-2")).toBe(false);
    expect(canDownloadJob(jobs[1], "owner-1")).toBe(false);
  });

  it("toasts when a job finishes away from the editor", () => {
    const previous = [job({ status: "rendering" }), job({ id: "upload", status: "uploading" })];
    const next = [
      job({ status: "done", outputRef: "out.jpg" }),
      job({ id: "upload", status: "failed", error: "stopped" }),
    ];
    expect(jobsFinishedElsewhere(previous, next, "/admin/dashboard").map((item) => item.id)).toEqual(["job-1", "upload"]);
    expect(jobsFinishedElsewhere(previous, next, "/admin/studio/scratch")).toEqual([]);
    expect(isStudioEditorPath("/admin/studio/editing")).toBe(true);
    expect(formatJobTime(1_000, 61_000)).toBe("1m ago");
  });

  it("builds a mid-render preview with active work", () => {
    const preview = midRenderPreview(10_000);
    expect(activeJobCount(preview.jobs, "temp-admin-uid")).toBe(2);
    expect(preview.jobs.some((item) => item.status === "rendering" && item.progress === 64)).toBe(true);
    expect(preview.project.title).toBe("Scratch pad");
  });
});
