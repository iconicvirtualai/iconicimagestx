/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import News from "./News";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderNews() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <News />
      </MemoryRouter>,
    );
  });
}

describe("news index", () => {
  it("shows HOLYYY SMOKES first and keeps promos empty", async () => {
    await renderNews();
    expect(container?.textContent).toContain("HOLYYY SMOKES");
    expect(container?.textContent).toContain("Newsletter");
    expect(container?.textContent).toContain("November 23, 2026");
    const card = container?.querySelector("[data-testid='news-card']");
    expect(card?.getAttribute("href")).toBe("/news/holysmokes");
    const image = card?.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/marketing/email/holy-smokes-2026/hero.jpg");
    expect(image?.className).toContain("rounded-2xl");

    const promos = [...(container?.querySelectorAll("button") || [])].find((button) => button.textContent === "Promos");
    await act(async () => {
      promos?.click();
    });
    expect(container?.textContent).toContain("No promos yet.");
    expect(container?.querySelector("[data-testid='news-card']")).toBeNull();
  });
});
