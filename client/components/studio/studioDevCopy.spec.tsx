import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { sampleStudioFrames } from "@shared/iconicStudio";
import type { StudioOrderTrayJob } from "@shared/studioOrderTray";
import IconicStudioWorkspace from "@/components/iconic-studio/IconicStudioWorkspace";
import StudioScratchPad, { type ScratchDeskMode } from "@/components/studio-scratch/StudioScratchPad";
import { StudioHomePanel, StudioMarketingPanel, StudioProjectsPanel } from "./StudioShell";

const DEV_NOTE = "TODO: OPENAI_API_KEY is set, but Iconic Studio does not call the images API in this version.";

const reviewJob: StudioOrderTrayJob = {
  id: "review-1",
  listingId: "job-1",
  status: "review",
  origin: "order",
  sourcePath: "listings/job-1/photos/front.jpg",
  resultPath: "listings/job-1/edits/front.jpg",
  label: "Front",
  note: DEV_NOTE,
  afterUrl: "https://example.com/after.jpg",
  placeholder: false,
  canApprove: true,
  canReject: true,
};

function shell(node: ReactElement) {
  return renderToString(<StaticRouter location="/admin/studio">{node}</StaticRouter>);
}

function scratch(mode: ScratchDeskMode) {
  return renderToString(
    <StudioScratchPad
      initialMode={mode}
      frames={[]}
      busy={false}
      progress=""
      grassReady={false}
      grassNote="Grass reference is missing."
      listingLabel="1234 Main Street"
      orderJobs={[reviewJob]}
      onAddFiles={() => undefined}
      onAddFloorplan={() => undefined}
      onSelect={() => undefined}
      onSelectAll={() => undefined}
      onClearSelection={() => undefined}
      onSort={() => undefined}
      onProcess={() => undefined}
      onStage={() => undefined}
      onCommitJpeg={() => undefined}
      onRevert={() => undefined}
      onDownload={() => undefined}
      onExport={() => undefined}
      onRemove={() => undefined}
    />,
  );
}

function assertNoDevCopy(html: string) {
  expect(html).not.toContain("TODO");
  expect(html).not.toContain("OPENAI_API_KEY");
}

describe("rendered studio surfaces", () => {
  it("does not show TODO or OPENAI_API_KEY", () => {
    for (const mode of ["upload", "edit", "studio", "staging"] as const) {
      const html = scratch(mode);
      assertNoDevCopy(html);
      expect(html).toContain('data-testid="scratch-order-approve-review-1"');
      expect(html).toContain('data-testid="scratch-order-reject-review-1"');
    }

    const workspace = renderToString(
      <IconicStudioWorkspace
        listings={[{ id: "sampledemo", address: "1234 Main Street", imageCount: 1 }]}
        jobs={[{
          id: "review-1",
          listingId: "sampledemo",
          origin: "order",
          type: "photo",
          label: "Front",
          status: "review",
          beforeUrl: "https://cdn.example/before.jpg",
          afterUrl: "https://cdn.example/after.jpg",
          placeholder: false,
          note: DEV_NOTE,
          sourcePath: "listings/sampledemo/photos/front.jpg",
          resultPath: "listings/sampledemo/photos/front-ai.jpg",
        }]}
        listingId="sampledemo"
        address="1234 Main Street"
        frames={sampleStudioFrames()}
        initialTab="ai"
        onSelectListing={() => undefined}
        onAiEdit={async () => undefined}
        onSaveAdjust={async () => undefined}
        onApprove={async () => undefined}
        onReject={async () => undefined}
      />,
    );
    assertNoDevCopy(workspace);
    expect(workspace).toContain("Approve final");
    expect(workspace).toContain("Reject");

    assertNoDevCopy(shell(<StudioHomePanel />));
    assertNoDevCopy(shell(<StudioProjectsPanel />));
    assertNoDevCopy(shell(<StudioMarketingPanel />));
  });
});
