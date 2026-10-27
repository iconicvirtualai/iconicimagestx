/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropertyAddressValue } from "./PropertyAddressField";

const places = vi.hoisted(() => ({
  fetchPlaceSuggestions: vi.fn(),
  fetchPickedPlace: vi.fn(),
}));

vi.mock("@/lib/placesAddress", () => ({
  fetchPlaceSuggestions: places.fetchPlaceSuggestions,
  fetchPickedPlace: places.fetchPickedPlace,
  newPlacesSessionToken: () => "session-1",
}));

import PropertyAddressField from "./PropertyAddressField";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  places.fetchPlaceSuggestions.mockReset();
  places.fetchPickedPlace.mockReset();
});

function renderField(onChange: (next: PropertyAddressValue) => void) {
  const clip = document.createElement("div");
  clip.style.overflowX = "clip";
  document.body.appendChild(clip);
  const host = document.createElement("div");
  clip.appendChild(host);
  root = createRoot(host);
  const state = { value: "" };
  const draw = () => {
    act(() => {
      root?.render(
        <PropertyAddressField
          value={state.value}
          debounceMs={0}
          onChange={(next) => {
            state.value = next.address;
            onChange(next);
            draw();
          }}
        />,
      );
    });
  };
  draw();
  return { clip, input: () => host.querySelector("input") as HTMLInputElement };
}

async function typeAddress(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("apprentice property address", () => {
  it("keeps a typed address when suggestions are unavailable", async () => {
    places.fetchPlaceSuggestions.mockResolvedValue({ suggestions: [], unavailable: true });
    const changes: PropertyAddressValue[] = [];
    const field = renderField((next) => changes.push(next));
    await typeAddress(field.input(), "123 Oak Dr, Spring, TX 77379");
    expect(changes[changes.length - 1]).toEqual({
      address: "123 Oak Dr, Spring, TX 77379",
      place: null,
    });
    expect(document.querySelector("[data-testid='re75-address-list']")).toBeNull();
    expect(document.body.textContent).toContain("The address you type still works.");
  });

  it("shows a body-level menu and fills the field from a suggestion", async () => {
    places.fetchPlaceSuggestions.mockResolvedValue({
      unavailable: false,
      suggestions: [{
        placeId: "place-1",
        description: "123 Oak Dr, Spring, TX 77379, USA",
        mainText: "123 Oak Dr",
        secondaryText: "Spring, TX 77379",
      }],
    });
    places.fetchPickedPlace.mockResolvedValue({
      placeId: "place-1",
      formatted: "123 Oak Dr, Spring, TX 77379, USA",
      lat: 30.08,
      lng: -95.42,
    });
    const changes: PropertyAddressValue[] = [];
    const field = renderField((next) => changes.push(next));
    const originalRect = HTMLInputElement.prototype.getBoundingClientRect;
    HTMLInputElement.prototype.getBoundingClientRect = () => ({
      x: 16,
      y: 120,
      top: 120,
      left: 16,
      right: 374,
      bottom: 168,
      width: 358,
      height: 48,
      toJSON() { return {}; },
    });
    try {
      await typeAddress(field.input(), "123 Oak");
    } finally {
      HTMLInputElement.prototype.getBoundingClientRect = originalRect;
    }
    const list = document.querySelector("[data-testid='re75-address-list']") as HTMLElement | null;
    expect(list).toBeTruthy();
    expect(field.clip.contains(list)).toBe(false);
    expect(list?.parentElement).toBe(document.body);
    expect(list?.style.position).toBe("fixed");
    expect(list?.style.top).toBe("172px");
    expect(Number.parseFloat(list?.style.width || "0")).toBeLessThanOrEqual(358);
    const option = document.querySelector("[data-testid='re75-address-option']") as HTMLButtonElement;
    await act(async () => {
      option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      await places.fetchPickedPlace.mock.results[0]?.value;
    });
    expect(changes[changes.length - 1]?.address).toBe("123 Oak Dr, Spring, TX 77379, USA");
    expect(changes[changes.length - 1]?.place?.placeId).toBe("place-1");
    expect(document.querySelector("[data-testid='re75-address-list']")).toBeNull();
  });
});
