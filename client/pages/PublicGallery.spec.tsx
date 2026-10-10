import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PublicGalleryMissing, PUBLIC_GALLERY_MISSING_COPY } from "./PublicGallery";

const INTERNAL = /fotello|collection|firestore/i;

function visibleText(html: string): string {
  return html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("public gallery not-found state", () => {
  it("renders Iconic copy and a portal link with no internal strings", () => {
    const html = visibleText(renderToString(
      <MemoryRouter>
        <PublicGalleryMissing />
      </MemoryRouter>,
    ));

    expect(html).toContain("Iconic Images");
    expect(html).toContain("Gallery not found");
    expect(html).toContain(PUBLIC_GALLERY_MISSING_COPY);
    expect(html).toContain('href="/portal"');
    expect(html).toContain("Sign in to your portal");
    expect(html).toContain("photos@iconicimagestx.com");
    expect(html).toContain("281.356.0965");
    expect(html).toContain('data-gallery-state="missing"');
    expect(html).not.toMatch(INTERNAL);
    expect(html).not.toContain("qa-nonexistent-gallery");
  });

  it("does not render resolver or API error text on the gallery page", () => {
    const source = readFileSync(new URL("./PublicGallery.tsx", import.meta.url), "utf8");
    expect(source).toContain("<PublicGalleryMissing />");
    expect(source).toContain("GalleryDownloadLockNotice");
    expect(source).not.toContain("link.message");
    expect(source).not.toContain("data.error");
    expect(source).not.toContain("data.message");
    expect(source).not.toMatch(INTERNAL);
  });
});
