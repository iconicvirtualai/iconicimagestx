/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminOrdersBrowser } from "./AdminOrdersBrowser";
import { adminOrderTotalLabel, sampleAdminOrderRecords, sampleAdminOrderStaff } from "@shared/adminOrderList";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const orders = sampleAdminOrderRecords();
const staff = sampleAdminOrderStaff();
const NOW = new Date("2026-11-10T18:00:00.000Z");

function Harness({ storageKey, list = orders }: { storageKey: string; list?: Record<string, unknown>[] }) {
  return (
    <MemoryRouter>
      <AdminOrdersBrowser
        orders={list}
        staff={staff}
        selection={new Set()}
        storageKey={storageKey}
        now={NOW}
        onToggleSelect={() => undefined}
        onSelectIds={() => undefined}
        onStudioChange={() => undefined}
      />
    </MemoryRouter>
  );
}

async function renderAt(storageKey: string, list = orders) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Harness storageKey={storageKey} list={list} />);
  });
}

function buttonByText(rootNode: ParentNode, label: string) {
  return [...rootNode.querySelectorAll("button")].find((button) => {
    const text = button.textContent?.replace(/\s+/g, " ").trim();
    return text === label;
  }) as HTMLButtonElement | undefined;
}

function section(id: string) {
  const node = container?.querySelector(`[data-section='${id}']`);
  if (!node) throw new Error(`Missing section ${id}`);
  return node;
}

function idsIn(id: string) {
  return [...section(id).querySelectorAll("[data-order-id]")].map((node) => node.getAttribute("data-order-id"));
}

async function clickButton(rootNode: ParentNode, label: string) {
  const button = buttonByText(rootNode, label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => {
    button.click();
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
});

describe("orders desk sections", () => {
  it("keeps triage orders out of all orders and collapses archives", async () => {
    await renderAt("adminOrdersView:desk");
    expect(container?.querySelector("[data-orders-view]")?.getAttribute("data-orders-view")).toBe("list");
    expect(section("archived").textContent).toContain("Collapsed");
    expect(section("archived").querySelector("[data-order-id]")).toBeNull();
    expect(idsIn("action").sort()).toEqual(["fixture-birch", "fixture-oak"]);
    expect(idsIn("active").sort()).toEqual(["fixture-cedar", "fixture-maple", "fixture-pine"]);
    expect(section("action").textContent).toContain("Unscheduled");
    expect(section("action").textContent).toContain("No photographer assigned");
    expect(section("action").textContent).toContain("Schedule");
    expect(section("action").textContent).toContain("Assign");
    const schedule = section("action").querySelector("a[href*='desk=schedule']");
    expect(schedule?.getAttribute("href")).toContain("/admin/order-request/");

    const expand = section("archived").querySelector("[aria-label='Expand Archives & Cancellations']") as HTMLButtonElement;
    await act(async () => {
      expand.click();
    });
    expect(idsIn("archived")).toEqual(["fixture-elm"]);
    expect(section("active").textContent).not.toContain("Sample Client Eden Frost");
  });

  it("filters every section from the one search box and the status tabs", async () => {
    await renderAt("adminOrdersView:filter");
    const input = container?.querySelector("[data-testid='orders-search']") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Maple");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(idsIn("active")).toEqual(["fixture-maple"]);
    expect(idsIn("action")).toEqual([]);
    expect(container?.textContent).not.toContain("Sample Client Blair Quinn");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButton(container!, "Unscheduled1");
    expect(idsIn("action")).toEqual(["fixture-birch"]);
    expect(idsIn("active")).toEqual([]);
  });

  it("shows order, payment, and gallery as plain text with one neutral dot", async () => {
    await renderAt("adminOrdersView:status");
    const maple = section("active").querySelector("[data-order-id='fixture-maple']");
    expect(maple?.textContent).toContain("Order");
    expect(maple?.textContent).toContain("Scheduled");
    expect(maple?.textContent).toContain("Payment");
    expect(maple?.textContent).toContain("Paid");
    expect(maple?.textContent).toContain("Gallery");
    expect(maple?.textContent).toContain("Editing");
    expect(maple?.querySelectorAll("i.ndot").length).toBe(1);
    expect(maple?.innerHTML).not.toMatch(/bg-red-|bg-green-|bg-blue-|rounded-full px-/);
    expect(maple?.textContent).toContain(adminOrderTotalLabel(orders.find((order) => order.id === "fixture-maple")!));
    const link = maple?.querySelector("a[data-order-link='fixture-maple']") as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe("/admin/order-request/fixture-maple");
    expect(section("active").textContent).toContain("The Showcase");
    expect(section("active").textContent).toContain("+1");
  });

  it("remembers list or board per user", async () => {
    await renderAt("adminOrdersView:uid-a");
    await clickButton(container!, "Board");
    expect(localStorage.getItem("adminOrdersView:uid-a")).toBe("board");
    expect(container?.querySelector("[data-testid='orders-board']")).toBeTruthy();
    expect(container?.textContent).toContain("Unscheduled");
    expect(container?.textContent).toContain("Delivered — Paid");
    expect(container?.querySelector("[data-section='action']")).toBeNull();

    await act(async () => {
      root?.render(<Harness storageKey="adminOrdersView:uid-b" />);
    });
    expect(container?.querySelector("[data-orders-view]")?.getAttribute("data-orders-view")).toBe("list");
    expect(localStorage.getItem("adminOrdersView:uid-a")).toBe("board");
  });
});

describe("orders desk overrides and selection", () => {
  it("sets a manual KPI value and resets it", async () => {
    await renderAt("adminOrdersView:manual");
    const adjust = container?.querySelector("[aria-label='Adjust Revenue this week']") as HTMLButtonElement;
    await act(async () => {
      adjust.click();
    });
    await clickButton(container!, "Set manual value");
    const input = container?.querySelector("#kpi-manual-revenue") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "1804.91");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButton(container!, "Save");
    const card = container?.querySelector("[data-kpi='revenue']");
    expect(card?.textContent).toContain("$1,804.91");
    expect(card?.getAttribute("data-manual")).toBe("true");
    expect(card?.textContent).toContain("Manual");
    const reset = [...(card?.querySelectorAll("button") || [])].find((button) => button.textContent === "Reset") as HTMLButtonElement;
    await act(async () => {
      reset.click();
    });
    expect(container?.querySelector("[data-kpi='revenue']")?.getAttribute("data-manual")).toBe("false");
  });

  it("selects the filtered orders from one control", async () => {
    const seen: string[][] = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <AdminOrdersBrowser
            orders={orders}
            staff={staff}
            selection={new Set()}
            storageKey="adminOrdersView:select"
            now={NOW}
            onToggleSelect={() => undefined}
            onSelectIds={(ids) => seen.push(ids)}
            onStudioChange={() => undefined}
          />
        </MemoryRouter>,
      );
    });
    const box = container.querySelector("[data-testid='orders-select-all']") as HTMLInputElement;
    await act(async () => {
      box.click();
    });
    expect(seen[0]?.sort()).toEqual(orders.map((order) => String(order.id)).sort());
    expect(container.querySelector("[data-testid='orders-select-all-action']")).toBeNull();
    expect(container.querySelector("[aria-label='Orders per page']")).toBeNull();
  });

  it("shows Calendar hold failed on the row", async () => {
    const failed = {
      id: "hold-fail",
      orderNumber: "#099",
      projectType: "real_estate",
      status: "scheduled",
      clientName: "Sample Client Hold",
      address: "9 Sample Hold Lane",
      appointmentDate: "2026-04-12",
      appointmentTime: "10:00 AM",
      assignedPhotographerName: "Sample Photographer Jordan Hale",
      officeFlag: "calendar_hold_failed",
      createdAt: { toDate: () => new Date("2026-04-02T15:00:00Z"), seconds: 0 },
    };
    await renderAt("adminOrdersView:hold", [failed]);
    expect(container?.querySelector("[data-slot='calendar-hold']")?.textContent).toContain("Calendar hold failed");
  });
});
