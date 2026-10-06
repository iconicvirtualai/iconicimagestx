import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ICONIC_POLISH_TREATMENTS } from "@shared/orderEditPlan";
import { orderExteriorTwilightPrompt } from "@shared/orderEditPlan";
import StudioScratchPad, { type ScratchFrameView } from "./StudioScratchPad";

const TOOLS = [
  "Grass Replacement",
  "Twilight Conversions",
  "Driveway Clean Up",
  "Cord Removal",
  "Photographer Removal",
  "TV Screens Added",
  "Fire Added",
  "Landscaping",
  "Virtual Staging",
  "Remove clutter",
  "Iconic Polish",
];

const frames: ScratchFrameView[] = [
  {
    id: "front",
    name: "front.jpg",
    beforeUrl: "blob:front",
    status: "done",
    afterUrl: "blob:front-after",
    selected: true,
    focused: true,
    lastAction: "twilight",
    canRevert: true,
  },
  {
    id: "yard",
    name: "yard.jpg",
    beforeUrl: "blob:yard",
    status: "ready",
    selected: false,
    focused: false,
  },
];

function render(grassReady = false, withFrames = true) {
  return renderToString(
    <StudioScratchPad
      frames={withFrames ? frames : []}
      revision=""
      busy={false}
      progress=""
      grassReady={grassReady}
      grassNote={
        grassReady
          ? "Using the lawn reference at /studio/grass-reference.jpg."
          : "Grass reference is missing."
      }
      onRevision={() => undefined}
      onAddFiles={() => undefined}
      onSelect={() => undefined}
      onSort={() => undefined}
      onProcessSet={() => undefined}
      onProcessSelection={() => undefined}
      onApplyFinetune={async () => false}
      onRevertFinetune={() => undefined}
      onDownload={() => undefined}
      onExport={() => undefined}
      onRemove={() => undefined}
    />,
  );
}

describe("scratch pad view", () => {
  it("uses a full-bleed photo, a bottom filmstrip, and Adjust enhancement", () => {
    const html = render(true);
    expect(html).toContain(
      'data-layout="center-photo bottom-filmstrip right-panel"',
    );
    expect(html).toContain('data-testid="scratch-viewer"');
    expect(html).toContain('data-testid="scratch-filmstrip"');
    expect(html).toContain('data-position="bottom"');
    expect(html).toContain("scrollbar-hide");
    expect(html).not.toContain("lg:flex-col");
    expect(html).toContain('data-testid="scratch-frame-front"');
    expect(html).toContain('data-testid="scratch-check-front"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('data-testid="scratch-adjust"');
    expect(html).toContain("Adjust enhancement");
    expect(html).toContain('data-testid="scratch-tab-basic"');
    expect(html).toContain('data-testid="scratch-tab-advanced"');
    expect(html).toContain('data-testid="scratch-tab-finetune"');
    expect(html).toContain("Basic");
    expect(html).toContain("Advanced");
    expect(html).toContain("Fine-tune");
    expect(html).not.toContain("AI settings");
    expect(html).not.toContain("AI Settings");
    expect(html).toContain('data-testid="scratch-compare"');
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain('data-testid="scratch-actions"');
    expect(html).toContain('data-testid="scratch-delete"');
    expect(html).toContain("Export to…");
    expect(html).toContain("Gallery");
    expect(html).toContain("Dropbox");
    expect(html).toContain("Google Drive");
    expect(html).toContain('data-testid="scratch-download"');
    expect(html).not.toContain("Pay now");
    expect(html).not.toContain("Square");
    expect(html).not.toContain("Sky Replacement");
    expect(html).not.toContain("Back to Grid");
    expect(html).not.toContain("Add people");
    expect(html).not.toContain("This photo");
    expect(html).not.toContain("All photos in the set");
  });

  it("uses Basic, Advanced, and Fine-tune instead of AI settings", () => {
    const html = render(true);
    expect(html).toContain('data-testid="scratch-process-basic"');
    expect(html).toContain('data-testid="scratch-reprocess-basic"');
    expect(html).toContain(">Process<");
    expect(html).toContain(">Reprocess<");
    expect(html).toContain('data-testid="scratch-sort"');
    expect(html).toContain("Filename");
    expect(html).toContain("Date shot, oldest first");
    expect(html).toContain("Date shot, newest first");
    expect(html).toContain("Size, large to small");
    expect(html).toContain("Upload order");
    expect(html).not.toContain(orderExteriorTwilightPrompt());
    expect(html).toContain('data-testid="scratch-tool-grass"');
    expect(html).toContain('data-testid="scratch-tool-twilight"');
    expect(html).not.toContain('data-testid="scratch-grass-preview"');
    expect(html).not.toContain("Using the lawn reference");
    expect(html).toContain("$25 add-on");
    expect(html).toContain("classic packages");
    expect(html).toContain('data-testid="scratch-polish-rules"');
    for (const treatment of ICONIC_POLISH_TREATMENTS) {
      expect(html).toContain(treatment);
    }
    for (const label of TOOLS) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-testid="scratch-advanced-prompt"');
    expect(html).toContain('data-testid="scratch-process-advanced"');
    expect(html).toContain('data-testid="scratch-revert"');
    expect(html).toContain('data-testid="scratch-revision"');
    expect(html).not.toContain('data-testid="scratch-preset-add_people"');
    expect(html).toContain("Nothing is added to an order or a gallery");
  });

  it("explains a missing grass reference instead of showing a broken preview", () => {
    const html = render(false);
    expect(html).toContain("Grass reference is missing.");
    expect(html).not.toContain('data-testid="scratch-grass-preview"');
    expect(html).toContain("disabled");
  });

  it("hides delete, export, download, and sort until a set is ready", () => {
    const html = render(false, false);
    expect(html).toContain('data-testid="scratch-drop"');
    expect(html).not.toContain('data-testid="scratch-actions"');
    expect(html).not.toContain('data-testid="scratch-sort"');
    expect(html).toContain('data-position="bottom"');
    expect(html).toContain("Basic");
    expect(html).not.toContain("AI settings");
  });
});
