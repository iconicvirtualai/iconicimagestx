import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { midRenderPreview } from "@shared/studioProjects";
import { MyProjectsPanel, StudioJobIndicator } from "./MyProjectsPanel";

describe("My Projects", () => {
  it("shows thumbnail, status, progress, time, and owner actions while a render is active", () => {
    const preview = midRenderPreview(1_700_000_000_000);
    const html = renderToString(
      <StaticRouter location="/admin/my-projects">
        <MyProjectsPanel
          jobs={preview.jobs}
          projects={[preview.project]}
          viewerUid="temp-admin-uid"
          now={1_700_000_120_000}
          onRetry={() => undefined}
          onDownload={() => undefined}
        />
      </StaticRouter>,
    );
    expect(html).toContain('data-testid="my-projects-page"');
    expect(html).toContain("font-family:Inter, ui-sans-serif, system-ui, sans-serif");
    expect(html).toContain("living-room.jpg");
    expect(html).toContain("Rendering");
    expect(html).toContain("64%");
    expect(html).toContain("Uploading");
    expect(html).toContain('data-testid="retry-preview-failed"');
    expect(html).toContain('data-testid="download-preview-done"');
    expect(html).not.toContain('data-testid="retry-preview-render"');
    expect(html).not.toContain('data-testid="download-preview-upload"');
    expect(html).toContain("/admin/studio/scratch?studioProject=preview-project");
    expect(html).toContain("Scratch pad");
  });

  it("hides another person's outputs", () => {
    const preview = midRenderPreview(1_700_000_000_000);
    const html = renderToString(
      <StaticRouter location="/admin/my-projects">
        <MyProjectsPanel
          jobs={preview.jobs}
          projects={[preview.project]}
          viewerUid="someone-else"
          now={1_700_000_120_000}
          onRetry={() => undefined}
          onDownload={() => undefined}
        />
      </StaticRouter>,
    );
    expect(html).not.toContain("living-room.jpg");
    expect(html).not.toContain('data-testid="download-preview-done"');
    expect(html).toContain("No projects yet");
  });

  it("shows the active job count on the header indicator", () => {
    const html = renderToString(
      <StaticRouter location="/admin/dashboard">
        <StudioJobIndicator count={2} />
      </StaticRouter>,
    );
    expect(html).toContain('data-testid="my-projects-indicator"');
    expect(html).toContain(">2<");
    expect(html).toContain('href="/admin/my-projects"');
    expect(html).toContain("2 active studio jobs");
  });
});
