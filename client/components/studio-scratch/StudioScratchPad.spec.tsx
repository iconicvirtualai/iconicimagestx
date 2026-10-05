import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { orderExteriorTwilightPrompt } from "@shared/orderEditPlan";
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

function render(grassReady = false) {
  return renderToString(
    <StudioScratchPad
      frames={frames}
      prompt="Clear the glare"
      revision=""
      busy={false}
      progress=""
      grassReady={grassReady}
      grassNote={grassReady ? "Using the lawn reference at /studio/grass-reference.jpg." : "Grass reference is missing."}
      onPrompt={() => undefined}
      onRevision={() => undefined}
      onAddFiles={() => undefined}
      onSelect={() => undefined}
      onSelectAll={() => undefined}
      onRun={() => undefined}
      onDownload={() => undefined}
      onDownloadZip={() => undefined}
      onRemove={() => undefined}
    />,
  );
}

describe("scratch pad view", () => {
  it("shows the filmstrip, before and after, twilight, grass, and downloads", () => {
    const html = render(true);
    expect(html).toContain('data-testid="scratch-filmstrip"');
    expect(html).toContain('data-testid="scratch-frame-front"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('data-testid="scratch-compare"');
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain('data-testid="scratch-prompt"');
    expect(html).toContain('data-testid="scratch-revision"');
    expect(html).toContain('data-testid="scratch-twilight"');
    expect(html).toContain(orderExteriorTwilightPrompt());
    expect(html).toContain('data-testid="scratch-grass"');
    expect(html).toContain('data-testid="scratch-grass-preview"');
    expect(html).toContain('data-testid="scratch-download"');
    expect(html).toContain('data-testid="scratch-download-zip"');
    expect(html).toContain("Nothing is added to an order or a gallery");
    expect(html).not.toContain("Pay now");
    expect(html).not.toContain("Square");
  });

  it("explains a missing grass reference instead of showing a broken preview", () => {
    const html = render(false);
    expect(html).toContain("Grass reference is missing.");
    expect(html).not.toContain('data-testid="scratch-grass-preview"');
    expect(html).toContain("disabled");
  });
});
