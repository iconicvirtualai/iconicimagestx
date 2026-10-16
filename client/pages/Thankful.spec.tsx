/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { THANKFUL_DRINKS_NOTE, THANKFUL_MENUS, THANKFUL_PROCESSING_NOTE, THANKFUL_RSVP_CLOSES_LABEL, THANKFUL_SOCIAL_LOCK_LABEL, THANKFUL_VOTE_RULE } from "@shared/thankfulEvent";
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
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/api/thankful/slots")) {
      return { ok: true, json: async () => ({ live: true, closed: false, slots: [SLOT], durationMinutes: 15, bufferMinutes: 5 }) };
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
    expect(text).toContain("Bring family, friends, and pets");
    expect(text).toContain("Headshots");
    expect(text).toContain("Saturday, Nov 14, 2026");
    expect(text).toContain("11 AM–3 PM CT");
    expect(text).toContain("Studio 105");
    expect(text).toContain("26410 Oakridge Dr. Ste 105, Spring, TX 77380");
    expect(text).toContain("281.356.0965");
    expect(text).toContain("photos@iconicimagestx.com");
    expect(text).toContain(`RSVP and menu vote close ${THANKFUL_RSVP_CLOSES_LABEL}.`);
    expect(text).toContain(THANKFUL_DRINKS_NOTE);
    expect(text).toContain(THANKFUL_VOTE_RULE);
    expect(text).toContain("Client holiday video");
    expect(container?.querySelector("[data-testid='thankful-video-hero']")?.nextElementSibling?.textContent).toContain("Thankful for You Always");
    expect(container?.querySelector("[data-testid='thankful-video-hero']")?.nextElementSibling?.querySelector("a")?.textContent).toBe("RSVP");
    expect(text).toContain("Event photos");
    expect(text).toContain("Photo 1");
    expect(text).toContain(THANKFUL_SOCIAL_LOCK_LABEL);
    expect(text).toContain("The Baseline");
    expect(text).toContain("The Professional Suite");
    expect(text).toContain("$500/mo");
    expect(text).toContain("$1,500/mo");
    expect(text).toContain("$2,700");
    expect(text).toContain("Buy now");
    expect(text).toContain(THANKFUL_PROCESSING_NOTE);
    expect(text).toContain("Number in party");
    expect(text).toContain("Santa");
    expect(text).toContain("No Santa");
    expect(text).toContain(LEGAL_BUSINESS_NAME);
    const hero = container?.querySelector("[data-testid='thankful-video-hero']");
    expect(hero?.className).toContain("aspect-video");
    expect(container?.querySelector("[data-testid='thankful-lights']")).toBeTruthy();
    expect(container?.querySelector("[data-testid='thankful-photo-strip']")).toBeTruthy();
    expect(container?.querySelector("table")).toBeNull();
    expect(container?.querySelector("[data-testid='thankful-submit']")).toBeTruthy();
    for (const menu of THANKFUL_MENUS) {
      expect(text).toContain(menu.label);
      for (const dish of menu.dishes) expect(text).toContain(dish);
    }
    expect(container?.querySelector("[data-testid=\"slot-2026-11-14T17:00:00.000Z\"]")?.textContent).toBe("11:00 AM");
    expect(text.toLowerCase()).not.toContain("cadi@");
    expect(text).not.toContain("vercel.app");
    expect(text).not.toContain("gserviceaccount.com");
  });

  it("hides the RSVP after the Monday, Nov 9 cutoff", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ live: false, closed: true, slots: [] }),
    }));
    await renderPage();
    const text = container?.textContent || "";
    expect(text).toContain("RSVPs are closed.");
    expect(text).toContain("Monday, Nov 9, 2026");
    expect(container?.querySelector("[data-testid='thankful-submit']")).toBeNull();
    expect(container?.querySelector("[data-testid='thankful-video-hero']")).toBeTruthy();
  });

  it("shows the half-price month-to-month rate and hides the form after a vote", async () => {
    await renderPage();
    const month = container?.querySelector("[data-testid='term-month']") as HTMLButtonElement;
    await act(async () => {
      month.click();
    });
    expect(container?.querySelector("[data-testid='social-baseline']")?.textContent).toContain("$250/mo");
    expect(container?.querySelector("[data-testid='social-professional-suite']")?.textContent).toContain("$750/mo");

    sessionStorage.setItem("thankful-menu-vote", JSON.stringify({ menuName: "Menu 2", orderNumber: "#042" }));
    await renderPage();
    const text = container?.textContent || "";
    expect(text).toContain("You already voted");
    expect(text).toContain("Menu 2 is your one vote.");
    expect(container?.querySelector("[data-testid='thankful-submit']")).toBeNull();
    expect(container?.querySelector("[data-testid='buy-baseline']")).toBeTruthy();
  });
});
