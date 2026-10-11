/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminOrdersBrowser } from "./AdminOrdersBrowser";
import { resolveListingPriceLabel } from "@shared/listingPrice";
import { sampleAdminOrderRecords, sampleAdminOrderStaff } from "@shared/adminOrderList";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const orders = sampleAdminOrderRecords();
const staff = sampleAdminOrderStaff();

function Harness({ storageKey }: { storageKey: string }) {
  return (
    <MemoryRouter>
      <AdminOrdersBrowser
        orders={orders}
        staff={staff}
        selection={new Set()}
        storageKey={storageKey}
        onToggleSelect={() => undefined}
        onSelectIds={() => undefined}
        onStudioChange={() => undefined}
      />
    </MemoryRouter>
  );
}

async function renderAt(storageKey: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Harness storageKey={storageKey} />);
  });
}

function buttonByText(rootNode: ParentNode, label: string) {
  return [...rootNode.querySelectorAll("button")].find((button) => {
    const text = button.textContent?.replace(/[↑↓]/g, "").replace(/\s+/g, " ").trim();
    return text === label;
  }) as HTMLButtonElement | undefined;
}

function activeSection() {
  const section = container?.querySelector("[data-section='active']");
  if (!section) throw new Error("Missing all-orders section");
  return section;
}

function activeIds() {
  return [...activeSection().querySelectorAll("[data-order-id]")].map((node) => node.getAttribute("data-order-id"));
}

async function clickButton(rootNode: ParentNode, label: string) {
  const button = buttonByText(rootNode, label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => {
    button.click();
  });
}

async function chooseList() {
  await clickButton(container!, "List view");
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

describe("admin orders tile and list toggle", () => {
  it("remembers the view per user and leaves the other user on tiles", async () => {
    await renderAt("adminOrdersView:uid-a");
    expect(container?.querySelector("[data-orders-view]")?.getAttribute("data-orders-view")).toBe("tile");
    expect(container?.querySelector("[data-admin-order-tile]")).toBeTruthy();
    await chooseList();
    expect(localStorage.getItem("adminOrdersView:uid-a")).toBe("list");
    expect(container?.querySelector("[data-orders-view]")?.getAttribute("data-orders-view")).toBe("list");
    expect(activeSection().querySelector("[data-order-list]")).toBeTruthy();
    expect(activeSection().querySelector("[data-admin-order-tile]")).toBeNull();

    await act(async () => {
      root?.render(<Harness storageKey="adminOrdersView:uid-b" />);
    });
    expect(container?.querySelector("[data-orders-view]")?.getAttribute("data-orders-view")).toBe("tile");
    expect(localStorage.getItem("adminOrdersView:uid-a")).toBe("list");
    expect(localStorage.getItem("adminOrdersView:uid-b")).toBeNull();

    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    await renderAt("adminOrdersView:uid-a");
    expect(container?.querySelector("[data-orders-view]")?.getAttribute("data-orders-view")).toBe("list");
    const listPressed = buttonByText(container!, "List view");
    expect(listPressed?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("admin orders list", () => {
  it("sorts from column headers, links the row, and maps payment and totals", async () => {
    await renderAt("adminOrdersView:uid-list");
    await chooseList();
    const section = activeSection();
    const list = section.querySelector("[data-order-list]");
    expect(list?.getAttribute("data-sort-field")).toBe("shoot");
    expect(list?.getAttribute("data-sort-order")).toBe("desc");
    expect(activeIds()).toEqual(["fixture-oak", "fixture-cedar", "fixture-maple", "fixture-pine"]);

    const shootHeader = [...section.querySelectorAll("button")].find((button) => button.textContent?.includes("Shoot date"));
    expect(shootHeader?.getAttribute("aria-sort")).toBe("descending");

    await clickButton(section, "Client name");
    expect(activeIds()).toEqual(["fixture-maple", "fixture-oak", "fixture-pine", "fixture-cedar"]);
    await clickButton(section, "Client name");
    expect(activeIds()).toEqual(["fixture-cedar", "fixture-pine", "fixture-oak", "fixture-maple"]);

    await clickButton(section, "Total");
    expect(section.querySelector("[data-order-list]")?.getAttribute("data-sort-field")).toBe("total");
    expect(section.querySelector("[data-order-list]")?.getAttribute("data-sort-order")).toBe("desc");
    expect(activeIds()).toEqual(["fixture-maple", "fixture-oak", "fixture-cedar", "fixture-pine"]);

    const link = section.querySelector("a[data-order-link='fixture-maple']") as HTMLAnchorElement | null;
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("/admin/orders/fixture-maple");
    expect(link?.className).toContain("focus-visible:ring-2");
    expect(link?.tabIndex).toBe(0);
    link?.focus();
    expect(document.activeElement).toBe(link);

    expect(section.textContent).toContain("Paid");
    expect(section.textContent).toContain("Unpaid");
    expect(section.textContent).toContain("No invoice");
    const money = [...section.querySelectorAll("[data-slot='money']")].map((node) => node.textContent);
    const maple = orders.find((order) => order.id === "fixture-maple")!;
    expect(money).toContain(resolveListingPriceLabel({ listing: maple }));
    expect(money).toContain("$350.00");
    expect(money).toContain("$199.00");
    expect(section.textContent).toContain("The Showcase + Twilight photos");
    expect(section.textContent).toContain("ORD - L - 10482");
    expect(section.textContent).toContain("Apr 12, 2026, 10:30 AM");
  });

  it("applies the all-orders search to the list and the tiles", async () => {
    await renderAt("adminOrdersView:uid-filter");
    await chooseList();
    const input = container?.querySelector("[data-testid='orders-search-active']") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Maple");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(activeIds()).toEqual(["fixture-maple"]);
    expect(activeSection().textContent).not.toContain("Sample Client Blair Quinn");

    await clickButton(container!, "Tile view");
    expect(localStorage.getItem("adminOrdersView:uid-filter")).toBe("tile");
    const tiles = [...activeSection().querySelectorAll("[data-admin-order-tile]")];
    expect(tiles).toHaveLength(1);
    expect(activeSection().textContent).toContain("Sample Client Avery North");
    expect(activeSection().textContent).not.toContain("Sample Client Blair Quinn");
  });

  it("renders stacked label and value pairs without a wide table", async () => {
    await renderAt("adminOrdersView:uid-mobile");
    await chooseList();
    const section = activeSection();
    const labels = [...section.querySelectorAll("[data-field]")];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const caption = label.querySelector("div");
      expect(caption?.className).toContain("sm:sr-only");
      expect(caption?.className).not.toContain("hidden");
      expect(label.className).toContain("[word-break:normal]");
    }
    const list = section.querySelector("[data-order-list]");
    expect(list?.className).not.toMatch(/min-w-\[(?:[7-9]\d{2}|\d{4,})px\]/);
    expect(list?.className).toContain("overflow-hidden");
    expect(list?.className).toContain("[word-break:normal]");
    expect(section.textContent).toContain("Property address");
    expect(section.textContent).toContain("Gallery / delivery status");
    const money = section.querySelector("[data-slot='money']");
    expect(money?.className).toContain("whitespace-nowrap");
  });
});
