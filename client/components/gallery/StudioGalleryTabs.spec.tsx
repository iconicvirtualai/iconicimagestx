import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StudioGalleryTabs, type StudioGalleryTab } from "./StudioGalleryTabs";

const ownerTabs: StudioGalleryTab[] = [
  { id: "photos", label: "Photos", count: 4 },
  { id: "videos", label: "Videos", count: 2 },
  { id: "tours", label: "Tours", count: 2 },
  { id: "revisions", label: "Revisions", count: 1 },
  { id: "ai_studio", label: "AI Tools", count: 0 },
];

function row(tabs: StudioGalleryTab[]) {
  return renderToString(
    <StudioGalleryTabs active="photos" tabs={tabs} onChange={() => undefined} />,
  );
}

describe("studio gallery tabs", () => {
  it("keeps each label on one line and scrolls the tab row", () => {
    const html = row(ownerTabs);
    expect(html).toContain('data-testid="studio-gallery-tabs"');
    expect(html).toContain("overflow-x-auto");
    for (const label of ["Photos", "Videos", "Tours", "Revisions", "AI Tools"]) {
      expect(html).toContain(label);
    }
    const buttons = html.match(/<button\b[^>]*>/g) || [];
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button).toContain("whitespace-nowrap");
      expect(button).toContain("shrink-0");
    }
  });

  it("renders only the tabs it is given", () => {
    const html = row(ownerTabs.slice(0, 3));
    expect(html).toContain("Photos");
    expect(html).toContain("Videos");
    expect(html).toContain("Tours");
    expect(html).not.toContain("Revisions");
    expect(html).not.toContain("AI Tools");
    expect(html.match(/<button\b/g)).toHaveLength(3);
  });
});
