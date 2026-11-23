/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLASH_SALE_ENDS_MS } from "@shared/flashSale";
import PromoBar from "./PromoBar";

vi.mock("@/hooks/useSiteSettings", () => ({
  useSiteSettings: () => ({
    global: {
      showPromoBar: true,
      promoBarText: "FREE AI STAGING ON YOUR FIRST ORDER - CODE: ICONICAI",
    },
  }),
}));

vi.mock("@/content/siteContent", () => ({
  useSiteHref: () => "/book",
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderBar() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <PromoBar />
      </MemoryRouter>,
    );
  });
}

describe("promo bar", () => {
  it("shows the flash sale through the shared Central deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(FLASH_SALE_ENDS_MS);
    await renderBar();
    const open = container?.querySelector("[data-testid='promo-bar']");
    expect(open?.getAttribute("href")).toBe("/flash-sale");
    expect(open?.getAttribute("data-promo")).toBe("flash-sale");
    expect(open?.textContent).toContain("5 SHOOTS $1,250");
    expect(open?.textContent).not.toContain("ICONICAI");
  });

  it("returns the AI staging line after that deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(FLASH_SALE_ENDS_MS + 1);
    await renderBar();
    const closed = container?.querySelector("[data-testid='promo-bar']");
    expect(closed?.getAttribute("href")).toBe("/book");
    expect(closed?.getAttribute("data-promo")).toBe("staging");
    expect(closed?.textContent).toContain("FREE AI STAGING ON YOUR FIRST ORDER - CODE: ICONICAI");
    expect(closed?.textContent).not.toContain("FLASH SALE");
  });
});
