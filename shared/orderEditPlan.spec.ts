import { describe, expect, it } from "vitest";
import {
  ORDER_GALLERY_RELEASE,
  orderEditDocId,
  orderEditDrafts,
  planOrderEdits,
} from "./orderEditPlan";

const frames = [
  { name: "living-room.jpg", path: "listings/job123456/photos/living-room.jpg", url: "https://cdn.example/living.jpg" },
  { name: "front-elevation.jpg", path: "listings/job123456/photos/front-elevation.jpg", url: "https://cdn.example/front.jpg" },
  { name: "rear-yard.jpg", path: "listings/job123456/photos/rear-yard.jpg", url: "https://cdn.example/rear.jpg" },
  { name: "frame.CR2", path: "listings/job123456/raw/frame.CR2", url: "", raw: true, previewable: false },
];

describe("order edit plan", () => {
  it("reads Showcase from the catalog, including two twilight slots", () => {
    const plan = planOrderEdits({ serviceIds: ["listing-showcase"] });
    expect(plan.packageName).toBe("The Showcase");
    expect(plan.photoCount).toBe(30);
    expect(plan.photoScope).toBe("count");
    expect(plan.deliverables.find((item) => item.id === "aerials")?.count).toBe(5);
    expect(plan.twilight.map((slot) => slot.role)).toEqual(["front", "back"]);
    expect(plan.twilight[0].prompt).toMatch(/front exterior/i);
    expect(plan.twilight[1].prompt).toMatch(/rear exterior/i);
    expect(plan.deliverables.map((item) => item.id)).toEqual([
      "aerials",
      "snap-reel",
      "animated-reel",
      "floorplan",
      "same-day",
    ]);
    expect(plan.deliverables.find((item) => item.id === "aerials")?.label).toBe("5 aerial stills");
    expect(plan.galleryRelease).toBe(ORDER_GALLERY_RELEASE);
    expect(plan.iconicPolish).toBe(false);
    expect(plan.photoPrompt).not.toMatch(/Iconic Polish/);
    expect(plan.notes.join(" ")).toMatch(/does not send/i);
  });

  it("locks Showcase at 30 photos when the catalog feature still says 50 images", () => {
    const fromCatalog = planOrderEdits({ serviceIds: ["listing-showcase"] });
    const fromName = planOrderEdits({ services: ["The Showcase"] });
    expect(fromCatalog.photoCount).toBe(30);
    expect(fromName.photoCount).toBe(30);
    const customFifty = planOrderEdits({ services: ["50 Images"] });
    expect(customFifty.photoCount).toBe(50);
    expect(customFifty.packageName).not.toBe("The Showcase");
  });

  it("accepts an order line written as twilight images and does not double-count the package", () => {
    const plan = planOrderEdits({
      lineItems: [
        { id: "listing-showcase", name: "The Showcase" },
        { name: "2 Twilight Images (Front/Back)" },
      ],
    });
    expect(plan.twilight).toHaveLength(2);
  });

  it("turns Iconic Polish on from the upload flag or an Iconic Finish line", () => {
    const flagged = planOrderEdits({
      services: ["35 Photos"],
      iconicPolish: true,
    });
    expect(flagged.iconicPolish).toBe(true);
    expect(flagged.photoPrompt).toMatch(/fireplace/i);
    expect(flagged.photoPrompt).toMatch(/driveway/i);

    const ordered = planOrderEdits({
      lineItems: [{ id: "iconic-finish", name: "Iconic Finish (Premium Upgrade)" }],
    });
    expect(ordered.polishFromOrder).toBe(true);
    expect(ordered.iconicPolish).toBe(true);
  });

  it("assigns front and back exteriors and leaves interiors waiting", () => {
    const plan = planOrderEdits({
      lineItems: [{ name: "2 Twilight Images (Front/Back)" }, { name: "30 Photos" }],
    });
    const drafts = orderEditDrafts(plan, frames);
    const front = drafts.find((draft) => draft.slot === "twilight-front");
    const back = drafts.find((draft) => draft.slot === "twilight-back");
    expect(front?.sourcePath).toContain("front-elevation");
    expect(back?.sourcePath).toContain("rear-yard");
    expect(drafts.some((draft) => draft.type === "twilight" && draft.sourcePath.includes("living-room"))).toBe(false);
    expect(drafts.some((draft) => draft.sourcePath.includes("frame.CR2"))).toBe(false);
    expect(drafts.filter((draft) => draft.type === "photo")).toHaveLength(3);
    expect(orderEditDocId("job123456", "twilight-front")).toBe("order_job123456_twilight-front");
  });

  it("does not invent a twilight source when no exterior filename matches", () => {
    const plan = planOrderEdits({ services: ["1 Iconic Twilight Render"] });
    const [draft] = orderEditDrafts(plan, [frames[0]]);
    expect(draft.sourcePath).toBe("");
    expect(draft.waitingNote).toMatch(/front exterior/i);
    expect(draft.waitingNote).toMatch(/not asked to pick/i);
  });
});
