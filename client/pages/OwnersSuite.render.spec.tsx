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

  it("shows orders for Cadi and submits the textarea", async () => {
    const data = parseOwnerSuite(ownerCommandCenterStructureGrids(), new Date("2026-10-10T18:00:00Z"));
    const submitted: string[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <OwnersSuiteView
          payload={{ data, source: "fixture", configured: true, notice: null, readerEmail: null }}
          refreshing={false}
          showOps={false}
          orders={[
            {
              timestamp: "2026-10-10 10:05 PM CT",
              text: "Book the lake house",
              status: "New",
              ownerBot: "",
              reply: "On it",
            },
          ]}
          onSubmitOrder={async (text) => {
            submitted.push(text);
            return true;
          }}
          onRefresh={() => undefined}
          onSignOut={() => undefined}
        />,
      );
    });
    const text = host.textContent || "";
    expect(text).toContain("Orders for Cadi 2.0");
    expect(text).toContain("Timestamp");
    expect(text).toContain("Order text");
    expect(text).toContain("Status");
    expect(text).toContain("Owner bot");
    expect(text).toContain("Cadi 2.0 reply");
    expect(text).toContain("2026-10-10 10:05 PM CT");
    expect(text).toContain("Book the lake house");
    expect(text).toContain("New");
    expect(text).toContain("On it");
    const box = host.querySelector("[data-cadi-orders]");
    expect(box?.innerHTML || "").not.toContain("font-serif");
    expect((box?.innerHTML || "").toLowerCase()).not.toContain("cormorant");
    const textarea = host.querySelector("textarea");
    expect(textarea?.getAttribute("style") || "").toContain("Inter, system-ui, sans-serif");
    expect(textarea?.getAttribute("style") || "").toContain("font-style: normal");
    const empty = host.querySelector("form");
    await act(async () => {
      empty?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(host.textContent || "").toContain("Enter an order.");
    expect(submitted).toEqual([]);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(textarea, "  Call the lab  ");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      empty?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(submitted).toEqual(["Call the lab"]);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("shows one not-connected line when the save error repeats the notice", () => {
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
          ordersNotice="Orders are not connected."
          orderError="Orders are not connected."
          onRefresh={() => undefined}
          onSignOut={() => undefined}
        />,
      );
    });
    const text = host.textContent || "";
    expect(text.split("Orders are not connected.").length - 1).toBe(1);
    expect(host.querySelector("[role='alert']")?.textContent).toBe("Orders are not connected.");
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

  it("shows approval actions and bot routines", async () => {
    const data = parseOwnerSuite(ownerCommandCenterStructureGrids(), new Date("2026-10-10T18:00:00Z"));
    const approved: Array<{ id: string; status: string; note: string }> = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <OwnersSuiteView
          payload={{ data, source: "fixture", configured: true, notice: null, readerEmail: null }}
          refreshing={false}
          showOps={false}
          orders={[
            {
              id: "order-1",
              timestamp: "2026-10-10 10:05 PM CT",
              text: "Book the lake house",
              status: "New",
              ownerBot: "Quinn",
              reply: "On it",
              approval: {
                status: "Go for it!",
                note: "",
                by: "owner@example.com",
                at: "2026-10-12T19:15:00.000Z",
              },
            },
          ]}
          onApproveOrder={async (id, status, note) => {
            approved.push({ id, status, note });
            return { status, note, by: "owner@example.com", at: "2026-10-12T19:20:00.000Z" };
          }}
          onRefresh={() => undefined}
          onSignOut={() => undefined}
        />,
      );
    });
    const text = host.textContent || "";
    expect(text).toContain("Completed");
    expect(text).toContain("Go for it!");
    expect(text).toContain("Needs Revisions");
    expect(text).toContain("owner@example.com");
    expect(text).toContain("CT");
    expect(text).toContain("What the bots are doing");
    expect(text).toContain("Rex");
    expect(text).toContain("Quinn");
    expect(text).toContain("Cadi 2.0");
    expect(text).toContain("Sam");
    expect(text).toContain("Sasha");
    expect(text).toContain("Cody");
    expect(text).toContain("Schedule to confirm");
    expect(text).toContain("On request");
    expect(text).toContain("No action log yet");
    const box = host.querySelector("[data-order-approval]");
    expect(box?.getAttribute("style") || "").toContain("Inter, ui-sans-serif, system-ui, sans-serif");
    expect(host.querySelector("[data-bot-routines]")?.getAttribute("style") || "").toContain("Inter, ui-sans-serif, system-ui, sans-serif");
    const revise = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Needs Revisions");
    await act(async () => {
      revise?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(approved).toEqual([]);
    expect(host.querySelector("[data-order-approval] textarea")).toBeTruthy();
    await act(async () => {
      revise?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host.textContent || "").toContain("Add a note for Needs Revisions.");
    expect(approved).toEqual([]);
    const done = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Completed");
    await act(async () => {
      done?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(approved).toEqual([{ id: "order-1", status: "Completed", note: "" }]);
  });
});
