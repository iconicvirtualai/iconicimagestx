/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ownerCommandCenterStructureGrids } from "../../server/services/ownerSuiteFixtures";
import { parseOwnerSuite } from "../../shared/ownerSuite";
import { OwnersSuiteView } from "./OwnersSuite";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
});

function renderSuite() {
  const data = parseOwnerSuite(ownerCommandCenterStructureGrids(), new Date("2026-10-10T18:00:00Z"));
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <OwnersSuiteView
        payload={{ data, source: "fixture", configured: true, notice: null, readerEmail: null }}
        refreshing={false}
        showOps={false}
        onRefresh={() => undefined}
        onSignOut={() => undefined}
      />,
    );
  });
  return host;
}

describe("owners suite structure rendering", () => {
  it("shows the live scorecard states and a quiet empty action log", () => {
    const host = renderSuite();
    const text = host.textContent || "";
    expect(text).toContain("Cash collected this week");
    expect(text).toContain("~0+");
    expect(text).toContain("Active");
    expect(text).toContain("0 / 0");
    expect(text).toContain("Placeholder client");
    expect(text).toContain("Yellow");
    expect(text).toContain("Placeholder standing");
    expect(text).toContain("Placeholder milestone");
    expect(text).toContain("Placeholder hard milestone");
    expect(text).toContain("Later");
    expect(text).toContain("No action log yet");
    expect(text).not.toContain("Coming soon");
    expect(text).not.toContain("Visual only placeholder");
    expect(host.querySelector(".owners-suite")?.getAttribute("style") || "").toContain("Inter, system-ui, sans-serif");
    expect(host.innerHTML).not.toContain("font-serif");
    expect(host.innerHTML.toLowerCase()).not.toContain("cormorant");
  });

  it("opens the plan board from the data tab", () => {
    const host = renderSuite();
    const plan = Array.from(host.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent === "Plan Board");
    expect(plan).toBeTruthy();
    act(() => {
      plan?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const text = host.textContent || "";
    expect(text).toContain("Data tab placeholder");
    expect(text).toContain("Oct 12");
    expect(text).not.toContain("Visual only placeholder");
    expect(text).not.toContain("No action log yet");
  });
});
