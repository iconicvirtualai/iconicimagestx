import { describe, expect, it } from "vitest";
import { sampleMediaDeliveryRows } from "./mediaDelivery.ts";
import {
  buildOpsBoard,
  editingDesk,
  filterOpsStage,
  legacyOpsTarget,
  OPS_PATH,
  sampleOpsBoard,
  stageFromDeliveryFilter,
} from "./opsLifecycle.ts";
import { DEMO_PHOTOGRAPHER_ID, demoPhotographerJobs, isDemoPhotographer } from "./photographerPreview.ts";

describe("ops lifecycle", () => {
  const board = sampleOpsBoard("2026-10-27");

  it("puts each sample shoot in one stage", () => {
    const ids = board.map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(filterOpsStage(board, "shoots").map((job) => job.address)).toEqual(["14 Maple Drive, Austin, TX"]);
    expect(filterOpsStage(board, "uploads").map((job) => job.id)).toEqual(["sampleUpload001"]);
    expect(filterOpsStage(board, "review").map((job) => job.id)).toEqual(["sampleReview001"]);
    expect(filterOpsStage(board, "delivered").map((job) => job.id)).toEqual(["sampleDone00001"]);
    expect(board.find((job) => job.id === "sampleUpload001")?.desk).toMatchObject({ hdr: 1, cull: 1 });
    expect(board.find((job) => job.id === "sampleUpload001")?.delivery?.label).toBe("Pending");
    expect(board.find((job) => job.id === "sampleReview001")?.delivery?.label).toBe("Undelivered");
  });

  it("does not list a gallery a second time when the listing is already on the board", () => {
    const merged = buildOpsBoard({
      today: "2026-10-27",
      listings: [{ id: "job-1", address: "1 Main", images: [{ name: "a.jpg" }], status: "uploaded" }],
      deliveryRows: sampleMediaDeliveryRows().slice(0, 1).map((row) => ({ ...row, listingId: "job-1", address: "1 Main" })),
    });
    expect(merged.filter((job) => job.listingId === "job-1")).toHaveLength(1);
  });

  it("names HDR and cull from the studio job, and leaves other edits as Studio", () => {
    expect(editingDesk([
      { type: "hdr", label: "Bracket merge" },
      { type: "raw_ingest" },
      { type: "photo", origin: "order" },
    ])).toMatchObject({ hdr: 1, cull: 1, studio: 1 });
    expect(editingDesk([]).line).toMatch(/No HDR or cull/);
  });

  it("keeps the old query string and sends each tab to its stage", () => {
    expect(stageFromDeliveryFilter("pending")).toBe("uploads");
    expect(stageFromDeliveryFilter("undelivered")).toBe("review");
    expect(stageFromDeliveryFilter("delivered")).toBe("delivered");
    expect(stageFromDeliveryFilter(null)).toBe("review");
    expect(legacyOpsTarget({
      pathname: "/admin/delivery",
      search: "?filter=pending&foo=1",
      role: "admin",
    })).toBe(`${OPS_PATH}?filter=pending&foo=1&stage=uploads`);
    expect(legacyOpsTarget({
      pathname: "/admin/upload",
      search: "?job=job+1&polish=1",
      role: "coordinator",
    })).toBe(`${OPS_PATH}?job=job+1&polish=1&stage=uploads`);
    expect(legacyOpsTarget({
      pathname: "/admin/upload",
      search: "?job=abc&polish=1",
      role: "photographer",
    })).toBe("/admin/photographer?job=abc&polish=1");
    expect(legacyOpsTarget({
      pathname: "/admin/photographer",
      search: "?tab=pay",
      role: "admin",
    })).toBe(`${OPS_PATH}?tab=pay&stage=shoots`);
    expect(legacyOpsTarget({
      pathname: "/admin/photographer",
      search: "?tab=pay",
      role: "photographer",
    })).toBe("/admin/photographer?tab=pay");
  });
});

describe("photographer preview seed", () => {
  it("builds a demo portal without a live photographer", () => {
    const jobs = demoPhotographerJobs("2026-10-27");
    expect(isDemoPhotographer(DEMO_PHOTOGRAPHER_ID)).toBe(true);
    expect(isDemoPhotographer("")).toBe(true);
    expect(jobs.map((job) => job.id)).toEqual(expect.arrayContaining(["demo-today-shoot", "demo-editing-shoot"]));
    expect(jobs.some((job) => job.action.kind === "upload")).toBe(true);
    expect(JSON.stringify(jobs)).not.toMatch(/steven/i);
  });
});
