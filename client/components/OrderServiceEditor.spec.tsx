/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "@shared/bookingCatalog";
import { BOOKING_PROCESSING_LABEL } from "@shared/invoiceProcessing";
import type { OrderServiceSavePatch } from "@shared/orderRequestServices";
import { OrderServiceEditor } from "./OrderServiceEditor";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let patch: OrderServiceSavePatch | null = null;

beforeEach(() => {
  patch = null;
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => undefined;
  }
  window.confirm = () => true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

const catalog = packagesForStaffEditor([
  {
    id: "listing-essentials",
    durationMinutes: 30,
    variants: [{ id: "essentials-rush", name: "Rush", price: 299, durationMinutes: 30 }],
  },
]);

async function renderEditor(lines: unknown = [{ name: "gggfgdfgd", price: 0 }]) {
  await act(async () => {
    root?.render(
      <OrderServiceEditor
        catalog={catalog}
        initialLines={lines}
        resetKey="order-1"
        onChange={(next) => { patch = next; }}
      />,
    );
  });
}

describe("order service editor", () => {
  it("replaces a typed service name with a catalog search and a processing line", async () => {
    await renderEditor();
    const picker = document.querySelector("[data-testid='order-service-picker']");
    expect(picker?.textContent).toContain("gggfgdfgd");
    expect(picker?.textContent).toContain("Not in the catalog yet.");
    expect(document.querySelector("[data-testid='order-processing-line']")?.textContent).toContain(BOOKING_PROCESSING_LABEL);
    expect(document.querySelector("[aria-label='Edit price 1']")).toBeTruthy();
    expect(document.querySelector("[aria-label='Remove price 1']")).toBeTruthy();
    expect(document.querySelector("[aria-label='Edit quantity 1']")).toBeTruthy();
    expect(document.querySelector("[aria-label='Remove tax rate']")).toBeTruthy();
    expect(document.querySelector("[aria-label='Remove processing fee']")).toBeTruthy();
    expect(document.querySelector("[aria-label='Remove travel fee']")).toBeTruthy();
    expect(document.querySelector("[data-testid='order-add-promo']")).toBeTruthy();
    expect(document.querySelector("[data-testid='order-add-addon']")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Aryeo");
    expect(document.querySelector("[data-testid='order-add-custom']")?.textContent).toContain("Custom line");
    expect(document.body.textContent).not.toContain("Aryeo");

    await act(async () => {
      (picker as HTMLButtonElement).click();
    });
    const option = Array.from(document.querySelectorAll("[cmdk-item]")).find((node) => node.textContent?.includes("The Essentials — Rush"));
    expect(option).toBeTruthy();
    await act(async () => {
      (option as HTMLElement).click();
    });

    expect(document.querySelector("[data-testid='order-service-picker']")?.textContent).toContain("The Essentials — Rush");
    expect(document.querySelector("[data-testid='order-service-duration']")?.textContent).toContain("30 min");
    expect(document.querySelector("[data-testid='order-processing-line']")?.textContent).toContain("$8.37");
    expect(document.querySelector("[data-testid='order-service-total']")?.textContent).toContain("$307.37");
    expect(patch?.catalogPackageIds).toEqual(["listing-essentials"]);
    expect(patch?.catalogVariantIds).toEqual(["essentials-rush"]);
    expect(patch?.lineItems[0]).toMatchObject({ id: "essentials-rush", variantId: "essentials-rush", price: 299 });
    expect(patch?.processing).toBe(8.37);
    expect(patch?.total).toBe(307.37);
  });

  it("lets staff type a custom price and fees that amount", async () => {
    await renderEditor([]);
    await act(async () => {
      (document.querySelector("[data-testid='order-add-custom']") as HTMLButtonElement).click();
    });
    const name = document.querySelector("[aria-label='Custom service 2']") as HTMLInputElement;
    const price = document.querySelectorAll("[data-testid='order-custom-price']")[0] as HTMLInputElement;
    await act(async () => {
      const nameSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      nameSetter?.call(name, "Extra prints");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      nameSetter?.call(price, "40");
      price.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(patch?.lineItems.some((line) => line.custom && line.name === "Extra prints" && line.price === 40)).toBe(true);
    expect(patch?.catalogPackageIds).toEqual([]);
    expect(patch?.processing).toBe(1.12);
    expect(patch?.total).toBe(41.12);
    expect(document.querySelector("[data-testid='order-service-total']")?.textContent).toContain("$41.12");
  });

  it("removes a line and quantity doubles a catalog price", async () => {
    await renderEditor([{ id: "photos-35", name: "35 Photos", price: 150, qty: 1 }]);
    const qty = document.querySelector("[data-testid='order-service-qty']") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(qty, "2");
      qty.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(patch?.lineItems[0]).toMatchObject({ id: "photos-35", qty: 2, price: 300 });
    expect(patch?.processing).toBe(8.4);
    await act(async () => {
      (document.querySelector("[aria-label='Remove service 1']") as HTMLButtonElement).click();
    });
    expect(patch?.lineItems).toEqual([]);
    expect(patch?.total).toBe(0);
  });
});
