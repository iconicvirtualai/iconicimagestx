import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { STUDIO_SCRATCH_PATH } from "@shared/studioScratch";
import { StudioHomePanel, StudioMarketingPanel, StudioProjectsPanel } from "./StudioShell";

function render(node: ReactElement) {
  return renderToString(<StaticRouter location="/admin/studio">{node}</StaticRouter>);
}

describe("studio shell", () => {
  it("shows one home with photo editing, projects, and marketing kits", () => {
    const html = render(<StudioHomePanel />);
    expect(html).toContain('data-testid="studio-home"');
    expect(html).toContain('data-testid="studio-section-editing"');
    expect(html).toContain('data-testid="studio-section-projects"');
    expect(html).toContain('data-testid="studio-section-marketing"');
    expect(html).toContain("Photo editing");
    expect(html).toContain("Projects");
    expect(html).toContain("Marketing kits");
    expect(html).toContain(`href="${STUDIO_SCRATCH_PATH}"`);
    expect(html).toContain('href="/admin/studio/projects"');
    expect(html).toContain('href="/admin/studio/marketing"');
    expect(html).not.toContain("Aryeo");
  });

  it("keeps project handoff on delivery and client projects", () => {
    const html = render(<StudioProjectsPanel />);
    expect(html).toContain('data-testid="studio-pathway-delivery"');
    expect(html).toContain('data-testid="studio-pathway-listings"');
    expect(html).toContain('href="/admin/delivery"');
    expect(html).toContain('href="/admin/listings"');
    expect(html).toContain("download hold");
  });

  it("leaves marketing kits as a placeholder", () => {
    const html = render(<StudioMarketingPanel />);
    expect(html).toContain("Marketing kits are not wired yet");
    expect(html).toContain('data-testid="studio-kit-social"');
    expect(html).toContain('data-testid="studio-kit-listing-sites"');
    expect(html).toContain('data-testid="studio-kit-extras"');
    expect(html).toContain("Not wired");
  });
});
