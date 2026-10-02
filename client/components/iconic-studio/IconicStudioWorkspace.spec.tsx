import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import IconicStudioWorkspace from "./IconicStudioWorkspace";
import { sampleStudioFrames } from "@shared/iconicStudio";
import { assessGalleryRelease } from "@shared/galleryRelease";
import { planOrderEdits } from "@shared/orderEditPlan";

describe("Iconic Studio staff shell", () => {
  it("renders the filmstrip, preview, and four tool tabs", () => {
    const html = renderToString(
      <IconicStudioWorkspace
        listings={[{ id: "sampledemo", address: "100 Sample Lane", imageCount: 2 }]}
        jobs={[]}
        listingId="sampledemo"
        address="100 Sample Lane"
        frames={sampleStudioFrames()}
        demo
        onSelectListing={() => undefined}
        onAiEdit={async () => undefined}
        onSaveAdjust={async () => undefined}
        onApprove={async () => undefined}
      />,
    );
    expect(html).toContain("Iconic Studio tools");
    expect(html).toContain("Adjust");
    expect(html).toContain("AI");
    expect(html).toContain("Brand");
    expect(html).toContain("Gallery");
    expect(html).toContain("studio-filmstrip");
    expect(html).toContain("studio-preview");
    expect(html).toContain("living-room.jpg");
    expect(html).toContain("RAW");
    expect(html).toContain("Agents: later");
  });

  it("shows the order plan and a real after image without the placeholder todo", () => {
    const html = renderToString(
      <IconicStudioWorkspace
        listings={[{ id: "sampledemo", address: "100 Sample Lane", imageCount: 1 }]}
        jobs={[{
          id: "job-1",
          listingId: "sampledemo",
          origin: "order",
          type: "twilight",
          label: "Twilight · front",
          status: "review",
          beforeUrl: "https://cdn.example/before.jpg",
          afterUrl: "https://cdn.example/after.jpg",
          placeholder: false,
          note: "OpenAI edit is ready for review.",
          sourcePath: "listings/sampledemo/photos/front.jpg",
          resultPath: "listings/sampledemo/photos/front-ai.jpg",
        }]}
        listingId="sampledemo"
        address="100 Sample Lane"
        frames={sampleStudioFrames()}
        editPlan={planOrderEdits({ serviceIds: ["listing-showcase"] })}
        initialTab="ai"
        onSelectListing={() => undefined}
        onAiEdit={async () => undefined}
        onRunOrder={async () => undefined}
        onSaveAdjust={async () => undefined}
        onApprove={async () => undefined}
        onReject={async () => undefined}
      />,
    );
    expect(html).toContain("Order edits");
    expect(html).toContain("The Showcase");
    expect(html).toContain("Staff override");
    expect(html).toContain("Run next order edit");
    expect(html).toContain("auto-queue");
    expect(html).toContain("https://cdn.example/after.jpg");
    expect(html).toContain("Approve final");
    expect(html).toContain("Reject");
    expect(html).not.toContain("TODO");
    expect(html).not.toContain("After · placeholder");
  });

  it("shows the gallery gate and the missing package counts", () => {
    const plan = planOrderEdits({ serviceIds: ["listing-showcase"] });
    const release = assessGalleryRelease(plan, { jobs: [], finals: [], uploads: [], media: [] });
    const html = renderToString(
      <IconicStudioWorkspace
        listings={[{ id: "sampledemo", address: "100 Sample Lane", imageCount: 1 }]}
        jobs={[]}
        listingId="sampledemo"
        address="100 Sample Lane"
        frames={sampleStudioFrames()}
        editPlan={plan}
        release={release}
        initialTab="gallery"
        onSelectListing={() => undefined}
        onAiEdit={async () => undefined}
        onSaveAdjust={async () => undefined}
        onApprove={async () => undefined}
      />,
    );
    expect(html).toContain("studio-gallery-gate");
    expect(html).toContain("Photos (0/50)");
    expect(html).toContain("Twilight renders (0/2)");
    expect(html).toContain("5 aerial stills (0/5)");
    expect(html).toContain("held until the order is 100%");
  });
});
