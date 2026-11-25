import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { StudioDeskLinks } from "./StudioShell";

function render(node: ReactElement) {
  return renderToString(<StaticRouter location="/admin/studio">{node}</StaticRouter>);
}

describe("studio desk links", () => {
  it("keeps delivery and client projects inside Studio", () => {
    const html = render(<StudioDeskLinks />);
    expect(html).toContain('data-testid="studio-desk-links"');
    expect(html).toContain('data-testid="studio-pathway-delivery"');
    expect(html).toContain('data-testid="studio-pathway-listings"');
    expect(html).toContain('href="/admin/delivery"');
    expect(html).toContain('href="/admin/listings"');
    expect(html).not.toContain("Marketing kits");
    expect(html).not.toContain("Not wired");
    expect(html).not.toContain("Aryeo");
  });
});
