/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { THANKFUL_DRINKS_NOTE, THANKFUL_MENUS } from "@shared/thankfulEvent";
import Thankful from "./Thankful";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

const SLOT = {
  start: "2026-11-14T17:00:00.000Z",
  end: "2026-11-14T17:15:00.000Z",
  date: "2026-11-14",
  time: "11:00 AM",
  label: "Sat, Nov 14 · 11:00 AM",
};

async function renderPage(url = "/thankful") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[url]}>
        <Thankful />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/api/thankful/slots")) {
      return { ok: true, json: async () => ({ live: true, slots: [SLOT], durationMinutes: 15, bufferMinutes: 5 }) };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  document.body.innerHTML = "";
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("thankful event page", () => {
  it("shows the invitation, menus, photo time, and legal name without a pay step", async () => {
    await renderPage();
    const text = container?.textContent || "";
    expect(text).toContain("Thankful for You Always");
    expect(text).toContain("Iconic Client Event 2026");
    expect(text).toContain("Bring family, friends, and pets");
    expect(text).toContain("Headshots");
    expect(text).toContain("Free content day");
    expect(text).toContain("Saturday, Nov 14, 2026");
    expect(text).toContain("11 AM–3 PM CT");
    expect(text).toContain("Studio 105, 26410 Oakridge Dr. Ste 105, Spring, TX 77380");
    expect(text).toContain("281.356.0965");
    expect(text).toContain("photos@iconicimagestx.com");
    expect(text).toContain(THANKFUL_DRINKS_NOTE);
    expect(text).toContain("50% off 2027 social packages");
    expect(text).toContain("Number in party");
    expect(text).toContain("Santa");
    expect(text).toContain("No Santa");
    expect(text).toContain(LEGAL_BUSINESS_NAME);
    for (const menu of THANKFUL_MENUS) {
      expect(text).toContain(menu.label);
      for (const dish of menu.dishes) expect(text).toContain(dish);
    }
    expect(container?.querySelector("[data-testid=\"slot-2026-11-14T17:00:00.000Z\"]")?.textContent).toBe("11:00 AM");
    expect(text).not.toMatch(/2\.8%/);
    expect(text.toLowerCase()).not.toContain("processing fee");
    expect(text.toLowerCase()).not.toContain("cadi@");
    expect(text).not.toContain("vercel.app");
  });
});
