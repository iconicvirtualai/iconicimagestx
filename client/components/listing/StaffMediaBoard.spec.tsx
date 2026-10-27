/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { collectArrangementMedia, readMediaArrangement } from "@shared/mediaArrangement";
import { StaffMediaBoard } from "./StaffMediaBoard";

const listing = {
  address: "123 Main St, Spring, TX",
  images: [
    { id: "front", name: "front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" },
    { id: "kitchen", name: "kitchen.jpg", url: "https://cdn.example/kitchen.jpg", contentType: "image/jpeg" },
    { id: "yard", name: "yard.jpg", url: "https://cdn.example/yard.jpg", contentType: "image/jpeg" },
  ],
  videos: [
    { id: "walkthrough", name: "walkthrough.mp4", url: "https://cdn.example/walkthrough.mp4", contentType: "video/mp4" },
  ],
  tours: [
    { id: "matterport", name: "3D tour", url: "https://my.matterport.com/show/?m=abc12345", type: "tour" },
  ],
};

function mount(onSave: (arrangement: ReturnType<typeof readMediaArrangement>) => void = () => undefined) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const media = collectArrangementMedia(listing);
  act(() => {
    root.render(
      <StaffMediaBoard
        userId="staff-1"
        address={listing.address}
        media={media}
        arrangement={readMediaArrangement(null)}
        onSave={onSave}
      />,
    );
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function pointer(target: Element, type: string, init: PointerEventInit = {}) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...init }));
}

describe("staff media board", () => {
  it("selects with click, shift-click, command-click, and select all", () => {
    const view = mount();
    const front = view.container.querySelector('[data-testid="staff-media-front"]') as HTMLElement;
    const kitchen = view.container.querySelector('[data-testid="staff-media-kitchen"]') as HTMLElement;
    const yard = view.container.querySelector('[data-testid="staff-media-yard"]') as HTMLElement;
    act(() => {
      pointer(front, "pointerdown", { clientX: 0, clientY: 0 });
      pointer(window as unknown as Element, "pointerup", { clientX: 1, clientY: 1 });
    });
    expect(front.getAttribute("data-selected")).toBe("true");
    expect(kitchen.getAttribute("data-selected")).toBe("false");

    act(() => {
      pointer(yard, "pointerdown", { clientX: 0, clientY: 0 });
      pointer(window as unknown as Element, "pointerup", { clientX: 1, clientY: 1, shiftKey: true });
    });
    expect(front.getAttribute("data-selected")).toBe("true");
    expect(kitchen.getAttribute("data-selected")).toBe("true");
    expect(yard.getAttribute("data-selected")).toBe("true");

    act(() => {
      pointer(kitchen, "pointerdown", { clientX: 0, clientY: 0 });
      pointer(window as unknown as Element, "pointerup", { clientX: 1, clientY: 1, metaKey: true });
    });
    expect(kitchen.getAttribute("data-selected")).toBe("false");
    expect(yard.getAttribute("data-selected")).toBe("true");

    act(() => {
      (view.container.querySelector('[data-testid="staff-media-select-all"]') as HTMLButtonElement).click();
    });
    expect(view.container.querySelectorAll('[data-selected="true"]').length).toBe(5);
    expect(view.container.querySelector('[data-testid="staff-media-save-state"]')?.textContent).toBe("Saved");
    view.unmount();
  });

  it("drags a selection with a mouse pointer and with touch", () => {
    const view = mount();
    const front = view.container.querySelector('[data-testid="staff-media-front"]') as HTMLElement;
    const yard = view.container.querySelector('[data-testid="staff-media-yard"]') as HTMLElement;
    act(() => {
      pointer(front, "pointerdown", { clientX: 0, clientY: 0, pointerType: "mouse" });
      pointer(yard, "pointermove", { clientX: 40, clientY: 0, pointerType: "mouse" });
      pointer(window as unknown as Element, "pointerup", { clientX: 40, clientY: 0, pointerType: "mouse" });
    });
    const names = [...view.container.querySelectorAll('[data-testid="staff-sequence-names"] li')].map((item) => item.getAttribute("data-testid"));
    expect(names[0]).toBe("staff-sequence-kitchen");

    const walk = view.container.querySelector('[data-testid="staff-media-walkthrough"]') as HTMLElement;
    const kitchen = view.container.querySelector('[data-testid="staff-media-kitchen"]') as HTMLElement;
    act(() => {
      pointer(walk, "pointerdown", { clientX: 0, clientY: 0, pointerType: "touch" });
      pointer(kitchen, "pointermove", { clientX: 48, clientY: 4, pointerType: "touch" });
      pointer(window as unknown as Element, "pointerup", { clientX: 48, clientY: 4, pointerType: "touch" });
    });
    const afterTouch = [...view.container.querySelectorAll('[data-testid="staff-sequence-names"] li')].map((item) => item.getAttribute("data-testid"));
    expect(afterTouch[0]).toBe("staff-sequence-walkthrough");
    expect(view.container.querySelector('[data-testid="staff-media-save-state"]')?.textContent).toBe("Unsaved changes");
    view.unmount();
  });

  it("remembers the thumbnail size and saves a hidden section", async () => {
    const saved: Array<ReturnType<typeof readMediaArrangement>> = [];
    const view = mount((arrangement) => {
      saved.push(arrangement);
    });
    const slider = view.container.querySelector('[data-testid="staff-media-scale"]') as HTMLInputElement;
    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      descriptor?.set?.call(slider, "80");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(window.localStorage.getItem("iconic-staff-media-tile:staff-1")).toBe("80");

    const name = view.container.querySelector('[data-testid="staff-section-name"]') as HTMLInputElement;
    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      descriptor?.set?.call(name, "Behind the scenes");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      name.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const front = view.container.querySelector('[data-testid="staff-media-front"]') as HTMLElement;
    const yard = view.container.querySelector('[data-testid="staff-media-yard"]') as HTMLElement;
    act(() => {
      pointer(front, "pointerdown");
      pointer(window as unknown as Element, "pointerup", { clientX: 1, clientY: 0 });
    });
    act(() => {
      pointer(yard, "pointerdown");
      pointer(window as unknown as Element, "pointerup", { clientX: 1, clientY: 0, shiftKey: true });
    });
    act(() => {
      (view.container.querySelector('[data-testid="staff-section-create"]') as HTMLButtonElement).click();
    });
    const section = view.container.querySelector('[data-testid^="staff-section-s"]');
    expect(section?.textContent).toContain("Hide from listing presentation websites");
    const hide = view.container.querySelector('[data-testid^="staff-section-hide-"]') as HTMLButtonElement;
    act(() => hide.click());
    expect(view.container.querySelector('[data-testid^="staff-section-hide-"]')?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      (view.container.querySelector('[data-testid="staff-media-save"]') as HTMLButtonElement).click();
    });
    expect(saved[0]?.sections[0]?.name).toBe("Behind the scenes");
    expect(saved[0]?.sections[0]?.hideFromListingSites).toBe(true);
    expect(saved[0]?.placements.filter((item) => item.sectionId === saved[0]?.sections[0]?.id).map((item) => item.id)).toEqual(["front", "kitchen", "yard"]);
    view.unmount();

    const again = mount();
    expect((again.container.querySelector('[data-testid="staff-media-scale"]') as HTMLInputElement).value).toBe("80");
    again.unmount();
    window.localStorage.removeItem("iconic-staff-media-tile:staff-1");
  });
});
