import { describe, expect, it } from "vitest";
import { listingOrderQueuePending, studioOrderTrayJobs } from "./studioOrderTray";

const jobs = [
  {
    id: "pending-1",
    listingId: "job-1",
    origin: "order",
    status: "pending",
    sourcePath: "listings/job-1/photos/a.jpg",
    type: "twilight",
  },
  {
    id: "review-1",
    listingId: "job-1",
    origin: "order",
    status: "review",
    afterUrl: "https://example.com/after.jpg",
    note: "Ready",
    label: "Front",
  },
  {
    id: "failed-1",
    listingId: "job-1",
    status: "failed",
    note: "OpenAI timed out.",
  },
  {
    id: "other",
    listingId: "job-2",
    status: "review",
    afterUrl: "https://example.com/other.jpg",
  },
  {
    id: "approved-1",
    listingId: "job-1",
    status: "approved",
  },
  {
    id: "placeholder-1",
    listingId: "job-1",
    status: "review",
    placeholder: true,
    afterUrl: "https://example.com/ph.jpg",
  },
];

describe("studio order tray", () => {
  it("keeps the open listing's unfinished order edits and the approve gate", () => {
    const tray = studioOrderTrayJobs(jobs, "job-1");
    expect(tray.map((job) => job.id)).toEqual(["pending-1", "review-1", "failed-1", "placeholder-1"]);
    expect(tray.find((job) => job.id === "review-1")).toMatchObject({
      canApprove: true,
      canReject: true,
      label: "Front",
      note: "Ready",
    });
    expect(tray.find((job) => job.id === "pending-1")?.canApprove).toBe(false);
    expect(tray.find((job) => job.id === "pending-1")?.canReject).toBe(false);
    expect(tray.find((job) => job.id === "failed-1")).toMatchObject({
      canApprove: false,
      canReject: true,
      note: "OpenAI timed out.",
    });
    expect(tray.find((job) => job.id === "placeholder-1")?.canApprove).toBe(false);
    expect(listingOrderQueuePending(tray)).toBe(true);
  });

  it("does not advance a queue that is only waiting on a photo", () => {
    const tray = studioOrderTrayJobs(
      [{ id: "wait", listingId: "job-1", origin: "order", status: "pending", sourcePath: "" }],
      "job-1",
    );
    expect(listingOrderQueuePending(tray)).toBe(false);
    expect(studioOrderTrayJobs(jobs, "")).toEqual([]);
  });
});
