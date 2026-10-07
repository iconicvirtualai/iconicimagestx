import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ICONIC_POLISH_TREATMENTS } from "@shared/orderEditPlan";
import { orderExteriorTwilightPrompt } from "@shared/orderEditPlan";
import StudioScratchPad, { type ScratchDeskMode, type ScratchFrameView } from "./StudioScratchPad";

const frames: ScratchFrameView[] = [
  {
    id: "front",
    name: "front.jpg",
    beforeUrl: "blob:front",
    status: "done",
    afterUrl: "blob:front-after",
    selected: true,
    focused: true,
    canRevert: true,
    editable: true,
  },
  {
    id: "yard",
    name: "yard.jpg",
    beforeUrl: "blob:yard",
    status: "ready",
    selected: false,
    focused: false,
    editable: true,
  },
];

function render(mode: ScratchDeskMode = "upload", grassReady = true) {
  return renderToString(
    <StudioScratchPad
      initialMode={mode}
      frames={frames}
      busy={false}
      progress=""
      grassReady={grassReady}
      grassNote={grassReady ? "Using the lawn reference at /studio/grass-reference.jpg." : "Grass reference is missing."}
      onAddFiles={() => undefined}
      onAddFloorplan={() => undefined}
      onSelect={() => undefined}
      onSelectAll={() => undefined}
      onClearSelection={() => undefined}
      onSort={() => undefined}
      onProcess={() => undefined}
      onCommitJpeg={() => undefined}
      onRevert={() => undefined}
      onDownload={() => undefined}
      onExport={() => undefined}
      onRemove={() => undefined}
    />,
  );
}

describe("scratch pad desk", () => {
  it("puts the filmstrip on the bottom and the mode switch on top", () => {
    const html = render();
    expect(html).toContain('data-layout="center-canvas bottom-filmstrip side-tools"');
    expect(html).toContain('data-position="bottom"');
    expect(html).toContain('data-testid="scratch-mode-upload"');
    expect(html).toContain('data-testid="scratch-mode-edit"');
    expect(html).toContain('data-testid="scratch-mode-studio"');
    expect(html).toContain('data-testid="scratch-mode-coordinator"');
    expect(html).not.toContain('data-testid="scratch-tab-basic"');
    expect(html).not.toContain("AI settings");
    expect(html).not.toContain("Add people");
    expect(html).not.toContain("This photo");
    expect(html).not.toContain("All photos in the set");
    expect(html).toContain("scrollbar-hide");
    expect(html).toContain('data-testid="scratch-check-front"');
    expect(html).toContain('data-testid="scratch-sort"');
    expect(html).toContain("Select all");
    expect(html).toContain("Nothing is added to an order or a gallery");
  });

  it("offers upload preferences, polish rules, and a note that Process sends", () => {
    const html = render("upload", true);
    expect(html).toContain('data-testid="scratch-pref-full-iconic"');
    expect(html).toContain('data-testid="scratch-pref-twilight"');
    expect(html).toContain('data-testid="scratch-pref-grass"');
    expect(html).toContain('data-testid="scratch-instruction-upload"');
    expect(html).toContain('data-testid="scratch-process"');
    expect(html).toContain("JPG · PNG · RAW · TIFF");
    for (const treatment of ICONIC_POLISH_TREATMENTS) expect(html).toContain(treatment);
    expect(html).toContain("classic packages");
    expect(html).not.toContain(orderExteriorTwilightPrompt());
    expect(html).not.toContain('data-testid="scratch-grass-preview"');
    expect(html).not.toContain("Using the lawn reference");
  });

  it("shows the manual adjustments, revert, and an instruction on Edit", () => {
    const html = render("edit");
    expect(html).toContain('data-testid="scratch-edit-tool-brush"');
    expect(html).toContain('data-testid="scratch-surface-whole"');
    expect(html).toContain('data-testid="scratch-look-exposure"');
    expect(html).toContain('data-testid="scratch-look-hue"');
    expect(html).toContain('data-testid="scratch-instruction-edit"');
    expect(html).toContain('data-testid="scratch-apply"');
    expect(html).toContain('data-testid="scratch-revert"');
    expect(html).toContain('data-testid="scratch-export"');
  });

  it("shows studio tools, sky options, floorplan branding, and a hidden grass file", () => {
    const html = render("studio", false);
    expect(html).toContain('data-testid="scratch-studio-sky"');
    expect(html).toContain('data-testid="scratch-studio-fire"');
    expect(html).toContain('data-testid="scratch-studio-floorplan"');
    expect(html).toContain('data-testid="scratch-sky-dramatic"');
    expect(html).toContain('data-testid="scratch-instruction-studio"');
    expect(html).not.toContain('data-testid="scratch-grass-preview"');
    const floor = renderToString(
      <StudioScratchPad
        initialMode="studio"
        initialStudioTool="floorplan"
        frames={frames}
        busy={false}
        progress=""
        grassReady={false}
        grassNote="Grass reference is missing."
        onAddFiles={() => undefined}
        onAddFloorplan={() => undefined}
        onSelect={() => undefined}
        onSelectAll={() => undefined}
        onClearSelection={() => undefined}
        onSort={() => undefined}
        onProcess={() => undefined}
        onCommitJpeg={() => undefined}
        onRevert={() => undefined}
        onDownload={() => undefined}
        onExport={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(floor).toContain('data-testid="scratch-floorplan-drop"');
    expect(floor).toContain("Replace Cubi footer");
    expect(floor).toContain("Grass reference is missing.");
  });
});
