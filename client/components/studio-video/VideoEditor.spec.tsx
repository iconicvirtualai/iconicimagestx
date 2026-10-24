import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { VideoEditor } from "./VideoEditor";

describe("video editor screen", () => {
  it("shows the template gallery, timeline, export dialog, and gallery picker", () => {
    const gallery = renderToString(<VideoEditor editorEnabled templatesEnabled />);
    expect(gallery).toContain('data-testid="studio-video-editor"');
    expect(gallery).toContain('data-testid="template-card-glamping_whip_tour"');
    expect(gallery).toContain('data-testid="template-card-social_teaser_15"');
    expect(gallery).toContain("Drop clips");
    expect(gallery).toContain("Dropbox");
    expect(gallery).toContain("Google Drive");

    const template = renderToString(
      <VideoEditor editorEnabled templatesEnabled initialTemplateId="glamping_whip_tour" />,
    );
    expect(template).toContain('data-testid="template-editor"');
    expect(template).toContain('data-testid="slot-card-s01"');
    expect(template).toContain("Aerial establishing");

    const timeline = renderToString(<VideoEditor editorEnabled templatesEnabled initialMode="timeline" />);
    expect(timeline).toContain('data-testid="timeline-editor"');
    expect(timeline).toContain('data-testid="track-v1"');
    expect(timeline).toContain("speed ramp");

    const dialogs = renderToString(
      <VideoEditor editorEnabled templatesEnabled forceExport forceGallery initialMode="timeline" />,
    );
    expect(dialogs).toContain('data-testid="export-dialog"');
    expect(dialogs).toContain('data-testid="export-preset-mls"');
    expect(dialogs).toContain('data-testid="export-preset-instagram_reel"');
    expect(dialogs).toContain('data-testid="gallery-picker"');
    expect(dialogs).toContain("does not email or text the client");
  });

  it("stays quiet when the editor flag is off", () => {
    const html = renderToString(<VideoEditor editorEnabled={false} />);
    expect(html).toContain("Video editor is off in this environment");
    expect(html).not.toContain('data-testid="template-card-glamping_whip_tour"');
  });
});
