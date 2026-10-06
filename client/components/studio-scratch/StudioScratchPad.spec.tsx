import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { orderExteriorTwilightPrompt } from "@shared/orderEditPlan";
import { AI_EDIT_PRESETS } from "@shared/iconicStudio";
import StudioScratchPad, { type ScratchFrameView } from "./StudioScratchPad";

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
  },
  {
    id: "yard",
    name: "yard.jpg",
    beforeUrl: "blob:yard",
    status: "ready",
    selected: true,
    focused: false,
  },
];

function render(grassReady = false, withFrames = true) {
  return renderToString(
    <StudioScratchPad
      frames={withFrames ? frames : []}
      prompt="Clear the glare"
      revision=""
      busy={false}
      progress=""
      grassReady={grassReady}
      grassNote={
        grassReady
          ? "Using the lawn reference at /studio/grass-reference.jpg."
          : "Grass reference is missing."
      }
      onPrompt={() => undefined}
      onRevision={() => undefined}
      onAddFiles={() => undefined}
      onSelect={() => undefined}
      onRun={() => undefined}
      onApplyPreset={() => undefined}
      onApplyFinetune={async () => false}
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
    expect(html).not.toContain("lg:flex-col");
    expect(html).toContain('data-testid="scratch-frame-front"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('data-testid="scratch-adjust"');
    expect(html).toContain("Adjust enhancement");
    expect(html).toContain("AI settings");
    expect(html).toContain("Finetune");
    expect(html).toContain("Presets");
    expect(html).toContain('data-testid="scratch-section-ai"');
    expect(html).toContain('data-testid="scratch-section-finetune"');
    expect(html).toContain('data-testid="scratch-section-presets"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-testid="scratch-compare"');
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain('data-testid="scratch-actions"');
    expect(html).toContain('data-testid="scratch-delete"');
    expect(html).toContain("Export to…");
    expect(html).toContain('data-testid="scratch-export-gallery"');
    expect(html).toContain("Gallery");
    expect(html).toContain("Dropbox");
    expect(html).toContain("Google Drive");
    expect(html).toContain('data-testid="scratch-download"');
    expect(html).toContain('data-testid="scratch-download-zip"');
    expect(html).not.toContain("Pay now");
    expect(html).not.toContain("Square");
    expect(html).not.toContain("Sky Replacement");
    expect(html).not.toContain("Auto Privacy");
    expect(html).not.toContain("Back to Grid");
  });

  it("keeps command, grass, twilight, revision, and presets as separate apply scopes", () => {
    const html = render(true);
    expect(html).toContain('data-testid="scratch-prompt"');
    expect(html).toContain('data-testid="scratch-scope-edit"');
    expect(html).toContain('data-testid="scratch-revision"');
    expect(html).toContain('data-testid="scratch-scope-revise"');
    expect(html).toContain('data-testid="scratch-twilight"');
    expect(html).toContain('data-testid="scratch-scope-twilight"');
    expect(html).toContain(orderExteriorTwilightPrompt());
    expect(html).toContain('data-testid="scratch-grass"');
    expect(html).toContain('data-testid="scratch-scope-grass"');
    expect(html).toContain('data-testid="scratch-grass-preview"');
    expect(html).toContain('data-testid="scratch-scope-finetune"');
    expect(html).toContain("This photo");
    expect(html).toContain("All photos in the set");
    for (const preset of AI_EDIT_PRESETS) {
      if (preset.id === "free_text" || preset.id === "twilight") continue;
      expect(html).toContain(`data-testid="scratch-preset-${preset.id}"`);
      expect(html).toContain(`data-testid="scratch-scope-preset-${preset.id}"`);
    }
    expect(html).toContain('data-testid="scratch-preset-iconic_polish"');
    expect(html).toContain("Nothing is added to an order or a gallery");
    const scopes = html.split("This photo").length - 1;
    expect(scopes).toBeGreaterThanOrEqual(6);
  });

  it("explains a missing grass reference instead of showing a broken preview", () => {
    const html = render(false);
    expect(html).toContain("Grass reference is missing.");
    expect(html).not.toContain('data-testid="scratch-grass-preview"');
    expect(html).toContain("disabled");
  });

  it("hides delete, export, and download until a set is ready", () => {
    const html = render(false, false);
    expect(html).toContain('data-testid="scratch-drop"');
    expect(html).not.toContain('data-testid="scratch-actions"');
    expect(html).toContain('data-position="bottom"');
    expect(html).toContain("Adjust enhancement");
  });
});
