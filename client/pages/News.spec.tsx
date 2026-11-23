/**
 * @vitest-environment happy-dom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import News from "./News";

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/AuthContext", () => {
  const user = { getIdToken: async () => "temp-admin-token" };
  return {
    useAuth: () => ({
      user,
      isStaff: true,
      loading: false,
      mustChangePassword: false,
      staffProfile: { role: "admin" },
    }),
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("staff news index", () => {
  it("shows HOLYYY SMOKES from the staff API and keeps promos empty", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/news")) {
        return new Response(JSON.stringify({
          issues: [{
            title: "HOLYYY SMOKES",
            slug: "holysmokes",
            category: "newsletter",
            date: "2026-11-23",
            summary: "Not in real estate.",
            heroImage: "/marketing/email/holy-smokes-2026/hero.jpg",
            path: "/news/holysmokes",
            source: "folder",
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.textContent).toContain("HOLYYY SMOKES");
    expect(container.querySelector("[data-testid='news-card']")?.getAttribute("href")).toBe("/news/holysmokes");
    const promos = [...container.querySelectorAll("button")].find((button) => button.textContent === "Promos");
    await act(async () => {
      promos?.click();
    });
    expect(container.textContent).toContain("No promos yet.");
  });
});
