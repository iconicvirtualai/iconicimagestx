/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { GalleryUploadBoard } from "./GalleryUploadBoard";

const project = {
  address: "801 River Road, The Woodlands, TX",
  mlsNumber: "2840193",
  images: [
    { id: "front", name: "front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" },
    { id: "kitchen", name: "kitchen.jpg", url: "https://cdn.example/kitchen.jpg", contentType: "image/jpeg", hiddenFromGallery: true },
  ],
  videos: [
    { id: "reel", name: "reel.mp4", url: "https://cdn.example/reel.mp4", contentType: "video/mp4", brandLabel: "branded", aspectLabel: "9:16" },
  ],
  tours: [
    { id: "branded-tour", name: "Matterport — Branded", url: "https://my.matterport.com/show/?m=abc", type: "tour", brandLabel: "branded" },
  ],
  floorplans: [
    { id: "plan", name: "Main level.png", url: "https://cdn.example/plan.png", contentType: "image/png", type: "floorplan" },
  ],
  files: [
    { id: "brochure", name: "brochure.pdf", url: "https://cdn.example/brochure.pdf", contentType: "application/pdf" },
  ],
};

function mount(tab = 0) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const saved: unknown[] = [];
  act(() => {
    root.render(
      <GalleryUploadBoard
        project={project}
        userId="staff-1"
        activeTab={tab}
        onTab={() => undefined}
        onSaveArrangement={(arrangement) => { saved.push(arrangement); }}
        onPatch={() => undefined}
      />,
    );
  });
  return {
    container,
    saved,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("gallery upload board", () => {
  it("shows the shared tabs and a hidden photo in the archived group", () => {
    const view = mount(0);
    expect(view.container.textContent).toContain("Photos");
    expect(view.container.textContent).toContain("Videos / Reels");
    expect(view.container.textContent).toContain("Floorplans");
    expect(view.container.textContent).toContain("Listing Kit");
    expect(view.container.querySelector('[data-testid="gallery-archived"]')?.textContent).toContain("kitchen.jpg");
    expect(view.container.querySelector('[data-testid="gallery-show-hidden"]')?.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      (view.container.querySelector('[data-testid="gallery-show-hidden"]') as HTMLButtonElement).click();
    });
    expect(view.container.querySelector('[data-testid="gallery-archived"]')).toBeNull();
    expect(view.container.textContent).not.toContain("kitchen.jpg");
    view.unmount();
  });

  it("blocks a video upload until the name and brand are set, and lists coming soon sources", () => {
    const view = mount(1);
    act(() => {
      (view.container.querySelector('[data-testid="gallery-add-media"]') as HTMLButtonElement).click();
    });
    const menu = view.container.querySelector('[data-testid="gallery-add-menu"]')?.textContent || "";
    expect(menu).toContain("From device");
    expect(menu).toContain("From link");
    expect(menu).toContain("Coming soon");
    expect(menu).toContain("From Dropbox");
    expect(menu).toContain("Google Drive");
    act(() => {
      const link = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "From link");
      link?.click();
    });
    expect(view.container.querySelector('[data-testid="video-upload-blocked"]')?.textContent).toContain("required");
    const go = view.container.querySelector('[data-testid="video-upload-go"]') as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(go.textContent).toContain("blocked");
    view.unmount();
  });

  it("asks for a delete count and shows a drag ghost", () => {
    const view = mount(0);
    const front = view.container.querySelector('[data-media-id="front"]') as HTMLElement;
    act(() => {
      front.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 2, clientY: 2 }));
    });
    act(() => {
      (view.container.querySelector('[data-testid="gallery-bulk-delete"]') as HTMLButtonElement).click();
    });
    expect(view.container.textContent).toContain("Delete 1 item?");
    view.unmount();

    const drag = mount(0);
    const tile = drag.container.querySelector('[data-media-id="front"]') as HTMLElement;
    act(() => {
      tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 80, clientY: 40 }));
    });
    const ghost = document.querySelector('[data-testid="drag-ghost"]');
    expect(ghost?.textContent).toContain("front.jpg");
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 80, clientY: 40 }));
    });
    expect(document.querySelector('[data-testid="drag-ghost"]')).toBeNull();
    drag.unmount();
  });

  it("renders listing kit slots empty and keeps the property address", () => {
    const view = mount(5);
    expect(view.container.textContent).toContain("Property Address");
    expect(view.container.textContent).toContain("801 River Road, The Woodlands, TX");
    expect(view.container.textContent).toContain("Not generated yet");
    expect(view.container.textContent).toContain("Neighborhood info");
    expect(view.container.textContent).toContain("Crime rate");
    expect(view.container.textContent).toContain("brochure.pdf");
    expect(view.container.textContent).not.toContain("12%");
    expect(view.container.textContent).not.toContain("ExxonMobil");
    view.unmount();
  });
});
