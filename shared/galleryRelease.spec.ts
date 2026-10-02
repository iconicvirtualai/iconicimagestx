import { describe, expect, it } from "vitest";
import { ORDER_GALLERY_RELEASE, planOrderEdits } from "./orderEditPlan";
import {
  assessGalleryRelease,
  galleryStatusNeedsReleaseGate,
  unlinkedGalleryRelease,
} from "./galleryRelease";

const showcase = planOrderEdits({ serviceIds: ["listing-showcase"] });

function photoJobs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    slot: `photo_${index}`,
    type: "photo",
    status: "approved",
    sourcePath: `listings/job123456/photos/photo-${index}.jpg`,
    resultPath: `listings/job123456/finals/photo-${index}.jpg`,
  }));
}

function showcaseCompleteEvidence() {
  return {
    jobs: [
      ...photoJobs(30),
      {
        slot: "twilight-front",
        type: "twilight",
        status: "approved",
        sourcePath: "listings/job123456/photos/front.jpg",
        resultPath: "listings/job123456/finals/front-twilight.jpg",
      },
      {
        slot: "twilight-back",
        type: "twilight",
        status: "approved",
        sourcePath: "listings/job123456/photos/rear.jpg",
        resultPath: "listings/job123456/finals/rear-twilight.jpg",
      },
    ],
    finals: Array.from({ length: 5 }, (_, index) => ({
      path: `listings/job123456/finals/aerial-${index}.jpg`,
      name: `aerial-${index}.jpg`,
    })),
    uploads: [],
    media: [
      { type: "reel", title: "Snap reel", fileName: "snap.mp4" },
      { type: "video", title: "Animated walk-through reel", fileName: "walk.mp4" },
      { type: "photo", title: "Floor plan", fileName: "floorplan.jpg" },
    ],
  };
}

describe("gallery release gate", () => {
  it("holds client delivery statuses and leaves review statuses open", () => {
    expect(galleryStatusNeedsReleaseGate("delivered")).toBe(true);
    expect(galleryStatusNeedsReleaseGate("approved")).toBe(true);
    expect(galleryStatusNeedsReleaseGate("ready_for_review")).toBe(false);
    expect(galleryStatusNeedsReleaseGate("editing")).toBe(false);
  });

  it("blocks Showcase until photos, twilights, aerials, and file deliverables are approved", () => {
    const report = assessGalleryRelease(showcase, { jobs: [], finals: [], uploads: [], media: [] });
    expect(report.galleryRelease).toBe(ORDER_GALLERY_RELEASE);
    expect(report.complete).toBe(false);
    expect(report.percent).toBe(0);
    expect(report.gaps.map((gap) => gap.id)).toEqual([
      "photos",
      "twilight",
      "aerials",
      "snap-reel",
      "animated-reel",
      "floorplan",
    ]);
    expect(report.gaps.find((gap) => gap.id === "photos")).toMatchObject({ required: 30, satisfied: 0 });
    expect(report.gaps.find((gap) => gap.id === "twilight")).toMatchObject({ required: 2, satisfied: 0 });
    expect(report.gaps.find((gap) => gap.id === "aerials")).toMatchObject({ required: 5, satisfied: 0 });
    expect(report.message).toMatch(/held until the order is 100%/i);
    expect(report.message).toMatch(/Photos \(0\/30\)/);
    expect(report.message).toMatch(/Twilight renders \(0\/2\)/);
    expect(report.message).toMatch(/5 aerial stills \(0\/5\)/);
    expect(report.message).toMatch(/Snap reel/);
    expect(report.message).toMatch(/Floor plan/);
    expect(report.message).not.toMatch(/Same-day/);
  });

  it("names a partial Showcase set and releases only at 100%", () => {
    const partial = assessGalleryRelease(showcase, {
      ...showcaseCompleteEvidence(),
      jobs: [
        ...photoJobs(25),
        { slot: "twilight-front", type: "twilight", status: "approved", sourcePath: "listings/job123456/photos/front.jpg" },
      ],
    });
    expect(partial.complete).toBe(false);
    expect(partial.message).toMatch(/Photos \(25\/30\)/);
    expect(partial.message).toMatch(/Twilight renders \(1\/2\)/);

    const done = assessGalleryRelease(showcase, showcaseCompleteEvidence());
    expect(done.complete).toBe(true);
    expect(done.percent).toBe(100);
    expect(done.gaps).toEqual([]);
    expect(done.message).toMatch(/100% complete/);
  });

  it("does not let one reel satisfy both video deliverables", () => {
    const report = assessGalleryRelease(showcase, {
      ...showcaseCompleteEvidence(),
      media: [
        { type: "reel", title: "Animated walk-through reel", fileName: "walk.mp4" },
        { type: "photo", title: "Floor plan", fileName: "floorplan.jpg" },
      ],
    });
    expect(report.gaps.map((gap) => gap.id)).toContain("snap-reel");
    expect(report.gaps.map((gap) => gap.id)).not.toContain("animated-reel");
    expect(report.complete).toBe(false);
  });

  it("requires every uploaded photo for Full Images and does not hold an order with no package", () => {
    const full = planOrderEdits({ services: ["Full Images", "Full Aerials"] });
    expect(full.photoScope).toBe("full");
    const report = assessGalleryRelease(full, {
      jobs: [{ slot: "photo_1", type: "photo", status: "approved", sourcePath: "listings/job123456/photos/living.jpg" }],
      finals: [],
      uploads: [
        { path: "listings/job123456/photos/living.jpg", name: "living.jpg" },
        { path: "listings/job123456/photos/kitchen.jpg", name: "kitchen.jpg" },
        { path: "listings/job123456/photos/aerial-front.jpg", name: "aerial-front.jpg" },
      ],
      media: [],
    });
    expect(report.complete).toBe(false);
    expect(report.gaps.find((gap) => gap.id === "photos")).toMatchObject({ required: 2, satisfied: 1 });
    expect(report.gaps.find((gap) => gap.id === "aerials")).toMatchObject({ required: 1, satisfied: 0 });

    const empty = assessGalleryRelease(planOrderEdits({ services: ["Photography"] }), {
      jobs: [],
      finals: [],
      uploads: [{ path: "listings/job123456/photos/living.jpg", name: "living.jpg" }],
      media: [],
    });
    expect(empty.complete).toBe(true);
    expect(empty.required).toBe(0);
    expect(unlinkedGalleryRelease().linked).toBe(false);
  });
});
