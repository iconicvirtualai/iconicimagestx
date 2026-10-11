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
  it("shows every owner label on one line at a narrow width", () => {
    const html = row(ownerTabs);
    expect(html).toContain('data-testid="studio-gallery-tabs"');
    for (const label of ["Photos", "Videos", "Tours", "Revisions", "AI Tools"]) {
      expect(html).toContain(label);
    }
    const buttons = html.match(/<button\b[^>]*>/g) || [];
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button).toContain("whitespace-nowrap");
    }
    const container = html.match(/<div\b[^>]*data-testid="studio-gallery-tabs"[^>]*>/)?.[0] || "";
    expect(container).toContain("flex-wrap");
    expect(container).toContain("gap-x-3");
    expect(container).not.toContain("overflow-x-auto");
    expect(container).not.toContain("overflow-x-scroll");
    expect(html).toContain("sm:tracking-widest");
    expect(html).toContain("sm:gap-6");
    const beforeTabs = html.slice(0, html.indexOf('data-testid="studio-gallery-tabs"'));
    expect(beforeTabs).not.toContain("overflow-hidden");
    expect(beforeTabs).not.toContain("overflow-x-hidden");
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
